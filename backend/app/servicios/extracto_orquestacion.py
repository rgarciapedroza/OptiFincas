import io
import re
import base64
import logging
from datetime import datetime, timedelta
from collections import defaultdict
from typing import Optional, Any, Union, Dict, List, Tuple

import pandas as pd
from fastapi import UploadFile, HTTPException, Form
from fastapi.responses import StreamingResponse

from app.servicios.supabase_db import supabase_client, supabase_service_role_client
from app.servicios.procesar_movimientos import procesar_extracto_y_registros, normalizar_piso_tecnico
from app.servicios.procesar_extracto import detectar_columnas, limpiar_importe, normalizar_fecha, load_df_from_excel_sheet_robust, buscar_piso_regex_en_fila
from app.procesamiento.generar_excel import crear_excel_actualizado, crear_excel_informe_finanzas
from app.procesamiento.procesar_excel_contable import obtener_nombre_hoja
from app.controllers.security import encriptar_dato, desencriptar_dato
from app.ml.clasificador_ml import crear_clasificador
from app.servicios.gestion_cuotas import LogicaCuotasFincas


from app.schemas import FinanzasReportRequest, MovimientoClasificado as MovimientoClasificadoExtracto

logger = logging.getLogger(__name__)
clasificador = crear_clasificador()


def opciones_service() -> Dict[str, Any]:
    return {
        "tipos": clasificador.get_tipos_disponibles(),
        "categorias_ingreso": clasificador.get_opciones_categoria("ingreso"),
        "categorias_gasto": clasificador.get_opciones_categoria("gasto"),
    }

def _detectar_periodo_desde_nombre(nombre_archivo: str) -> Tuple[int, int]:
    """Helper privado para extraer mes y año del nombre del archivo."""
    nombre = nombre_archivo.lower()
    mes_detectado = datetime.now().month
    anio_detectado = datetime.now().year


    meses = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12,
    }
    for nombre_mes, numero in meses.items():
        if nombre_mes in nombre:
            mes_detectado = numero
            break
    anio_match = re.search(r"20\d{2}", nombre)
    if anio_match:
        anio_detectado = int(anio_match.group())
   
    return mes_detectado, anio_detectado
def _obtener_nombre_comunidad(community_id: int) -> str:
    """Consulta el nombre de la comunidad para fallbacks de UI."""
    res = supabase_client.table("comunidades").select("nombre").eq("id", community_id).execute()
    return res.data[0]["nombre"] if res.data else "Comunidad"
async def entrenar_service(extracto: UploadFile, excel_contable: UploadFile) -> Dict[str, Any]:
    contenido = await extracto.read()
    # Detección automática de periodo
    mes_detectado, anio_detectado = _detectar_periodo_desde_nombre(extracto.filename)


    try:
        if extracto.filename.lower().endswith(".csv"):
            try:
                df = pd.read_csv(io.StringIO(contenido.decode("utf-8")))
            except Exception:
                df = pd.read_csv(io.StringIO(contenido.decode("latin-1")))
        else:
            df = pd.read_excel(io.BytesIO(contenido))
    except Exception:
        raise HTTPException(status_code=400, detail="Error leyendo extracto")
    columnas = detectar_columnas(df)
    if columnas["importe"] is None:
        raise HTTPException(status_code=400, detail="Sin columna de importe")
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
            piso=resultado["piso"],
        )
    resultado = clasificador.entrenar()
    clasificador.guardar_estado()
    return {
        "estado": "ok",
        "mensajes": [resultado.get("mensaje", "Entrenamiento completado")],
        "precision": resultado.get("precision", 0.85),
        "ejemplos_entrenados": resultado.get("ejemplos_entrenados", 0),
    }
