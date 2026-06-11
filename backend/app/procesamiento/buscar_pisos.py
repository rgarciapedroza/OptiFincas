import re
import logging
import pandas as pd
import unicodedata
from difflib import SequenceMatcher
from typing import Dict, List, Optional, Union
import json # Importar el módulo json
from app.servicios.supabase_db import supabase_client, supabase_service_role_client

logger = logging.getLogger(__name__)

def find_col_by_keywords(cols_actuales: List[str], keywords: List[str], exclude_keywords: List[str] = None) -> Optional[str]:
    """
    Helper para encontrar columnas de forma flexible.
    Busca palabras clave (case-insensitive) y puede excluir otras. Prioriza coincidencias exactas.
    """
    # Primero, buscar coincidencias exactas (ignorando case y espacios)
    for kw in keywords:
        for col_actual in cols_actuales:
            if col_actual.lower().strip() == kw.lower().strip():
                return col_actual
    # Si no hay coincidencia exacta, buscar palabras clave contenidas
    for kw in keywords:
        for col_actual in cols_actuales:
            col_lower = col_actual.lower().strip()
            if kw.lower().strip() in col_lower:
                if exclude_keywords and any(ex_kw.lower().strip() in col_lower for ex_kw in exclude_keywords):
                    continue
                return col_actual
    return None

GENERICAS = {
    "PAGO", "PAGOS", "TRANSFERENCIA", "TRANSFERENCIAS", "TRASPASO", "TRASF", "TRANSFER", "TRANSF.", "TRANSF", "TRANS", "MES",
    "COMUNIDAD", "PROPIETARIOS", "PROPIETARIO", "CUOTA", "CDAD", "CP", "C P", "CDAD.", "VIVIENDA", "VIVIEND",
    "DICIEMBRE", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE",
    "MENSUALIDAD", "RECIBO", "INGRESO", "EFECTIVO", "DEPOSITO",
    "BANCO", "VARIOS", "COMUN", "PROPIEDAD", "PROP", "TITULAR", "ORDENANTE", "DATOS", "PROPIET",
    "IDENTIFICAR", "PROCESO", "CONTABLE", "OPERACION", "VALOR", "LIQUIDACION",
    "SU", "FAVOR", "ABONO", "CARGO", "RECIBO", "INMEDIATA", "CAJERO", "CURSO",
    "CALLE", "CL", "C", "AVENIDA", "AV", "PORTAL",
    "ESCALERA", "ESC", "EDIFICIO", "BLOQUE", "BLQ",
    "DE", "DEL", "LOS", "LAS", "LA", "EL", "Y",
    "BANCARIA", "TELEMATICA", "ONLINE", "NOMINA", "PENSION", "RECIBOS", "EMITIDO", "BANCARIO"
}

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

def normalizar_texto(texto: str) -> str:
    """Normaliza texto para comparaciones."""
    if not texto:
        return ""

    texto = texto.replace("º", "")
    texto = texto.replace("ª", "")

    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Za-z0-9\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip().upper()

