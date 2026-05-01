import pandas as pd
import re
from typing import Dict, List, Optional, Tuple
from difflib import SequenceMatcher

UMBRAL_SIMILITUD_EXACTA = 1.0
UMBRAL_SIMILITUD_ALTA = 0.90
UMBRAL_SIMILITUD_MEDIA = 0.75
UMBRAL_SIMILITUD_BAJA = 0.60
TOLERANCIA_IMPORTE = 0.01

def normalizar_texto(texto: str) -> str:
    if not texto:
        return ""
    
    texto = texto.lower()
    texto = re.sub(r'[^\w\s]', ' ', texto)
    texto = ' '.join(texto.split())
    
    return texto

def calcular_similitud(texto1: str, texto2: str) -> float:
    if not texto1 or not texto2:
        return 0.0
    
    t1 = normalizar_texto(texto1)
    t2 = normalizar_texto(texto2)
    
    if t1 == t2:
        return 1.0
    
    return SequenceMatcher(None, t1, t2).ratio()

def importe_coincide(importe1: float, importe2: float, tolerancia: float = TOLERANCIA_IMPORTE) -> bool:
    return abs(abs(importe1) - abs(importe2)) <= tolerancia

def fecha_coincide(fecha1: Optional[str], fecha2: Optional[str], dias_tolerancia: int = 3) -> bool:
    if not fecha1 or not fecha2:
        return True
    
    from datetime import datetime, timedelta
    
    try:
        for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"]:
            try:
                f1 = datetime.strptime(str(fecha1)[:10], fmt)
                f2 = datetime.strptime(str(fecha2)[:10], fmt)
                
                diff = abs((f1 - f2).days)
                return diff <= dias_tolerancia
            except:
                continue
        
        return True
    except:
        return True

def buscar_conciliacion_exacta(
    movimiento: Dict,
    movimientos_contable: List[Dict],
    indices_usados: set
) -> Optional[Dict]:
    importe = movimiento.get("importe", 0)
    concepto = movimiento.get("concepto_normalizado", movimiento.get("concepto", ""))
    tipo = movimiento.get("tipo", "")
    
    for idx, mov_contable in enumerate(movimientos_contable):
        if idx in indices_usados:
            continue
        
        if mov_contable.get("tipo") != tipo:
            continue
        
        importe_contable = mov_contable.get("importe", 0)
        if not importe_coincide(importe, importe_contable):
            continue
        
        concepto_contable = mov_contable.get("concepto_normalizado", mov_contable.get("concepto", ""))
        similitud = calcular_similitud(concepto, concepto_contable)
        
        if similitud >= UMBRAL_SIMILITUD_ALTA:
            return {
                "idx_contable": idx,
                "movimiento_contable": mov_contable,
                "similitud": similitud,
                "tipo_conciliacion": "exacta",
            }
    
    return None

def buscar_conciliacion_parcial(
    movimiento: Dict,
    movimientos_contable: List[Dict],
    indices_usados: set,
    buscar_por_importe: bool = True
) -> Optional[Dict]:
    importe = movimiento.get("importe", 0)
    concepto = movimiento.get("concepto_normalizado", movimiento.get("concepto", ""))
    tipo = movimiento.get("tipo", "")
    
    mejores_opciones = []
    
    for idx, mov_contable in enumerate(movimientos_contable):
        if idx in indices_usados:
            continue
        
        if mov_contable.get("tipo") != tipo:
            continue
        
        importe_contable = mov_contable.get("importe", 0)
        concepto_contable = mov_contable.get("concepto_normalizado", mov_contable.get("concepto", ""))
        
        similitud = calcular_similitud(concepto, concepto_contable)
        
        if buscar_por_importe:
            if importe_coincide(importe, importe_contable, tolerancia=abs(importe) * 0.05):
                if similitud >= UMBRAL_SIMILITUD_MEDIA:
                    mejores_opciones.append({
                        "idx_contable": idx,
                        "movimiento_contable": mov_contable,
                        "similitud": similitud,
                        "tipo_conciliacion": "importe",
                    })
        else:
            if similitud >= UMBRAL_SIMILITUD_MEDIA:
                mejores_opciones.append({
                    "idx_contable": idx,
                    "movimiento_contable": mov_contable,
                    "similitud": similitud,
                    "tipo_conciliacion": "concepto",
                })
    
    if mejores_opciones:
        mejores_opciones.sort(key=lambda x: x["similitud"], reverse=True)
        return mejores_opciones[0]
    
    return None

