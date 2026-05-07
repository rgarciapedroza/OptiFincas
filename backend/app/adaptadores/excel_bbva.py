import pandas as pd
import io
from backend.app.procesamiento.buscar_pisos import detectar_fila_cabecera

def leer_extracto_excel(upload_file):
    contenido = upload_file.file.read()
    excel = pd.ExcelFile(io.BytesIO(contenido))

    df_raw = excel.parse(excel.sheet_names[0], header=None)
    header_row = detectar_fila_cabecera(df_raw)
    if header_row is None:
        raise ValueError("No se pudo detectar la fila de cabecera en el extracto Excel")

    df = excel.parse(excel.sheet_names[0], header=header_row)
    df.columns = [str(c).strip().lower() for c in df.columns]

    posibles_ordenantes = [
        "beneficiario/ordenante",
        "ordenante",
        "beneficiario",
        "titular",
        "nombre"
    ]
    col_ordenante = next((c for c in df.columns if c in posibles_ordenantes), None)

    concepto = df.get("concepto", "").astype(str)
    observ = df.get("observaciones", "").astype(str)

    if col_ordenante:
        ordenante = df[col_ordenante].fillna("").astype(str)
        df["concepto_original"] = (concepto + " " + observ + " " + ordenante).str.strip()
    else:
        df["concepto_original"] = (concepto + " " + observ).str.strip()

    return df
