import io
import base64
import os
import re
import pandas as pd
import logging
from datetime import datetime, timedelta
from fastapi import UploadFile, HTTPException, File, Form
from typing import Optional, Any, Union
from fastapi.responses import StreamingResponse
from collections import defaultdict
from app.ml.clasificador_ml import crear_clasificador
from app.servicios.procesar_movimientos import procesar_extracto_y_registros, normalizar_piso_tecnico
from app.servicios.procesar_extracto import detectar_columnas, limpiar_importe
from app.servicios.resumen import calcular_resumen_categorias_con_tipo
from app.servicios.supabase_db import supabase_client, supabase_service_role_client 
from app.procesamiento.generar_excel import crear_excel_actualizado, crear_excel_informe_finanzas
from app.procesamiento.procesar_excel_contable import obtener_nombre_hoja
from app.controllers.security import encriptar_dato, desencriptar_dato
from app.servicios.gestion_cuotas import LogicaCuotasFincas
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
        # Aumentamos el límite para no perder de vista los pagos de años anteriores
        response_movs = supabase_service_role_client.table("movimientos").select("community_id,concepto_original,importe,piso_detectado,ordenante,fecha,extracto_id").eq("community_id", community_id).order("fecha", desc=True).limit(5000).execute()
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
        extractos_res = supabase_service_role_client.table("extractos_procesados").select("id,mes_contable,anio_contable").eq("comunidad_id", community_id).limit(1000).execute()
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

    resultado = procesar_extracto_y_registros(extracto, None, clasificador, db_historico=df_historico, extractos_map=extractos_map) # El community_id se extrae dentro
    
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
    Centraliza la encriptación para que el frontend no necesite conocer las llaves
    """
    try:
        community_id = data.get("community_id")
        movimientos = data.get("movimientos", [])
        mes = data.get("mes")
        anio = data.get("anio")

        # --- RE-CÁLCULO CRONOLÓGICO GLOBAL (Unificado con Importador Masivo) ---
        # 1. Determinar el inicio absoluto de la historia de la comunidad
        db_min_date = datetime(int(anio), 1, 1)
        oldest_ext = supabase_service_role_client.table("extractos_procesados") \
            .select("mes_contable, anio_contable") \
            .eq("comunidad_id", community_id) \
            .order("anio_contable", desc=False).order("mes_contable", desc=False).limit(1).execute()
        
        if oldest_ext.data:
            db_min_date = min(db_min_date, datetime(oldest_ext.data[0]["anio_contable"], oldest_ext.data[0]["mes_contable"], 1))

        # 2. Generar horizonte continuo (desde Enero del año más antiguo hasta el futuro próximo)
        horizon_meses = []
        curr_date = datetime(db_min_date.year, 1, 1)
        limit_date = max(datetime(int(anio), int(mes), 1), datetime.now()) + timedelta(days=400)
        while curr_date <= limit_date:
            horizon_meses.append(curr_date.strftime("%Y-%m"))
            if curr_date.month == 12: curr_date = datetime(curr_date.year + 1, 1, 1)
            else: curr_date = datetime(curr_date.year, curr_date.month + 1, 1)

        # 3. Identificar meses que REALMENTE tienen registros para generar déficit
        ext_existentes = supabase_service_role_client.table("extractos_procesados").select("mes_contable, anio_contable").eq("comunidad_id", community_id).execute()
        meses_con_registro = {f"{r['anio_contable']}-{str(r['mes_contable']).zfill(2)}" for r in (ext_existentes.data or [])}
        meses_con_registro.add(f"{int(anio):04d}-{int(mes):02d}")

        # 4. Cargar cuotas base y pisos
        comm_res = supabase_service_role_client.table("comunidades").select("cuota_base").eq("id", community_id).maybe_single().execute()
        cuota_global = float(comm_res.data.get("cuota_base") or 0.0) if comm_res.data else 0.0
        pisos_res = supabase_service_role_client.table("pisos").select("id,codigo,cuota_base").eq("community_id", community_id).execute()

        cuotas_config = {}
        for p in (pisos_res.data or []):
            p_cod = normalizar_piso_tecnico(p["codigo"])
            c_base = float(p.get("cuota_base") if (p.get("cuota_base") and p.get("cuota_base") > 0) else cuota_global)
            for m_h in horizon_meses:
                # Solo creamos déficit real si el mes tiene un registro contable oficial
                cuotas_config[(p_cod, m_h)] = c_base if m_h in meses_con_registro else 0.0

        estado_inicial = defaultdict(lambda: defaultdict(float))
        credito_inicial = defaultdict(float)
        prev_pagos = supabase_service_role_client.table("movimientos") \
            .select("piso_detectado, detalle_asignacion_cuotas, extractos_procesados(mes_contable, anio_contable), importe, fecha") \
            .eq("community_id", community_id).gt("importe", 0).limit(5000).execute()

        if prev_pagos.data:
            for mov_db in prev_pagos.data:
                p_norm = normalizar_piso_tecnico(mov_db.get("piso_detectado"))
                if not p_norm: continue
                ext = mov_db.get("extractos_procesados")
                if ext and int(ext.get("mes_contable", 0)) == int(mes) and int(ext.get("anio_contable", 0)) == int(anio):
                    continue
                
                asig_list = mov_db.get("detalle_asignacion_cuotas")
                if isinstance(asig_list, list) and len(asig_list) > 0:
                    for a in asig_list:
                        m_dest_raw = str(a.get("mes_destino", "")).strip()
                        # Normalización de formato de mes destino.
                        # Acepta: "YYYY-M", "YYYY-MM" y también "YYYY-MM-DD".
                        if m_dest_raw != "CREDITO_ACUMULADO" and m_dest_raw:
                            # Si viene como YYYY-MM-DD, recortamos a YYYY-MM
                            if len(m_dest_raw) >= 10 and m_dest_raw[7] == '-' and m_dest_raw[4] == '-':
                                m_dest_raw = m_dest_raw[:7]

                            if "-" in m_dest_raw:
                                y_p, m_p = m_dest_raw.split("-")[0], m_dest_raw.split("-")[1]
                                m_dest_raw = f"{int(y_p):04d}-{int(m_p):02d}"

                        val_asig = float(a.get("importe_aplicado", 0))

                        if m_dest_raw == "CREDITO_ACUMULADO":
                            credito_inicial[p_norm] += val_asig
                        elif m_dest_raw in horizon_meses:
                            estado_inicial[p_norm][m_dest_raw] += val_asig
                else:
                    # MEJORA: Analizador robusto de fecha para anclar pagos sin desglose
                    f_raw = str(mov_db.get("fecha") or "")
                    mes_p = None
                    try:
                        if '/' in f_raw:
                            partes = f_raw.split('/')
                            if len(partes) == 3:
                                d_f, m_f, y_f = partes
                                mes_p = f"{int(y_f):04d}-{int(m_f):02d}"
                        elif '-' in f_raw:
                            mes_p = f_raw[:7] # YYYY-MM
                    except:
                        pass

                    # Si el pago pertenece a un mes dentro del horizonte de deuda, lo fijamos como pagado
                    # para que el motor no intente cobrar ese mes otra vez.
                    # OJO: Para evitar errores de parseo, solo lo marcamos como pagado si el mes
                    # coincide exactamente con un mes del horizonte (YYYY-MM).
                    if mes_p and mes_p in horizon_meses:
                        estado_inicial[p_norm][mes_p] += float(mov_db.get("importe", 0))
                    else:
                        credito_inicial[p_norm] += float(mov_db.get("importe", 0))


        # Ejecutar motor sobre los datos que vienen del frontend
        logger.info(
            f"[PERSISTIR] horizon_meses={horizon_meses} | mes={mes}/{anio} | community_id={community_id}"
        )
        engine = LogicaCuotasFincas(horizon_meses, cuotas_config, estado_inicial=estado_inicial, credito_inicial=credito_inicial)
        logger.info(
            f"[PERSISTIR] estado_inicial keys={list(estado_inicial.keys())[:10]} credito_inicial keys={list(credito_inicial.keys())[:10]}"
        )
        pagos_nuevos = []

        for i, m in enumerate(movimientos):
            # DEBUG: entender por qué el mes nuevo termina aplicándose a otro mes
            # (no imprime todos los movimientos, solo los de tipo ingreso con piso)
            if m.get("tipo") == "ingreso" and m.get("piso_detectado"):
                logger.info(
                    f"[DEBUG MES] extracto mes/anio persistir={mes}/{anio} | movimiento_idx={i} | fecha_raw={m.get('fecha')} | piso_detectado={m.get('piso_detectado')} | importe={m.get('importe')}"
                )

                pagos_nuevos.append({
                    "piso_id": normalizar_piso_tecnico(m["piso_detectado"]),
                    # Usamos la fecha completa para que la conciliación respete el orden de los días del mes
                    # El motor espera mes_referencia en formato YYYY-MM.
                    # En los extractos, m["fecha"] suele venir como dd/mm/YYYY, por eso normalizamos.
                    # Conversión robusta de fecha -> YYYY-MM
                    # El motor usa YYYY-MM para decidir el destino.
                    # Para evitar inconsistencias por formatos raros de fecha en el extracto,
                    # fijamos el mes de referencia directamente desde el mes/año que se está persistiendo.
                    # Así el motor no puede asignar el pago a un mes antiguo por parseo incorrecto.
                    "mes_referencia": f"{int(anio):04d}-{int(mes):02d}",
                    "importe": float(m.get("importe", 0)),
                    "pago_id": f"manual_{i}"
                })
        
        resumen_final = {}
        if pagos_nuevos:
            logger.info(
                f"[PERSISTIR] Pagos_nuevos={[(p.get('piso_id'), p.get('mes_referencia'), p.get('importe')) for p in pagos_nuevos]}"
            )
            engine.procesar_lista_pagos(pagos_nuevos)
            resumen_final = engine.generar_resumen()
            # Log de asignaciones para validar cascada por mes
            for piso_id, data_res in resumen_final.items():
                asigns = data_res.get("historial_asignaciones", [])
                logger.info(f"[PERSISTIR] reparto piso={piso_id} asignaciones_count={len(asigns)} detalle_sample={asigns[:5]}")
            logger.info(f"[PERSISTIR] Recálculo completado para {len(resumen_final)} pisos.")


        # 0. Limpiar duplicados previos para asegurar la sobrescritura
        if community_id and mes is not None and anio is not None:
            supabase_service_role_client.table("extractos_procesados").delete() \
                .eq("comunidad_id", int(community_id)) \
                .eq("mes_contable", int(mes)) \
                .eq("anio_contable", int(anio)) \
                .execute()
        
        # 1. Crear el extracto padre
        extracto_payload = {
            "comunidad_id": community_id,
            "nombre_archivo": data.get("nombre_archivo", "Extracto IA"),
            "mes_contable": mes,
            "anio_contable": anio,
            "fecha_subida": datetime.now().isoformat()
        }
        
        ext_res = supabase_service_role_client.table("extractos_procesados").insert(extracto_payload).execute()
        if not ext_res.data:
            raise HTTPException(status_code=500, detail="No se pudo crear el registro del extracto.")
        
        extracto_id = ext_res.data[0]['id']
        
        # 2. Procesar y encriptar movimientos
        movs_a_insertar = []
        for i, m in enumerate(movimientos):
            piso_raw = m.get("piso_detectado")
            p_norm = normalizar_piso_tecnico(piso_raw)
            asigs = []

            # OJO: detalle_asignacion_cuotas debe guardarse SOLO para movimientos de ingreso con piso.
            if m.get("tipo") == "ingreso" and p_norm:
                pago_id_mov = f"manual_{i}"
                if p_norm in resumen_final and "historial_asignaciones" in resumen_final[p_norm]:
                    asigs_all = resumen_final[p_norm]["historial_asignaciones"] or []
                    # FILTRO CRÍTICO: guardar SOLO asignaciones del pago/movimiento actual
                    asigs = [a for a in asigs_all if a.get("pago_id") == pago_id_mov]
                else:
                    asigs = []

                logger.info(
                    f"[PERSISTIR] movimiento id_tmp={i} tipo={m.get('tipo')} piso_raw={piso_raw} p_norm={p_norm} pago_id={pago_id_mov} asigs_count={len(asigs)}"
                )


            movs_a_insertar.append({
                "community_id": community_id,
                "extracto_id": extracto_id,
                "fecha": m.get("fecha"),
                "concepto_original": encriptar_dato(m.get("concepto_original")),
                "importe": m.get("importe"),
                "saldo_resultante": m.get("saldo_resultante"),
                "ordenante": encriptar_dato(m.get("ordenante")),
                "piso_detectado": piso_raw,
                "tipo": m.get("tipo"),
                "categoria": m.get("categoria"),
                "editado_manualmente": True,
                "detalle_asignacion_cuotas": asigs if asigs else None
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
