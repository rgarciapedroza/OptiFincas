import pandas as pd
import os
import logging
from typing import Dict, List, Optional, Union
from collections import defaultdict

from app.ml.clasificador_ml import crear_clasificador
from app.procesamiento.buscar_pisos import buscar_pisos_en_registro, normalizar_texto
from app.servicios.procesar_movimientos import formatear_piso
from app.servicios.procesar_extracto import limpiar_importe, buscar_piso_regex_en_fila
from app.servicios.supabase_db import supabase_service_role_client, supabase_client
from app.controllers.security import desencriptar_dato


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _build_concepto_completo_sim(c_base_raw: str, c_ben_raw: str) -> str:
    c_base = str(c_base_raw or "").strip()
    c_ben = str(c_ben_raw or "").strip()
    partes = []
    if c_base:
        partes.append(c_base)
    if c_ben and c_ben.upper() not in c_base.upper():
        partes.append(c_ben)
    return " ".join(partes).strip()


def ejecutar_test_accuracy(community_id: Optional[int] = None) -> Dict:

    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    excel_path = os.path.join(base_dir, "data", "tests", "test_dataset.xlsx")

    if not os.path.exists(excel_path):
        return {"error": f"Dataset de prueba no encontrado en {excel_path}"}
    try:
        df_test = pd.read_excel(excel_path, sheet_name='test_cases').fillna("")
    except Exception as e:
        return {"error": f"Error al leer 'test_cases': {e}"}

    try:
        df_hist = pd.read_excel(excel_path, sheet_name='historico_values').fillna("")
    except:
        df_hist = pd.DataFrame()

    clasificador = crear_clasificador()

    def limpiar_piso_ml(piso_ml):
        if piso_ml and str(piso_ml).strip().lower() in [
            "none", "nan", "", "piso sin identificar", "piso desconocido", "sin asignar"
        ]:
            return None
        return piso_ml

    stats = {
        "excel": {"ok": 0, "total": 0, "automatizados": 0},
        "csv": {"ok": 0, "total": 0, "automatizados": 0},
        "errores_piso": {"ingreso": 0, "gasto": 0}
    }

    total = len(df_test)

    ambiguos = 0

    detalle_errores = []

    def normalizar_valor_esperado(val):
        s = str(val).strip().upper()
        if s in ["NONE", "NAN", "", "NULL",
                  "PISO SIN IDENTIFICAR",
                  "SIN ASIGNAR",
                  "PISO DESCONOCIDO",
                  "PISODESCONOCIDO"]:
            return ""
        return s

    def canon_piso(val):
        s = str(val or "").strip().upper()
        if s in ["", "NAN", "NONE", "NULL", "SIN ASIGNAR"]:
            return ""
        s = s.replace(" ", "").replace("º", "").replace("ª", "")
        s = s.replace("IZQUIERDA", "IZQ").replace("DERECHA", "DRCHA")
        s = s.replace("EXTERIOR", "EXT").replace("INTERIOR", "INT")
        s = s.replace("-", "").replace("/", "")
        return s

    for idx, row in df_test.iterrows():
        obs = str(row['observaciones'])
        ord_val = str(row['ordenante'])
        imp = limpiar_importe(row.get('importe', 0))
        try:
            cid = int(row['comunidad']) if str(row.get('comunidad', '')).strip() != "" else community_id
        except (ValueError, TypeError):
            cid = community_id

        tipo_esp = str(row.get('tipo_esperado', '')).strip().lower()
        piso_esp_excel = normalizar_valor_esperado(row['resultado_esperado_excel'])
        piso_esp_csv = normalizar_valor_esperado(row['resultado_esperado_csv'])

        # --- Pipeline EXCEL ---
        concepto_excel = _build_concepto_completo_sim(obs, ord_val)
        res_ml_excel = clasificador.clasificar(concepto_excel, imp, cid)
        
        piso_regex_excel = buscar_piso_regex_en_fila(
            pd.Series({"obs": obs, "ord": ord_val, "imp": imp}),
            {"observaciones": "obs", "ordenante": "ord", "importe": "imp"},
            cid
        )
        piso_ml_ex = limpiar_piso_ml(res_ml_excel["piso"])
        
        if imp < 0:
            piso_final_excel = res_ml_excel["categoria"]
        else:
            piso_final_excel = piso_regex_excel if piso_regex_excel else (
                piso_ml_ex if (piso_ml_ex and len(str(piso_ml_ex)) <= 5) else None
            )

        if not piso_final_excel and not df_hist.empty and imp > 0:
            df_hist_ex = df_hist.copy()
            if "resultado_esperado_excel" in df_hist_ex.columns:
                df_hist_ex = df_hist_ex.rename(columns={"resultado_esperado_excel": "PISO"})
            
            mov_sim = {
                "concepto_original": obs,
                "ordenante": ord_val,
                "importe": imp,
                "es_csv": False
            }
            res_hist = buscar_pisos_en_registro(df_hist_ex, [mov_sim], community_id=cid)
            if res_hist and res_hist[0].get("piso"):
                piso_final_excel = res_hist[0]["piso"]
                res_ml_excel["metodo"] = res_hist[0]["metodo_piso"]
        
        # --- Pipeline CSV (Solo observaciones) ---
        res_ml_csv = clasificador.clasificar(obs, imp, cid)
        
        piso_regex_csv = buscar_piso_regex_en_fila(
            pd.Series({"obs": obs, "imp": imp}),
            {"observaciones": "obs", "importe": "imp"},
            cid
        )
        
        piso_ml_csv = limpiar_piso_ml(res_ml_csv["piso"])

        if imp < 0:
            piso_final_csv = res_ml_csv["categoria"]
        else:
            piso_final_csv = piso_regex_csv if piso_regex_csv else (
                piso_ml_csv if (piso_ml_csv and len(str(piso_ml_csv)) <= 5) else None
            )

        # --- FALLBACK HISTÓRICO CSV ---
        if not piso_final_csv and not df_hist.empty and imp > 0:
            # Renombramos temporalmente para que el motor encuentre el piso
            df_hist_csv = df_hist.copy()
            if "resultado_esperado_csv" in df_hist_csv.columns:
                df_hist_csv = df_hist_csv.rename(columns={"resultado_esperado_csv": "PISO"})

            mov_sim_csv = {
                "concepto_original": obs,
                "ordenante": "",
                "importe": imp,
                "es_csv": True
            }
            res_hist_csv = buscar_pisos_en_registro(df_hist_csv, [mov_sim_csv], community_id=cid)
            if res_hist_csv and res_hist_csv[0].get("piso"):
                piso_final_csv = res_hist_csv[0]["piso"]

        stats["excel"]["total"] += 1
        hit_excel = canon_piso(piso_final_excel) == canon_piso(piso_esp_excel)
        if hit_excel:
            stats["excel"]["ok"] += 1
        if piso_final_excel:
            stats["excel"]["automatizados"] += 1

        stats["csv"]["total"] += 1
        hit_csv = canon_piso(piso_final_csv) == canon_piso(piso_esp_csv)
        if hit_csv:
            stats["csv"]["ok"] += 1
        if piso_final_csv:
            stats["csv"]["automatizados"] += 1

        if res_ml_excel["confianza"] < 0.6 or not piso_final_excel:
            ambiguos += 1

        if not hit_excel or not hit_csv:
            detalle_errores.append({
                "id": idx,
                "obs": obs,
                "ord": ord_val,
                "importe": imp,
                "excel": {
                    "predicho": piso_final_excel,
                    "esperado": piso_esp_excel,
                    "exito": hit_excel
                },
                "csv": {
                    "predicho": piso_final_csv,
                    "esperado": piso_esp_csv,
                    "exito": hit_csv
                }
            })

    reporte = {
        "metadata": {
            "total_muestras": total,
            "modo": "TFG evaluation pipeline"
        },
        "metricas_excel": {
            "precision_piso": stats["excel"]["ok"] / max(1, stats["excel"]["total"]),
            "tasa_automatizacion": stats["excel"]["automatizados"] / max(1, stats["excel"]["total"])
        },
        "metricas_csv": {
            "precision_piso": stats["csv"]["ok"] / max(1, stats["csv"]["total"]),
            "tasa_automatizacion": stats["csv"]["automatizados"] / max(1, stats["csv"]["total"])
        },
        "casos_ambiguos": ambiguos,
        "detalle_errores": detalle_errores
    }

    return reporte