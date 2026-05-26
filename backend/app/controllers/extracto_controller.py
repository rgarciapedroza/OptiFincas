import io
import base64
import os
import re
import pandas as pd
import logging
from datetime import datetime
from fastapi import UploadFile, HTTPException, File, Form
from typing import Optional, Any, Union
from fastapi.responses import StreamingResponse
from app.ml.clasificador_ml import crear_clasificador
from app.servicios.procesar_movimientos import procesar_extracto_y_registros 
from app.servicios.procesar_extracto import detectar_columnas, limpiar_importe
from app.servicios.resumen import calcular_resumen_categorias_con_tipo
from app.servicios.supabase_db import supabase_client, supabase_service_role_client 
from app.procesamiento.generar_excel import crear_excel_actualizado, crear_excel_informe_finanzas
from app.procesamiento.procesar_excel_contable import obtener_nombre_hoja
from app.controllers.security import encriptar_dato, desencriptar_dato
from app.schemas import FinanzasReportRequest, MovimientoClasificado as MovimientoClasificadoExtracto
# Configuración de logging profesional
logger = logging.getLogger(__name__)
clasificador = crear_clasificador()

def opciones_controller():
    return {
        "tipos": clasificador.get_tipos_disponibles(),
        "categorias_ingreso": clasificador.get_opciones_categoria("ingreso"),
        "categorias_gasto": clasificador.get_opciones_categoria("gasto"),
    }

async def entrenar_controller(extracto: UploadFile, excel_contable: UploadFile):
    # Variables locales en lugar de globales
    mes_detectado = 1
    anio_detectado = 2024

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
            mes_detectado = numero
            break

    # Detección del año en el nombre del archivo
    anio_match = re.search(r"20\d{2}", nombre)
    if anio_match:
        anio_detectado = int(anio_match.group())

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
    # Variables locales para evitar colisiones
    df_historico = None
    nombre_comunidad_fallback = "Comunidad"
    mes_detectado = 1
    anio_detectado = 2024

    # Si se proporciona community_id, cargamos el histórico directamente desde la base de datos
    if community_id:
        # Consultamos el nombre de la comunidad para nombrar el archivo de salida
        comm_res = supabase_client.table("comunidades").select("nombre").eq("id", community_id).execute()
        if comm_res.data and len(comm_res.data) > 0:
            nombre_comunidad_fallback = comm_res.data[0]['nombre']

        # Cargamos movimientos previos para usarlos como base de conocimiento, incluyendo extracto_id
        response_movs = supabase_service_role_client.table("movimientos").select("concepto_original,importe,piso_detectado,ordenante,fecha,extracto_id").eq("community_id", community_id).order("fecha", desc=True).execute()
        if response_movs.data:
            logger.info(f"Cargados {len(response_movs.data)} movimientos históricos de la base de datos para la comunidad {community_id}")
            
            # DESENCRIPTAR datos históricos para que el buscador pueda trabajar con texto plano
            movs_desencriptados = [] # Ya no necesitamos crear el objeto cipher aquí
            for m in response_movs.data:
                m["concepto_original"] = desencriptar_dato(m.get("concepto_original")) # Sin pasar el objeto cipher
                m["ordenante"] = desencriptar_dato(m.get("ordenante")) # Sin pasar el objeto cipher
                movs_desencriptados.append(m)
            
            df_historico = pd.DataFrame(movs_desencriptados)
            # Renombramos columnas para que coincidan con la lógica de búsqueda de pisos
            df_historico = df_historico.rename(columns={"concepto_original": "concepto", "piso_detectado": "piso"})
            df_historico.columns = [c.lower() for c in df_historico.columns]
        else:
            logger.warning(f"No se encontraron movimientos históricos para la comunidad {community_id}.")
            df_historico = pd.DataFrame() # Asegurarse de que df_historico siempre sea un DataFrame

        # Fetch extractos_procesados to get month/year mapping
        extractos_res = supabase_service_role_client.table("extractos_procesados").select("id,mes_contable,anio_contable").eq("comunidad_id", community_id).execute()
        extractos_map = {ext['id']: {'mes': ext['mes_contable'], 'anio': ext['anio_contable']} for ext in extractos_res.data}
        logger.info(f"Cargados {len(extractos_map)} extractos procesados para la comunidad {community_id}.")

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
            mes_detectado = numero
            break
    anio_search = re.search(r"20\d{2}", nombre_file)
    if anio_search:
        anio_detectado = int(anio_search.group())

    resultado = procesar_extracto_y_registros(extracto, None, clasificador, db_historico=df_historico, extractos_map=extractos_map)
    
    # 2. Refinar mes y año con la fecha del primer movimiento si no se detectó o para mayor precisión
    if resultado["movimientos_clasificados"]:
        for m in resultado["movimientos_clasificados"]:
            f = m.get("fecha")
            if f and "/" in str(f):
                try:
                    p_fecha = str(f).split("/")
                    if len(p_fecha) == 3:
                        mes_detectado, anio_detectado = int(p_fecha[1]), int(p_fecha[2])
                        break
                except: continue
    
    es_excel = extracto.filename.lower().endswith((".xlsx", ".xls"))

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
        "mes_extracto": mes_detectado,
        "anio_extracto": anio_detectado,
        "nombre_comunidad": nombre_comunidad_fallback
    }

