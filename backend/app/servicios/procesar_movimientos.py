import re
from typing import Dict, List, Optional
import pandas as pd
from fastapi import UploadFile
from app.servicios.procesar_extracto import (
    cargar_extracto_a_df,
    cargar_registros_a_excel,
    detectar_columnas,
    limpiar_importe,
    normalizar_fecha,
    buscar_piso_regex_en_fila,
)
from app.procesamiento.buscar_pisos import buscar_pisos_en_historico, find_col_by_keywords
from app.servicios.resumen import calcular_resumen_categorias_con_tipo # Importar correctamente

def normalizar_piso_tecnico(piso_raw: str) -> str:
    """Normalización estricta para claves del motor y búsqueda (ej: '2º J' -> '2J')"""
    if not piso_raw: return ""
    return re.sub(r'[^A-Z0-9]', '', str(piso_raw).upper())

def formatear_piso(piso: str) -> str:
    if not piso:
        return ""
    piso_str = str(piso).strip().upper()
    if piso_str.lower() in ["piso sin identificar", "piso desconocido", "sin asignar", "nan", "pisodesconocido", "none", ""]:
        return "piso sin identificar"
    
    # Normalizar descriptores comunes
    piso_str = piso_str.replace("IZQUIERDA", "IZQ").replace("DERECHA", "DRCHA").replace("DCHA", "DRCHA")
    
    # Caso Numero+Letra (ej: 2J -> 2º J)
    match = re.match(r"^(\d{1,2})([A-Z])$", piso_str)
    if match:
        return f"{match.group(1)}º {match.group(2)}"
        
    # Caso Numero+Descriptor (ej: 4IZQ -> 4º IZQ)
    match_desc = re.match(r"^(\d{1,2})(IZQ|DRCHA|EXT|INT)$", piso_str)
    if match_desc:
        return f"{match_desc.group(1)}º {match_desc.group(2)}"

    # Caso Numero solo -> 4º
    if piso_str.isdigit() and len(piso_str) <= 2:
        return f"{piso_str}º"
        
    return piso_str

