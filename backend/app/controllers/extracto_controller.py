import io
import base64
import os
import re
import pandas as pd
from datetime import datetime
from fastapi import UploadFile, HTTPException, File, Form
from typing import Optional, Any, Union
from fastapi.responses import StreamingResponse
from app.ml.clasificador_ml import crear_clasificador
from app.servicios.procesar_movimientos import procesar_extracto_y_registros # Importar correctamente
from app.servicios.procesar_extracto import detectar_columnas, limpiar_importe
from app.servicios.resumen import calcular_resumen_categorias_con_tipo
from app.servicios.supabase_db import supabase_client, supabase_service_role_client # Importar supabase_service_role_client
from app.procesamiento.generar_excel import crear_excel_actualizado, crear_excel_informe_finanzas
from app.procesamiento.procesar_excel_contable import obtener_nombre_hoja
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

clasificador = crear_clasificador()
_movimientos_procesados = []
_registros_contenido = None
_registros_filename = "Registros.xlsx"
_extracto_filename = "Extracto.csv" # Nueva variable global para el nombre del extracto

# Claves de encriptación consistentes
ENCRYPT_KEY = b'OptiFincasSecretKey2024_Security'
ENCRYPT_IV = b'OptiFincas_IV_16'

def desencriptar_dato(texto_encriptado: str | None, cipher: Cipher) -> str:
    if not texto_encriptado:
        return ""
    try:
        ct = base64.b64decode(texto_encriptado)
        decryptor = cipher.decryptor()
        datos_padded = decryptor.update(ct) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(datos_padded) + unpadder.finalize()).decode('utf-8')
    except Exception:
        return texto_encriptado # Fallback al original

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

    # Detección del año en el nombre del archivo
    anio_match = re.search(r"20\d{2}", nombre)
    if anio_match:
        _año = int(anio_match.group())

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

async def procesar_extracto_db_controller(
    extracto: UploadFile, 
    community_id: int = Form(...)
):
    global _movimientos_procesados, _registros_contenido, _registros_filename, _extracto_filename, _mes, _año

    _extracto_filename = extracto.filename
    df_historico = None
    _registros_filename = "Registros.xlsx"
    _registros_contenido = None

    # Si se proporciona community_id, cargamos el histórico directamente desde la base de datos
    if community_id:
        # Consultamos el nombre de la comunidad para nombrar el archivo de salida
        comm_res = supabase_client.table("comunidades").select("nombre").eq("id", community_id).execute()
        if comm_res.data and len(comm_res.data) > 0:
            _registros_filename = f"{comm_res.data[0]['nombre']}.xlsx"

        # Cargamos movimientos previos para usarlos como base de conocimiento, incluyendo extracto_id
        response_movs = supabase_service_role_client.table("movimientos").select("concepto_original,importe,piso_detectado,ordenante,fecha,extracto_id").eq("community_id", community_id).order("fecha", desc=True).execute()
        if response_movs.data:
            print(f"[DEBUG extracto_controller] Cargados {len(response_movs.data)} movimientos históricos de la base de datos para la comunidad {community_id}")
            
            # DESENCRIPTAR datos históricos para que el buscador pueda trabajar con texto plano
            cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=default_backend())
            movs_desencriptados = []
            for m in response_movs.data:
                m["concepto_original"] = desencriptar_dato(m.get("concepto_original"), cipher)
                m["ordenante"] = desencriptar_dato(m.get("ordenante"), cipher)
                movs_desencriptados.append(m)
            
            df_historico = pd.DataFrame(movs_desencriptados)
            # Renombramos columnas para que coincidan con la lógica de búsqueda de pisos
            df_historico = df_historico.rename(columns={"concepto_original": "concepto", "piso_detectado": "piso"})
            df_historico.columns = [c.lower() for c in df_historico.columns]
            print(f"[DEBUG extracto_controller] df_historico head después de renombrar y lower:\n{df_historico.head().to_string()}")
        else:
            print(f"[DEBUG extracto_controller] No se encontraron movimientos históricos para la comunidad {community_id}.")
            df_historico = pd.DataFrame() # Asegurarse de que df_historico siempre sea un DataFrame

        # Fetch extractos_procesados to get month/year mapping
        extractos_res = supabase_service_role_client.table("extractos_procesados").select("id,mes_contable,anio_contable").eq("comunidad_id", community_id).execute()
        extractos_map = {ext['id']: {'mes': ext['mes_contable'], 'anio': ext['anio_contable']} for ext in extractos_res.data}
        print(f"[DEBUG extracto_controller] Cargados {len(extractos_map)} extractos procesados para la comunidad {community_id}.")

    else:
        extractos_map = {} # Ensure it's always defined

    # 1. Intentar detectar mes y año del nombre del archivo
    nombre_file = extracto.filename.lower()
    meses_nombres = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4,
        "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
        "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12
    }
    for nombre_mes, numero in meses_nombres.items():
        if nombre_mes in nombre_file:
            _mes = numero
            break
    anio_search = re.search(r"20\d{2}", nombre_file)
    if anio_search:
        _año = int(anio_search.group())

    resultado = procesar_extracto_y_registros(extracto, None, clasificador, db_historico=df_historico, extractos_map=extractos_map)
    
    # 2. Refinar mes y año con la fecha del primer movimiento si no se detectó o para mayor precisión
    if resultado["movimientos_clasificados"]:
        for m in resultado["movimientos_clasificados"]:
            f = m.get("fecha")
            if f and "/" in str(f):
                try:
                    p_fecha = str(f).split("/")
                    if len(p_fecha) == 3:
                        _mes, _año = int(p_fecha[1]), int(p_fecha[2])
                        break
                except: continue
    
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
        "es_excel": es_excel,
        "mes_extracto": _mes, # Añadir el mes detectado
        "anio_extracto": _año # Añadir el año detectado
    }