async def confirmar_controller(
    data: Union[FinanzasReportRequest, list[MovimientoClasificadoExtracto]], 
    modo: str = "mensual", 
    community_name: Optional[str] = None, 
    mes: Optional[int] = None, 
    anio: Optional[int] = None
):
    # Inicializar variables para los datos específicos de cada tipo de informe
    logger.info(f"Iniciando generación de documento modo={modo}")

    # Usar mes/año del parámetro o fecha actual como fallback seguro
    p_mes = mes if mes is not None else datetime.now().month
    p_anio = anio if anio is not None else datetime.now().year

    # Lógica de nombre de comunidad para el archivo y títulos
    # Prioridad absoluta al nombre enviado desde la UI
    nombre_limpio = str(community_name).strip() if community_name else ""

    # Si sigue siendo genérico o vacío, usamos "Comunidad" como último recurso
    if not nombre_limpio or nombre_limpio.lower() in ["registros", "extracto", "extracto_clasificado", ""]:
        nombre_limpio = "Comunidad"

    # Determinar nombre de hoja (MES AÑO en MAYUSCULAS) basado en los datos
    hoja_nombre = obtener_nombre_hoja(p_mes, p_anio).upper()

    if modo == "finanzas":
        # FastAPI/Pydantic garantizan que si llegamos aquí, data es un FinanzasReportRequest
        finanzas_dict = data.model_dump() if hasattr(data, "model_dump") else data
        logger.info("Generando informe de FINANZAS")
        # Generar el informe de finanzas (3 tablas: Ingresos por piso, Gastos y Resumen)
        excel_bytes = crear_excel_informe_finanzas(
            nombre_documento=nombre_limpio,
            nombre_hoja=hoja_nombre,
            finanzas_data=finanzas_dict
        )
        nombre_archivo = f"Informe_Finanzas_{nombre_limpio}_{hoja_nombre}.xlsx"
    else:
        # En modo mensual, data es una lista de movimientos
        movimientos_dicts = [m.model_dump() if hasattr(m, "model_dump") else m for m in data]
        logger.info(f"Generando extracto MENSUAL con {len(movimientos_dicts)} movimientos")

        tiene_datos_ordenante = any(m.get("ORDENANTE") and str(m["ORDENANTE"]).strip() != "" for m in movimientos_dicts)
        show_ordenante = tiene_datos_ordenante # Simplificado para no depender de la global

        excel_bytes = crear_excel_actualizado(
            contenido_excel=None, # Siempre libro nuevo para mensual
            nombre_hoja=hoja_nombre,
            movimientos_nuevos=movimientos_dicts,
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

async def persistir_extracto_db_controller(data: dict):
    """
    Recibe los resultados de la IA y los guarda en la DB de forma segura.
    Centraliza la encriptación para que el frontend no necesite conocer las llaves.
    """
    try:
        community_id = data.get("community_id")
        movimientos = data.get("movimientos", [])
        
        # 1. Crear el extracto padre
        extracto_payload = {
            "comunidad_id": community_id,
            "nombre_archivo": data.get("nombre_archivo", "Extracto IA"),
            "mes_contable": data.get("mes"),
            "anio_contable": data.get("anio"),
            "fecha_subida": datetime.now().isoformat()
        }
        
        ext_res = supabase_service_role_client.table("extractos_procesados").insert(extracto_payload).execute()
        if not ext_res.data:
            raise HTTPException(status_code=500, detail="No se pudo crear el registro del extracto.")
        
        extracto_id = ext_res.data[0]['id']
        
        # 2. Procesar y encriptar movimientos
        movs_a_insertar = []
        for m in movimientos:
            movs_a_insertar.append({
                "community_id": community_id,
                "extracto_id": extracto_id,
                "fecha": m.get("fecha"),
                # ENCRIPTACIÓN AUTOMÁTICA EN BACKEND
                "concepto_original": encriptar_dato(m.get("concepto_original")),
                "importe": m.get("importe"),
                "saldo_resultante": m.get("saldo_resultante"),
                "ordenante": encriptar_dato(m.get("ordenante")),
                "piso_detectado": m.get("piso_detectado"),
                "tipo": m.get("tipo"),
                "categoria": m.get("categoria"),
                "editado_manualmente": True
            })
        
        supabase_service_role_client.table("movimientos").insert(movs_a_insertar).execute()
        return {"status": "success", "message": "Extracto persistido y datos encriptados correctamente."}
    except Exception as e:
        logger.error(f"Error persistiendo extracto: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def descargar_controller(movimientos_actualizados: list[dict], formato: str, mes: int = 1, anio: int = 2024):
    df = pd.DataFrame(movimientos_actualizados)

    es_ordenante_presente = "ORDENANTE" in df.columns
    cols_order = [
        "FECHA",
        "ORDENANTE" if es_ordenante_presente else None,
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

    nombre = f"extracto_clasificado_{mes}_{anio}.{extension}"

    return StreamingResponse(
        io.BytesIO(contenido),
        media_type=mime_type,
        headers={"Content-Disposition": f"attachment; filename={nombre}"}
    )

async def descargar_excel_controller(movimientos_actualizados: list[dict], mes: int = 1, anio: int = 2024):
    df = pd.DataFrame(movimientos_actualizados)
    
    cols_order = ["FECHA"]
    if "ORDENANTE" in df.columns:
        cols_order.append("ORDENANTE")
    cols_order.extend(["OBSERVACIONES", "IMPORTE", "SALDO", "CONCEPTO"])

    cols_order = [c for c in cols_order if c in df.columns]
    df = df[cols_order]

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Movimientos")

        resumen_df = df.groupby(["tipo", "categoria"])["importe"].sum().reset_index()
        resumen_df.to_excel(writer, index=False, sheet_name="Resumen", startrow=0)

    nombre = f"extracto_completo_{mes}_{anio}.xlsx"

    return StreamingResponse(
        output.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={nombre}"}
    )