async def procesar_extracto_db_service(
    extracto: UploadFile,
    community_id: int,
) -> Dict[str, Any]:
    df_historico = None
    nombre_comunidad_fallback = "Comunidad"
    mes_detectado = 1
    anio_detectado = 2024
    if community_id:
        comm_res = supabase_client.table("comunidades").select("nombre").eq("id", community_id).execute()
        if comm_res.data and len(comm_res.data) > 0:
            nombre_comunidad_fallback = comm_res.data[0]["nombre"]
        response_movs = (
            supabase_service_role_client.table("movimientos")
            .select(
                "community_id,concepto_original,importe,piso_detectado,ordenante,fecha,extracto_id"
            )
            .eq("community_id", community_id)
            .order("fecha", desc=True)
            .limit(5000)
            .execute()
        )
        if response_movs.data:
            movs_desencriptados = []
            for m in response_movs.data:
                m["concepto_original"] = desencriptar_dato(m.get("concepto_original"))
                m["ordenante"] = desencriptar_dato(m.get("ordenante"))
                movs_desencriptados.append(m)
            df_historico = pd.DataFrame(movs_desencriptados)
            df_historico = df_historico.rename(
                columns={"concepto_original": "concepto", "piso_detectado": "piso"}
            )
            df_historico.columns = [c.lower() for c in df_historico.columns]
        else:
            df_historico = pd.DataFrame()
        extractos_res = (
            supabase_service_role_client.table("extractos_procesados")
            .select("id,mes_contable,anio_contable")
            .eq("comunidad_id", community_id)
            .limit(1000)
            .execute()
        )
        extractos_map = {
            ext["id"]: {"mes": ext["mes_contable"], "anio": ext["anio_contable"]}
            for ext in (extractos_res.data or [])
        }
    else:
        extractos_map = {}
    nombre_file = extracto.filename.lower()
    meses_nombres = {
        "enero": 1,
        "febrero": 2,
        "marzo": 3,
        "abril": 4,
        "mayo": 5,
        "junio": 6,
        "julio": 7,
        "agosto": 8,
        "septiembre": 9,
        "octubre": 10,
        "noviembre": 11,
        "diciembre": 12,
    }
    for nombre_mes, numero in meses_nombres.items():
        if nombre_mes in nombre_file:
            mes_detectado = numero
            break
    import re
    anio_search = re.search(r"20\d{2}", nombre_file)
    if anio_search:
        anio_detectado = int(anio_search.group())
    resultado = procesar_extracto_y_registros(
        extracto=extracto,
        registros=None,
        clasificador=clasificador,
        db_historico=df_historico,
        extractos_map=extractos_map,
        community_id=community_id
    )
    if resultado.get("movimientos_clasificados"):
        for m in resultado["movimientos_clasificados"]:
            f = m.get("fecha")
            if f and "/" in str(f):
                try:
                    p_fecha = str(f).split("/")
                    if len(p_fecha) == 3:
                        mes_detectado, anio_detectado = int(p_fecha[1]), int(p_fecha[2])
                        break
                except Exception:
                    continue
    es_excel = extracto.filename.lower().endswith((".xlsx", ".xls"))
    return {
        "estado": "ok",
        "nombre_archivo": resultado["nombre_archivo"],
        "resumen_general": {
            "total_ingresos": resultado["total_ingresos"],
            "total_gastos": resultado["total_gastos"],
            "saldo_neto": resultado["saldo_neto"],
        },
        "movimientos_clasificados": resultado["movimientos_clasificados"],
        "resumen_categorias": resultado["resumen_categorias"],
        "es_excel": es_excel,
        "mes_extracto": mes_detectado,
        "anio_extracto": anio_detectado,
        "nombre_comunidad": nombre_comunidad_fallback,
    }
async def confirmar_service(
    data: Union[FinanzasReportRequest, list[MovimientoClasificadoExtracto]],
    modo: str = "mensual",
    community_name: Optional[str] = None,
    mes: Optional[int] = None,
    anio: Optional[int] = None,
) -> Dict[str, Any]:
    logger.info(f"Iniciando generación de documento modo={modo}")
    p_mes = mes if mes is not None else datetime.now().month
    p_anio = anio if anio is not None else datetime.now().year
    nombre_limpio = str(community_name).strip() if community_name else ""
    if not nombre_limpio or nombre_limpio.lower() in ["registros", "extracto", "extracto_clasificado", ""]:
        nombre_limpio = "Comunidad"
    hoja_nombre = obtener_nombre_hoja(p_mes, p_anio).upper()
    if modo == "finanzas":
        finanzas_dict = data.model_dump() if hasattr(data, "model_dump") else data
        excel_bytes = crear_excel_informe_finanzas(
            nombre_documento=nombre_limpio,
            nombre_hoja=hoja_nombre,
            finanzas_data=finanzas_dict,
        )
        nombre_archivo = f"Informe_Finanzas_{nombre_limpio}_{hoja_nombre}.xlsx"
    else:
        movimientos_dicts = [m.model_dump() if hasattr(m, "model_dump") else m for m in data]
        tiene_datos_ordenante = any(
            m.get("ORDENANTE") and str(m["ORDENANTE"]).strip() != "" for m in movimientos_dicts
        )
        show_ordenante = tiene_datos_ordenante
        excel_bytes = crear_excel_actualizado(
            contenido_excel=None,
            nombre_hoja=hoja_nombre,
            movimientos_nuevos=movimientos_dicts,
            resultado_conciliacion={},
            mes=p_mes,
            año=p_anio,
            nombre_documento=nombre_limpio,
            es_excel=show_ordenante,
        )
        nombre_archivo = f"Extracto_{nombre_limpio}_{hoja_nombre}.xlsx"
    excel_base64 = base64.b64encode(excel_bytes).decode("utf-8")
    return {
        "estado": "ok",
        "mensaje": f"Documento {modo} generado correctamente",
        "excel_contenido": excel_base64,
        "nombre_archivo": nombre_archivo,
    }