def detectar_duplicados(movimientos: List[Dict]) -> List[Tuple[int, int]]:
    duplicados = []
    
    for i in range(len(movimientos)):
        for j in range(i + 1, len(movimientos)):
            m1 = movimientos[i]
            m2 = movimientos[j]
            
            if not importe_coincide(m1.get("importe", 0), m2.get("importe", 0)):
                continue
            
            concepto1 = m1.get("concepto_normalizado", m1.get("concepto", ""))
            concepto2 = m2.get("concepto_normalizado", m2.get("concepto", ""))
            
            similitud = calcular_similitud(concepto1, concepto2)
            
            if similitud >= UMBRAL_SIMILITUD_ALTA:
                duplicados.append((i, j))
    
    return duplicados

def conciliar_movimientos(
    movimientos_extracto: List[Dict],
    movimientos_contable: List[Dict]
) -> Dict:
    conciliados = []
    no_conciliados = []
    diferencias = []
    duplicados_encontrados = []
    
    indices_contable_usados = set()
    indices_extracto_procesados = set()
    
    duplicados_extracto = detectar_duplicados(movimientos_extracto)
    
    duplicados_ids = set()
    for dup in duplicados_extracto:
        duplicados_ids.add(dup[0])
        duplicados_ids.add(dup[1])
    
    for idx_extracto, mov_extracto in enumerate(movimientos_extracto):
        if idx_extracto in indices_extracto_procesados:
            continue
        
        importe = mov_extracto.get("importe", 0)
        tipo = mov_extracto.get("tipo", "")
        
        resultado = buscar_conciliacion_exacta(
            mov_extracto,
            movimientos_contable,
            indices_contable_usados
        )
        
        if resultado:
            idx_contable = resultado["idx_contable"]
            mov_contable = resultado["movimiento_contable"]
            
            importe_contable = mov_contable.get("importe", 0)
            diferencia = abs(importe) - abs(importe_contable)
            
            if abs(diferencia) > TOLERANCIA_IMPORTE:
                diferencias.append({
                    "movimiento_extracto": mov_extracto,
                    "movimiento_contable": mov_contable,
                    "importe_extracto": importe,
                    "importe_contable": importe_contable,
                    "diferencia": round(diferencia, 2),
                    "tipo_conciliacion": resultado["tipo_conciliacion"],
                })
            else:
                conciliados.append({
                    "movimiento_extracto": mov_extracto,
                    "movimiento_contable": mov_contable,
                    "importe_extracto": importe,
                    "importe_contable": importe_contable,
                    "diferencia": round(diferencia, 2),
                    "similitud": resultado["similitud"],
                    "tipo_conciliacion": resultado["tipo_conciliacion"],
                })
            
            indices_contable_usados.add(idx_contable)
            indices_extracto_procesados.add(idx_extracto)
            continue
        
        resultado = buscar_conciliacion_parcial(
            mov_extracto,
            movimientos_contable,
            indices_contable_usados,
            buscar_por_importe=True
        )
        
        if resultado:
            idx_contable = resultado["idx_contable"]
            mov_contable = resultado["movimiento_contable"]
            
            importe_contable = mov_contable.get("importe", 0)
            diferencia = abs(importe) - abs(importe_contable)
            
            diferencias.append({
                "movimiento_extracto": mov_extracto,
                "movimiento_contable": mov_contable,
                "importe_extracto": importe,
                "importe_contable": importe_contable,
                "diferencia": round(diferencia, 2),
                "tipo_conciliacion": resultado["tipo_conciliacion"],
            })
            
            indices_contable_usados.add(idx_contable)
            indices_extracto_procesados.add(idx_extracto)
            continue
        
        no_conciliados.append({
            "movimiento": mov_extracto,
            "tipo": tipo,
            "importe": round(importe, 2),
            "es_duplicado": idx_extracto in duplicados_ids,
        })
        indices_extracto_procesados.add(idx_extracto)
    
    movimientos_contable_no_usados = [
        mov for idx, mov in enumerate(movimientos_contable)
        if idx not in indices_contable_usados
    ]
    
    resumen = {
        "total_extracto": len(movimientos_extracto),
        "total_contable": len(movimientos_contable),
        "conciliados": len(conciliados),
        "no_conciliados": len(no_conciliados),
        "diferencias": len(diferencias),
        "duplicados": len(duplicados_extracto),
        "movimientos_contable_no_encontrados": len(movimientos_contable_no_usados),
        "ingresos_conciliados": sum(1 for c in conciliados if c.get("movimiento_extracto", {}).get("tipo") == "ingreso"),
        "gastos_conciliados": sum(1 for c in conciliados if c.get("movimiento_extracto", {}).get("tipo") == "gasto"),
        "ingresos_nuevos": sum(1 for n in no_conciliados if n.get("tipo") == "ingreso"),
        "gastos_nuevos": sum(1 for n in no_conciliados if n.get("tipo") == "gasto"),
    }
    
    return {
        "conciliados": conciliados,
        "no_conciliados": no_conciliados,
        "diferencias": diferencias,
        "duplicados": duplicados_extracto,
        "movimientos_contable_no_usados": movimientos_contable_no_usados,
        "resumen": resumen,
    }

