from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from backend.app.procesamiento.buscar_pisos import buscar_pisos_en_historico
import pandas as pd
import io
import re
import sys
import os
from datetime import datetime
from typing import Dict, List, Optional
import base64
from backend.app.ml.clasificador_ml import ClasificadorML

project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

app = FastAPI(title="API Procesador de Extractos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_clasificador = None
_movimientos_procesados = []
_mes = 1
_año = 2024


def get_clasificador() -> ClasificadorML:
    """Obtiene (o crea) el clasificador"""
    global _clasificador
    if _clasificador is None:
        _clasificador = ClasificadorML()
    return _clasificador


def detectar_columnas(df: pd.DataFrame) -> Dict[str, str]:
    """Detecta las columnas"""
    cols = list(df.columns)
    resultado = {
        "fecha": None,
        "concepto": None,
        "observaciones": None,
        "importe": None,
        "saldo": None
    }


    for col in cols:
        col_lower = col.lower().strip()
        if resultado["fecha"] is None and ("fecha" in col_lower or "date" in col_lower):
            resultado["fecha"] = col
        if resultado["concepto"] is None and (
            "concepto" in col_lower or "observaciones" in col_lower or "descripcion" in col_lower
        ):
            resultado["concepto"] = col
        if resultado["observaciones"] is None and "observaciones" in col_lower:
            resultado["observaciones"] = col
        if resultado["importe"] is None and col_lower == "importe":
            resultado["importe"] = col
        if resultado["saldo"] is None and col_lower == "saldo":
            resultado["saldo"] = col
    return resultado


def limpiar_importe(valor) -> float:
    """Limpia el importe"""
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
    """Convierte cualquier fecha a formato YYYY-MM-DD"""
    if not fecha:
        return None
    try:
        return pd.to_datetime(fecha, dayfirst=True).strftime("%Y-%m-%d")
    except:
        try:
            return pd.to_datetime(str(fecha), dayfirst=True).strftime("%Y-%m-%d")
        except:
            return None


@app.get("/")
def root():
    return {"mensaje": "API de procesamiento de extractos bancarios"}


@app.get("/api/opciones")
def get_opciones():
    """Obtiene las opciones para los selects del frontend"""
    clasificador = get_clasificador()
    
    return {
        "tipos": clasificador.get_tipos_disponibles(),
        "categorias_ingreso": clasificador.get_opciones_categoria("ingreso"),
        "categorias_gasto": clasificador.get_opciones_categoria("gasto"),
    }


@app.post("/api/entrenar")
async def entrenar(
    extracto: UploadFile = File(...),
    excel_contable: UploadFile = File(None)
):
    """Entrena el modelo con los datos del extracto"""
    global _mes, _año
    
    contenido = await extracto.read()
    try:
        if extracto.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))
            except:
                df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
        else:
            df = pd.read_excel(io.BytesIO(contenido))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo extracto: {str(e)}")
    
    columnas = detectar_columnas(df)
    if columnas["importe"] is None:
        raise HTTPException(status_code=400, detail="Sin columna de importe")
    
    nombre = extracto.filename.lower()
    meses = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
        "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
        "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12
    }
    for nombre_mes, numero in meses.items():
        if nombre_mes in nombre:
            _mes = numero
            break
    
    clasificador = get_clasificador()
    
    for _, row in df.iterrows():
        concepto = str(row.get(columnas["concepto"], "")) if columnas["concepto"] else ""
        importe = limpiar_importe(row.get(columnas["importe"], 0))
        if importe == 0:
            continue
        
        resultado = clasificador.clasificar(concepto, importe)
        
        clasificador.add_ejemplo(
            concepto=concepto,
            importe=importe,
            tipo=resultado["tipo"],
            categoria=resultado["categoria"],
            piso=resultado["piso"]
        )
    
    resultado = clasificador.entrenar()
    
    clasificador.guardar_estado()
    
    return {
        "estado": "ok",
        "mensajes": [resultado.get("mensaje", "Entrenamiento completado")],
        "precision": resultado.get("precision", 0.85),
        "ejemplos_entrenados": resultado.get("ejemplos_entrenados", 0)
    }


