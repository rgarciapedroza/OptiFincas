import re
import logging
import pandas as pd
import unicodedata
from difflib import SequenceMatcher
from typing import Dict, List, Optional

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
    "PAGO", "PAGOS", "TRANSFERENCIA", "TRASPASO", "TRASF",
    "COMUNIDAD", "PROPIETARIOS", "PROPIETARIO", "CUOTA",
    "MENSUALIDAD", "RECIBO", "INGRESO", "EFECTIVO",
    "BANCO", "VARIOS", "COMUN", "PROPIEDAD", "PROP",
    "CALLE", "CL", "C", "AVENIDA", "AV", "PORTAL",
    "ESCALERA", "ESC", "EDIFICIO", "BLOQUE", "BLQ",
    "DE", "DEL", "LOS", "LAS", "LA", "EL", "SAN", "SANTA", "Y"
}

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

def normalizar_texto(texto: str) -> str:
    if not texto:
        return ""

    texto = texto.replace("º", "")
    texto = texto.replace("ª", "")

    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Za-z0-9\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip().upper()

# Patrón mejorado para detectar: 2J, 2 J, 02-A, 2/A, A2
PATRON_PISO = re.compile(r"\b(\d{1,2}\s*[A-Z]|[A-Z]\s*\d{1,2}|\d{1,2}\s*[-/]\s*[A-Z])\b", re.IGNORECASE)

def extraer_piso(texto: str) -> str:
    if not texto:
        return ""
    try:
        texto = str(texto).upper().replace(",", " ").replace(".", " ")
        m = PATRON_PISO.search(texto)
        if not m:
            return ""
        # Limpiar el resultado: quitar espacios, guiones y barras
        res = m.group(1)
        res = re.sub(r"[\s\-/]", "", res)
        return res.upper()
    except:
        return ""

def es_piso_identificado(piso) -> bool:
    if pd.isna(piso) or piso is None:
        return False
    p = str(piso).strip().lower()
    return p not in ["", "nan", "none", "piso sin identificar", "piso desconocido", "sin asignar", "pisodesconocido"]

def es_nombre_o_apellido(p):
    p = p.upper()
    if any(c.isdigit() for c in p):
        return False
    if len(p) < 3:
        return False
    for g in GENERICAS:
        if similar(p, g) >= 0.85:
            return False
    return True

def extraer_nombres_desde_concepto(concepto: str) -> List[str]:
    concepto = concepto.upper()
    partes = concepto.split()
    nombres = []
    # Recorremos todas las partes y filtramos las que parecen nombres (solo letras y longitud > 2)
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
    
    # Si hay columna directa de piso (Base de Datos), incluimos esos valores como válidos
    col_piso_directo = cols_lower.get("piso")
    if col_piso_directo:
        for val in df_registro[col_piso_directo]:
            if es_piso_identificado(val):
                pisos.add(str(val).strip().upper())

    # También buscamos por regex en campos de texto (Excel/Fallback)
    posibles_columnas = [c for c in df_registro.columns if any(kw in c.lower() for kw in ["observ", "concept", "orden", "titular", "nombre", "datos"])]
    for _, row in df_registro.iterrows():
        for col in posibles_columnas:
            texto = normalizar_texto(str(row.get(col, "")))
            for p in PATRON_PISO.findall(texto):
                pisos.add(p.replace(" ", ""))
    return pisos