async def persistir_extracto_db_service(data: dict) -> Dict[str, Any]:
    community_id = data.get("community_id")
    movimientos = data.get("movimientos", [])
    mes = data.get("mes")
    anio = data.get("anio")
    db_min_date = datetime(int(anio), 1, 1)
    oldest_ext = (
        supabase_service_role_client.table("extractos_procesados")
        .select("mes_contable, anio_contable")
        .eq("comunidad_id", community_id)
        .order("anio_contable", desc=False)
        .order("mes_contable", desc=False)
        .limit(1)
        .execute()
    )
    if oldest_ext.data:
        db_min_date = min(
            db_min_date,
            datetime(
                oldest_ext.data[0]["anio_contable"],
                oldest_ext.data[0]["mes_contable"],
                1,
            ),
        )
    horizon_meses = []
    curr_date = datetime(db_min_date.year, 1, 1)
    limit_date = max(datetime(int(anio), int(mes), 1), datetime.now()) + timedelta(days=400)
    while curr_date <= limit_date:
        horizon_meses.append(curr_date.strftime("%Y-%m"))
        if curr_date.month == 12:
            curr_date = datetime(curr_date.year + 1, 1, 1)
        else:
            curr_date = datetime(curr_date.year, curr_date.month + 1, 1)
    ext_existentes = (
        supabase_service_role_client.table("extractos_procesados")
        .select("mes_contable, anio_contable")
        .eq("comunidad_id", community_id)
        .execute()
    )
    meses_con_registro = {
        f"{r['anio_contable']}-{str(r['mes_contable']).zfill(2)}" for r in (ext_existentes.data or [])
    }
    meses_con_registro.add(f"{int(anio):04d}-{int(mes):02d}")
    comm_res = (
        supabase_service_role_client.table("comunidades")
        .select("cuota_base")
        .eq("id", community_id)
        .maybe_single()
        .execute()
    )
    cuota_global = float(comm_res.data.get("cuota_base") or 0.0) if comm_res.data else 0.0
    pisos_res = (
        supabase_service_role_client.table("pisos")
        .select("id,codigo,cuota_base")
        .eq("community_id", community_id)
        .execute()
    )
    cuotas_config = {}
    for p in (pisos_res.data or []):
        p_cod = normalizar_piso_tecnico(p["codigo"])
        c_base = float(
            p.get("cuota_base")
        ) if (p.get("cuota_base") and p.get("cuota_base") > 0) else cuota_global
        # FIX: No dependemos de "meses_con_registro" (meses que ya existen en extractos_procesados),
        # porque al añadir meses/nuevos datos puede quedar el set incompleto y el motor de cuotas
        # asigna el pago en cascada contra meses ya cubiertos.
        #
        # En su lugar, consideramos que el horizonte completo tiene cuota configurada para este cálculo.
        for m_h in horizon_meses:
            cuotas_config[(p_cod, m_h)] = c_base

    estado_inicial = defaultdict(lambda: defaultdict(float))
    credito_inicial = defaultdict(float)
    prev_pagos = (
        supabase_service_role_client.table("movimientos")
        .select(
            "piso_detectado, detalle_asignacion_cuotas, extractos_procesados(mes_contable, anio_contable), importe, fecha"
        )
        .eq("community_id", community_id)
        .limit(5000)
        .execute()
    )
    if prev_pagos.data:
        for mov_db in prev_pagos.data:
            p_norm = normalizar_piso_tecnico(mov_db.get("piso_detectado"))
            if not p_norm:
                continue
            ext = mov_db.get("extractos_procesados")
            if ext and int(ext.get("mes_contable", 0)) == int(mes) and int(ext.get("anio_contable", 0)) == int(anio):
                continue
            asig_list = mov_db.get("detalle_asignacion_cuotas")
            if isinstance(asig_list, list) and len(asig_list) > 0:
                for a in asig_list:
                    m_dest_raw = str(a.get("mes_destino", "")).strip()
                    if m_dest_raw != "CREDITO_ACUMULADO" and m_dest_raw:
                        if len(m_dest_raw) >= 10 and m_dest_raw[7] == "-" and m_dest_raw[4] == "-":
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
                f_raw = str(mov_db.get("fecha") or "")
                mes_p = None
                try:
                    if "/" in f_raw:
                        partes = f_raw.split("/")
                        if len(partes) == 3:
                            d_f, m_f, y_f = partes
                            mes_p = f"{int(y_f):04d}-{int(m_f):02d}"
                    elif "-" in f_raw:
                        mes_p = f_raw[:7]
                except Exception:
                    pass
                if mes_p and mes_p in horizon_meses:
                    estado_inicial[p_norm][mes_p] += float(mov_db.get("importe", 0))
                else:
                    credito_inicial[p_norm] += float(mov_db.get("importe", 0))
    engine = LogicaCuotasFincas(horizon_meses, cuotas_config, estado_inicial=estado_inicial, credito_inicial=credito_inicial)
    pagos_nuevos = []
    for i, m in enumerate(movimientos):
        if m.get("tipo") == "ingreso" and m.get("piso_detectado"):
            pagos_nuevos.append(
                {
                    "piso_id": normalizar_piso_tecnico(m["piso_detectado"]),
                    "mes_referencia": f"{int(anio):04d}-{int(mes):02d}",
                    "importe": float(m.get("importe", 0)),
                    "pago_id": f"manual_{i}",
                }
            )
    resumen_final = {}
    if pagos_nuevos:
        engine.procesar_lista_pagos(pagos_nuevos)
        resumen_final = engine.generar_resumen()
    if community_id and mes is not None and anio is not None:
        supabase_service_role_client.table("extractos_procesados").delete() \
            .eq("comunidad_id", int(community_id)) \
            .eq("mes_contable", int(mes)) \
            .eq("anio_contable", int(anio)) \
            .execute()
    extracto_payload = {
        "comunidad_id": community_id,
        "nombre_archivo": data.get("nombre_archivo", "Extracto IA"),
        "mes_contable": mes,
        "anio_contable": anio,
        "fecha_subida": datetime.now().isoformat(),
    }
    ext_res = supabase_service_role_client.table("extractos_procesados").insert(extracto_payload).execute()
    extracto_id = ext_res.data[0]["id"]
    movs_a_insertar = []
    for i, m in enumerate(movimientos):
        piso_raw = m.get("piso_detectado")
        p_norm = normalizar_piso_tecnico(piso_raw)
        asigs = []
        if m.get("tipo") == "ingreso" and p_norm:
            pago_id_mov = f"manual_{i}"
            if p_norm in resumen_final and "historial_asignaciones" in resumen_final[p_norm]:
                asigs_all = resumen_final[p_norm]["historial_asignaciones"] or []
                asigs = [a for a in asigs_all if a.get("pago_id") == pago_id_mov]
        movs_a_insertar.append(
            {
                "community_id": community_id,
                "extracto_id": extracto_id,
                "fecha": m.get("fecha"),
                "concepto_original": encriptar_dato(m.get("concepto_original")),
                "importe": m.get("importe"),
                "saldo_resultante": m.get("saldo_resultante"),
                "ordenante": encriptar_dato(m.get("ordenante")),
                "piso_detectado": p_norm, # Guardar siempre el código normalizado (ej: "1A")
                "tipo": m.get("tipo"),
                "categoria": m.get("categoria"),
                "editado_manualmente": True,
                "detalle_asignacion_cuotas": asigs if asigs else None,
            }
        )
    supabase_service_role_client.table("movimientos").insert(movs_a_insertar).execute()
    return {"status": "success", "message": "Extracto persistido y datos encriptados correctamente."}
