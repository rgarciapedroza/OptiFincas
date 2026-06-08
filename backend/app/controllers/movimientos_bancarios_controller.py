import io
import logging
import pandas as pd
from fastapi import UploadFile, HTTPException, BackgroundTasks
from typing import List, Dict, Optional, Union
import math
from app.servicios.supabase_db import supabase_client, supabase_service_role_client
from app.servicios.procesar_extracto import limpiar_importe, normalizar_fecha, load_df_from_excel_sheet_robust, detectar_columnas, buscar_piso_regex_en_fila
from app.servicios.gestion_cuotas import LogicaCuotasFincas, PagoInfo, DetalleAsignacion
from collections import defaultdict
from app.servicios.procesar_movimientos import formatear_piso, normalizar_piso_tecnico
import re
from datetime import datetime, timedelta
from app.controllers.security import encriptar_dato, desencriptar_dato

logger = logging.getLogger(__name__)

def limpiar_nan(obj):
    """Limpia recursivamente valores NaN o Inf de diccionarios y listas para que sean JSON compliant."""
    if isinstance(obj, dict):
        return {k: limpiar_nan(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [limpiar_nan(i) for i in obj]
    elif isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return 0.0
        return obj
    else:
        return obj

async def importar_movimientos_controller(community_id: int, file: UploadFile, user_id: str):
    """
    Importa movimientos bancarios desde un archivo Excel (con múltiples hojas)
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
    cuotas_config: Dict[tuple[str, str], float] = {}
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
    # Aumentamos el límite a 5000 para cargar todo el historial de la comunidad
    # Eliminamos el filtro de importe > 0 para incluir aplicaciones de "Entrega a cuenta" (importe 0)
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
                except:
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
    for p_data in pisos_data:
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
                        except:
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
            
            # Borramos registros previos de este mes/año específico
            client.table("extractos_procesados").delete() \
                .eq("comunidad_id", community_id) \
                .eq("mes_contable", hoja["mes"]) \
                .eq("anio_contable", hoja["anio"]).execute()

            # Distribuir las asignaciones calculadas globalmente
            for i, m in enumerate(movimientos):
                p_c = normalizar_piso_tecnico(m.get("piso_detectado", ""))
                if p_c in resumen_final:
                    p_id_asig = f"{hoja['name']}_{i}"
                    asigs = [a for a in resumen_final[p_c]["historial_asignaciones"] if a["pago_id"] == p_id_asig]
                    m["detalle_asignacion_cuotas"] = asigs

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
            for mov in movimientos:
                mov["extracto_id"] = extracto_id
            
            # Verificamos que la inserción sea exitosa
            mov_res = client.table("movimientos").insert(movimientos).execute()
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

async def get_movimientos_by_community_controller(community_id: int, user_id: str, extracto_id: Optional[int] = None, piso_codigo: Optional[str] = None):
    """
    Obtiene todos los movimientos bancarios asociados a una comunidad específica.
    Filtra por extracto_id si se proporciona (selección de mes).
    Filtra por piso_codigo si se proporciona.
    """
    try:
        query = supabase_service_role_client.table("movimientos") \
            .select("*") \
            .eq("community_id", community_id)
 
        if extracto_id:
            query = query.eq("extracto_id", extracto_id)
        
        if piso_codigo:
            query = query.eq("piso_detectado", piso_codigo) # Filter by piso_detectado

        response = query.order("fecha", desc=True).execute()

        if response.data:
            # Desencriptación segura para la visualización en el Dashboard
            for mov in response.data:
                try:
                    desc_con = desencriptar_dato(mov.get("concepto_original"))
                    desc_ord = desencriptar_dato(mov.get("ordenante"))
                except Exception:
                    desc_con = mov.get("concepto_original")
                    desc_ord = mov.get("ordenante")
                
                # Si la desencriptación falló (devuelve el token cifrado), usamos la categoría como fallback
                if desc_con == mov.get("concepto_original") and mov.get("categoria"):
                    desc_con = mov.get("categoria")
                mov["concepto_original"] = desc_con
                mov["ordenante"] = desc_ord or ""
                mov["ORDENANTE"] = desc_ord or "-"
                
                if 'importe' in mov and mov['importe'] is not None:
                    try:
                        mov['importe'] = float(mov['importe'])
                    except (ValueError, TypeError):
                        pass
            return response.data
        return []
    except Exception as e:
        logger.error(f"Error al obtener movimientos: {e}")
        raise HTTPException(status_code=500, detail="Error al recuperar los movimientos bancarios")



async def get_extractos_by_community_controller(community_id: int, user_id: str):
    """
    Obtiene todos los extractos procesados asociados a una comunidad específica.
    """
    try:
        response = supabase_service_role_client.table("extractos_procesados") \
            .select("*, movimientos(count)") \
            .eq("comunidad_id", community_id) \
            .order("anio_contable", desc=True) \
            .order("mes_contable", desc=True) \
            .execute()

        return response.data if response.data else []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener extractos: {e}")

async def eliminar_extracto_controller(extracto_id: int):
    """
    Elimina un extracto y todos sus movimientos asociados.
    """
    try:
        # Con ON DELETE CASCADE en la DB, eliminar el extracto padre
        # automáticamente elimina los movimientos asociados.
        client = supabase_service_role_client if supabase_service_role_client else supabase_client
        response = client.table("extractos_procesados").delete().eq("id", extracto_id).execute()
        
        return {"status": "success", "message": "Registro eliminado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar registro: {e}")

async def get_finanzas_comunidad_controller(community_id: int, mes: int, anio: int):
    """ 
    Calcula el estado financiero de una comunidad para un mes dado.
    Lógica centralizada en el backend para Matrícula de Honor.
    """
    try:
        # Siempre usar service_role para cálculos financieros de servidor para evitar filtros RLS parciales
        client = supabase_service_role_client if supabase_service_role_client else supabase_client
        
        # 1. Obtener el extracto correspondiente
        ext_res = client.table("extractos_procesados") \
            .select("id") \
            .eq("comunidad_id", community_id) \
            .eq("mes_contable", mes) \
            .eq("anio_contable", anio) \
            .maybe_single().execute()
        
        if not ext_res.data:
            # Si no hay extracto, devolvemos estructura vacía coherente
            return {
                "ingresosPorPiso": [],
                "gastos": [],
                "resumenCuentas": {
                    "saldoAnterior": 0, "ingresosMes": 0, "gastosMes": 0, "saldoTotal": 0
                },
                "mensaje": "No se encontraron datos para el periodo seleccionado."
            }
            
        extracto_id = ext_res.data['id']

        # 2. Obtener movimientos y pisos
        movs_res = client.table("movimientos").select("*").eq("extracto_id", extracto_id).execute()
        pisos_res = client.table("pisos").select("codigo").eq("community_id", community_id).execute()
        
        if not movs_res.data:
            return {"ingresosPorPiso": [], "gastos": [], "resumenCuentas": { "saldoAnterior": 0, "ingresosMes": 0, "gastosMes": 0, "saldoTotal": 0 }}

        df = pd.DataFrame(movs_res.data)

        # Garantizar que las columnas necesarias existen (evita KeyError si Supabase no las devuelve)
        for col in ['importe', 'piso_detectado', 'categoria', 'saldo_resultante', 'fecha']:
            if col not in df.columns:
                df[col] = 0.0 if col == 'importe' else None

        # Asegurar tipos e importes limpios
        df['importe'] = df['importe'].apply(limpiar_importe)
        
        def normalizar_piso_simple(p):
            if not p: return ""
            return re.sub(r'[^A-Z0-9]', '', str(p).upper())

        df['piso_norm'] = df['piso_detectado'].apply(normalizar_piso_simple)
        ingresos = df[df['importe'] > 0]
        gastos = df[df['importe'] < 0]

        # 3. Resumen de Ingresos por Piso
        resumen_pisos = []
        codigos_norm_comunidad = {normalizar_piso_simple(p['codigo']) for p in pisos_res.data}

        for p in pisos_res.data:
            codigo = p['codigo']
            codigo_norm = normalizar_piso_simple(codigo)
            
            # Coincidencia exacta sobre versión normalizada
            movs_piso = ingresos[ingresos['piso_norm'] == codigo_norm]
            total = float(movs_piso['importe'].sum())
            
            resumen_pisos.append({
                "codigo": codigo,
                "importe": total,
                "pagado": total > 0,
                "fecha": movs_piso.iloc[0]['fecha'] if len(movs_piso) > 0 else None
            })

        # 3.1 Ingresos sin identificar (No asignados a ningún piso de la lista)
        ingresos_sin_piso_df = ingresos[~ingresos['piso_norm'].isin(codigos_norm_comunidad)]
        ingresos_sin_identificar = []
        for _, row in ingresos_sin_piso_df.iterrows():
            # Desencriptar concepto_original para el informe
            raw_obs = row.get("concepto_original") or ""
            obs = desencriptar_dato(raw_obs)
            if not obs or obs == raw_obs:
                obs = "Ingreso sin identificar"
                
            ingresos_sin_identificar.append({
                "fecha": row.get("fecha"),
                "observaciones": obs,
                "importe": float(row.get("importe", 0))
            })

        # 4. Resumen de Gastos (Ahora devolvemos movimientos individuales para permitir adjuntar facturas)
        resumen_gastos = []
        if not gastos.empty:
            for _, row in gastos.iterrows():
                # Recuperamos el concepto del extracto bancario tal cual
                raw_obs = row.get("concepto_original") or ""
                obs_desencriptado = desencriptar_dato(raw_obs)
                
                # Robustez: Si el texto sigue siendo el token cifrado o está vacío, usamos la categoría
                if not obs_desencriptado or obs_desencriptado == raw_obs:
                    obs_desencriptado = row.get("categoria") or "Gasto"
                    
                resumen_gastos.append({
                    "id": int(row.get("id")),
                    "concepto": obs_desencriptado, # Enviamos el concepto del banco desencriptado
                    "importe": abs(float(row.get("importe", 0))),
                    "categoria": row.get("categoria") or "Sin Categoría"
                })

        # 5. Totales
        total_ingresos = float(ingresos['importe'].sum())
        total_gastos = abs(float(gastos['importe'].sum()))
        # Saldo final (del último movimiento si existe saldo_resultante)
        df_sorted = df.sort_values('fecha', ascending=False)
        
        saldo_total = 0.0
        if 'saldo_resultante' in df.columns and not df_sorted.empty:
            val = df_sorted.iloc[0]['saldo_resultante']
            if pd.notna(val) and val is not None:
                try: 
                    temp_val = float(val)
                    if not math.isnan(temp_val) and not math.isinf(temp_val):
                        saldo_total = temp_val
                except: 
                    saldo_total = 0.0

        res = {
            "ingresosPorPiso": resumen_pisos,
            "gastos": resumen_gastos,
            "ingresosSinIdentificar": ingresos_sin_identificar,
            "resumenCuentas": {
                "saldoAnterior": round(saldo_total - total_ingresos + total_gastos, 2),
                "ingresosMes": round(total_ingresos, 2),
                "gastosMes": round(total_gastos, 2),
                "saldoTotal": round(saldo_total, 2)
            }
        }
        
        return limpiar_nan(res)
    except Exception as e:
        logger.error(f"Error calculando finanzas: {e}")
        raise HTTPException(status_code=500, detail="Error al calcular el informe financiero")