from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import io
import json
import re
import sys
import os
from datetime import datetime
from typing import Dict, List, Optional

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CLASIFICADOR_CACHE = None


def get_clasificador():
    global CLASIFICADOR_CACHE
    if CLASIFICADOR_CACHE is None:
        try:
            from backend.app.procesamiento.clasificador import ClasificadorMovimientos
        except ImportError:
            from app.procesamiento.clasificador import ClasificadorMovimientos

        CLASIFICADOR_CACHE = ClasificadorMovimientos()
    return CLASIFICADOR_CACHE


def detectar_columnas(df: pd.DataFrame) -> Dict[str, str]:
    cols = list(df.columns)
    resultado = {"fecha": None, "concepto": None, "importe": None, "saldo": None}

    for col in cols:
        col_lower = col.lower().strip()

        if resultado["fecha"] is None and ("fecha" in col_lower or "date" in col_lower):
            resultado["fecha"] = col

        if resultado["concepto"] is None and (
            "concepto" in col_lower
            or "observaciones" in col_lower
            or "descripcion" in col_lower
        ):
            resultado["concepto"] = col

        if resultado["importe"] is None and col_lower == "importe":
            resultado["importe"] = col

        if resultado["saldo"] is None and col_lower == "saldo":
            resultado["saldo"] = col

    if resultado["importe"] is None:
        for col in cols:
            if pd.api.types.is_numeric_dtype(df[col]):
                col_lower = col.lower()
                if "codigo" not in col_lower and "code" not in col_lower:
                    resultado["importe"] = col
                    break

    return resultado


def limpiar_importe(valor) -> float:
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


@app.get("/")
def root():
    return {"mensaje": "API de procesamiento de extractos bancarios"}


@app.post("/api/procesar-extracto")
async def procesar_extracto(file: UploadFile = File(...)):
    contenido = await file.read()

    try:
        if file.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))
            except:
                df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
        elif file.filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(contenido))
        else:
            raise HTTPException(status_code=400, detail="Formato no soportado")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer archivo: {str(e)}")

    columnas = detectar_columnas(df)

    if columnas["importe"] is None:
        raise HTTPException(status_code=400, detail="No se encontró columna de importe")

    clasificador = get_clasificador()

    movimientos = []
    for idx, row in df.iterrows():
        concepto = (
            str(row.get(columnas["concepto"], "")) if columnas["concepto"] else ""
        )
        importe = limpiar_importe(row.get(columnas["importe"], 0))

        if importe == 0:
            continue

        fecha = None
        if columnas["fecha"]:
            fecha = row.get(columnas["fecha"])

        clasificacion = clasificador.clasificar(concepto, importe)

        movimientos.append(
            {
                "fecha": str(fecha) if fecha else None,
                "concepto": concepto,
                "importe": round(importe, 2),
                "categoria": clasificacion["categoria"],
                "tipo": clasificacion["tipo"],
                "confianza": clasificacion["confianza"],
            }
        )

    total_ingresos = sum(m["importe"] for m in movimientos if m["importe"] > 0)
    total_gastos = sum(abs(m["importe"]) for m in movimientos if m["importe"] < 0)

    resumen_categorias = {}
    for m in movimientos:
        cat = m["categoria"]
        if cat not in resumen_categorias:
            resumen_categorias[cat] = {"ingresos": 0, "gastos": 0}

        if m["importe"] > 0:
            resumen_categorias[cat]["ingresos"] += m["importe"]
        else:
            resumen_categorias[cat]["gastos"] += abs(m["importe"])

    for cat in resumen_categorias:
        resumen_categorias[cat] = {
            "ingresos": round(resumen_categorias[cat]["ingresos"], 2),
            "gastos": round(resumen_categorias[cat]["gastos"], 2),
        }

    df_csv = pd.DataFrame(movimientos)
    csv_output = io.StringIO()
    df_csv.to_csv(csv_output, index=False, encoding="utf-8")
    csv_content = csv_output.getvalue()

    return {
        "nombre_archivo": file.filename,
        "total_movimientos": len(movimientos),
        "resumen_general": {
            "total_ingresos": round(total_ingresos, 2),
            "total_gastos": round(total_gastos, 2),
            "saldo_neto": round(total_ingresos - total_gastos, 2),
        },
        "movimientos_clasificados": movimientos,
        "resumen_categorias": resumen_categorias,
        "csv_contenido": csv_content,
    }


@app.post("/api/descargar-exracto")
async def descargar_extracto(file: UploadFile = File(...)):
    contenido = await file.read()

    try:
        if file.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))
            except:
                df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
        elif file.filename.lower().endswith((".xlsx", ".xls")):
            df = pd.read_excel(io.BytesIO(contenido))
        else:
            raise HTTPException(status_code=400, detail="Formato no soportado")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer archivo: {str(e)}")

    columnas = detectar_columnas(df)

    if columnas["importe"] is None:
        raise HTTPException(status_code=400, detail="No se encontró columna de importe")

    clasificador = get_clasificador()

    movimientos = []
    for idx, row in df.iterrows():
        concepto = (
            str(row.get(columnas["concepto"], "")) if columnas["concepto"] else ""
        )
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

    df_resultado = pd.DataFrame(movimientos)

    output = io.StringIO()
    df_resultado.to_csv(output, index=False, encoding="utf-8")
    output.seek(0)

    nombre_salida = file.filename.replace(".csv", "").replace(".xlsx", "")
    nombre_salida = f"{nombre_salida}_clasificado.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={nombre_salida}"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
