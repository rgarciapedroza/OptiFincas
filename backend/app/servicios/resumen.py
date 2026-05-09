from typing import List, Dict


def calcular_resumen_categorias(movimientos: List[Dict]) -> Dict[str, Dict[str, float]]:
    resumen = {}
    for m in movimientos:
        cat = m["categoria"]
        if cat not in resumen:
            resumen[cat] = {"ingresos": 0, "gastos": 0}
        if m["importe"] > 0:
            resumen[cat]["ingresos"] += m["importe"]
        else:
            resumen[cat]["gastos"] += abs(m["importe"])
    return resumen


def calcular_resumen_categorias_con_tipo(movimientos: List[Dict]) -> Dict[str, Dict[str, float | str]]:
    resumen = {}
    for m in movimientos:
        cat = m["categoria"]
        if cat not in resumen:
            resumen[cat] = {"ingresos": 0, "gastos": 0, "tipo": m["tipo"]}
        if m["importe"] > 0:
            resumen[cat]["ingresos"] += m["importe"]
        else:
            resumen[cat]["gastos"] += abs(m["importe"])
    return resumen
