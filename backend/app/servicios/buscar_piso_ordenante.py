from typing import List, Dict, Tuple, Iterable
import re
import pandas as pd
from app.procesamiento.buscar_pisos import detectar_fila_cabecera, similar, es_nombre_o_apellido

def extraer_nombres_desde_concepto(concepto: str) -> List[str]:
    concepto = concepto.upper()
    partes = concepto.split()
    nombres = []
    # Recorremos todas las partes y filtramos las que parecen nombres (solo letras y longitud > 2)
    for p in partes:
        if es_nombre_o_apellido(p):
            nombres.append(p)
    return nombres


def iterar_hojas_excel(excel_registros) -> Iterable[Tuple[str, pd.DataFrame]]:
    if isinstance(excel_registros, dict):
        return excel_registros.items()
    return [(nombre, None) for nombre in excel_registros.sheet_names]


def obtener_df_registro_por_hoja(excel_registros, nombre_hoja: str, df_csv):
    if df_csv is not None:
        return df_csv
    df_raw = excel_registros.parse(nombre_hoja, header=None)
    header_row = detectar_fila_cabecera(df_raw)
    if header_row is None:
        return None
    df = excel_registros.parse(nombre_hoja, header=header_row)
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df