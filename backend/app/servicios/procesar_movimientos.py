from typing import Dict, List
import pandas as pd
from fastapi import UploadFile
from backend.app.servicios.procesar_extracto import (
    cargar_extracto_a_df,
    cargar_registros_a_excel,
    detectar_columnas,
    limpiar_importe,
    normalizar_fecha,
    buscar_piso_regex_en_fila,
)
from backend.app.procesamiento.buscar_pisos import buscar_pisos_en_historico
from backend.app.servicios.buscar_piso_ordenante import aplicar_busqueda_por_ordenante
from backend.app.servicios.resumen import calcular_resumen_categorias

def buscar_columna_ordenante(df):
    posibles_nombres = ["BENEFICIARIO/ORDENANTE", "ORDENANTE", "BENEFICIARIO", "NOMBRE"]
    for col in df.columns:
        col_clean = str(col).strip().upper()
        if any(p in col_clean for p in posibles_nombres):
            return col
    return None

def construir_movimientos(df_extracto, columnas, clasificador, es_csv):
    movimientos_con_piso = []
    movimientos_sin_piso = []
    
    col_ordenante = buscar_columna_ordenante(df_extracto)

    # Si es CSV, buscamos la columna que contenga "FECHA PROCESO" explícitamente
    col_fecha_proceso_csv = None
    if es_csv:
        for col in df_extracto.columns:
            col_up = str(col).upper()
            if any(x in col_up for x in ["PROCESO", "OPER", "VALOR"]):
                col_fecha_proceso_csv = col
                break

    def clean_str(val):
        if pd.isna(val) or val is None:
            return ""
        s = str(val).strip()
        return "" if s.lower() == "nan" else s

    for idx, row in df_extracto.iterrows():
        # Intentamos obtener la fecha. normalizar_fecha devuelve None si encuentra guiones ("-") o nulos.
        fecha_final = normalizar_fecha(row.get(columnas["fecha"]))
        
        # Lógica de fallback: Si la fecha principal no es válida y detectamos "FECHA PROCESO" (común en BBVA), la usamos.
        if not fecha_final and es_csv and col_fecha_proceso_csv:
            fecha_final = normalizar_fecha(row.get(col_fecha_proceso_csv))

        c_base = clean_str(row.get(columnas["concepto"]))
        c_obs = clean_str(row.get(columnas["observaciones"]))
        c_ben = clean_str(row.get(col_ordenante)) if col_ordenante else ""

        concepto_completo = f"{c_base} {c_ben} {c_obs}".strip()
        importe = limpiar_importe(row.get(columnas["importe"], 0))
        # Corregimos la obtención del saldo usando la columna detectada
        saldo_val = limpiar_importe(row.get(columnas["saldo"], 0)) if columnas.get("saldo") else 0
        
        if importe == 0: continue

        resultado_ml = clasificador.clasificar(concepto_completo, importe)
        
        mov = {
            "id": idx,
            # Cabeceras en MAYÚSCULAS para la UI y Excel
            "FECHA": fecha_final or "",
            "CONCEPTO": resultado_ml["piso"] or "Sin asignar",
            "OBSERVACIONES": c_obs,
            "SALDO": saldo_val,
            "IMPORTE": round(importe, 2),

            # Campos técnicos internos (mantener en minúsculas para compatibilidad)
            "fecha": fecha_final,
            "concepto": concepto_completo,
            "importe": round(importe, 2),
            "saldo": saldo_val,
            "ordenante": c_ben if (col_ordenante and not es_csv) else "", # En UI mostrar solo si no es CSV

            "piso": resultado_ml["piso"] or "",
            "tipo": resultado_ml["tipo"],
            "categoria": resultado_ml["categoria"],
            "concepto_original": concepto_completo,
            "confianza": resultado_ml["confianza"],
            "metodo_piso": resultado_ml.get("metodo", ""),
            "texto_busqueda_nombres": c_ben if (not es_csv and c_ben) else concepto_completo,
        }

        # Para la visualización en la UI, incluimos ORDENANTE solo si es Excel
        if not es_csv and col_ordenante:
            mov["ORDENANTE"] = c_ben



        if importe < 0:
            mov["CONCEPTO"] = resultado_ml["categoria"]
            movimientos_con_piso.append(mov)
        elif mov["piso"]:
            mov["CONCEPTO"] = mov["piso"]
            movimientos_con_piso.append(mov)
        else:
            movimientos_sin_piso.append(mov)

    return movimientos_con_piso, movimientos_sin_piso

def completar_pisos(movimientos_sin_piso, excel_registros, es_csv: bool):

    recuperados = buscar_pisos_en_historico(excel_registros, movimientos_sin_piso)
    
    if not es_csv:
        recuperados = aplicar_busqueda_por_ordenante(excel_registros, recuperados)
        
    # Marcamos los movimientos recuperados del histórico para la UI
    for m in recuperados:
        m["es_historico"] = True
        
        # Guardamos el motivo de la asignación para el modal
        if es_csv:
            m["detalle_historico"] = {
                "piso_encontrado": m.get("piso", "N/A"),
                "observacion_historica": m.get("observacion_historica", "N/A"),
                "concepto_original": m.get("concepto_original", "N/A"),
                "motivo": "Coincidencia encontrada en registros históricos."
            }
        else:
            m["detalle_historico"] = {
                "piso_asignado": m.get("piso", "N/A"),
                "ordenante_actual": m.get("ORDENANTE") or m.get("ordenante") or "N/A",
                "ordenante_identificado": m.get("ordenante_historico") or "N/A",
                "motivo": "Coincidencia encontrada por nombre del ordenante en el histórico."
            }

        # Asegurar que el piso recuperado se asigne a la columna visible CONCEPTO
        if m.get("piso"):
            m["CONCEPTO"] = m["piso"]
        
    return recuperados

def procesar_extracto_y_registros(extracto: UploadFile, registros: UploadFile, clasificador) -> Dict:
    df_extracto = cargar_extracto_a_df(extracto)
    excel_registros = cargar_registros_a_excel(registros)
    columnas = detectar_columnas(df_extracto)
    
    es_csv = extracto.filename.lower().endswith(".csv")
    
    movimientos_con_piso, movimientos_sin_piso = construir_movimientos(
        df_extracto, columnas, clasificador, es_csv
    )

    recuperados = completar_pisos(movimientos_sin_piso, excel_registros, es_csv)
    
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
            if m.get("CONCEPTO") in ["Sin asignar", "Piso desconocido", "", None]:
                m["CONCEPTO"] = piso_id
        # Si no se identificó piso y CONCEPTO es un valor por defecto, establecer "Piso desconocido".
        elif m.get("CONCEPTO") in ["Sin asignar", "", None]:
            m["CONCEPTO"] = "Piso desconocido"
        
    total_ingresos = sum(m["importe"] for m in movimientos_finales if m["importe"] > 0)
    total_gastos = sum(abs(m["importe"]) for m in movimientos_finales if m["importe"] < 0)
    
    return {
        "nombre_archivo": extracto.filename,
        "movimientos_clasificados": movimientos_finales,
        "resumen_categorias": calcular_resumen_categorias(movimientos_finales),
        "total_ingresos": round(total_ingresos, 2),
        "total_gastos": round(total_gastos, 2),
        "saldo_neto": round(total_ingresos - total_gastos, 2),
    }