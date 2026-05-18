import io
import pandas as pd
from fastapi import UploadFile, HTTPException
from typing import List, Dict
from app.servicios.supabase_db import supabase_client
from app.servicios.procesar_extracto import limpiar_importe, normalizar_fecha, detectar_columnas
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

    # 1. Crear el registro del extracto (Cabecera)
    try:
        extracto_res = supabase_client.table("extractos_procesados").insert({
            "comunidad_id": community_id,
            "nombre_archivo": file.filename,
            "user_id": user_id,
            "fecha_subida": datetime.now().isoformat()
        }).execute()
        
        if not extracto_res.data:
            raise Exception("No se pudo crear el registro del extracto")
        
        extracto_id = extracto_res.data[0]['id']
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al registrar el extracto: {e}")

    movimientos_a_insertar = []
    total_movimientos_importados = 0

    for sheet_name in excel_file.sheet_names:
        try:
            df = excel_file.parse(sheet_name)
            if df.empty:
                continue

            # Normalizar columnas para detectar el formato de "Registro"
            cols_actuales = [str(col).strip().upper() for col in df.columns]
            df.columns = cols_actuales

            # Mapeo basado en tu formato: "Fecha contable", "Fecha valor", "Observaciones", "Importe", "Saldo", "CONCEPTO"
            col_fecha = next((c for c in cols_actuales if "FECHA CONTABLE" in c or "FECHA" == c), None)
            col_valor = next((c for c in cols_actuales if "FECHA VALOR" in c), None)
            col_obs = next((c for c in cols_actuales if "OBSERVACIONES" in c or "CONCEPTO ORIGINAL" in c), None)
            col_importe = next((c for c in cols_actuales if "IMPORTE" in c), None)
            col_saldo = next((c for c in cols_actuales if "SALDO" in c), None)
            col_piso = next((c for c in cols_actuales if "CONCEPTO" == c or "PISO" in c), None)

            if not all([col_fecha, col_importe]):
                print(f"Omitiendo hoja '{sheet_name}': Faltan FECHA o IMPORTE")
                continue

            for _, row in df.iterrows():
                fecha_str = normalizar_fecha(row.get(col_fecha))
                importe_limpio = limpiar_importe(row.get(col_importe))
                
                # En tu registro, OBSERVACIONES es el concepto del banco
                obs_str = str(row.get(col_obs, '')).strip()
                # En tu registro, CONCEPTO es el Piso
                piso_val = str(row.get(col_piso, '')).strip()

                if fecha_str and importe_limpio != 0:
                    movimientos_a_insertar.append({
                        "extracto_id": extracto_id,
                        "community_id": int(community_id),
                        "fecha": fecha_str,
                        "concepto_original": obs_str if obs_str != "nan" else "",
                        "importe": importe_limpio,
                        "saldo_resultante": limpiar_importe(row.get(col_saldo)) if col_saldo else None,
                        "ordenante": str(row.get(col_valor, ''))[:255] if col_valor else None,
                        "piso_detectado": piso_val if piso_val != "nan" else None,
                        "piso": piso_val if (piso_val != "nan" and len(piso_val) < 10) else None,
                        "tipo": "ingreso" if importe_limpio > 0 else "gasto",
                        "user_id": user_id,
                        "editado_manualmente": True # Al venir de un registro ya clasificado
                    })
                    total_movimientos_importados += 1

        except Exception as e:
            print(f"Error procesando hoja '{sheet_name}': {e}")
            # Continuar con la siguiente hoja si una falla

    if not movimientos_a_insertar:
        raise HTTPException(status_code=400, detail="No se encontraron movimientos válidos en el archivo Excel.")

    # Insertar en Supabase
    try:
        # Supabase inserta en lotes de 1000 por defecto, pero podemos enviar todo el array
        response = supabase_client.table("movimientos").insert(movimientos_a_insertar).execute()
        if response.data:
            return {
                "status": "success",
                "message": f"Se importaron {total_movimientos_importados} movimientos bancarios correctamente.",
                "imported_count": total_movimientos_importados
            }
        else:
            raise HTTPException(status_code=500, detail=f"Error al insertar en Supabase: {response.error.message if response.error else 'Error desconocido'}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error en la base de datos: {e}")


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