@app.post("/api/procesar-dos-archivos")
async def procesar_dos_archivos(
    extracto: UploadFile = File(...),
    registros: UploadFile = File(...)
):
    global _movimientos_procesados, _mes, _año

    contenido_extracto = await extracto.read()
    df_extracto = pd.read_excel(io.BytesIO(contenido_extracto)) \
        if not extracto.filename.lower().endswith(".csv") \
        else pd.read_csv(io.StringIO(contenido_extracto.decode("latin-1")))

    contenido_registros = await registros.read()
    if registros.filename.lower().endswith(".csv"):
        excel_registros = {"CSV": pd.read_csv(io.StringIO(contenido_registros.decode("latin-1")))}
    else:
        excel_registros = pd.ExcelFile(io.BytesIO(contenido_registros))


    columnas = detectar_columnas(df_extracto)
    clasificador = get_clasificador()

    movimientos_con_piso = []
    movimientos_sin_piso = []

    for idx, row in df_extracto.iterrows():
        concepto_base = str(row.get(columnas["concepto"], ""))
        observaciones = str(row.get(columnas["observaciones"], ""))
        concepto = f"{concepto_base} {observaciones}".strip()

        importe = limpiar_importe(row.get(columnas["importe"], 0))
        fecha = normalizar_fecha(row.get(columnas["fecha"]))

        resultado = clasificador.clasificar(concepto, importe)

        mov = {
            "id": idx,
            "fecha": fecha,
            "concepto": concepto,
            "importe": round(importe, 2),
            "piso": resultado["piso"] or "",
            "tipo": resultado["tipo"],
            "categoria": resultado["categoria"],
            "confianza": resultado["confianza"]
        }

        if mov["importe"] < 0:
            mov["piso"] = ""
            movimientos_con_piso.append(mov)
            continue

        if mov["piso"]:
            movimientos_con_piso.append(mov)
        else:
            movimientos_sin_piso.append(mov)

    recuperados = buscar_pisos_en_historico(excel_registros, movimientos_sin_piso)

    movimientos_finales = movimientos_con_piso + recuperados
    movimientos_finales = sorted(
        movimientos_finales,
            key=lambda m: (m["fecha"] is None, m["fecha"])
        )
    _movimientos_procesados = movimientos_finales

    total_ingresos = sum(m["importe"] for m in movimientos_finales if m["importe"] > 0)
    total_gastos = sum(abs(m["importe"]) for m in movimientos_finales if m["importe"] < 0)
    saldo_neto = total_ingresos - total_gastos

    resumen_categorias = {}
    for m in movimientos_finales:
        cat = m["categoria"]
        if cat not in resumen_categorias:
            resumen_categorias[cat] = {"ingresos": 0, "gastos": 0}
        if m["importe"] > 0:
            resumen_categorias[cat]["ingresos"] += m["importe"]
        else:
            resumen_categorias[cat]["gastos"] += abs(m["importe"])

    return {
        "estado": "ok",
        "nombre_archivo": extracto.filename,
        "resumen_general": {
            "total_ingresos": round(total_ingresos, 2),
            "total_gastos": round(total_gastos, 2),
            "saldo_neto": round(saldo_neto, 2)
        },
        "movimientos_clasificados": movimientos_finales,
        "resumen_categorias": resumen_categorias
    }