async def descargar_service(movimientos_actualizados: list[dict], formato: str, mes: int = 1, anio: int = 2024):
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
        "metodo_piso",
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
        headers={"Content-Disposition": f"attachment; filename={nombre}"},
    )
async def descargar_excel_service(movimientos_actualizados: list[dict], mes: int = 1, anio: int = 2024):
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
        io.BytesIO(output.getvalue()),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={nombre}"},
    )

async def importar_movimientos_service(community_id: int, file: UploadFile, user_id: str):
    """
    Lógica de negocio para la importación masiva desde un archivo Excel (con múltiples hojas)
    y los asocia a una comunidad específica, registrando el extracto.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos Excel (.xlsx, .xls)")

    try:
        contenido = await file.read()
        excel_file = pd.ExcelFile(io.BytesIO(contenido))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el archivo Excel: {e}")

    # Usar el cliente de servicio para saltar políticas RLS durante la importación masiva
    client = supabase_service_role_client if supabase_service_role_client else supabase_client

    total_movimientos_importados = 0
    meses_nombres = {
        "enero": 1, "ene": 1, "febrero": 2, "feb": 2, "marzo": 3, "mar": 3,
        "abril": 4, "abr": 4, "mayo": 5, "may": 5, "junio": 6, "jun": 6,
        "julio": 7, "jul": 7, "agosto": 8, "ago": 8, "septiembre": 9, "sep": 9, "setiembre": 9,
        "octubre": 10, "oct": 10, "noviembre": 11, "nov": 11, "diciembre": 12, "dic": 12
    }

    processed_sheets_info = []
    skipped_sheets_info = []

    # 1. Precargar cuotas base de la comunidad para el motor
    com_res = client.table("comunidades").select("cuota_base").eq("id", community_id).maybe_single().execute()
    logger.info(f"[IMPORT] Raw community response for cuota_base: {com_res.data}")
    cuota_global = com_res.data.get("cuota_base") if com_res.data else 0
    logger.info(f"[IMPORT] Usando cuota global de la comunidad como base: {cuota_global}€")
    

    pisos_res = client.table("pisos").select("id,codigo,cuota_base").eq("community_id", community_id).execute()
    pisos_db_map = {p["id"]: p for p in pisos_res.data}
    
    # 2. Determinar el horizonte global de meses (Historia completa + Excel actual)
    # Buscamos el registro más antiguo en la DB para esta comunidad para que la cascada empiece desde el principio real
    db_min_date = None
    oldest_ext = client.table("extractos_procesados") \
        .select("mes_contable, anio_contable") \
        .eq("comunidad_id", community_id) \
        .order("anio_contable", desc=False) \
        .order("mes_contable", desc=False) \
        .limit(1).execute()
    
    if oldest_ext.data:
        db_min_date = datetime(oldest_ext.data[0]["anio_contable"], oldest_ext.data[0]["mes_contable"], 1)

    excel_dates = []
    for sheet_name in excel_file.sheet_names:
        mes_contable_temp = None
        anio_contable_temp = None
        partes = sheet_name.lower().split()
        for p in partes:
            if p in meses_nombres: mes_contable_temp = meses_nombres[p]
            elif p.isdigit(): anio_contable_temp = int(p) if len(p) == 4 else 2000 + int(p)
        if mes_contable_temp and anio_contable_temp:
            excel_dates.append(datetime(anio_contable_temp, mes_contable_temp, 1))

    if not excel_dates and not db_min_date:
        raise HTTPException(status_code=400, detail="No se pudo detectar ningún mes/año válido en los nombres de las hojas del Excel.")

    # Calculamos el inicio absoluto: el mínimo entre lo que hay en DB y lo que hay en el Excel
    # Siempre retrocedemos a Enero del año más antiguo para asegurar consistencia anual
    dates_to_compare = [d for d in excel_dates + ([db_min_date] if db_min_date else []) if d]
    absolute_min_date = min(dates_to_compare)
    absolute_max_date = max(dates_to_compare)

    # Horizonte global: desde enero del año más antiguo hasta el futuro próximo
    global_horizon_meses: List[str] = []
    current_date = datetime(absolute_min_date.year, 1, 1)
    
    # Límite superior: el mayor entre el Excel y el mes actual + margen de seguridad
    limit_date = max(absolute_max_date, datetime.now()) + timedelta(days=400)

    while current_date <= limit_date:
        global_horizon_meses.append(current_date.strftime("%Y-%m"))
        # Avanzar un mes de forma segura
        if current_date.month == 12:
            current_date = datetime(current_date.year + 1, 1, 1)
        else:
            current_date = datetime(current_date.year, current_date.month + 1, 1)

    global_horizon_meses = sorted(list(set(global_horizon_meses)))
    logger.info(f"[IMPORT] Horizonte global de meses para el Excel: {global_horizon_meses[0]} a {global_horizon_meses[-1]}")

    # --- PRE-ANALISIS DE HOJAS PARA ORDEN CRONOLÓGICO ---
    hojas_validas = []
    for sheet_name in excel_file.sheet_names:
        m_c, a_c = None, None
        for p in sheet_name.lower().split():
            if p in meses_nombres: m_c = meses_nombres[p]
            elif p.isdigit() and len(p) >= 2: a_c = int(p) if len(p) == 4 else 2000 + int(p)
        
        if m_c and a_c:
            hojas_validas.append({
                "name": sheet_name, "mes": m_c, "anio": a_c, "sort_key": f"{a_c}-{str(m_c).zfill(2)}"
            })
        else:
            skipped_sheets_info.append({"name": sheet_name, "reason": "No cumple con el formato 'Mes Año' o no se pudo extraer mes/año."})
            logger.warning(f"Omitiendo hoja '{sheet_name}': No cumple con el formato 'Mes Año'.")

    # Ordenamos las hojas cronológicamente para que los pagos se apliquen en orden real (Waterfall Global)
    hojas_validas.sort(key=lambda x: x["sort_key"])
    meses_importados = {h["sort_key"] for h in hojas_validas}

    # --- OBTENER TODOS LOS MESES CON REGISTRO (Para crear déficit) ---
    # Consultamos los meses que ya tienen extractos para que el motor genere la deuda correspondiente
    ext_existentes = client.table("extractos_procesados").select("mes_contable, anio_contable").eq("comunidad_id", community_id).execute()
    meses_con_registro = {f"{r['anio_contable']}-{str(r['mes_contable']).zfill(2)}" for r in (ext_existentes.data or [])}
    todos_meses_con_deuda = meses_con_registro.union(meses_importados)
    logger.info(f"[IMPORT] Total de meses con registro contable detectados: {len(todos_meses_con_deuda)}")

    # --- PREPARACIÓN DEL MOTOR DE CUOTAS GLOBAL ---
    cuotas_config: Dict[Tuple[str, str], float] = {}
    pisos_data = list(pisos_db_map.values())
    piso_id_to_codigo = {p["id"]: p["codigo"] for p in pisos_data}

    for piso in pisos_data:
        p_cod_norm = normalizar_piso_tecnico(piso["codigo"])
        cuota_esp = piso.get("cuota_base")
        cuota_base = float(cuota_esp if (cuota_esp is not None and cuota_esp > 0) else cuota_global or 0.0)
        
        # Creamos el déficit para CADA mes que tenga o vaya a tener un registro contable
        for mes_h in todos_meses_con_deuda:
            if mes_h in global_horizon_meses:
                cuotas_config[(p_cod_norm, mes_h)] = cuota_base

    if global_horizon_meses and pisos_data:
        piso_ids_in_community = [p["id"] for p in pisos_data]
        months_q = list(set(int(m.split('-')[1]) for m in global_horizon_meses))
        years_q = list(set(int(m.split('-')[0]) for m in global_horizon_meses))
        try:
            ch_res = client.table("cuotas_historico").select("*").eq("community_id", community_id).in_("piso_id", piso_ids_in_community).in_("mes", months_q).in_("anio", years_q).limit(1000).execute()
            if ch_res and ch_res.data:
                for ch in ch_res.data:
                    p_cod = normalizar_piso_tecnico(piso_id_to_codigo.get(ch["piso_id"]))
                    if p_cod:
                        m_str = f"{ch['anio']}-{str(ch['mes']).zfill(2)}"
                        if m_str in global_horizon_meses: cuotas_config[(p_cod, m_str)] = float(ch["importe_cuota"])
        except Exception as e:
            logger.warning(f"[IMPORT] La tabla cuotas_historico no está disponible, usando cuota base: {e}")

    estado_inicial_pagos = defaultdict(lambda: defaultdict(float))
    credito_inicial_pisos = defaultdict(float)
    resp_pagos = client.table("movimientos").select("piso_detectado, detalle_asignacion_cuotas, extractos_procesados(mes_contable, anio_contable), importe, fecha").eq("community_id", community_id).limit(5000).execute()
    if resp_pagos.data:
        for mov in resp_pagos.data:
            p_c = normalizar_piso_tecnico(mov.get("piso_detectado"))
            if not p_c: continue

            ext_info = mov.get("extractos_procesados")
            m_comp = f"{ext_info['anio_contable']}-{str(ext_info['mes_contable']).zfill(2)}" if ext_info else None
            
            # Ignorar pagos de meses que vamos a borrar/sobrescribir en esta importación
            if m_comp in meses_importados:
                continue

            asig_db = mov.get("detalle_asignacion_cuotas")
            if isinstance(asig_db, list) and len(asig_db) > 0:
                for a in asig_db:
                    m_dest = str(a.get("mes_destino", "")).strip()
                    # Asegurar formato YYYY-MM
                    if "-" in m_dest:
                        yp, mp = m_dest.split("-")
                        m_dest = f"{int(yp):04d}-{int(mp):02d}"

                    imp = float(a.get("importe_aplicado", 0))
                    
                    # Detectar si es uso de crédito previo (ajuste manual de Entrega a cuenta)
                    if a.get("pago_id") == "CREDITO_PREVIO":
                        credito_inicial_pisos[p_c] -= imp
                        if m_dest in global_horizon_meses:
                            estado_inicial_pagos[p_c][m_dest] += imp
                    elif m_dest == "CREDITO_ACUMULADO":
                        credito_inicial_pisos[p_c] += imp
                    elif m_dest in global_horizon_meses:
                        estado_inicial_pagos[p_c][m_dest] += imp
            else:
                # Fijar a mes de origen con soporte multiformato
                f_raw = str(mov.get("fecha") or "")
                mes_p = None
                try:
                    if '/' in f_raw:
                        d_f, m_f, y_f = f_raw.split('/')
                        mes_p = f"{int(y_f):04d}-{int(m_f):02d}"
                    elif '-' in f_raw:
                        mes_p = f_raw[:7]
                except Exception:
                    pass

                if mes_p and mes_p in global_horizon_meses:
                    estado_inicial_pagos[p_c][mes_p] += float(mov.get("importe", 0))
                else:
                    credito_inicial_pisos[p_c] += float(mov.get("importe", 0))


    engine = LogicaCuotasFincas(global_horizon_meses, cuotas_config, 
                               estado_inicial=estado_inicial_pagos,
                               credito_inicial=credito_inicial_pisos)

    # Limpiar el estado del motor para TODOS los meses que vamos a importar
    # Esto asegura que no haya "residuos" si estamos sobreescribiendo datos previos
    for p_data in pisos_db_map.values():
        p_key = normalizar_piso_tecnico(p_data["codigo"])
        for m_imp in meses_importados:
            if m_imp in engine.estado_pisos[p_key]:
                engine.estado_pisos[p_key][m_imp] = 0.0

    # Para garantizar la concordancia global y cronológica, recolectamos 
    # TODOS los movimientos de todas las hojas antes de ejecutar el motor.
    pagos_globales_excel = []
    hojas_procesadas_data = []

    for hoja_info in hojas_validas:
        sheet_name = hoja_info["name"]
        mes_contable = hoja_info["mes"]
        anio_contable = hoja_info["anio"]
        
        logger.info(f"Analizando hoja: '{sheet_name}'...")

        try:
            # Usar la función de carga robusta para detectar la cabecera
            df = load_df_from_excel_sheet_robust(excel_file, sheet_name)
            if df.empty:
                skipped_sheets_info.append({"name": sheet_name, "reason": "DataFrame vacío o no se detectaron columnas válidas."})
                logger.warning(f"Omitiendo hoja '{sheet_name}': DataFrame vacío o no se detectaron columnas válidas.")
                continue
            
            movimientos_hoja = []
            # Usar la función centralizada de detección de columnas
            columnas = detectar_columnas(df)
            col_fecha = columnas.get("fecha")
            col_fecha_valor = columnas.get("fecha_valor")
            col_importe = columnas.get("importe")
            col_obs = columnas.get("observaciones")
            col_saldo = columnas.get("saldo")
            col_piso = columnas.get("concepto") # 'concepto' en detectar_columnas es el 'piso'
            col_ordenante_generico = columnas.get("ordenante")

            if not all([col_fecha, col_importe]):
                skipped_sheets_info.append({"name": sheet_name, "reason": f"Columnas esenciales no encontradas (Fecha='{col_fecha}', Importe='{col_importe}')."})
                logger.warning(f"Omitiendo hoja '{sheet_name}': Columnas esenciales no encontradas. Detectadas: Fecha='{col_fecha}', Importe='{col_importe}'")
                continue

            validas_en_hoja = 0
            for _, row in df.iterrows():
                fecha_str = normalizar_fecha(row.get(col_fecha))
                importe_limpio = limpiar_importe(row.get(col_importe))
                
                # En tu registro, OBSERVACIONES es el concepto del banco
                obs_str = str(row.get(col_obs, '')).strip()
                # En tu registro, CONCEPTO es el Piso (para ingresos) o Categoría (para gastos)
                piso_raw = row.get(col_piso)
                piso_val = str(piso_raw).strip() if pd.notna(piso_raw) else ""
                if piso_val.lower() in ['nan', 'none']: piso_val = ""

                ordenante_final = None

                # Prioridad 1: Columna 'ORDENANTE' o 'BENEFICIARIO' si existe
                # Importante: 'DATOS' ahora entra aquí a través de find_col_by_keywords
                if col_ordenante_generico and str(row.get(col_ordenante_generico, '')).strip().lower() != 'nan':
                    ordenante_final = str(row.get(col_ordenante_generico, '')).strip()[:255]
                    if ordenante_final == '':
                        ordenante_final = None

                # Prioridad 2: Si no hay ordenante claro, intentar con 'Fecha valor' (que a veces trae nombres)
                if (not ordenante_final or ordenante_final == 'nan') and col_fecha_valor:
                    fecha_valor_raw = row.get(col_fecha_valor)
                    if fecha_valor_raw:
                        # Intentar parsear como fecha. Si falla, asumir que es un nombre de ordenante.
                        try:
                            # Si es una fecha, la ignoramos para el ordenante
                            pd.to_datetime(fecha_valor_raw, dayfirst=True)
                        except Exception:
                            # Si no es una fecha, tratarlo como ordenante
                            ordenante_final = str(fecha_valor_raw).strip()[:255]
                            if ordenante_final.lower() == 'nan' or ordenante_final == '':
                                ordenante_final = None # Limpiar si es solo 'nan' o vacío

                if fecha_str and importe_limpio != 0:
                    # Convertir DD/MM/YYYY a YYYY-MM-DD para Postgres (tipo DATE)
                    fecha_db = fecha_str
                    if fecha_str and '/' in fecha_str:
                        partes_f = fecha_str.split('/')
                        if len(partes_f) == 3:
                            d, m, y = partes_f
                            fecha_db = f"{y}-{m}-{d}"

                    tipo = "ingreso" if importe_limpio > 0 else "gasto"
                    
                    # En los registros históricos (Registros.xlsx), la columna mapeada a 'piso' (col_piso)
                    # contiene el Piso para ingresos y la Categoría para gastos.
                    piso_detectado = piso_val[:20] if (piso_val and piso_val != "") else None
                    if piso_detectado:
                        piso_detectado = normalizar_piso_tecnico(piso_detectado)

                    categoria = "Sin Categoría"
                    
                    if tipo == "ingreso":
                        # Si no se detectó un piso limpio, intentamos buscarlo con Regex en toda la fila
                        if not piso_detectado or len(piso_detectado) > 5: # Un piso suele ser corto (2J)
                            piso_regex = buscar_piso_regex_en_fila(row, columnas)
                            if piso_regex:
                                piso_detectado = normalizar_piso_tecnico(piso_regex)

                        categoria = "Ingreso Cuota"
                        # Si no se detectó piso, se queda como None para no contaminar el histórico
                    else:
                        categoria = piso_val[:50] if (piso_val and piso_val != "") else "Gasto Varios" # Los gastos no tienen piso_detectado
                        piso_detectado = None

                    movimientos_hoja.append({
                        "community_id": community_id,
                        "fecha": fecha_db,
                        # Encriptamos datos sensibles durante la importación, sin pasar el objeto cipher
                        "concepto_original": encriptar_dato(obs_str) if obs_str and obs_str.lower() != "nan" else None,
                        "importe": importe_limpio,
                        "saldo_resultante": limpiar_importe(row.get(col_saldo)) if col_saldo else None,
                        "ordenante": encriptar_dato(ordenante_final) if ordenante_final else None, # Sin pasar el objeto cipher
                        "piso_detectado": piso_detectado,
                        "tipo": tipo,
                        "categoria": categoria,
                        "user_id": user_id,
                        "editado_manualmente": True # Al venir de un registro ya clasificado
                    })
                    validas_en_hoja += 1

            if movimientos_hoja:
                for i, m in enumerate(movimientos_hoja):
                    if m["tipo"] == "ingreso" and m["piso_detectado"]:
                        pagos_globales_excel.append({
                            "piso_id": normalizar_piso_tecnico(m["piso_detectado"]),
                            # Usamos la fecha real (YYYY-MM-DD) para el orden cronológico estricto
                            "mes_referencia": m["fecha"], 
                            "importe": m["importe"],
                            "pago_id": f"{sheet_name}_{i}"
                        })
                
                hojas_procesadas_data.append({
                    "hoja_info": hoja_info,
                    "movimientos": movimientos_hoja,
                    "validas": validas_en_hoja
                })

        except Exception as e:
            skipped_sheets_info.append({"name": sheet_name, "reason": f"Error analizando: {str(e)}"})
            logger.error(f"Error analizando hoja '{sheet_name}': {e}")

    # --- EJECUCIÓN DEL MOTOR GLOBAL ---
    if pagos_globales_excel:
        logger.info(f"[IMPORT] Ejecutando motor de cuotas global sobre {len(pagos_globales_excel)} pagos...")
        # LogicaCuotasFincas ya ordena por 'mes_referencia'. Al ser YYYY-MM-DD, el orden es cronológico real.
        engine.procesar_lista_pagos(pagos_globales_excel)
        resumen_final = engine.generar_resumen()

        # --- PERSISTENCIA Y ASIGNACIÓN ---
        for data_hoja in hojas_procesadas_data:
            hoja = data_hoja["hoja_info"]
            movimientos = data_hoja["movimientos"]
            pisos_con_ajuste = set() # Para controlar si ya hemos adjuntado CREDITO_PREVIO a un movimiento de este piso
            
            # Borramos registros previos de este mes/año específico
            client.table("extractos_procesados").delete() \
                .eq("comunidad_id", community_id) \
                .eq("mes_contable", hoja["mes"]) \
                .eq("anio_contable", hoja["anio"]).execute()

            # Asegurarse de que los movimientos de ajuste de importe 0 se añaden al final
            # para no interferir con el índice 'i' de los movimientos originales.
            movimientos_a_insertar_final = []
            movimientos_a_insertar_final.extend(movimientos)

            # Distribuir las asignaciones calculadas globalmente
            for i, m in enumerate(movimientos):
                p_c = normalizar_piso_tecnico(m.get("piso_detectado", ""))
                if p_c in resumen_final:
                    p_id_asig = f"{hoja['name']}_{i}"
                    asigs_all = resumen_final[p_c]["historial_asignaciones"] or []
                    asigs = [a for a in asigs_all if a.get("pago_id") == p_id_asig]
                    
                    # Adjuntar consumos de crédito previo si es el primer movimiento del piso
                    if p_c not in pisos_con_ajuste:
                        asigs.extend([a for a in asigs_all if a["pago_id"] == "CREDITO_PREVIO"])
                        pisos_con_ajuste.add(p_c)
                    
                    m["detalle_asignacion_cuotas"] = asigs

            # Crear ajustes de importe 0 para los que usaron crédito pero no tienen pagos físicos en esta hoja
            for p_c, data_res in resumen_final.items(): # Iteramos sobre todos los pisos que el motor ha procesado
                if p_c not in pisos_con_ajuste: # Si no hemos adjuntado ya el CREDITO_PREVIO a un movimiento de este piso
                    asigs_cred = [a for a in data_res.get("historial_asignaciones", []) if a["pago_id"] == "CREDITO_PREVIO"]
                    if asigs_cred:
                        movimientos_a_insertar_final.append({
                            "community_id": community_id,
                            "fecha": f"{hoja['anio']}-{str(hoja['mes']).zfill(2)}-01",
                            "concepto_original": encriptar_dato("Ajuste automático de saldo"),
                            "importe": 0,
                            "piso_detectado": p_c,
                            "tipo": "ingreso",
                            "categoria": "Ajuste de Saldo",
                            "editado_manualmente": True,
                            "detalle_asignacion_cuotas": asigs_cred
                        })
                        pisos_con_ajuste.add(p_c) # Marcamos que ya hemos manejado el CREDITO_PREVIO para este piso

            logger.info(f"Insertando {data_hoja['validas']} movimientos de la hoja '{hoja['name']}'...")
            # 1. Crear un registro de extracto para esta HOJA (un "Registro" de mes/año)
            # Solo si hay movimientos válidos para insertar
            extracto_res = client.table("extractos_procesados").insert({
                "comunidad_id": community_id, "nombre_archivo": f"{file.filename} ({hoja['name']})",
                "fecha_subida": datetime.now().isoformat(), "mes_contable": hoja["mes"], "anio_contable": hoja["anio"]
            }).execute()
            
            if not extracto_res.data:
                continue
            extracto_id = extracto_res.data[0]['id']
            
            # Asignar el extracto_id a todos los movimientos de esta hoja
            for mov in movimientos_a_insertar_final:
                mov["extracto_id"] = extracto_id
            
            # Verificamos que la inserción sea exitosa
            mov_res = client.table("movimientos").insert(movimientos_a_insertar_final).execute()
            if mov_res.data:
                total_movimientos_importados += len(mov_res.data)

            processed_sheets_info.append({"name": hoja["name"], "count": data_hoja["validas"]})

    return {
        "status": "success",
        "message": f"Se importaron {total_movimientos_importados} movimientos correctamente.",
        "imported_count": total_movimientos_importados,
        "processed_sheets": processed_sheets_info,
        "skipped_sheets": skipped_sheets_info
    }