def buscar_pisos_en_registro(df_registro, movimientos_a_procesar, extractos_map: Optional[Dict] = None):
    cols_lower = {str(c).strip().lower(): c for c in df_registro.columns}
 
    col_concepto = cols_lower.get("concepto") or next((v for k, v in cols_lower.items() if "concept" in k), None)
    col_observ = cols_lower.get("observaciones") or next((v for k, v in cols_lower.items() if "observ" in k), None)
    col_ordenante = cols_lower.get("ordenante") or next((v for k, v in cols_lower.items() if any(kw in k for kw in ["titular", "propietario", "nombre", "benef"])), None)
    col_piso_directo = cols_lower.get("piso")
    
    # Define col_extracto_id here using the helper
    col_extracto_id = find_col_by_keywords(df_registro.columns.tolist(), ["extracto_id", "id_extracto", "extracto"])

    # 1. Mapa de Propietario -> {Piso: Frecuencia} (extraído del historial global)
    # Esto permite identificar de antemano qué propietarios tienen varias propiedades.
    owner_to_pisos = {}
    if col_ordenante and col_piso_directo:
        for _, row in df_registro.iterrows():
            p_hist = str(row.get(col_piso_directo, "")).strip().upper()
            o_hist = normalizar_texto(str(row.get(col_ordenante, "")))
            if o_hist and es_piso_identificado(p_hist):
                if o_hist not in owner_to_pisos:
                    owner_to_pisos[o_hist] = {}
                owner_to_pisos[o_hist][p_hist] = owner_to_pisos[o_hist].get(p_hist, 0) + 1

    # 2. Control de asignaciones en el lote actual (batch) para repartir pagos
    # Si un propietario tiene 2 pisos, el primer pago va al 1º y el segundo al 2º.
    lote_assignments = {} # {owner_norm: [piso1, piso2...]}

    recuperados = []
    
    for mov in movimientos_a_procesar:
        # Preparar texto del movimiento actual
        c_mov_raw = str(mov.get("concepto_original") or mov.get("concepto") or "")
        # Intentamos obtener la identidad del pagador
        o_mov_raw = str(mov.get("ORDENANTE") or mov.get("ordenante") or "").strip()
        
        # Si no hay ordenante explícito (común en CSV), intentamos extraer nombres del concepto
        if not o_mov_raw:
            nombres_detectados = extraer_nombres_desde_concepto(c_mov_raw)
            if nombres_detectados:
                o_mov_raw = " ".join(nombres_detectados)
        
        c_mov = normalizar_texto(c_mov_raw)
        o_mov = normalizar_texto(o_mov_raw)
        
        # Combinar asegurando que no duplicamos información si el nombre ya está en el concepto
        if o_mov and o_mov in c_mov:
            texto_actual_full = c_mov
        else:
            texto_actual_full = f"{o_mov} {c_mov}".strip().replace("  ", " ")
        texto_busqueda = texto_actual_full

        palabras = texto_busqueda.split()
        palabras_nombre = [p for p in palabras if es_nombre_o_apellido(p)]

        # Evitar falsos positivos en CSVs con información genérica.
        # Si es un CSV, contiene palabras de ruido y no tiene al menos 2 palabras útiles (nombres), se descarta.
        es_csv = mov.get("es_csv", False)
        contiene_generica = any(p in GENERICAS for p in palabras)
        if es_csv and contiene_generica and len(palabras_nombre) < 2:
            mov["piso"] = ""
            mov["metodo_piso"] = ""
            mov["es_historico"] = False
            recuperados.append(mov)
            continue

        is_mario = "MARIO" in texto_busqueda
        if is_mario:
            logger.debug(f"Analizando: '{texto_busqueda}'. Nombres detectados: {palabras_nombre}")
            logger.debug(f"  Movimiento actual: Concepto='{c_mov}', Ordenante='{o_mov}'")

        # Diccionario para contar coincidencias y aplicar la regla de los 3 movimientos
        candidatos_conteo = {} # {piso: {"count": int, "best_score": float, "row": dict, "metodo": str}}
        extracto_id_historico_found = None # Initialize for each movement
        # Winning historical row fields (used later to build detalle_historico)
        hist_concepto_original_best = ""
        hist_ordenante_best = ""

        # --- FASE 1: Búsqueda por Nombres (Mínimo 2 palabras útiles) ---
        if len(palabras_nombre) >= 2:
            n1, n2 = palabras_nombre[:2]
            
            for _, row in df_registro.iterrows():
                val_piso = row.get(col_piso_directo)
                p_hist = str(val_piso).strip().upper() if es_piso_identificado(val_piso) else ""
                if not p_hist:
                    txt_h = f"{row.get(col_concepto, '')} {row.get(col_observ, '') if col_observ else ''} {row.get(col_ordenante, '') if col_ordenante else ''}"
                    p_hist = extraer_piso(txt_h)
                if not p_hist: continue

                h_con_n = normalizar_texto(str(row.get(col_concepto, '')))
                h_ord_n = normalizar_texto(str(row.get(col_ordenante, ''))) if col_ordenante else ''
                t_hist_norm = h_con_n if (h_ord_n and h_ord_n in h_con_n) else f"{h_ord_n} {h_con_n}".strip().replace("  ", " ")
                palabras_hist = t_hist_norm.split()
                
                s1 = max((similar(n1, p) for p in palabras_hist), default=0)
                s2 = max((similar(n2, p) for p in palabras_hist), default=0)

                if s1 >= 0.85 and s2 >= 0.85:
                    score = (s1 + s2) / 2
                    if p_hist not in candidatos_conteo:
                        candidatos_conteo[p_hist] = {"count": 0, "best_score": 0.0, "row": row, "metodo": "historico_db_nombres"}
                    candidatos_conteo[p_hist]["count"] += 1
                    if score > candidatos_conteo[p_hist]["best_score"]:
                        candidatos_conteo[p_hist]["best_score"] = score
                        candidatos_conteo[p_hist]["row"] = row


        # --- FASE 2: Similitud de Texto Completo (Fallback si Fase 1 falló o es insuficiente) ---
        if not candidatos_conteo or max((c["count"] for c in candidatos_conteo.values()), default=0) < 3:
            for _, row in df_registro.iterrows():
                val_piso = row.get(col_piso_directo)
                p_hist = str(val_piso).strip().upper() if es_piso_identificado(val_piso) else ""
                if not p_hist:
                    txt_h = f"{row.get(col_concepto, '')} {row.get(col_observ, '') if col_observ else ''} {row.get(col_ordenante, '') if col_ordenante else ''}"
                    p_hist = extraer_piso(txt_h)
                if not p_hist: continue

                h_con_n = normalizar_texto(str(row.get(col_concepto, '')))
                h_ord_n = normalizar_texto(str(row.get(col_ordenante, ''))) if col_ordenante else ''
                t_hist_full = h_con_n if (h_ord_n and h_ord_n in h_con_n) else f"{h_ord_n} {h_con_n}".strip().replace("  ", " ")
                
                score = similar(texto_actual_full, t_hist_full)
                if score >= 0.85:
                    if p_hist not in candidatos_conteo:
                        candidatos_conteo[p_hist] = {"count": 0, "best_score": 0.0, "row": row, "metodo": "historico_db_similitud"}
                    candidatos_conteo[p_hist]["count"] += 1
                    if score > candidatos_conteo[p_hist]["best_score"]:
                        candidatos_conteo[p_hist]["best_score"] = score
                        candidatos_conteo[p_hist]["row"] = row


        # --- LÓGICA DE ASIGNACIÓN FINAL Y MULTI-PROPIEDAD ---
        mejor_piso = None
        mejor_metodo = ""
        mejor_score = 0.0

        # Regla de consistencia: al menos 3 movimientos con el mismo resultado en el historial
        candidatos_consistentes = [p for p, data in candidatos_conteo.items() if data["count"] >= 3]
        
        if candidatos_consistentes:
            # Ordenar por frecuencia (el que más veces aparezca en el pasado gana)
            candidatos_consistentes.sort(key=lambda p: candidatos_conteo[p]["count"], reverse=True)
            
            # Comprobar si este propietario tiene más de una finca registrada en la comunidad
            pisos_del_propietario = [p for p, c in owner_to_pisos.get(o_mov, {}).items() if c >= 3]
            
            if len(pisos_del_propietario) > 1:
                # REPARTO PARA MULTI-PROPIETARIOS
                # Buscamos un piso que este propietario posea pero que NO hayamos asignado aún en este lote (mes)
                ya_asignados = lote_assignments.get(o_mov, [])
                pendientes = [p for p in pisos_del_propietario if p not in ya_asignados]
                
                if pendientes:
                    # Asignamos el primero de los que faltan por pagar
                    mejor_piso = pendientes[0]
                else:
                    # Si ya han pagado todos sus pisos este mes, repetimos por orden de probabilidad
                    mejor_piso = candidatos_consistentes[0]
                
                # Registrar la asignación para el siguiente movimiento del mismo lote
                if o_mov not in lote_assignments: lote_assignments[o_mov] = []
                lote_assignments[o_mov].append(mejor_piso)
                mejor_metodo = candidatos_conteo.get(mejor_piso, {}).get("metodo", "multi_propiedad_db")
            else:
                # Caso normal: un solo piso o no detectado como multi-piso
                mejor_piso = candidatos_consistentes[0]
                mejor_metodo = candidatos_conteo[mejor_piso]["metodo"]

            # Extraer metadatos del registro ganador para la UI
            best_match = candidatos_conteo.get(mejor_piso, {})
            mejor_score = best_match.get("best_score", 0.0)
            win_row = best_match.get("row")
            if win_row is not None:
                extracto_id_historico_found = win_row.get(col_extracto_id) if col_extracto_id else None
                hist_concepto_original_best = str(win_row.get(col_concepto, '') or '')
                hist_ordenante_best = str(win_row.get(col_ordenante, '') if col_ordenante else '')


        if mejor_piso:
            mov["piso"] = mejor_piso
            mov["metodo_piso"] = mejor_metodo
            mov["es_historico"] = True # Set this flag for the frontend
            if is_mario:
                logger.info(f"¡IDENTIFICADO! Piso: {mejor_piso} via {mejor_metodo} (Score: {mejor_score:.2f})")


            # Capturamos la coincidencia completa encontrada en el histórico
            coincidencia_limpia = f"{hist_concepto_original_best} {hist_ordenante_best}".strip().replace('  ', ' ')

            # Inicializamos el detalle siempre, aunque no tengamos el ID del extracto
            mov["detalle_historico"] = {
                "campo_coincidencia_historico": "Nombre/Concepto en Historial",
                "valor_coincidencia_historico": coincidencia_limpia,
                "texto_buscado": texto_busqueda
            }

            # Solo si tenemos los mapas de extractos añadimos el mes y año
            if (
                extracto_id_historico_found
                and extractos_map
                and extracto_id_historico_found in extractos_map
            ):
                mov["detalle_historico"].update({
                    "mes_historico": extractos_map[extracto_id_historico_found]['mes'],
                    "anio_historico": extractos_map[extracto_id_historico_found]['anio']
                })
        else: # If no piso was found for this movement

            mov["piso"] = ""
            mov["metodo_piso"] = ""
            mov["es_historico"] = False # Explicitly set to False
            
        recuperados.append(mov)

    return recuperados
 
def buscar_pisos_en_historico(excel_registros, movimientos_sin_piso, extractos_map: Optional[Dict] = None):
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

        nuevos = buscar_pisos_en_registro(df_registro, movimientos_a_procesar, extractos_map)
        
        encontrados_en_hoja = [mov for mov in nuevos if mov.get("piso")]
        pendientes_despues_hoja = [mov for mov in nuevos if not mov.get("piso")]

        movimientos_encontrados.extend(encontrados_en_hoja)
        movimientos_a_procesar = pendientes_despues_hoja 

        if not movimientos_a_procesar:
            break

    return movimientos_encontrados + movimientos_a_procesar