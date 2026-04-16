import pandas as pd
import io
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(".")))

from backend.app.procesamiento.clasificador import ClasificadorMovimientos


def detectar_columnas(df):
    cols = {c.lower().strip(): c for c in df.columns}

    resultado = {"fecha": None, "concepto": None, "importe": None, "saldo": None}

    for nombre_original, nombre_lower in cols.items():
        if resultado["fecha"] is None and any(
            p in nombre_lower for p in ["fecha", "date", "fec"]
        ):
            resultado["fecha"] = nombre_original
        if resultado["concepto"] is None and any(
            p in nombre_lower
            for p in [
                "concepto",
                "descripcion",
                "descrip",
                "detalle",
                "texto",
                "concept",
            ]
        ):
            resultado["concepto"] = nombre_original
        if resultado["importe"] is None and any(
            p in nombre_lower
            for p in [
                "importe",
                "amount",
                " valor",
                "quant",
                " debit",
                "credit",
                "haber",
                "debe",
            ]
        ):
            resultado["importe"] = nombre_original
        if resultado["saldo"] is None and any(
            p in nombre_lower for p in ["saldo", "balance"]
        ):
            resultado["saldo"] = nombre_original

    if resultado["importe"] is None:
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                resultado["importe"] = col
                break

    return resultado


def limpiar_importe(valor):
    if pd.isna(valor):
        return 0.0
    if isinstance(valor, (int, float)):
        return float(valor)
    texto = str(valor).strip()
    texto = texto.replace(".", "").replace(",", ".")
    texto = re.sub(r"[^\d.\-]", "", texto)
    try:
        return float(texto)
    except:
        return 0.0


# Test the endpoint logic manually
with open("test_extracto.csv", "r") as f:
    df = pd.read_csv(f)

print("Columnas detectadas:", detectar_columnas(df))

columnas = detectar_columnas(df)
clasificador = ClasificadorMovimientos()

movimientos = []
for idx, row in df.iterrows():
    concepto = str(row.get(columnas["concepto"], "")) if columnas["concepto"] else ""
    importe = limpiar_importe(row.get(columnas["importe"], 0))

    if importe == 0:
        continue

    fecha = None
    if columnas["fecha"]:
        fecha = row.get(columnas["fecha"])

    clasificacion = clasificador.clasificar(concepto, importe)

    movimientos.append(
        {
            "Fecha": fecha,
            "Concepto": concepto,
            "Importe": round(importe, 2),
            "Tipo": clasificacion["tipo"],
            "Categoria": clasificacion["categoria"],
            "Confianza": clasificacion["confianza"],
        }
    )

print("Movimientos:", len(movimientos))
print("First:", movimientos[0] if movimientos else "None")

df_resultado = pd.DataFrame(movimientos)
output = io.StringIO()
df_resultado.to_csv(output, index=False, encoding="utf-8")
output.seek(0)
print("CSV output:")
print(output.read())
