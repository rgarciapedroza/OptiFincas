import pandas as pd
import io
import re
from fastapi import UploadFile, HTTPException

from typing import Dict, Optional, List
from app.adaptadores.csv_bbva import leer_extracto_csv
from app.adaptadores.excel_bbva import leer_extracto_excel

def find_col_by_keywords(cols_actuales: List[str], keywords: List[str], exclude_keywords: List[str] = None) -> Optional[str]:
    """
    Helper para encontrar columnas de forma flexible.
    Busca palabras clave (case-insensitive) y puede excluir otras. Prioriza coincidencias exactas.
    """
    # Primero, buscar coincidencias exactas (ignorando case y espacios)
    for kw in keywords:
        for col_actual in cols_actuales:
            if col_actual.lower().strip() == kw.lower().strip():
                return col_actual
    # Si no hay coincidencia exacta, buscar palabras clave contenidas
    for kw in keywords:
        for col_actual in cols_actuales:
            col_lower = col_actual.lower().strip()
            if kw.lower().strip() in col_lower:
                if exclude_keywords and any(ex_kw.lower().strip() in col_lower for ex_kw in exclude_keywords):
                    continue
                return col_actual
    return None


def detectar_columnas(df: pd.DataFrame) -> Dict[str, str]:
    cols = list(df.columns)
    resultado = {
        "fecha": None,
        "fecha_valor": None,
        "concepto": None,
        "observaciones": None,
        "importe": None,
        "saldo": None,
        "ordenante": None
    }

    for col in cols:
        # Usar el helper find_col_by_keywords para todas las detecciones
        if resultado["fecha"] is None: # Ampliamos palabras clave para fecha
            resultado["fecha"] = find_col_by_keywords(cols, ["fecha", "f.cont", "f.oper", "proceso", "date", "f.contable", "f.operacion", "f. oper", "fecha contable", "fecha de operacion", "fecha de valor"])

        if resultado["fecha_valor"] is None: # Ampliamos palabras clave para fecha_valor
            resultado["fecha_valor"] = find_col_by_keywords(cols, ["fecha valor", "f.valor", "fecha de valor"])

        if resultado["concepto"] is None: # Ampliamos palabras clave para concepto
            resultado["concepto"] = find_col_by_keywords(cols, ["concepto", "piso", "unidad", "apartamento", "vivienda"])

        if resultado["observaciones"] is None: # Ampliamos palabras clave para observaciones
            resultado["observaciones"] = find_col_by_keywords(cols, ["observaciones", "observ", "detalle", "informacion", "descripcion", "comentario", "texto", "concepto original", "detalle operacion"])

        if resultado["ordenante"] is None: # Ampliamos palabras clave para ordenante
            resultado["ordenante"] = find_col_by_keywords(cols, ["ordenante", "beneficiario", "titular", "nombre", "benef"])

        if resultado["importe"] is None: # Ampliamos palabras clave para importe, con exclusiones
            resultado["importe"] = find_col_by_keywords(cols, ["importe", "monto", "cantidad", "euros", "amount", "valor"], exclude_keywords=["saldo", "fecha", "f.cont", "f.oper", "proceso", "contable", "f.valor"])

        if resultado["saldo"] is None: # Ampliamos palabras clave para saldo
            resultado["saldo"] = find_col_by_keywords(cols, ["saldo", "balance", "disponible"])

    return resultado


def limpiar_importe(valor) -> float:
    if pd.isna(valor):
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip().replace(".", "").replace(",", ".")
    texto = re.sub(r"[^\d.\-]", "", texto)
    try:
        return float(texto)
    except:
        return 0.0


def normalizar_fecha(fecha) -> str:
    if fecha is None:
        return None

    # Si viene como solo guiones ("-", "--", "—", etc.), no es una fecha válida
    texto = str(fecha).strip()
    if not texto or all(ch in "-–—_ ." for ch in texto):
        return None

    try:
        return pd.to_datetime(fecha, dayfirst=True).strftime("%d/%m/%Y")
    except:
        try:
            return pd.to_datetime(texto, dayfirst=True).strftime("%d/%m/%Y")
        except:
            return None



def cargar_extracto_a_df(extracto: UploadFile) -> pd.DataFrame:
    extension = extracto.filename.lower().split(".")[-1]
    if extension == "csv":
        return leer_extracto_csv(extracto)
    if extension in ("xlsx", "xls"):
        return leer_extracto_excel(extracto)
    raise HTTPException(status_code=400, detail="Formato de extracto no soportado")


