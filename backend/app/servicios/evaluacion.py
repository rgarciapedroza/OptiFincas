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

    clasificador = crear_clasificador()

    matriz_confusion = defaultdict(lambda: defaultdict(int))

    stats = {
        "categoria": {"ok": 0, "total": 0},
        "tipo": {"ok": 0, "total": 0},
        "piso": {"ok": 0, "total": 0},
        "errores_piso": {"ingreso": 0, "gasto": 0}
    }

    total = len(df_test)

    batch_excel = []
    batch_csv = []

    automatizados = 0
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

    # =========================
    # PREDICCIÓN
    # =========================
    for idx, row in df_test.iterrows():

        obs = str(row['observaciones'])
        ord_val = str(row['ordenante'])
        imp = limpiar_importe(row.get('importe', 0))

        cat_esp = normalizar_valor_esperado(row['categoria_esperada'])
        piso_esp = normalizar_valor_esperado(row['concepto_esperado_excel'])

        res_ml_excel = clasificador.clasificar(
            _build_concepto_completo_sim(obs, ord_val),
            imp
        )

        piso_regex_excel = buscar_piso_regex_en_fila(
            pd.Series({"obs": obs, "ord": ord_val, "imp": imp}),
            {"observaciones": "obs", "ordenante": "ord", "importe": "imp"}
        )

        piso_final_excel = piso_regex_excel or res_ml_excel["piso"]

        batch_excel.append({
            "id": idx,
            "obs": obs,
            "ord": ord_val,
            "importe": imp,
            "categoria_pred": res_ml_excel["categoria"],
            "tipo_pred": res_ml_excel["tipo"],
            "piso_pred": piso_final_excel,
            "piso_esperado": piso_esp,
            "cat_esperada": cat_esp,
            "confianza": res_ml_excel["confianza"]
        })

    # =========================
    # EVALUACIÓN
    # =========================
    for m in batch_excel:

        # --- categoría ---
        stats["categoria"]["total"] += 1
        if m["categoria_pred"] == m["cat_esperada"]:
            stats["categoria"]["ok"] += 1

        # --- tipo ---
        stats["tipo"]["total"] += 1
        if m["tipo_pred"] in ["INGRESO", "GASTO"]:
            stats["tipo"]["ok"] += 1

        # --- piso ---
        stats["piso"]["total"] += 1

        hit_piso = canon_piso(m["piso_pred"]) == canon_piso(m["piso_esperado"])
        if hit_piso:
            stats["piso"]["ok"] += 1

        # --- matriz de confusión ---
        matriz_confusion[m["cat_esperada"]][m["categoria_pred"]] += 1

        # --- automatización real (pipeline) ---
        if m["piso_pred"] is not None:
            automatizados += 1

        # --- ambiguos (baja confianza o sin predicción) ---
        if m["confianza"] < 0.6 or not m["piso_pred"]:
            ambiguos += 1

        # --- errores ---
        if not hit_piso or m["categoria_pred"] != m["cat_esperada"]:
            detalle_errores.append(m)

    # =========================
    # SERIALIZAR MATRIZ
    # =========================
    matriz_confusion = {
        k: dict(v) for k, v in matriz_confusion.items()
    }

    # =========================
    # REPORTE FINAL
    # =========================
    reporte = {
        "metadata": {
            "total_muestras": total,
            "modo": "TFG evaluation pipeline"
        },

        "metricas_categoria": {
            "accuracy": stats["categoria"]["ok"] / max(1, stats["categoria"]["total"])
        },

        "metricas_tipo": {
            "accuracy": stats["tipo"]["ok"] / max(1, stats["tipo"]["total"])
        },

        "metricas_piso": {
            "accuracy": stats["piso"]["ok"] / max(1, stats["piso"]["total"])
        },

        "tasa_automatizacion": automatizados / max(1, total),

        "casos_ambiguos": ambiguos,

        "matriz_confusion": matriz_confusion,

        "detalle_errores": detalle_errores
    }

    return reporte