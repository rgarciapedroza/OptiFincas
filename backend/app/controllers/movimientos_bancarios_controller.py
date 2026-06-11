import io
import re
import logging
import pandas as pd
from fastapi import UploadFile, HTTPException, BackgroundTasks
from typing import List, Dict, Optional, Union
import math
from app.servicios.supabase_db import supabase_client, supabase_service_role_client
from app.servicios.procesar_extracto import limpiar_importe, normalizar_fecha, load_df_from_excel_sheet_robust, detectar_columnas, buscar_piso_regex_en_fila
from app.servicios.gestion_cuotas import LogicaCuotasFincas, PagoInfo, DetalleAsignacion
from app.servicios.procesar_movimientos import normalizar_piso_tecnico
from app.controllers.security import encriptar_dato, desencriptar_dato
# Importamos el servicio de orquestación
from app.servicios.extracto_orquestacion import importar_movimientos_service
 
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
    return await importar_movimientos_service(community_id, file, user_id)

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
            # Normalizamos el código recibido para que coincida con la base de datos (ej: "1º A" -> "1A")
            query = query.eq("piso_detectado", normalizar_piso_tecnico(piso_codigo))

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
        
        df['piso_norm'] = df['piso_detectado'].apply(normalizar_piso_tecnico)
        ingresos = df[df['importe'] > 0]
        gastos = df[df['importe'] < 0]

        # 3. Resumen de Ingresos por Piso
        resumen_pisos = []
        codigos_norm_comunidad = {normalizar_piso_tecnico(p['codigo']) for p in pisos_res.data}

        for p in pisos_res.data:
            codigo = p['codigo']
            codigo_norm = normalizar_piso_tecnico(codigo)
            
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