def get_patrones_piso(community_id: Optional[int] = None) -> List[Dict]: # Retorna la lista de objetos RegexRule
    """Obtiene los patrones regex de configuración."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    try:
        query = client.table("patrones_piso_config")\
            .select("*")\
            .eq("active", True)\
            .order("priority", desc=True)

        if community_id:
            res = query.or_(f"community_id.is.null,community_id.eq.{community_id}").execute()
        else:
            res = query.is_("community_id", "null").execute()

        if res.data and len(res.data) > 0:
            return res.data

        res_config = client.table("sistema_config")\
            .select("valor")\
            .eq("clave", "patrones_piso")\
            .maybe_single().execute()

        if res_config.data and res_config.data.get("valor"):
            val = res_config.data["valor"]
            if isinstance(val, str):
                try:
                    val = json.loads(val)
                except:
                    pass
            
            if isinstance(val, list):
                return val

    except Exception as e:
        logger.warning(f"No se pudo cargar config de regex desde DB, usando fallback: {e}")
    
    return []

def extraer_piso(texto: str, community_id: Optional[int] = None) -> Optional[str]:
    if not texto:
        return None

    try:
        texto = str(texto).upper().replace(",", " ").replace(".", " ")

        reglas = get_patrones_piso(community_id)
        for rule in reglas:
            pattern = rule.get("pattern")
            if not pattern or not isinstance(pattern, str):
                continue

            pattern_norm = pattern.replace('\x08', r'\b')
            if '\\\\' in pattern_norm:
                try:
                    pattern_norm = pattern_norm.encode("utf-8").decode("unicode_escape").replace('\x08', r'\b')
                except:
                    pass

            m = re.search(pattern_norm, texto, re.IGNORECASE)
            if m:
                if rule.get("assigned_value"):
                    return str(rule["assigned_value"]).upper()

                for group in m.groups():
                    if group:
                        res = re.sub(r"[\s\-/ºª]", "", str(group))
                        return res.upper()

        return None
    except Exception:
        return None


def es_piso_identificado(piso) -> bool:
    if pd.isna(piso) or piso is None:
        return False
    p = str(piso).strip().lower()
    return p not in ["", "nan", "none", "piso sin identificar", "piso desconocido", "sin asignar", "pisodesconocido"]

def es_nombre_o_apellido(p):
    p = p.upper()
    if any(c.isdigit() for c in p):
        return False
    if p in ["S.A.", "S.L.", "S.L", "S.A", "SOCIEDAD", "LIMITADA"]:
        return True
    if len(p) <= 2:
        return False
    if p in GENERICAS:
        return False
    return True

def extraer_nombres_desde_concepto(concepto: str) -> List[str]:
    concepto = concepto.upper()
    partes = concepto.split()
    nombres = []
    for p in partes:
        if es_nombre_o_apellido(p):
            nombres.append(p)
    return nombres

def detectar_fila_cabecera(df_raw):
    claves = ["fecha", "observ", "importe", "saldo", "concept"]
    for i, row in df_raw.iterrows():
        valores = [str(x).strip().lower() for x in row.values]
        coincidencias = sum(1 for v in valores if any(k in v for k in claves))
        if coincidencias >= 3:
            return i
    return None

def obtener_pisos_validos(df_registro):
    pisos = set()
    cols_lower = {str(c).strip().lower(): c for c in df_registro.columns}
    
    col_piso_directo = cols_lower.get("piso")
    if col_piso_directo:
        for val in df_registro[col_piso_directo]:
            if es_piso_identificado(val):
                pisos.add(str(val).strip().upper())

    posibles_columnas = [c for c in df_registro.columns if any(kw in c.lower() for kw in ["observ", "concept", "orden", "titular", "nombre", "datos"])]
    for _, row in df_registro.iterrows():
        for col in posibles_columnas:
            texto = normalizar_texto(str(row.get(col, "")))
            p_found = extraer_piso(texto)
            if p_found:
                pisos.add(p_found)
    return pisos

def buscar_pisos_en_registro(df_registro, movimientos_a_procesar, extractos_map: Optional[Dict] = None, community_id: Optional[int] = None):
    cols_lower = {str(c).strip().lower(): c for c in df_registro.columns}
 
    col_piso_directo = find_col_by_keywords(df_registro.columns.tolist(), 
                                            ["piso", "concepto"], 
                                            exclude_keywords=["observ", "detalle", "original", "banco", "texto"])
    
    col_observ_hist = find_col_by_keywords(df_registro.columns.tolist(), 
                                           ["observaciones", "observ", "detalle", "texto", "concepto original"])
    
    col_ordenante_hist = find_col_by_keywords(df_registro.columns.tolist(), 
                                              ["ordenante", "titular", "propietario", "nombre", "beneficiario", "datos"])

    col_concepto_fuente = None
    if not col_observ_hist:
        col_concepto_fuente = find_col_by_keywords(df_registro.columns.tolist(), ["concepto"], exclude_keywords=["piso"])
        if col_concepto_fuente == col_piso_directo:
            col_concepto_fuente = None

    col_extracto_id = find_col_by_keywords(df_registro.columns.tolist(), ["extracto_id", "id_extracto", "extracto"])

    df_hist = df_registro.copy()
    if col_piso_directo:
        df_hist = df_hist[df_hist[col_piso_directo].apply(es_piso_identificado)]
    
    owner_to_pisos = {}
    if not df_hist.empty:
        h_ord_col = col_ordenante_hist if col_ordenante_hist else col_concepto_fuente
        for _, row in df_hist.iterrows():
            p_hist = str(row.get(col_piso_directo, "")).strip().upper()
            o_hist = normalizar_texto(str(row.get(h_ord_col, "")))
            if o_hist and es_piso_identificado(p_hist):
                if o_hist not in owner_to_pisos:
                    owner_to_pisos[o_hist] = {}
                owner_to_pisos[o_hist][p_hist] = owner_to_pisos[o_hist].get(p_hist, 0) + 1
    
    lote_assignments = {}

    recuperados = []
    
    for mov in movimientos_a_procesar:
        c_mov_raw = str(mov.get("concepto_original") or mov.get("concepto") or "").strip()
        o_mov_raw = str(mov.get("ORDENANTE") or mov.get("ordenante") or "").strip()
        es_csv = mov.get("es_csv", False)

        if not c_mov_raw and not o_mov_raw:
            mov["piso"] = ""
            mov["metodo_piso"] = ""
            mov["es_historico"] = False
            recuperados.append(mov)
            continue

        nombres_en_concepto = extraer_nombres_desde_concepto(c_mov_raw)
        nombres_en_ordenante = extraer_nombres_desde_concepto(o_mov_raw)

        if es_csv:
            palabras_nombre_mov = nombres_en_concepto
        else:
            palabras_nombre_mov = list(set(nombres_en_concepto + nombres_en_ordenante))

        c_mov = normalizar_texto(c_mov_raw)
        o_mov = normalizar_texto(o_mov_raw)
        
        texto_actual_full = f"{o_mov} {c_mov}".strip()
        texto_busqueda = texto_actual_full

        palabras = texto_busqueda.split()

        if es_csv and any(p in GENERICAS for p in palabras) and len(palabras_nombre_mov) < 2:
            mov["piso"] = ""
            mov["metodo_piso"] = ""
            mov["es_historico"] = False
            recuperados.append(mov)
            continue

        candidatos_conteo = {}

        for _, row in df_hist.iterrows():
            p_hist = str(row.get(col_piso_directo, "")).strip().upper()

            h_obs_raw = str(row.get(col_observ_hist or col_concepto_fuente, ''))
            h_ord_raw = str(row.get(col_ordenante_hist, '')) if col_ordenante_hist else ''
            
            t_hist_norm = normalizar_texto(f"{h_ord_raw} {h_obs_raw}")

            tokens_h_con = extraer_nombres_desde_concepto(h_obs_raw)
            tokens_h_ord = extraer_nombres_desde_concepto(h_ord_raw)
            tokens_h_all = list(set(tokens_h_con + tokens_h_ord))

            matches_count = 0
            if len(palabras_nombre_mov) >= 1 and tokens_h_all:
                for pm in palabras_nombre_mov:
                    if any(similar(pm, ph) >= 0.85 for ph in tokens_h_all):
                        matches_count += 1
                    elif any((pm in ph or ph in pm) and len(pm) > 3 for ph in tokens_h_all):
                        matches_count += 0.8

                denominador = min(len(palabras_nombre_mov), len(tokens_h_all))
                token_score = matches_count / denominador if denominador > 0 else 0
                
                min_ratio = 0.45 if len(palabras_nombre_mov) > 3 else 0.55
                if (matches_count >= 2 or (matches_count >= 1 and token_score >= 0.75)) and token_score >= min_ratio:
                    o_mov_clean = " ".join([p for p in o_mov.split() if p not in GENERICAS])
                    h_ord_clean = " ".join([p for p in normalizar_texto(h_ord_raw).split() if p not in GENERICAS])

                    if not es_csv and o_mov_clean and h_ord_clean:
                        sim_titular = similar(o_mov_clean, h_ord_clean)
                        if sim_titular > 0.85:
                            token_score += 0.7 
                        elif any(similar(tn, th) > 0.90 for tn in nombres_en_ordenante for th in tokens_h_ord):
                            token_score += 0.4

                    if tokens_h_all and palabras_nombre_mov and similar(palabras_nombre_mov[0], tokens_h_all[0]) > 0.90:
                        token_score += 0.3

                    if p_hist not in candidatos_conteo:
                        candidatos_conteo[p_hist] = {"count": 0, "best_score": 0.0, "row": row, "metodo": "historico_tokens"}
                    candidatos_conteo[p_hist]["count"] += 1
                    candidatos_conteo[p_hist]["best_score"] = max(candidatos_conteo[p_hist].get("best_score", 0), token_score)
                    continue

            if not es_csv:
                t_act_clean = " ".join([p for p in texto_actual_full.split() if p not in GENERICAS and len(p) > 2])
                t_hist_clean = " ".join([p for p in t_hist_norm.split() if p not in GENERICAS and len(p) > 2])
                
                if t_act_clean and t_hist_clean:
                    full_score = similar(t_act_clean, t_hist_clean)
                    if full_score >= 0.82:
                        if p_hist not in candidatos_conteo:
                            candidatos_conteo[p_hist] = {"count": 0, "best_score": 0.0, "row": row, "metodo": "historico_db_difuso"}
                        candidatos_conteo[p_hist]["count"] += 1
                        candidatos_conteo[p_hist]["best_score"] = max(candidatos_conteo[p_hist].get("best_score", 0), full_score)

        extracto_id_historico_found = None
        hist_concepto_original_best = ""
        hist_ordenante_best = ""

        mejor_piso = None
        mejor_metodo = ""

        candidatos_consistentes = [p for p, data in candidatos_conteo.items() if data["count"] >= 2]
        
        if candidatos_consistentes:
            candidatos_consistentes.sort(key=lambda p: (candidatos_conteo[p].get("best_score", 0), candidatos_conteo[p].get("count", 0)), reverse=True)
            
            owner_norm = o_mov
            pisos_del_propietario = [p for p, c in owner_to_pisos.get(owner_norm, {}).items() if c >= 2]

            if len(pisos_del_propietario) > 1:
                ya_asignados = lote_assignments.get(o_mov, [])
                pendientes = [p for p in pisos_del_propietario if p not in ya_asignados]
                
                if pendientes:
                    mejor_piso = pendientes[0]
                else:
                    mejor_piso = candidatos_consistentes[0]
                
                if o_mov not in lote_assignments: lote_assignments[o_mov] = []
                lote_assignments[o_mov].append(mejor_piso)
                mejor_metodo = candidatos_conteo.get(mejor_piso, {}).get("metodo", "multi_propiedad_db")
            else:
                mejor_piso = candidatos_consistentes[0]
                mejor_metodo = candidatos_conteo[mejor_piso]["metodo"]

            best_match = candidatos_conteo.get(mejor_piso, {})
            win_row = best_match.get("row")
            if win_row is not None:
                extracto_id_historico_found = win_row.get(col_extracto_id) if col_extracto_id else None
                hist_concepto_original_best = str(win_row.get(col_observ_hist or col_concepto_fuente, '') or '')
                hist_ordenante_best = str(win_row.get(col_ordenante_hist, '') if col_ordenante_hist else '')


        if mejor_piso:
            mov["piso"] = mejor_piso
            mov["metodo_piso"] = mejor_metodo
            mov["es_historico"] = True

            coincidencia_limpia = f"{hist_concepto_original_best} {hist_ordenante_best}".strip().replace('  ', ' ')

            mov["detalle_historico"] = {
                "campo_coincidencia_historico": "Nombre/Concepto en Historial",
                "valor_coincidencia_historico": coincidencia_limpia,
                "texto_buscado": texto_busqueda
            }

            if (
                extracto_id_historico_found
                and extractos_map
                and extracto_id_historico_found in extractos_map
            ):
                mov["detalle_historico"].update({
                    "mes_historico": extractos_map[extracto_id_historico_found]['mes'],
                    "anio_historico": extractos_map[extracto_id_historico_found]['anio']
                })
        else:
            mov["piso"] = ""
            mov["metodo_piso"] = ""
            mov["es_historico"] = False
            
        recuperados.append(mov)

    return recuperados
 
def buscar_pisos_en_historico(excel_registros, movimientos_sin_piso, extractos_map: Optional[Dict] = None, community_id: Optional[int] = None):
    movimientos_a_procesar = movimientos_sin_piso[:] 
    movimientos_encontrados = []

    if isinstance(excel_registros, dict):
        hojas = excel_registros.items()
    else:
        hojas = [(nombre, None) for nombre in excel_registros.sheet_names]

    for nombre_hoja, df_csv in hojas:
        if df_csv is not None:
            df_registro = df_csv
        else:
            df_raw = excel_registros.parse(nombre_hoja, header=None)
            header_row = detectar_fila_cabecera(df_raw)
            if header_row is None:
                continue
            df_registro = excel_registros.parse(nombre_hoja, header=header_row)
            df_registro.columns = [str(c).strip().lower() for c in df_registro.columns]

        nuevos = buscar_pisos_en_registro(df_registro, movimientos_a_procesar, extractos_map, community_id)
        
        encontrados_en_hoja = [mov for mov in nuevos if mov.get("piso")]
        pendientes_despues_hoja = [mov for mov in nuevos if not mov.get("piso")]

        movimientos_encontrados.extend(encontrados_en_hoja)
        movimientos_a_procesar = pendientes_despues_hoja 

        if not movimientos_a_procesar:
            break

    return movimientos_encontrados + movimientos_a_procesar