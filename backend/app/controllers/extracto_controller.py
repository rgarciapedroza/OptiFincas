import io
import base64
import os
import re
import pandas as pd
from datetime import datetime
from fastapi import UploadFile, HTTPException
from fastapi.responses import StreamingResponse
from backend.app.ml.clasificador_ml import ClasificadorML
from backend.app.servicios.procesar_movimientos import procesar_extracto_y_registros
from backend.app.servicios.procesar_extracto import detectar_columnas, limpiar_importe
from backend.app.servicios.resumen import calcular_resumen_categorias_con_tipo
from backend.app.procesamiento.generar_excel import crear_excel_actualizado
from backend.app.procesamiento.procesar_excel_contable import obtener_nombre_hoja

clasificador = ClasificadorML()
_movimientos_procesados = []
_registros_contenido = None
_registros_filename = "Registros.xlsx"
_extracto_filename = "Extracto.csv" # Nueva variable global para el nombre del extracto
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
    global _movimientos_procesados, _registros_contenido, _registros_filename, _extracto_filename

    # Guardar contenido de registros para uso posterior en descargas históricas
    _registros_contenido = await registros.read()
    _registros_filename = registros.filename
    registros.file.seek(0)
    _extracto_filename = extracto.filename # Guardar el nombre del archivo de extracto

    resultado = procesar_extracto_y_registros(extracto, registros, clasificador)
    
    es_excel = extracto.filename.lower().endswith((".xlsx", ".xls"))
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
        "resumen_categorias": resultado["resumen_categorias"],
        "es_excel": es_excel
    }

