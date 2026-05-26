import io
import logging
import pandas as pd
from fastapi import UploadFile, HTTPException, BackgroundTasks
from typing import List, Dict
from app.servicios.supabase_db import supabase_client, supabase_service_role_client
from app.servicios.procesar_extracto import limpiar_importe, normalizar_fecha, load_df_from_excel_sheet_robust, detectar_columnas, buscar_piso_regex_en_fila
import re
from datetime import datetime
from app.controllers.security import encriptar_dato

logger = logging.getLogger(__name__)

async def importar_movimientos_controller(community_id: str, file: UploadFile, user_id: str):
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

    for sheet_name in excel_file.sheet_names:
        logger.info(f"Analizando hoja: '{sheet_name}'...")
        # Extraer mes y año del nombre de la hoja (ej: "Enero 2024")
        mes_contable = None
        anio_contable = None
        partes = sheet_name.lower().split()
        for p in partes:
            if p in meses_nombres:
                mes_contable = meses_nombres[p]
            elif p.isdigit():
                if len(p) == 4:
                    anio_contable = int(p)
                elif len(p) == 2:
                    anio_contable = 2000 + int(p)

        # VALIDACIÓN: Si no se detecta Mes y Año, se omite la hoja por completo
        if mes_contable is None or anio_contable is None:
            skipped_sheets_info.append({"name": sheet_name, "reason": "No cumple con el formato 'Mes Año' o no se pudo extraer mes/año."})
            logger.warning(f"Omitiendo hoja '{sheet_name}': No cumple con el formato 'Mes Año' o no se pudo extraer mes/año.")
            continue

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
                    categoria = "Sin Categoría"
                    
                    if tipo == "ingreso":
                        # Si no se detectó un piso limpio, intentamos buscarlo con Regex en toda la fila
                        if not piso_detectado or len(piso_detectado) > 5: # Un piso suele ser corto (2J)
                            piso_regex = buscar_piso_regex_en_fila(row, columnas)
                            if piso_regex:
                                piso_detectado = piso_regex
                        
                        categoria = "Ingreso Cuota"
                        # Si no se detectó piso, se queda como None para no contaminar el histórico
                    else:
                        categoria = piso_val[:50] if (piso_val and piso_val != "") else "Gasto Varios" # Los gastos no tienen piso_detectado
                        piso_detectado = None

                    movimientos_hoja.append({
                        "community_id": int(community_id),
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
                logger.info(f"Insertando {validas_en_hoja} movimientos de la hoja '{sheet_name}'...")
                # Borramos registros previos para el mismo periodo y comunidad para evitar duplicados.
                # Gracias al ON DELETE CASCADE configurado en la base de datos, esto eliminará 
                # automáticamente también los movimientos antiguos vinculados a esos extractos.
                client.table("extractos_procesados").delete() \
                    .eq("comunidad_id", community_id) \
                    .eq("mes_contable", mes_contable) \
                    .eq("anio_contable", anio_contable) \
                    .execute()

                # 1. Crear un registro de extracto para esta HOJA (un "Registro" de mes/año)
                # Solo si hay movimientos válidos para insertar
                extracto_res = client.table("extractos_procesados").insert({
                    "comunidad_id": community_id,
                    "nombre_archivo": f"{file.filename} ({sheet_name})",
                    # Eliminamos user_id de aquí porque la tabla extractos_procesados no tiene esta columna en tu DB
                    "fecha_subida": datetime.now().isoformat(),
                    "mes_contable": mes_contable,
                    "anio_contable": anio_contable
                }).execute()
                
                if not extracto_res.data:
                    continue
                extracto_id = extracto_res.data[0]['id']
                
                # Asignar el extracto_id a todos los movimientos de esta hoja
                for mov in movimientos_hoja:
                    mov["extracto_id"] = extracto_id
                
                # Verificamos que la inserción sea exitosa
                mov_res = client.table("movimientos").insert(movimientos_hoja).execute()
                if mov_res.data:
                    total_movimientos_importados += len(mov_res.data)

            processed_sheets_info.append({"name": sheet_name, "count": validas_en_hoja})
        except Exception as e:
            skipped_sheets_info.append({"name": sheet_name, "reason": f"Error interno: {str(e)}"})
            logger.error(f"Error procesando hoja '{sheet_name}': {e}")

    return {
        "status": "success",
        "message": f"Se importaron {total_movimientos_importados} movimientos correctamente.",
        "imported_count": total_movimientos_importados,
        "processed_sheets": processed_sheets_info,
        "skipped_sheets": skipped_sheets_info
    }


async def get_movimientos_by_community_controller(community_id: str, user_id: str):
    """
    Obtiene todos los movimientos bancarios asociados a una comunidad específica
    para el usuario autenticado.
    """
    try:
        response = supabase_client.table("movimientos") \
            .select("*") \
            .eq("community_id", community_id) \
            .eq("user_id", user_id) \
            .order("fecha", desc=True) \
            .execute()

        if response.data:
            # Convertir Decimal a float para JSON serialización
            for mov in response.data:
                if 'importe' in mov and isinstance(mov['importe'], str):
                    try:
                        mov['importe'] = float(mov['importe'])
                    except ValueError:
                        pass # Mantener como string si no se puede convertir
            return response.data
        else:
            return []
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al obtener movimientos: {e}")

async def get_extractos_by_community_controller(community_id: str, user_id: str):
    """
    Obtiene todos los extractos procesados asociados a una comunidad específica.
    """
    try:
        response = supabase_client.table("extractos_procesados") \
            .select("*") \
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