@app.post("/api/procesar")
async def procesar(
    extracto: UploadFile = File(...),
    mes: int = 1,
    año: int = 2024
):
    """
    Procesa el extracto y devuelve los movimientos clasificados
    """
    global _movimientos_procesados, _mes, _año
    
    _mes = mes
    _año = año
    
    contenido = await extracto.read()
    try:
        if extracto.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))
            except:
                df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
        else:
            df = pd.read_excel(io.BytesIO(contenido))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo extracto: {str(e)}")
    
    columnas = detectar_columnas(df)
    if columnas["importe"] is None:
        raise HTTPException(status_code=400, detail="Sin columna de importe")
    
    clasificador = get_clasificador()
    movimientos = []
    pisos_encontrados = set()
    
    for idx, row in df.iterrows():
        concepto_base = str(row.get(columnas["concepto"], "")) if columnas["concepto"] else ""
        observaciones = str(row.get(columnas["observaciones"], "")) if columnas["observaciones"] else ""

        concepto = f"{concepto_base} {observaciones}".strip()

        importe = limpiar_importe(row.get(columnas["importe"], 0))
        if importe == 0:
            continue
        
        fecha = normalizar_fecha(row.get(columnas["fecha"])) if columnas["fecha"] else None
        
        resultado = clasificador.clasificar(concepto, importe)
        
        movimiento = {
            "id": idx,
            "fecha": fecha,
            "concepto": concepto,
            "importe": round(importe, 2),
            "piso": resultado["piso"] or "",
            "tipo": resultado["tipo"],
            "categoria": resultado["categoria"],
            "confianza": resultado["confianza"]
        }
        
        if resultado["piso"]:
            pisos_encontrados.add(resultado["piso"])
        
        movimientos.append(movimiento)
    
    _movimientos_procesados = movimientos
    
    total_ingresos = sum(m["importe"] for m in movimientos if m["importe"] > 0)
    total_gastos = sum(abs(m["importe"]) for m in movimientos if m["importe"] < 0)
    
    resumen_categorias = {}
    for m in movimientos:
        cat = m["categoria"]
        if cat not in resumen_categorias:
            resumen_categorias[cat] = {"ingresos": 0, "gastos": 0, "tipo": m["tipo"]}
        if m["importe"] > 0:
            resumen_categorias[cat]["ingresos"] += m["importe"]
        else:
            resumen_categorias[cat]["gastos"] += abs(m["importe"])
    
    opciones = {
        "tipos": ["ingreso", "gasto"],
        "categorias_ingreso": clasificador.get_opciones_categoria("ingreso"),
        "categorias_gasto": clasificador.get_opciones_categoria("gasto"),
    }
    
    return {
        "estado": "ok",
        "total_movimientos": len(movimientos),
        "movimientos": movimientos,
        "pisos_encontrados": list(pisos_encontrados),
        "resumen": {
            "total_ingresos": round(total_ingresos, 2),
            "total_gastos": round(total_gastos, 2),
            "saldo_neto": round(total_ingresos - total_gastos, 2)
        },
        "resumen_categorias": resumen_categorias,
        "opciones": opciones
    }


@app.post("/api/confirmar")
async def confirmar(movimientos_actualizados: List[Dict]):
    """Confirma las clasificaciones y genera el CSV para descargar"""
    global _movimientos_procesados
    
    _movimientos_procesados = movimientos_actualizados
    
    df = pd.DataFrame(movimientos_actualizados)
    
    cols_order = ["fecha", "concepto", "importe", "piso", "tipo", "categoria", "confianza"]
    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]
    
    csv_output = io.StringIO()
    df.to_csv(csv_output, index=False, encoding="utf-8")
    
    csv_content = csv_output.getvalue()
    csv_base64 = base64.b64encode(csv_content.encode('utf-8')).decode('utf-8')
    
    return {
        "estado": "ok",
        "mensaje": "Confirmado y listo para descargar",
        "csv_contenido": csv_base64,
        "nombre_archivo": f"extracto_clasificado_{_mes}_{_año}.csv"
    }


@app.post("/api/descargar")
async def descargar(
    movimientos_actualizados: List[Dict],
    formato: str = "csv"
):
    """ Descarga los movimientos clasificados"""
    df = pd.DataFrame(movimientos_actualizados)
    
    cols_order = ["fecha", "concepto", "importe", "piso", "tipo", "categoria"]
    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]
    
    if formato == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Movimientos')
        mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        extension = "xlsx"
    else:
        output = io.StringIO()
        df.to_csv(output, index=False, encoding="utf-8")
        mime_type = "text/csv"
        extension = "csv"
    
    contenido = output.getvalue()
    nombre = f"extracto_clasificado_{_mes}_{_año}.{extension}"
    
    return StreamingResponse(
        io.BytesIO(contenido.encode('utf-8')),
        media_type=mime_type,
        headers={"Content-Disposition": f"attachment; filename={nombre}"}
    )


@app.post("/api/descargar-excel")
async def descargar_excel(movimientos_actualizados: List[Dict]):
    """Descarga los movimientos en formato Excel"""
    df = pd.DataFrame(movimientos_actualizados)
    
    cols_order = ["fecha", "concepto", "importe", "piso", "tipo", "categoria"]
    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]
    
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Movimientos')
    
        resumen_df = df.groupby(["tipo", "categoria"])["importe"].sum().reset_index()
        resumen_df.to_excel(writer, index=False, sheet_name='Resumen', startrow=0)
    
    nombre = f"extracto_completo_{_mes}_{_año}.xlsx"
    
    return StreamingResponse(
        output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={nombre}"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