async def confirmar_controller(movimientos_actualizados: list[dict], modo: str = "mensual"):
    global _movimientos_procesados, _registros_contenido, _registros_filename, _extracto_filename

    _movimientos_procesados = movimientos_actualizados

    # Crear un DataFrame de Pandas para asegurar el orden de las columnas
    df_movimientos = pd.DataFrame(movimientos_actualizados)

    es_excel_extracto = _extracto_filename.lower().endswith((".xlsx", ".xls"))

    # Asegurar que las columnas existan y tengan el nombre correcto antes de reordenar
    mapeo = {
        "fecha": "FECHA", 
        "ordenante": "ORDENANTE", 
        "beneficiario": "ORDENANTE",
        "observaciones": "OBSERVACIONES",
        "observación": "OBSERVACIONES",
        "importe": "IMPORTE", 
        "saldo": "SALDO", 
        "concepto": "CONCEPTO"
    }
    
    # Normalización agresiva de columnas basadas en el mapeo
    for col_old, col_new in mapeo.items():
        # Si es un CSV, no queremos crear la columna ORDENANTE
        if col_new == "ORDENANTE" and not es_excel_extracto:
            continue
        for actual_col in df_movimientos.columns:
            if col_old in actual_col.lower():
                # Si la columna destino está vacía o es 0, intentamos llenarla con el valor de la columna encontrada
                if col_new not in df_movimientos.columns:
                    df_movimientos[col_new] = df_movimientos[actual_col]
                else:
                    # Evitar convertir NaN a la cadena literal "nan"
                    val_clean = df_movimientos[col_new].fillna("")
                    serie_destino = val_clean.astype(str).str.strip()
                    vacio = serie_destino.isin(['', '0', '0.0', 'nan', 'None']).all()
                    if vacio:
                        df_movimientos[col_new] = df_movimientos[actual_col]

    # Asegurar que las columnas clave existan (excluyendo ORDENANTE si no es excel)
    columnas_clave = ["FECHA", "OBSERVACIONES", "IMPORTE", "SALDO", "CONCEPTO"]
    if es_excel_extracto:
        columnas_clave.insert(1, "ORDENANTE")

    for col in columnas_clave:
        if col not in df_movimientos.columns:
            df_movimientos[col] = ""
        else:
            # Limpieza final para evitar "nan" en el Excel
            if col not in ["IMPORTE", "SALDO"]:
                df_movimientos[col] = df_movimientos[col].fillna("").astype(str).replace("nan", "")

    # Convertir a numérico para evitar que el Excel trate los números como texto
    for col_num in ["IMPORTE", "SALDO"]:
        # Limpiar posibles formatos de string antes de convertir
        if df_movimientos[col_num].dtype == object:
            df_movimientos[col_num] = df_movimientos[col_num].astype(str).str.replace(',', '.')
        df_movimientos[col_num] = pd.to_numeric(df_movimientos[col_num], errors="coerce").fillna(0)

    # Definir el orden deseado de las columnas principales
    core_cols_order = ["FECHA"]
    if es_excel_extracto:
        core_cols_order.append("ORDENANTE")
    core_cols_order.extend(["OBSERVACIONES", "IMPORTE", "SALDO", "CONCEPTO"])

    # Obtener todas las columnas existentes en el DataFrame
    all_cols = df_movimientos.columns.tolist()
    
    # Construir el orden final de las columnas: las principales primero, luego el resto
    final_cols_order = [col for col in core_cols_order if col in all_cols]
    final_cols_order.extend([col for col in all_cols if col not in final_cols_order])

    # Reindexar el DataFrame para aplicar el orden de las columnas
    df_movimientos = df_movimientos.reindex(columns=final_cols_order)
    
    # Determinar nombre de hoja (MES AÑO en MAYUSCULAS) basado en los datos
    hoja_nombre = obtener_nombre_hoja(_mes, _año).upper()
    if movimientos_actualizados:
        for mov in movimientos_actualizados:
            f = mov.get("FECHA")
            if f and len(str(f)) >= 10:
                try:
                    dt = datetime.strptime(str(f), "%d/%m/%Y")
                    meses = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
                             "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
                    hoja_nombre = f"{meses[dt.month-1]} {dt.year}"
                    break
                except: continue

    nombre_base_registros = os.path.splitext(_registros_filename)[0]
    
    # Limpiar el nombre del archivo histórico de mes y año para el título interno
    nombre_limpio = nombre_base_registros
    meses_es = r"(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)"
    
    if not nombre_limpio:
        nombre_limpio = "Registros"

    if modo == "mensual":
        # Para el mensual, se crea un nuevo libro desde cero
        base_excel_content = None
        # El nombre del archivo de descarga para el mensual mantiene el formato original con fecha
        nombre_archivo = f"{nombre_base_registros} {hoja_nombre}.xlsx"
    else:
        # Para el histórico, se usa el contenido original
        base_excel_content = _registros_contenido
        nombre_archivo = f"{nombre_limpio}.xlsx"

    # El título que aparece DENTRO del Excel (antes de la tabla) siempre es el nombre limpio del histórico
    document_name_for_excel = nombre_limpio

    # Generar el Excel usando el servicio de procesamiento que incluye estilos
    excel_bytes = crear_excel_actualizado(
        contenido_excel=base_excel_content,
        nombre_hoja=hoja_nombre,
        movimientos_nuevos=df_movimientos.to_dict(orient="records"), # Convertir a lista de diccionarios con el orden de columnas garantizado
        resultado_conciliacion={}, # No se requiere conciliación completa para esta descarga
        mes=_mes,
        año=_año,
        nombre_documento=document_name_for_excel,
        es_excel=es_excel_extracto
    )

    excel_base64 = base64.b64encode(excel_bytes).decode("utf-8")

    return {
        "estado": "ok",
        "mensaje": f"Documento {modo} generado correctamente",
        "excel_contenido": excel_base64,
        "nombre_archivo": nombre_archivo
    }

async def descargar_controller(movimientos_actualizados: list[dict], formato: str):
    df = pd.DataFrame(movimientos_actualizados)

    # (Usamos la extensión real del extracto que se guardó globalmente en `procesar_dos_archivos_controller`).
    es_excel_extracto = _extracto_filename.lower().endswith((".xlsx", ".xls"))

    cols_order = [
        "FECHA",
        "ORDENANTE" if (es_excel_extracto and "ORDENANTE" in df.columns) else None,
        "OBSERVACIONES",
        "IMPORTE",
        "SALDO",
        "CONCEPTO",
        "piso",
        "tipo",
        "categoria",
        "confianza",
        "metodo_piso"
    ]

    cols_order = [c for c in cols_order if c is not None and c in df.columns]

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
    es_excel_extracto = _extracto_filename.lower().endswith((".xlsx", ".xls"))

    cols_order = ["FECHA"]
    if es_excel_extracto:
        cols_order.append("ORDENANTE")
    cols_order.extend(["OBSERVACIONES", "IMPORTE", "SALDO", "CONCEPTO"])

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
