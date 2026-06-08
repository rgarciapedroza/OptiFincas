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
            1 for mes in self.horizon_meses
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

        # Para cumplir con el requisito de cubrir siempre las cuotas más antiguas primero,
        # recorremos el horizonte completo desde el principio (idx 0). Esto asegura que 
        # cualquier deuda pendiente (como enero o febrero) sea saldada antes de generar crédito.
        logger.info(f"[CUOTAS] Aplicando cascada total desde el inicio del horizonte para {piso_id}")

        for i in range(len(self.horizon_meses)):
            if restante <= 0:
                break

            mes_actual = self.horizon_meses[i]
            cuota_total = self.cuotas_config.get((piso_id, mes_actual), 0.0)

            ya_abonado = self.estado_pisos[piso_id][mes_actual]
            # Si este mes ya está pagado en el estado inicial (desde DB),
            # no le asignamos parte del pago nuevo.
            # Esto evita que el censo recién cargado termine asignando al mes más antiguo
            # aunque esté marcado como PAGADO.
            if ya_abonado >= cuota_total and cuota_total > 0:
                continue

            deuda_mes = round(cuota_total - ya_abonado, 2)

            # Si no hay cuota configurada para este mes, saltamos pero logueamos por seguridad
            # Esto ocurre si el mes no tiene un registro contable oficial asociado
            if cuota_total <= 0:
                logger.debug(f"[CUOTAS] Mes {mes_actual} saltado: cuota configurada es 0€.")
                continue

            if deuda_mes > 0:
                pago_a_mes = min(restante, deuda_mes)
                logger.info(f"[CUOTAS]   - Asignando {pago_a_mes}€ al mes {mes_actual} (Deuda pendiente: {deuda_mes}€)")
                
                self.estado_pisos[piso_id][mes_actual] += pago_a_mes
                self.mapa_asignacion[piso_id].append({
                    "pago_id": pago_id,
                    "mes_destino": mes_actual,
                    "importe_aplicado": round(pago_a_mes, 2)
                })
                restante = round(restante - pago_a_mes, 2)
                logger.info(f"[CUOTAS]     Sobrante tras este mes: {restante}€")

        # Si sobra dinero tras recorrer el horizonte, se guarda como crédito acumulado
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
