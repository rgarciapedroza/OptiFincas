import pandas as pd
import os
import logging
from typing import Dict, List, Optional, Union
from app.ml.clasificador_ml import crear_clasificador
from app.procesamiento.buscar_pisos import buscar_pisos_en_registro, normalizar_texto
from app.servicios.procesar_movimientos import formatear_piso # Importar formatear_piso desde el módulo correcto
from app.servicios.procesar_extracto import limpiar_importe, buscar_piso_regex_en_fila, detectar_columnas
from app.servicios.supabase_db import supabase_service_role_client, supabase_client
from app.controllers.security import desencriptar_dato

logger = logging.getLogger(__name__)

def _build_concepto_completo_sim(c_base_raw: str, c_ben_raw: str) -> str:
    """
    Simula la construcción de concepto_completo como en procesar_movimientos.py
    """
    c_base = str(c_base_raw or "").strip()
    c_ben = str(c_ben_raw or "").strip()
    partes = []
    if c_base: partes.append(c_base)
    if c_ben and c_ben.upper() not in c_base.upper():
        partes.append(c_ben)
    return " ".join(partes).strip()

def ejecutar_test_accuracy(community_id: Optional[int] = None) -> Dict:
    """
    Protocolo de evaluación reproducible para el TFG.
    Compara las predicciones del sistema contra un dataset etiquetado manualmente.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    excel_path = os.path.join(base_dir, "data", "tests", "test_dataset.xlsx")
    
    if not os.path.exists(excel_path):
        return {"error": f"Dataset de prueba no encontrado en {excel_path}"}

    try:
        # 1. Cargar datos de prueba
        df_test = pd.read_excel(excel_path, sheet_name='test_cases').fillna("")
        logger.info(f"Cargados {len(df_test)} casos de prueba.")
    except Exception as e:
        return {"error": f"Error al leer 'test_cases': {e}"}

    clasificador = crear_clasificador()
    
    def normalizar_valor_esperado(val):
        """Helper para convertir 'None', 'NaN' o celdas vacías en ''."""
        s = str(val).strip().upper()
        if s in ["NONE", "NAN", "", "NULL", "PISO SIN IDENTIFICAR", "SIN ASIGNAR", "PISO DESCONOCIDO", "PISODESCONOCIDO", "DESCONOCIDO"]:
            return ""
        return s

    def canon_piso(val):
        """Canonicalización extra para comparar equivalencias típicas (2J/2 J, 2º/2, etc)"""
        s = str(val or "").strip().upper()
        # Tratamos valores de "no identificado" como vacíos para la comparación
        if s in ["PISO SIN IDENTIFICAR", "SIN ASIGNAR", "PISO DESCONOCIDO", "PISODESCONOCIDO", "NAN", "NONE", "NULL", "", "SINASIGNAR", "DESCONOCIDO"]:
            return ""
        
        s = s.replace(" ", "")
        s = s.replace("º", "").replace("ª", "")
        # Normalizar descriptores comunes para que coincidan (IZQUIERDA == IZQ)
        s = s.replace("IZQUIERDA", "IZQ").replace("DERECHA", "DRCHA").replace("DCHA", "DRCHA")
        s = s.replace("EXTERIOR", "EXT").replace("INTERIOR", "INT")
        s = s.replace("PLANTA", "P").replace("PISO", "P")
        # Canonicalizar separadores comunes
        s = s.replace("-", "").replace("/", "")
        return s

    # --- OBTENCIÓN DEL HISTÓRICO ---
    df_historico_full: pd.DataFrame = pd.DataFrame() # Inicializar como DataFrame vacío
    if community_id:
        # MODO PRODUCCIÓN: Usar datos reales de la DB de Supabase
        client = supabase_service_role_client if supabase_service_role_client else supabase_client
        response = client.table("movimientos").select("concepto_original,piso_detectado,ordenante,importe")\
            .eq("community_id", community_id).execute()
        
        if response.data:
            movs_desencriptados = []
            for m in response.data:
                # Importante: Estructuramos el DF exactamente como lo espera buscar_pisos_en_registro
                movs_desencriptados.append({
                    "piso": m.get("piso_detectado"),
                    "concepto": desencriptar_dato(m.get("concepto_original")),
                    "ordenante": desencriptar_dato(m.get("ordenante")),
                    "tipo": "ingreso" if limpiar_importe(m.get("importe", 0)) > 0 else "gasto"
                })
            df_historico_full = pd.DataFrame(movs_desencriptados) # Cargar todos los movimientos de la comunidad
            logger.info(f"Evaluación usando {len(df_historico_full)} registros reales de la comunidad {community_id}")
        else:
            return {"error": f"La comunidad {community_id} no tiene movimientos históricos para evaluar."}
    else:
        # MODO BENCHMARK TFG: Usar la hoja 'historico_values'
        try:
            df_hist_raw = pd.read_excel(excel_path, sheet_name='historico_values').fillna("")
            hist_data = []
            for _, row in df_hist_raw.iterrows():
                # Corregimos el mapeo de columnas según tu documento real
                hist_data.append({
                    "comunidad_nombre": str(row.get('comunidad')).strip().upper(),
                    "piso": normalizar_valor_esperado(row.get('concepto_esperado_excel')),
                    "concepto": str(row.get('observaciones')).upper(),
                    "ordenante": str(row.get('ordenante')).upper(),
                    "tipo": "ingreso" if limpiar_importe(row.get('importe', 0)) > 0 else "gasto"
                })
            df_historico_full = pd.DataFrame(hist_data) # Cargar todos los movimientos del histórico simulado
            logger.info(f"Base de conocimiento cargada con {len(df_historico_full)} registros.")
        except Exception as e:
            return {"error": f"Error leyendo 'historico_values': {e}"}

    stats = {
        "excel": {"piso_ok": 0, "cat_ok": 0, "total": 0},
        "csv": {"piso_ok": 0, "cat_ok": 0, "total": 0},
        "errores_piso": {
            "ingreso": 0,
            "gasto": 0
        }
    }
    
    detalle_errores = []
    total_vecinos_test = 0
    total = len(df_test) # Renombrado a 'total' para consistencia

    # --- FASE 1: PROCESAMIENTO ML Y REGEX (Individual) ---
    batch_excel = []
    batch_csv = []

    for idx, row in df_test.iterrows():
        obs = str(row['observaciones'])
        ord_val = str(row['ordenante'])
        imp = limpiar_importe(row.get('importe', 0))
        comm_nombre = str(row['comunidad']).strip().upper()
        cat_esp = normalizar_valor_esperado(row['categoria_esperada'])

        # --- SIMULACIÓN EXCEL ---
        sim_cols_excel = {"observaciones": "obs", "ordenante": "ord", "importe": "imp", "concepto": "obs"}
        sim_row_excel = pd.Series({"obs": obs, "ord": ord_val, "imp": imp})
        res_ml_excel = clasificador.clasificar(_build_concepto_completo_sim(obs, ord_val), imp)
        piso_regex_excel = buscar_piso_regex_en_fila(sim_row_excel, sim_cols_excel)
        piso_ml_excel = res_ml_excel["piso"] if (res_ml_excel["piso"] and len(str(res_ml_excel["piso"])) <= 5) else None
        piso_final_excel = piso_regex_excel or piso_ml_excel

        batch_excel.append({
            "id": idx, "concepto_original": obs, "ORDENANTE": ord_val, 
            "importe": imp, "tipo": res_ml_excel["tipo"], "categoria": res_ml_excel["categoria"],
            "piso": piso_final_excel, "comunidad": comm_nombre, "cat_esp": cat_esp,
            "esp_piso": normalizar_valor_esperado(row['concepto_esperado_excel']), "es_csv": False
        })

        # --- SIMULACIÓN CSV ---
        res_ml_csv = clasificador.clasificar(_build_concepto_completo_sim(obs, ""), imp)
        piso_regex_csv = buscar_piso_regex_en_fila(sim_row_excel, {"observaciones": "obs", "importe": "imp"})
        piso_ml_csv = res_ml_csv["piso"] if (res_ml_csv["piso"] and len(str(res_ml_csv["piso"])) <= 5) else None
        piso_final_csv = piso_regex_csv or piso_ml_csv

        batch_csv.append({
            "id": idx, "concepto_original": obs, "ORDENANTE": "", 
            "importe": imp, "tipo": res_ml_csv["tipo"], "categoria": res_ml_csv["categoria"],
            "piso": piso_final_csv, "comunidad": comm_nombre, "cat_esp": cat_esp,
            "esp_piso": normalizar_valor_esperado(row['concepto_esperado_csv']), "es_csv": True
        })

    # BÚSQUEDA HISTÓRICA POR LOTES ---
    for scenario in ["excel", "csv"]:
        data_list = batch_excel if scenario == "excel" else batch_csv
        comunidades = set(m["comunidad"] for m in data_list)
        
        for comm in comunidades:
            movs_comm = [m for m in data_list if m["comunidad"] == comm]
            df_hist_local = df_historico_full if community_id else df_historico_full[df_historico_full['comunidad_nombre'] == comm]
            
            # Identificar los que necesitan histórico
            sin_piso = [m for m in movs_comm if not m["piso"]] # Enviar TODO al histórico si no hay piso
            if sin_piso:
                recuperados = buscar_pisos_en_registro(df_hist_local, sin_piso)
                for r in recuperados:
                    # Actualizar en la lista original
                    for original in movs_comm:
                        if original["id"] == r["id"]:
                            original["piso"] = r["piso"]

    #  CONSOLIDACIÓN DE MÉTRICAS
    for i in range(total):
        m_ex = batch_excel[i]
        m_cv = batch_csv[i]
        imp = m_ex["importe"]
        
        # Predicciones finales formateadas (Usar formatear_piso para asegurar sufijos º/ª)
        pred_ex = m_ex["categoria"] if imp < 0 else formatear_piso(m_ex["piso"])
        pred_cv = m_cv["categoria"] if imp < 0 else formatear_piso(m_cv["piso"])
        
        # --- EVALUACIÓN DE CATEGORÍA (ML) ---
        tipo_ex_up = str(m_ex["tipo"]).upper()
        tipo_cv_up = str(m_cv["tipo"]).upper()
        
        if tipo_ex_up == m_ex["cat_esp"]: stats["excel"]["cat_ok"] += 1
        if tipo_cv_up == m_cv["cat_esp"]: stats["csv"]["cat_ok"] += 1
        
        # --- EVALUACIÓN DE IDENTIDAD (PISO) ---
        hit_ex = canon_piso(pred_ex) == canon_piso(m_ex["esp_piso"])
        hit_cv = (canon_piso(pred_cv) == canon_piso(m_cv["esp_piso"])) or \
                 (m_cv["esp_piso"] == "" and canon_piso(pred_cv) == canon_piso(m_ex["esp_piso"]) and pred_cv != "")

        if hit_ex: stats["excel"]["piso_ok"] += 1
        if hit_cv: stats["csv"]["piso_ok"] += 1
        
        # --- DIAGNÓSTICO ---
        # Filtramos ruidos: Ignoramos gastos y plazas de garaje masivas del ayuntamiento
        piso_esp_up = str(m_ex["esp_piso"]).upper()
        es_vecino = imp >= 0 and "GARAJE" not in piso_esp_up and "PLAZA" not in piso_esp_up and piso_esp_up != ""
        if es_vecino: total_vecinos_test += 1
        
        if not hit_ex:
            if es_vecino:
                stats["errores_piso"]["ingreso"] += 1
            elif imp < 0:
                stats["errores_piso"]["gasto"] += 1

        # Registro de detalle: Solo fallos reales (ignorando diferencias de mayúsculas o aciertos extra del CSV)
        if not hit_ex or tipo_ex_up != m_ex["cat_esp"]:
            detalle_errores.append({
                "comunidad": m_ex["comunidad"], "observaciones": m_ex["concepto_original"], "ordenante": m_ex["ORDENANTE"],
                "excel": {
                    "esp_piso": m_ex["esp_piso"], "got_piso": pred_ex,
                    "esp_cat": m_ex["cat_esp"], "got_cat": tipo_ex_up
                },
                "csv": {
                    "esp_piso": m_cv["esp_piso"], "got_piso": pred_cv
                }
            })

        stats["excel"]["total"] += 1
        stats["csv"]["total"] += 1


    reporte = {
        "metadata": {
            "total_muestras": total,

            "modo": "Simulación (Excel test_cases vs historico_values)" if not community_id else "Real (Supabase)",
            "tamano_historico": len(df_historico_full),
            "fecha": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M")
        },
        "diagnostico_errores_piso": {
            "total_ingresos_erroneos": stats["errores_piso"]["ingreso"],
            "total_gastos_erroneos": stats["errores_piso"]["gasto"],
            "tasa_error_identidad_vecinos": f"{(stats['errores_piso']['ingreso'] / max(1, total_vecinos_test)) * 100:.2f}%"
        },
        "metricas_excel": {
            "accuracy_piso": f"{(stats['excel']['piso_ok'] / total) * 100:.2f}%",
            "accuracy_categoria": f"{(stats['excel']['cat_ok'] / total) * 100:.2f}%",
        },
        "metricas_csv": {
            "accuracy_piso": f"{(stats['csv']['piso_ok'] / total) * 100:.2f}%",
            "accuracy_categoria": f"{(stats['csv']['cat_ok'] / total) * 100:.2f}%",
        },
        "conclusiones_tecnicas": {
            "mejor_formato": "Excel" if stats["excel"]["piso_ok"] >= stats["csv"]["piso_ok"] else "CSV",
            "ventaja_columnas_separadas": f"{abs((stats['excel']['piso_ok'] - stats['csv']['piso_ok']) / total * 100):.2f}%"
        },
        "detalle_errores": detalle_errores
    }
    
    return reporte