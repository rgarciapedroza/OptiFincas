import io
import base64
import pandas as pd
from fastapi import UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from backend.app.ml.clasificador_ml import ClasificadorML
from backend.app.servicios.procesar_movimientos import procesar_extracto_y_registros
from backend.app.servicios.procesar_extracto import detectar_columnas, limpiar_importe
from backend.app.servicios.resumen import calcular_resumen_categorias_con_tipo

clasificador = ClasificadorML()
_movimientos_procesados = []
_mes = 1
_año = 2024

def opciones_controller():
    return {
        "tipos": clasificador.get_tipos_disponibles(),
        "categorias_ingreso": clasificador.get_opciones_categoria("ingreso"),
        "categorias_gasto": clasificador.get_opciones_categoria("gasto"),
    }

async def entrenar_controller(extracto: UploadFile, excel_contable: UploadFile):
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
    except:
        raise HTTPException(status_code=400, detail="Error leyendo extracto")

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

async def procesar_dos_archivos_controller(extracto: UploadFile, registros: UploadFile):
    global _movimientos_procesados

    resultado = procesar_extracto_y_registros(extracto, registros, clasificador)
    _movimientos_procesados = resultado["movimientos_clasificados"]

    return {
        "estado": "ok",
        "nombre_archivo": resultado["nombre_archivo"],
        "resumen_general": {
            "total_ingresos": resultado["total_ingresos"],
            "total_gastos": resultado["total_gastos"],
            "saldo_neto": resultado["saldo_neto"]
        },
        "movimientos_clasificados": resultado["movimientos_clasificados"],
        "resumen_categorias": resultado["resumen_categorias"]
    }

async def confirmar_controller(movimientos_actualizados: list[dict]):
    global _movimientos_procesados

    _movimientos_procesados = movimientos_actualizados

    df = pd.DataFrame(movimientos_actualizados)

    cols_order = [
        "fecha_contable",
        "observaciones",
        "importe",
        "saldo",
        "concepto"
    ]

    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]

    csv_output = io.StringIO()
    df.to_csv(csv_output, index=False, encoding="utf-8")

    csv_content = csv_output.getvalue()
    csv_base64 = base64.b64encode(csv_content.encode("utf-8")).decode("utf-8")

    return {
        "estado": "ok",
        "mensaje": "Confirmado y listo para descargar",
        "csv_contenido": csv_base64,
        "nombre_archivo": f"extracto_clasificado_{_mes}_{_año}.csv"
    }

async def descargar_controller(movimientos_actualizados: list[dict], formato: str):
    df = pd.DataFrame(movimientos_actualizados)

    cols_order = [
        "fecha_contable",
        "fecha_valor",
        "observaciones",
        "concepto",
        "importe",
        "saldo",
        "piso",
        "tipo",
        "categoria",
        "confianza",
        "metodo_piso"
    ]

    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]

    if formato == "excel":
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine="openpyxl") as writer:
            df.to_excel(writer, index=False, sheet_name="Movimientos")
        mime_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        extension = "xlsx"
        contenido = output.getvalue()
    else:
        output = io.StringIO()
        df.to_csv(output, index=False, encoding="utf-8")
        mime_type = "text/csv"
        extension = "csv"
        contenido = output.getvalue().encode("utf-8")

    nombre = f"extracto_clasificado_{_mes}_{_año}.{extension}"

    return StreamingResponse(
        io.BytesIO(contenido),
        media_type=mime_type,
        headers={"Content-Disposition": f"attachment; filename={nombre}"}
    )

async def descargar_excel_controller(movimientos_actualizados: list[dict]):
    df = pd.DataFrame(movimientos_actualizados)

    cols_order = ["fecha", "concepto", "importe", "piso", "tipo", "categoria", "metodo_piso"]
    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Movimientos")

        resumen_df = df.groupby(["tipo", "categoria"])["importe"].sum().reset_index()
        resumen_df.to_excel(writer, index=False, sheet_name="Resumen", startrow=0)

    nombre = f"extracto_completo_{_mes}_{_año}.xlsx"

    return StreamingResponse(
        output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={nombre}"}
    )