def generar_resumen_mes(
    mes: int,
    año: int,
    resultado_conciliacion: Dict
) -> Dict:
    resumen = resultado_conciliacion.get("resumen", {})
    
    ingresos_conciliados = 0.0
    gastos_conciliados = 0.0
    
    for conc in resultado_conciliacion.get("conciliados", []):
        mov = conc.get("movimiento_extracto", {})
        if mov.get("tipo") == "ingreso":
            ingresos_conciliados += abs(mov.get("importe", 0))
        else:
            gastos_conciliados += abs(mov.get("importe", 0))
    
    ingresos_nuevos = 0.0
    gastos_nuevos = 0.0
    
    for no_conc in resultado_conciliacion.get("no_conciliados", []):
        mov = no_conc.get("movimiento", {})
        if mov.get("tipo") == "ingreso":
            ingresos_nuevos += abs(mov.get("importe", 0))
        else:
            gastos_nuevos += abs(mov.get("importe", 0))
    
    diferencias_total = sum(
        abs(d.get("diferencia", 0)) 
        for d in resultado_conciliacion.get("diferencias", [])
    )
    
    meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ]
    
    return {
        "mes": meses[mes - 1],
        "año": año,
        "ingresos_conciliados": round(ingresos_conciliados, 2),
        "gastos_conciliados": round(gastos_conciliados, 2),
        "ingresos_nuevos": round(ingresos_nuevos, 2),
        "gastos_nuevos": round(gastos_nuevos, 2),
        "diferencias_total": round(diferencias_total, 2),
        "total_ingresos": round(ingresos_conciliados + ingresos_nuevos, 2),
        "total_gastos": round(gastos_conciliados + gastos_nuevos, 2),
        "movimientos_conciliados": resumen.get("conciliados", 0),
        "movimientos_no_conciliados": resumen.get("no_conciliados", 0),
        "movimientos_diferencias": resumen.get("diferencias", 0),
    }

Conciliacion = conciliar_movimientos
DetectarDuplicados = detectar_duplicados