async def confirmar_controller(data: Any, modo: str = "mensual", community_name: Optional[str] = None, mes: Optional[int] = None, anio: Optional[int] = None):
    global _movimientos_procesados, _registros_contenido, _registros_filename, _extracto_filename, _mes, _año

    # Inicializar variables para los datos específicos de cada tipo de informe
    finanzas_data_payload: Optional[dict] = None
    movimientos_actualizados_payload: List[Dict] = []

    if modo == "finanzas":
        if not isinstance(data, dict):
            print(f"[ERROR] Modo finanzas pero el cuerpo de la petición no es un diccionario. Tipo recibido: {type(data)}")
            raise HTTPException(status_code=400, detail="Para el modo 'finanzas', el cuerpo de la petición debe ser un objeto JSON (diccionario).")
        finanzas_data_payload = data
    else: # modo == "mensual"
        if not isinstance(data, list):
            print(f"[ERROR] Modo mensual pero el cuerpo de la petición no es una lista. Tipo recibido: {type(data)}")
            raise HTTPException(status_code=400, detail="Para el modo 'mensual', el cuerpo de la petición debe ser una lista JSON.")
        movimientos_actualizados_payload = data

    # Actualizar la variable global _movimientos_procesados solo si es relevante para el modo mensual
    # (ya que el modo finanzas usa finanzas_data_payload directamente)
    _movimientos_procesados = movimientos_actualizados_payload

    # Usar mes/año del parámetro (Dashboard) o globales (Clasificador)
    # Usar mes/año del parámetro (Dashboard) o globales (Clasificador)
    p_mes = mes if mes is not None else _mes
    p_anio = anio if anio is not None else _año

    # Lógica de nombre de comunidad para el archivo y títulos
    # Prioridad absoluta al nombre enviado desde la UI
    nombre_limpio = str(community_name).strip() if community_name else ""

    if not nombre_limpio or nombre_limpio.lower() in ["", "undefined", "null", "none", "comunidad"]:
        nombre_limpio = os.path.splitext(_registros_filename)[0].replace(".xlsx", "").replace(".xls", "")

    # Si sigue siendo genérico o vacío, usamos "Comunidad" como último recurso
    if not nombre_limpio or nombre_limpio.lower() in ["registros", "extracto", "extracto_clasificado", ""]:
        nombre_limpio = "Comunidad"

    # Determinar nombre de hoja (MES AÑO en MAYUSCULAS) basado en los datos
    hoja_nombre = obtener_nombre_hoja(p_mes, p_anio).upper()

    print(f"[DEBUG confirmar_controller] modo={modo} finanzas_payload_exists={finanzas_data_payload is not None} type(data)={type(data)}")

    if modo == "finanzas" and finanzas_data_payload:
        print("[DEBUG confirmar_controller] Generando FINANZAS excel_informe")
        # Generar el informe de finanzas (3 tablas: Ingresos por piso, Gastos y Resumen)
        excel_bytes = crear_excel_informe_finanzas(
            nombre_documento=nombre_limpio,
            nombre_hoja=hoja_nombre,
            finanzas_data=finanzas_data_payload
        )
        nombre_archivo = f"Informe_Finanzas_{nombre_limpio}_{hoja_nombre}.xlsx"
    else:
        print("[DEBUG confirmar_controller] Generando MENSUAL/EXTRACTO excel_actualizado")
        # Generar el Excel de movimientos (extracto mensual)

        tiene_datos_ordenante = any(m.get("ORDENANTE") and str(m["ORDENANTE"]).strip() != "" for m in movimientos_actualizados_payload)
        show_ordenante = tiene_datos_ordenante or _extracto_filename.lower().endswith((".xlsx", ".xls"))

        excel_bytes = crear_excel_actualizado(
            contenido_excel=None, # Siempre libro nuevo para mensual
            nombre_hoja=hoja_nombre,
            movimientos_nuevos=movimientos_actualizados_payload,
            resultado_conciliacion={},
            mes=p_mes,
            año=p_anio,
            nombre_documento=nombre_limpio,
            es_excel=show_ordenante
        )
        nombre_archivo = f"Extracto_{nombre_limpio}_{hoja_nombre}.xlsx"

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
