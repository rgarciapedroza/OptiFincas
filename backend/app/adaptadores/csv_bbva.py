import pandas as pd
import io

def leer_extracto_csv(upload_file):

    contenido = upload_file.file.read()

    try:
        df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
    except:
        df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))

    df.columns = [str(c).strip().lower() for c in df.columns]

    concepto = df["concepto"].fillna("").astype(str) if "concepto" in df.columns else pd.Series("", index=df.index)
    observ = df["observaciones"].fillna("").astype(str) if "observaciones" in df.columns else pd.Series("", index=df.index)

    posibles_ordenantes = ["beneficiario/ordenante", "ordenante", "beneficiario", "titular", "nombre"]
    col_ordenante = next((c for c in df.columns if c in posibles_ordenantes), None)

    if col_ordenante:
        ordenante = df[col_ordenante].fillna("").astype(str)
        df["concepto_original"] = (concepto + " " + observ + " " + ordenante).str.strip()
    else:
        df["concepto_original"] = (concepto + " " + observ).str.strip()

    return df