import pandas as pd
import io
import re
from fastapi import UploadFile, HTTPException
from typing import Dict
from backend.app.adaptadores.csv_bbva import leer_extracto_csv
from backend.app.adaptadores.excel_bbva import leer_extracto_excel


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
        col_lower = col.lower().strip()

        if resultado["fecha"] is None and ("f. contable" in col_lower or "contable" in col_lower):
            resultado["fecha"] = col

        if resultado["fecha_valor"] is None and ("f. valor" in col_lower or "valor" in col_lower):
            resultado["fecha_valor"] = col

        if resultado["concepto"] is None and "concepto" in col_lower:
            resultado["concepto"] = col

        if resultado["observaciones"] is None and "observ" in col_lower:
            resultado["observaciones"] = col

        if resultado["observaciones"] is None and any(x in col_lower for x in [
            "detalle", "información", "informacion", "descripcion", "descripción",
            "comentario", "texto", "concepto (1)", "detalle operación", "detalle operacion"
        ]):
            resultado["observaciones"] = col

        if resultado["ordenante"] is None and ("ordenante" in col_lower or "beneficiario" in col_lower):
            resultado["ordenante"] = col

        if resultado["ordenante"] is None and any(x in col_lower for x in [
            "nombre", "titular", "beneficiario", "beneficiario/ordenante"
        ]):
            resultado["ordenante"] = col

        if resultado["importe"] is None and "importe" in col_lower:
            resultado["importe"] = col

        if resultado["saldo"] is None and "saldo" in col_lower:
            resultado["saldo"] = col

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
    if not fecha:
        return None
    try:
        return pd.to_datetime(fecha, dayfirst=True).strftime("%Y-%m-%d")
    except:
        try:
            return pd.to_datetime(str(fecha), dayfirst=True).strftime("%Y-%m-%d")
        except:
            return None


def cargar_extracto_a_df(extracto: UploadFile) -> pd.DataFrame:
    extension = extracto.filename.lower().split(".")[-1]
    if extension == "csv":
        return leer_extracto_csv(extracto)
    if extension in ("xlsx", "xls"):
        return leer_extracto_excel(extracto)
    raise HTTPException(status_code=400, detail="Formato de extracto no soportado")


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