def construir_movimientos(df_extracto, columnas, clasificador, es_csv, community_id: Optional[int] = None):
    movimientos_con_piso = []
    movimientos_sin_piso = []

    col_fecha_proceso_csv = None
    if es_csv:
        for col in df_extracto.columns:
            col_up = str(col).upper()
            if any(k in col_up for k in ["FECHA PROCESO", "F. PROCESO", "FECHA OPERACION", "F. OPERACION", "FECHA VALOR", "VALOR"]):
                col_fecha_proceso_csv = col
                break

    # Usar el helper find_col_by_keywords para buscar la columna ordenante
    col_ordenante = columnas.get("ordenante") or find_col_by_keywords(df_extracto.columns.tolist(), ["ordenante", "beneficiario", "nombre", "titular", "remitente", "datos", "contraparte", "propietario"])

    def clean_str(val):
        if pd.isna(val) or val is None:
            return ""
        s = str(val).strip()
        return "" if s.lower() == "nan" else s

    for idx, row in df_extracto.iterrows():
        # Intentamos obtener la fecha. normalizar_fecha devuelve None si encuentra guiones ("-") o nulos.
        col_f = columnas.get("fecha")
        col_fv = columnas.get("fecha_valor")
        
        fecha_final = normalizar_fecha(row.get(col_f)) if col_f else None

        # Fallback 1: Si no hay fecha principal, intentar con fecha_valor
        if not fecha_final and col_fv:
            fecha_final = normalizar_fecha(row.get(col_fv))

        # Fallback 2: Si sigue sin haber fecha y es CSV, probar con la columna detectada de proceso
        if not fecha_final and es_csv and col_fecha_proceso_csv:
            fecha_final = normalizar_fecha(row.get(col_fecha_proceso_csv))

        c_base = clean_str(row.get(columnas.get("concepto"))) if columnas.get("concepto") else ""
        c_obs = clean_str(row.get(columnas.get("observaciones"))) if columnas.get("observaciones") else ""
        c_mix_raw = clean_str(row.get(columnas.get("texto_mezclado"))) if columnas.get("texto_mezclado") else ""
        c_ben = clean_str(row.get(col_ordenante)) if col_ordenante else ""

        if c_mix_raw:
            concepto_completo = c_mix_raw
        else:
            # Evitar duplicar el ordenante si ya está contenido en el concepto o observaciones
            partes = []
            if c_base: partes.append(c_base)
            if c_ben and c_ben.upper() not in c_base.upper():
                partes.append(c_ben)
            if c_obs and c_obs.upper() not in c_base.upper() and c_obs.upper() not in c_ben.upper():
                partes.append(c_obs)
            concepto_completo = " ".join(partes).strip()

        # Lógica de limpieza para la visualización de Observaciones
        # Queremos mostrar el texto del banco sin el nombre del ordenante duplicado
        obs_limpia = c_obs if c_obs else c_base
        if c_ben and len(c_ben) > 3:
            # Eliminamos el nombre del ordenante del texto (insensible a mayúsculas)
            obs_limpia = re.sub(re.escape(c_ben), "", obs_limpia, flags=re.IGNORECASE).strip()
            # Limpiamos ruidos sobrantes como guiones o barras al inicio/final
            obs_limpia = re.sub(r"^[ \t\-\:\/]+|[ \t\-\:\/]+$", "", obs_limpia).strip()

        importe = limpiar_importe(row.get(columnas["importe"], 0))
        # Corregimos la obtención del saldo usando la columna detectada
        saldo_val = limpiar_importe(row.get(columnas["saldo"], 0)) if columnas.get("saldo") else 0

        if importe == 0: continue

        resultado_ml = clasificador.clasificar(concepto_completo, importe, community_id)
        
        # Normalizar el piso devuelto por el ML para evitar que la cadena "NONE" se trate como un piso identificado
        piso_ml = resultado_ml["piso"]
        if piso_ml and str(piso_ml).strip().lower() in ["none", "nan", "", "piso sin identificar", "piso desconocido", "sin asignar"]:
            piso_ml = None

        # --- MEJORA: Búsqueda Regex Proactiva ---
        # Si el ML no encontró piso, o devolvió algo muy largo (erróneo), intentamos Regex
        piso_regex = buscar_piso_regex_en_fila(row, columnas, community_id)
        piso_final_detectado = piso_regex if piso_regex else (piso_ml if (piso_ml and len(str(piso_ml)) <= 5) else None)

        mov = {
            "id": idx,
            # Cabeceras en MAYÚSCULAS para la UI y Excel
            "FECHA": fecha_final or "",
            "CONCEPTO": formatear_piso(piso_final_detectado) if piso_final_detectado else "piso sin identificar", # Corregido: Usar piso_final_detectado
            "OBSERVACIONES": obs_limpia, # Observaciones limpias de nombres
            "SALDO": saldo_val,
            "IMPORTE": round(importe, 2),

            # Campos técnicos internos (mantener en minúsculas para compatibilidad)
            "fecha": fecha_final or "",
            "concepto": concepto_completo,
            "importe": round(importe, 2),
            "saldo": saldo_val,
            "ordenante": c_ben, # Guardar siempre para lógica interna de búsqueda de pisos

            "piso": piso_final_detectado or "",
            "tipo": resultado_ml["tipo"],
            "categoria": resultado_ml["categoria"],
            "concepto_original": concepto_completo,
            "confianza": resultado_ml["confianza"],
            "metodo_piso": resultado_ml.get("metodo", ""),
            "texto_busqueda_nombres": c_ben if (not es_csv and c_ben) else concepto_completo,
            "es_csv": es_csv,
        }

        # Para la visualización en la UI, incluimos ORDENANTE solo si es Excel
        if not es_csv and col_ordenante:
            mov["ORDENANTE"] = c_ben

        if importe < 0:
            mov["CONCEPTO"] = resultado_ml["categoria"]
            movimientos_con_piso.append(mov)
        elif piso_final_detectado:
            mov["piso"] = piso_final_detectado
            mov["CONCEPTO"] = formatear_piso(piso_final_detectado)
            movimientos_con_piso.append(mov)
        else:
            movimientos_sin_piso.append(mov)

    return movimientos_con_piso, movimientos_sin_piso

