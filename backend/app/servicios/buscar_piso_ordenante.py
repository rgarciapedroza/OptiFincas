from typing import List, Dict, Tuple, Iterable
import re
import pandas as pd
from backend.app.procesamiento.buscar_pisos import detectar_fila_cabecera, similar


def extraer_nombres_desde_concepto(concepto: str) -> List[str]:
    concepto = concepto.upper()
    partes = concepto.split()
    nombres = []
    # Recorremos todas las partes y filtramos las que parecen nombres (solo letras y longitud > 2)
    for p in partes:
        if p.isalpha() and len(p) > 2:
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


def buscar_piso_por_ordenante_en_historico(excel_registros, mov: Dict) -> Tuple[str | None, str | None]:
    # Priorizar el texto de búsqueda de nombres que ya está limpio para Excel
    nombre_busqueda = mov.get("texto_busqueda_nombres") or mov.get("concepto_original", "")
    nombres = extraer_nombres_desde_concepto(nombre_busqueda.upper())
    if len(nombres) < 2:
        return None, None

    nombre1, nombre2 = nombres[:2]
    mejor_piso = None
    mejor_nombre_hist = None
    mejor_score = 0.0

    for nombre_hoja, df_csv in iterar_hojas_excel(excel_registros):
        df_registro = obtener_df_registro_por_hoja(excel_registros, nombre_hoja, df_csv)
        if df_registro is None:
            continue

        cols = {str(c).strip().lower(): c for c in df_registro.columns}
        col_obs = next((v for k, v in cols.items() if any(x in k for x in ["observ", "detalle", "descripcion", "texto"])), None)
        col_con = next((v for k, v in cols.items() if "concept" in k or "concepto" in k), None)

        for _, row in df_registro.iterrows():
            col_ord = next((v for k, v in cols.items() if "orden" in k or "benef" in k or "nombre" in k), None)
            texto = f"{row.get(col_obs, '')} {row.get(col_con, '')} {row.get(col_ord, '')}".upper()
            palabras = [p for p in texto.split() if p.isalpha() and len(p) > 2]
            if not palabras:
                continue

            sim1 = max(similar(nombre1, p) for p in palabras)
            sim2 = max(similar(nombre2, p) for p in palabras)

            if sim1 >= 0.85 and sim2 >= 0.85:
                m = re.search(r"\b(\d{1,2}\s*[A-Z])\b", texto)
                if m:
                    piso = m.group(1).replace(" ", "").upper()
                    score = (sim1 + sim2) / 2
                    if score > mejor_score:
                        mejor_score = score
                        mejor_piso = piso
                        mejor_nombre_hist = str(row.get(col_ord, "")) if col_ord else ""

    return mejor_piso, mejor_nombre_hist


def aplicar_busqueda_por_ordenante(excel_registros, movimientos: List[Dict]) -> List[Dict]:
    for mov in movimientos:
        if mov.get("piso"):
            continue
        piso, nombre_hist = buscar_piso_por_ordenante_en_historico(excel_registros, mov)
        if piso:
            mov["piso"] = piso
            mov["ordenante_historico"] = nombre_hist
    return movimientos