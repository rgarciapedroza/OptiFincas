import io
import pandas as pd
from fastapi import UploadFile, HTTPException
from typing import List, Dict
from app.servicios.supabase_db import supabase_client
from app.servicios.procesar_extracto import limpiar_importe, normalizar_fecha, load_df_from_excel_sheet_robust
from datetime import datetime

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

    total_movimientos_importados = 0
    meses_nombres = {
        "enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6,
        "julio": 7, "agosto": 8, "septiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12
    }

    for sheet_name in excel_file.sheet_names:
        # Extraer mes y año del nombre de la hoja (ej: "Enero 2024")
        mes_contable = None
        anio_contable = None
        partes = sheet_name.lower().split()
        for p in partes:
            if p in meses_nombres:
                mes_contable = meses_nombres[p]
            elif p.isdigit() and len(p) == 4:
                anio_contable = int(p)

        # VALIDACIÓN: Si no se detecta Mes y Año, se omite la hoja por completo
        if mes_contable is None or anio_contable is None:
            print(f"Omitiendo hoja '{sheet_name}': No cumple con el formato 'Mes Año'")
            continue

        try:
            # Usar la función de carga robusta para detectar la cabecera
            df = load_df_from_excel_sheet_robust(excel_file, sheet_name)
            if df.empty:
                print(f"Omitiendo hoja '{sheet_name}': DataFrame vacío después de cargar.")
                continue
            
            movimientos_hoja = []

            # Columnas ya normalizadas a mayúsculas por load_df_from_excel_sheet_robust
            cols_actuales = df.columns.tolist()

            # Mapeo basado en tu formato: "Fecha contable", "Fecha valor", "Observaciones", "Importe", "Saldo", "CONCEPTO"
            col_fecha = next((c for c in cols_actuales if "FECHA CONTABLE" in c or "FECHA" == c), None)
            col_fecha_valor = next((c for c in cols_actuales if "FECHA VALOR" in c), None) # Columna "Fecha valor"
            col_obs = next((c for c in cols_actuales if "OBSERVACIONES" in c or "CONCEPTO ORIGINAL" in c), None)
            col_importe = next((c for c in cols_actuales if "IMPORTE" in c), None)
            col_saldo = next((c for c in cols_actuales if "SALDO" in c), None)
            col_piso = next((c for c in cols_actuales if "CONCEPTO" == c or "PISO" in c), None)
            
            # También buscar una columna genérica de "ORDENANTE" o "BENEFICIARIO"
            col_ordenante_generico = next((c for c in cols_actuales if "ORDENANTE" in c or "BENEFICIARIO" in c), None)

            if not all([col_fecha, col_importe]):
                print(f"Omitiendo hoja '{sheet_name}': Faltan FECHA o IMPORTE después de detección de cabecera.")
                continue

            for _, row in df.iterrows():
                fecha_str = normalizar_fecha(row.get(col_fecha))
                importe_limpio = limpiar_importe(row.get(col_importe))
                
                # En tu registro, OBSERVACIONES es el concepto del banco
                obs_str = str(row.get(col_obs, '')).strip()
                # En tu registro, CONCEPTO es el Piso
                piso_val = str(row.get(col_piso, '')).strip()

                ordenante_final = None

                # Prioridad 1: Columna 'ORDENANTE' o 'BENEFICIARIO' si existe
                if col_ordenante_generico:
                    ordenante_final = str(row.get(col_ordenante_generico, '')).strip()[:255]
                    if ordenante_final.lower() == 'nan' or ordenante_final == '':
                        ordenante_final = None # Limpiar si es solo 'nan' o vacío

                # Prioridad 2: Si no hay ordenante genérico, intentar con 'Fecha valor'
                if not ordenante_final and col_fecha_valor:
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

                    movimientos_hoja.append({
                        "community_id": int(community_id),
                        "fecha": fecha_db,
                        "concepto_original": obs_str if obs_str != "nan" else "",
                        "importe": importe_limpio,
                        "saldo_resultante": limpiar_importe(row.get(col_saldo)) if col_saldo else None,
                        "ordenante": ordenante_final, # Usar el ordenante determinado dinámicamente
                        "piso_detectado": piso_val if piso_val != "nan" else None,
                        "tipo": "ingreso" if importe_limpio > 0 else "gasto",
                        "user_id": user_id,
                        "editado_manualmente": True # Al venir de un registro ya clasificado
                    })

            if movimientos_hoja:
                # 1. Crear un registro de extracto para esta HOJA (un "Registro" de mes/año)
                # Solo si hay movimientos válidos para insertar
                extracto_res = supabase_client.table("extractos_procesados").insert({
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
                supabase_client.table("movimientos").insert(movimientos_hoja).execute()
                total_movimientos_importados += len(movimientos_hoja)

        except Exception as e:
            print(f"Error procesando hoja '{sheet_name}': {e}")

    return {
        "status": "success",
        "message": f"Se importaron {total_movimientos_importados} movimientos correctamente.",
        "imported_count": total_movimientos_importados
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

async def eliminar_extracto_controller(extracto_id: int):
    """
    Elimina un extracto y todos sus movimientos asociados.
    """
    try:
        # Con ON DELETE CASCADE en la DB, eliminar el extracto padre
        # automáticamente elimina los movimientos asociados.
        response = supabase_client.table("extractos_procesados").delete().eq("id", extracto_id).execute()
        
        return {"status": "success", "message": "Registro eliminado correctamente"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al eliminar registro: {e}")