def detectar_fila_cabecera(df_raw: pd.DataFrame) -> Optional[int]:
    """Detecta la fila de cabecera buscando palabras clave."""
    keywords = ["fecha", "importe", "saldo", "concepto", "observaciones", "ordenante", "f.cont", "valor"]
    
    # Palabras clave esenciales (al menos una de estas debe estar para ser una cabecera fuerte)
    essential_keywords = ["fecha", "importe", "f.cont", "f.oper", "debe", "haber", "date", "amount"]
    # Todas las palabras clave posibles para una cabecera
    all_keywords = [
        "fecha", "importe", "saldo", "concepto", "observaciones", "ordenante",
        "f.cont", "valor", "debe", "haber", "proceso", "date", "f.contable",
        "f.operacion", "f. oper", "fecha contable", "fecha de operacion",
        "fecha de valor", "monto", "cantidad", "euros", "amount", "total",
        "balance", "disponible", "piso", "unidad", "apartamento", "vivienda", "codigo",
        "referencia", "beneficiario", "titular", "nombre", "remitente",
        "descripcion", "comentario", "texto", "glosa", "saldo final", "saldo actual", "cargo", "abono", "datos", "contraparte",
        "movimiento", "transaccion"
    ]

    best_row_idx = None
    max_keyword_matches = 0
    best_row_has_essential = False # Flag to indicate if the best candidate so far has essential keywords

    # Buscar en las primeras 50 filas (aumentado por si las cabeceras están muy abajo o hay mucho ruido)
    for i in range(min(df_raw.shape[0], 50)):
        raw_row = df_raw.iloc[i].tolist()
        row_values_lower = [str(x).lower().strip() for x in raw_row]
        row_str_combined = " ".join(row_values_lower) # Para buscar palabras clave en toda la fila
        
        has_essential_in_current_row = any(ek in row_str_combined for ek in essential_keywords)

        # Heurística 0: Contar celdas reales (no nulas)
        non_empty_count = sum(1 for x in raw_row if pd.notna(x) and str(x).strip() != "" and str(x).lower() != "nan")
        if non_empty_count < 2: # Una fila de cabecera suele tener al menos 2 o 3 nombres de columna
            continue

        # Heurística 1: Si la primera celda es muy larga y no contiene palabras clave esenciales,
        # es probable que sea una fila de resumen, no una cabecera.
        if len(row_values_lower[0]) > 45 and not has_essential_in_current_row:
            continue # Saltar esta fila, es probable que sea un resumen

        # Heurística 2: Si la fila contiene muchas columnas "UNNAMED", es probable que no sea la cabecera real.
        unnamed_cols_count = sum(1 for val in row_values_lower if "unnamed" in val)
        if unnamed_cols_count > (non_empty_count / 2) and non_empty_count > 3: # Más de la mitad son UNNAMED y hay al menos 4 columnas
            continue

        current_matches = sum(1 for kw in all_keywords if any(kw in val for val in row_values_lower))
        
        # Lógica de selección de la mejor fila de cabecera
        # Priorizamos filas que contengan palabras clave esenciales
        if has_essential_in_current_row:
            if not best_row_has_essential or current_matches > max_keyword_matches:
                max_keyword_matches = current_matches
                best_row_idx = i
                best_row_has_essential = True
        elif not best_row_has_essential and current_matches > max_keyword_matches:
            # Si aún no hemos encontrado una fila con esenciales, pero esta tiene más matches generales
            max_keyword_matches = current_matches
            best_row_idx = i
            
    # Final decision: a header must have at least one essential keyword,
    # or at least 2 general keywords if no essential keyword was ever found.
    if best_row_idx is not None and (best_row_has_essential or max_keyword_matches >= 2):
        return best_row_idx
        
    return None


def load_df_from_excel_sheet_robust(excel_file: pd.ExcelFile, sheet_name: str) -> pd.DataFrame:
    """Carga una hoja de Excel detectando automáticamente dónde empiezan los datos."""
    df_raw = excel_file.parse(sheet_name, header=None)
    
    # Intentar detectar la cabecera
    header_row_idx = detectar_fila_cabecera(df_raw)

    if header_row_idx is not None:
        df = excel_file.parse(sheet_name, header=header_row_idx)
    else:
        # Si no se detecta una cabecera clara, probar con la primera fila como cabecera
        df = excel_file.parse(sheet_name, header=0)
        
    if df.empty:
        return pd.DataFrame()

    # Eliminar filas completamente vacías después de cargar el DataFrame
    df.dropna(how='all', inplace=True)

    # Normalizar nombres de columnas
    df.columns = [str(col).strip().upper() for col in df.columns]
    
    return df


def cargar_registros_a_excel(registros: UploadFile):
    contenido = registros.file.read()
    registros.file.seek(0)
    if registros.filename.lower().endswith(".csv"):
        return {"CSV": pd.read_csv(io.StringIO(contenido.decode("latin-1")))}
    return pd.ExcelFile(io.BytesIO(contenido))


def buscar_piso_regex_en_fila(row: pd.Series, columnas: Dict[str, str]):
    if not columnas.get("observaciones"):
        return None
    texto = str(row.get(columnas["observaciones"], ""))
    m = re.search(r"\b(\d{1,2}\s*[A-Z])\b", texto, re.IGNORECASE)
    if m:
        return m.group(1).replace(" ", "").upper()
    return None