def completar_pisos(movimientos_sin_piso, excel_registros, es_csv: bool, extractos_map: Optional[Dict] = None, community_id: Optional[int] = None):
    print(f"\n[DEBUG completar_pisos] Recibidos {len(movimientos_sin_piso)} movimientos para buscar en histórico.")
    if movimientos_sin_piso:
        print(f"[DEBUG completar_pisos] Primer movimiento sin piso: {movimientos_sin_piso[0].get('concepto_original', '')} / {movimientos_sin_piso[0].get('ordenante', '')}")
    
    # Nota: Si buscar_pisos_en_historico requiere extractos_map, asegúrate de actualizar su firma también
    recuperados = buscar_pisos_en_historico(excel_registros, movimientos_sin_piso, extractos_map, community_id)
    print(f"[DEBUG completar_pisos] Histórico devolvió {len(recuperados)} movimientos.")
    if any(m.get('piso') for m in recuperados):
        print(f"[DEBUG completar_pisos] Movimientos con piso asignado: {[m.get('piso') for m in recuperados if m.get('piso')]}")

    for m in recuperados:
        if m.get("piso"):
            # The 'es_historico' and 'detalle_historico' should already be set by buscar_pisos_en_registro
            # We just need to update the 'CONCEPTO' for display in the UI
            m["CONCEPTO"] = formatear_piso(m["piso"])
    return recuperados

def procesar_extracto_y_registros(
    extracto: UploadFile, 
    registros: Optional[UploadFile], 
    clasificador, 
    db_historico: Optional[pd.DataFrame] = None, 
    extractos_map: Optional[Dict] = None,
    community_id: Optional[int] = None
) -> Dict:
    df_extracto = cargar_extracto_a_df(extracto)

    # Manejo de registros opcionales (archivo o base de datos)
    if db_historico is not None:
        excel_registros = {"DB": db_historico}
    elif registros:
        excel_registros = cargar_registros_a_excel(registros)
    else:
        excel_registros = {}

    # Si no se pasó explícitamente, intentamos extraerlo del histórico como último recurso
    if community_id is None:
        if db_historico is not None and not db_historico.empty:
            if 'community_id' in db_historico.columns:
                community_id = int(db_historico['community_id'].iloc[0])

    columnas = detectar_columnas(df_extracto)

    es_csv = extracto.filename.lower().endswith(".csv")

    movimientos_con_piso, movimientos_sin_piso = construir_movimientos( # type: ignore
        df_extracto, columnas, clasificador, es_csv, community_id
    )
    
    recuperados = completar_pisos(movimientos_sin_piso, excel_registros, es_csv, extractos_map, community_id)
    
    movimientos_finales = movimientos_con_piso + recuperados
    movimientos_finales = sorted(movimientos_finales, key=lambda m: m["id"])

    # Si es CSV, nos aseguramos de que no existan las claves de ORDENANTE para evitar ruidos en la UI
    if es_csv:
        columnas_visibles_csv = ["FECHA", "OBSERVACIONES", "IMPORTE", "SALDO", "CONCEPTO"]
        for i, m in enumerate(movimientos_finales):
            # Eliminamos claves de ordenante si existen
            m.pop("ORDENANTE", None)
            m.pop("ordenante", None)
            # Reordenamos el diccionario para que las claves principales aparezcan primero (opcional, ayuda a depurar)
            ordenado = {k: m[k] for k in ["id"] + columnas_visibles_csv if k in m}
            # Añadimos el resto de campos técnicos al final
            ordenado.update({k: v for k, v in m.items() if k not in ordenado})
            movimientos_finales[i] = ordenado

    for m in movimientos_finales:
        piso_id = str(m.get("piso", "")).strip()
        
        # Si se identificó un piso (por ML o histórico) y CONCEPTO aún es un valor por defecto, asignarlo.
        if piso_id:
            if m.get("CONCEPTO") in ["Sin asignar", "piso sin identificar", "piso desconocido", "Piso desconocido", "PISODESCONOCIDO", "", None]: # La lógica de formatear_piso(m.get("piso_ml_original", "")) no es necesaria aquí.
                m["CONCEPTO"] = formatear_piso(piso_id)
        # Si no se identificó piso y CONCEPTO es un valor por defecto, establecer "piso sin identificar".
        elif m.get("CONCEPTO") in ["Sin asignar", "piso sin identificar", "piso desconocido", "PISODESCONOCIDO", "", None]:
            m["CONCEPTO"] = "piso sin identificar"
        
    total_ingresos = sum(m["importe"] for m in movimientos_finales if m["importe"] > 0)
    total_gastos = sum(abs(m["importe"]) for m in movimientos_finales if m["importe"] < 0)
    
    return {
        "nombre_archivo": extracto.filename,
        "movimientos_clasificados": movimientos_finales,
        "resumen_categorias": calcular_resumen_categorias_con_tipo(movimientos_finales),
        "total_ingresos": round(total_ingresos, 2),
        "total_gastos": round(total_gastos, 2),
        "saldo_neto": round(total_ingresos - total_gastos, 2),
    }