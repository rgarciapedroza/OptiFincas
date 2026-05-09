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

    for idx, row in df_extracto.iterrows():
        c_base = str(row.get(columnas["concepto"], "")).strip()
        c_obs = str(row.get(columnas["observaciones"], "")).strip()
        
        c_ben = str(row.get(col_ordenante, "")).strip() if col_ordenante else ""

        concepto_completo = f"{c_base} {c_ben} {c_obs}".strip()
        importe = limpiar_importe(row.get(columnas["importe"], 0))
        
        if importe == 0: continue

        resultado_ml = clasificador.clasificar(concepto_completo, importe)
        
        mov = {
            "id": idx,
            "fecha_contable": normalizar_fecha(row.get(columnas["fecha"])),
            "observaciones": concepto_completo,
            "importe": round(importe, 2),
            "concepto_original": concepto_completo,
            "concepto": "Piso desconocido",
            "piso": resultado_ml["piso"] or "",
            "tipo": resultado_ml["tipo"],
            "categoria": resultado_ml["categoria"],
            "confianza": resultado_ml["confianza"],
            "texto_busqueda_nombres": c_ben if (not es_csv and c_ben) else concepto_completo
        }

        if importe < 0:
            mov["concepto"] = resultado_ml["categoria"]
            movimientos_con_piso.append(mov)
        elif mov["piso"]:
            mov["concepto"] = mov["piso"]
            movimientos_con_piso.append(mov)
        else:
            movimientos_sin_piso.append(mov)

    return movimientos_con_piso, movimientos_sin_piso

def completar_pisos(movimientos_sin_piso, excel_registros, es_csv: bool):

    recuperados = buscar_pisos_en_historico(excel_registros, movimientos_sin_piso)
    
    if not es_csv:
        recuperados = aplicar_busqueda_por_ordenante(excel_registros, recuperados)
        
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

    for m in movimientos_finales:
        if m["importe"] > 0:
            if m.get("piso") and str(m["piso"]).strip():
                m["concepto"] = m["piso"]
            else:
                m["concepto"] = "Piso desconocido"

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