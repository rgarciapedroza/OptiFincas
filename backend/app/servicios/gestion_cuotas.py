from typing import Dict, List, Tuple, Optional, TypedDict, Any
from enum import Enum
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)

class EstadoMes(Enum):
    PAGADO = "PAGADO"
    PENDIENTE = "PENDIENTE"
    PARCIAL = "PARCIAL"

class PagoInfo(TypedDict):
    piso_id: str
    mes_referencia: str  # Formato "YYYY-MM"
    importe: float
    pago_id: str

class DetalleAsignacion(TypedDict):
    pago_id: str
    mes_destino: str
    importe_aplicado: float

class LogicaCuotasFincas:
    """
    Gestiona la asignación de pagos en cascada para cubrir cuotas mensuales.
    Soporta pagos parciales, adelantados y generación de crédito acumulado.
    """
    def __init__(self, horizon_meses: List[str], 
                 cuotas_config: Dict[Tuple[str, str], float], 
                 estado_inicial: Optional[Dict[str, Dict[str, float]]] = None,
                 credito_inicial: Optional[Dict[str, float]] = None):
        """
        :param horizon_meses: Lista ordenada de meses "YYYY-MM".
        :param cuotas_config: Dict con clave (piso_id, mes) -> importe_cuota.
        :param estado_inicial: Dict con clave piso_id -> { mes: ya_abonado_en_db }.
        :param credito_inicial: Dict con clave piso_id -> saldo_sobrante_previo.
        """
        self.horizon_meses = sorted(horizon_meses)
        self.cuotas_config = cuotas_config
        
        # Estado: piso_id -> { mes: importe_abonado }
        self.estado_pisos = defaultdict(lambda: {mes: 0.0 for mes in self.horizon_meses})
        if estado_inicial:
            for p_id, meses_pagados in estado_inicial.items():
                for mes, imp in meses_pagados.items():
                    if mes in self.horizon_meses:
                        self.estado_pisos[p_id][mes] = imp

        # Crédito: piso_id -> float
        self.credito_pisos: Dict[str, float] = defaultdict(float)
        if credito_inicial:
            for p_id, cred in credito_inicial.items():
                self.credito_pisos[p_id] = round(cred, 2)

        # Trazabilidad: piso_id -> List[DetalleAsignacion]
        self.mapa_asignacion: Dict[str, List[DetalleAsignacion]] = defaultdict(list)

    def procesar_lista_pagos(self, lista_pagos: List[PagoInfo]):
        """Procesa un lote de pagos identificados ordenados por fecha."""
        # 1. Antes de procesar nuevos pagos, intentamos aplicar el crédito acumulado existente
        # para cubrir deudas en el horizonte actual.
        for piso_id in list(self.credito_pisos.keys()):
            if self.credito_pisos[piso_id] > 0:
                cred_disp = self.credito_pisos[piso_id]
                # Reset temporal para que aplicar_pago no lo sume como "sobrante nuevo"
                self.credito_pisos[piso_id] = 0 
                self.aplicar_pago(
                    piso_id=piso_id, mes_inicio=self.horizon_meses[0], 
                    importe=cred_disp, pago_id="CREDITO_PREVIO"
                )

        pagos_ordenados = sorted(lista_pagos, key=lambda x: x['mes_referencia'])
        for pago in pagos_ordenados:
            self.aplicar_pago(
                piso_id=pago['piso_id'],
                mes_inicio=pago['mes_referencia'],
                importe=pago['importe'],
                pago_id=pago['pago_id']
            )

    def aplicar_pago(self, piso_id: str, mes_inicio: str, importe: float, pago_id: str):
        """Lógica de cascada: aplica el importe primero a los meses MÁS ANTIGUOS con deuda.

        Nota: aunque se recibe mes_inicio, el requisito del sistema es que siempre se cubran
        primero las cuotas pendientes más antiguas (no la fecha del pago).
        """
        restante = round(importe, 2) # Importe total del pago
        # Nota: se espera que cada pago aplique su importe en cascada a meses con deuda
        # comenzando desde mes_inicio, y si sobra, se acumule como CREDITO_ACUMULADO.
        # En caso de que el horizonte recorra meses parcialmente cubiertos, el crédito debe
        # quedar como saldo para el futuro, no como asignación adicional a meses anteriores.

        logger.info(
            f"[CUOTAS] >>> Iniciando reparto para {piso_id} | Pago: {pago_id} | Importe: {importe}€ "
            f"(Mes de referencia del pago recibido: {mes_inicio}) | Reglas: cubrir desde el mes más cercano al pago (mes_inicio) hacia adelante"
        )

        # Short-circuit: si TODAS las cuotas del horizonte son 0€ para este piso,
        # no iteramos 96+ meses en vano — va directo a CREDITO_ACUMULADO.
        cuotas_no_cero = sum(
            1 for mes in self.horizon_meses # type: ignore
            if self.cuotas_config.get((piso_id, mes), 0.0) > 0
        )
        if cuotas_no_cero == 0:
            logger.info(f"[CUOTAS] Todas las cuotas del horizonte son 0€ para {piso_id}. "
                        f"Asignando {restante}€ directamente como CREDITO_ACUMULADO.")
            self.credito_pisos[piso_id] += restante
            self.mapa_asignacion[piso_id].append({
                "pago_id": pago_id,
                "mes_destino": "CREDITO_ACUMULADO",
                "importe_aplicado": restante
            })
            logger.info(f"[CUOTAS] <<< Fin de reparto para {piso_id}\n")
            return
        
        # Encontrar el índice del mes_inicio en el horizonte
        # Normalizamos mes_inicio por si viene con día (YYYY-MM-DD) para encontrar el mes correcto
        mes_inicio_norm = mes_inicio[:7] if len(mes_inicio) >= 7 else mes_inicio
        try:
            idx_mes_inicio = self.horizon_meses.index(mes_inicio_norm)
        except ValueError:
            logger.warning(f"[CUOTAS] Mes de inicio {mes_inicio} no encontrado en el horizonte para {piso_id}. "
                           f"Iniciando cascada desde el principio del horizonte.")
            idx_mes_inicio = 0 # Fallback al inicio del horizonte si mes_inicio no está

        # --- Prioridad 1: Cubrir el mes de inicio (mes_referencia del pago) ---
        logger.info(f"[CUOTAS]   - Prioridad 1: Intentando cubrir el mes de referencia {mes_inicio} para {piso_id}")
        mes_actual_p1 = self.horizon_meses[idx_mes_inicio]
        cuota_total_p1 = self.cuotas_config.get((piso_id, mes_actual_p1), 0.0)
        ya_abonado_p1 = self.estado_pisos[piso_id][mes_actual_p1]
        deuda_mes_p1 = round(max(cuota_total_p1 - ya_abonado_p1, 0), 2)

        if deuda_mes_p1 > 0 and restante > 0 and cuota_total_p1 > 0:
            pago_a_mes_p1 = min(restante, deuda_mes_p1)
            logger.info(f"[CUOTAS]     - Asignando {pago_a_mes_p1}€ al mes de inicio {mes_actual_p1} (Deuda: {deuda_mes_p1}€)")
            self.estado_pisos[piso_id][mes_actual_p1] += pago_a_mes_p1
            self.mapa_asignacion[piso_id].append({
                "pago_id": pago_id,
                "mes_destino": mes_actual_p1,
                "importe_aplicado": round(pago_a_mes_p1, 2)
            })
            restante = round(restante - pago_a_mes_p1, 2)
            logger.info(f"[CUOTAS]       Sobrante tras mes de inicio: {restante}€")

        # --- Prioridad 2: Cubrir meses anteriores pendientes (hacia atrás desde mes_inicio-1) ---
        if restante > 0:
            logger.info(f"[CUOTAS]   - Prioridad 2: Cubriendo meses anteriores pendientes para {piso_id}")
            for i in range(idx_mes_inicio - 1, -1, -1): # Iterar hacia atrás
                if restante <= 0: break
                
                mes_actual = self.horizon_meses[i]
                cuota_total = self.cuotas_config.get((piso_id, mes_actual), 0.0)
                ya_abonado = self.estado_pisos[piso_id][mes_actual]
                deuda_mes = round(max(cuota_total - ya_abonado, 0), 2)

                # Solo asignamos si hay deuda real y cuota configurada
                if deuda_mes > 0 and cuota_total > 0:
                    pago_a_mes = min(restante, deuda_mes)
                    logger.info(f"[CUOTAS]     - Asignando {pago_a_mes}€ al mes anterior {mes_actual} (Deuda: {deuda_mes}€)")
                    self.estado_pisos[piso_id][mes_actual] += pago_a_mes
                    self.mapa_asignacion[piso_id].append({
                        "pago_id": pago_id,
                        "mes_destino": mes_actual,
                        "importe_aplicado": round(pago_a_mes, 2)
                    })
                    restante = round(restante - pago_a_mes, 2)
                    logger.info(f"[CUOTAS]       Sobrante: {restante}€")

        # --- Prioridad 3: Cubrir meses posteriores pendientes (hacia adelante desde mes_inicio+1) ---
        if restante > 0:
            logger.info(f"[CUOTAS]   - Prioridad 3: Cubriendo meses posteriores pendientes para {piso_id}")
            for i in range(idx_mes_inicio + 1, len(self.horizon_meses)): # Iterar hacia adelante
                if restante <= 0: break
                
                mes_actual = self.horizon_meses[i]
                cuota_total = self.cuotas_config.get((piso_id, mes_actual), 0.0)
                ya_abonado = self.estado_pisos[piso_id][mes_actual]
                deuda_mes = round(max(cuota_total - ya_abonado, 0), 2)

                # Solo asignamos si hay deuda real y cuota configurada (> 0)
                if deuda_mes > 0 and cuota_total > 0:
                    pago_a_mes = min(restante, deuda_mes)
                    logger.info(f"[CUOTAS]     - Asignando {pago_a_mes}€ al mes posterior {mes_actual} (Deuda: {deuda_mes}€)")
                    
                    self.estado_pisos[piso_id][mes_actual] += pago_a_mes
                    self.mapa_asignacion[piso_id].append({
                        "pago_id": pago_id,
                        "mes_destino": mes_actual,
                        "importe_aplicado": round(pago_a_mes, 2)
                    })
                    restante = round(restante - pago_a_mes, 2)
                    logger.info(f"[CUOTAS]       Sobrante: {restante}€")
                elif cuota_total <= 0:
                    logger.debug(f"[CUOTAS] Mes {mes_actual} saltado: cuota configurada es 0€.")

        # --- Crédito acumulado si aún sobra dinero ---
        if restante > 0:
            logger.info(f"[CUOTAS] !!! Sobrante final de {restante}€ asignado como CREDITO_ACUMULADO para el futuro.")
            self.credito_pisos[piso_id] += restante
            self.mapa_asignacion[piso_id].append({
                "pago_id": pago_id,
                "mes_destino": "CREDITO_ACUMULADO",
                "importe_aplicado": restante
            })
        logger.info(f"[CUOTAS] <<< Fin de reparto para {piso_id}\n")

    def generar_resumen(self) -> Dict[str, Any]:
        """Devuelve el estado final de todos los pisos procesados."""
        resumen = {}
        for piso_id in self.estado_pisos:
            detalle_meses = {}
            for mes in self.horizon_meses:
                cuota = self.cuotas_config.get((piso_id, mes), 0.0)
                abonado = self.estado_pisos[piso_id][mes]
                deuda = round(max(cuota - abonado, 0), 2)
                
                estado = EstadoMes.PENDIENTE
                if abonado >= cuota: estado = EstadoMes.PAGADO
                elif abonado > 0: estado = EstadoMes.PARCIAL
                
                detalle_meses[mes] = {
                    "estado": estado.value,
                    "cuota": cuota,
                    "abonado": round(abonado, 2),
                    "deuda": deuda
                }
            resumen[piso_id] = {
                "detalle_mensual": detalle_meses,
                "credito_total": round(self.credito_pisos[piso_id], 2),
                "historial_asignaciones": self.mapa_asignacion[piso_id]
            }
        return resumen
