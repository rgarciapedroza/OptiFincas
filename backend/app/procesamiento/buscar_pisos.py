import re
import pandas as pd
import unicodedata
from difflib import SequenceMatcher
from typing import Dict, List, Optional

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

print(">>> TRES CARGANDO buscar_pisos.py DESDE:", __file__)
 
GENERICAS = {
    "PAGO", "PAGOS", "TRANSFERENCIA", "TRASPASO", "TRASF",
    "COMUNIDAD", "PROPIETARIOS", "PROPIETARIO", "CUOTA",
    "MENSUALIDAD", "RECIBO", "INGRESO", "EFECTIVO",
    "BANCO", "VARIOS", "COMUN", "PROPIEDAD", "PROP",
    "CALLE", "CL", "C", "AVENIDA", "AV", "PORTAL",
    "ESCALERA", "ESC", "EDIFICIO", "BLOQUE", "BLQ"
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

PATRON_PISO = re.compile(r"\b(\d{1,2}\s*[A-Z])\b", re.IGNORECASE)

def extraer_piso(texto: str) -> str:
    if not texto:
        return ""
    texto = str(texto).upper().replace(",", " ").replace(".", " ")
    m = PATRON_PISO.search(texto)
    if not m:
        return ""
    return m.group(1).replace(" ", "")

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
            if pd.notna(val) and str(val).strip() != "" and str(val).lower() != "nan":
                pisos.add(str(val).strip().upper())

    # También buscamos por regex en campos de texto (Excel/Fallback)
    posibles_columnas = [c for c in df_registro.columns if "observ" in c or "concept" in c]
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

    print(f"\n[DEBUG] Buscando en base de datos ({len(df_registro)} registros históricos). Columnas: {list(cols_lower.keys())}")
    if len(movimientos_a_procesar) > 0:
        print(f"  Primer movimiento pendiente: Concepto='{movimientos_a_procesar[0].get('concepto_original', '')}', Ordenante='{movimientos_a_procesar[0].get('ordenante', '')}'")

    recuperados = []
    
    for mov in movimientos_a_procesar:
        # Preparar texto del movimiento actual
        c_mov = normalizar_texto(mov.get("concepto_original", mov.get("concepto", "")))
        o_mov = normalizar_texto(mov.get("ORDENANTE", mov.get("ordenante", "")))
        texto_busqueda = f"{c_mov} {o_mov}".strip()

        palabras = texto_busqueda.split()
        palabras_nombre = [p for p in palabras if es_nombre_o_apellido(p)]

        is_mario = "MARIO" in texto_busqueda
        if is_mario:
            print(f"\n[DEBUG MARIO] Analizando: '{texto_busqueda}'. Nombres detectados: {palabras_nombre}")
            print(f"[DEBUG MARIO]   Movimiento actual: Concepto='{c_mov}', Ordenante='{o_mov}'")

        mejor_piso = None
        mejor_score = 0.0
        mejor_metodo = ""
        extracto_id_historico_found = None # Initialize for each movement
        # Winning historical row fields (used later to build detalle_historico)
        hist_concepto_original_best = ""
        hist_ordenante_best = ""


        # --- FASE 1: Búsqueda por Nombres (Mínimo 2 palabras útiles) ---
        if len(palabras_nombre) >= 2:
            n1, n2 = palabras_nombre[:2]
            for _, row in df_registro.iterrows():
                # 1. Obtener el piso del registro histórico
                p_hist = str(row.get(col_piso_directo, "")).strip().upper() if col_piso_directo else ""
                if not p_hist or p_hist in ["NAN", "NONE"]:
                    # Fallback: intentar extraer piso del texto del histórico si la columna está vacía
                    t_hist_raw = f"{row.get(col_concepto, '')} {row.get(col_observ, '')} {row.get(col_ordenante, '')}"
                    p_hist = extraer_piso(t_hist_raw)
                
                if not p_hist: continue # Skip if no piso could be identified for this historical record
                current_hist_extracto_id = row.get(col_extracto_id) if col_extracto_id else None

                # 2. Comprobar nombres en el texto histórico normalizado
                t_hist_norm = normalizar_texto(f"{row.get(col_concepto, '')} {row.get(col_observ, '')} {row.get(col_ordenante, '')}")
                palabras_hist = t_hist_norm.split()
                
                s1 = max((similar(n1, p) for p in palabras_hist), default=0)
                s2 = max((similar(n2, p) for p in palabras_hist), default=0)

                if s1 >= 0.85 and s2 >= 0.85:
                    score = (s1 + s2) / 2
                    if score > mejor_score:
                        mejor_score, mejor_piso, mejor_metodo = score, p_hist, "historico_db_nombres"
                        extracto_id_historico_found = current_hist_extracto_id # Assign here
                        # Save winning row fields for the UI details
                        hist_concepto_original_best = str(row.get(col_concepto, '') or '')
                        hist_ordenante_best = str(row.get(col_ordenante, '') if col_ordenante else '')
                        if score >= 0.98: break # Found a very strong match, no need to search further for this movement


        # --- FASE 2: Similitud de Texto Completo (Fallback si Fase 1 falló o es insuficiente) ---
        if not mejor_piso or mejor_score < 0.90:
            for _, row in df_registro.iterrows():
                p_hist = str(row.get(col_piso_directo, "")).strip().upper() if col_piso_directo else ""
                if not p_hist or p_hist in ["NAN", "NONE"]:
                    t_hist_raw = f"{row.get(col_concepto, '')} {row.get(col_observ, '')} {row.get(col_ordenante, '')}"
                    p_hist = extraer_piso(t_hist_raw)
                
                if not p_hist: continue # Skip if no piso could be identified for this historical record
                current_hist_extracto_id = row.get(col_extracto_id) if col_extracto_id else None # Get the extract ID from the historical record

                t_hist_norm = normalizar_texto(f"{row.get(col_concepto, '')} {row.get(col_ordenante, '')}")
                
                # Comparamos el bloque del movimiento actual contra el bloque histórico
                sim1 = similar(c_mov, t_hist_norm)
                sim2 = similar(o_mov, t_hist_norm)
                score = max(sim1, sim2)

                if score >= 0.85 and score > mejor_score:
                    mejor_score, mejor_piso, mejor_metodo = score, p_hist, "historico_db_similitud"
                    extracto_id_historico_found = current_hist_extracto_id # Assign here
                    # Save winning row fields for the UI details
                    hist_concepto_original_best = str(row.get(col_concepto, '') or '')
                    hist_ordenante_best = str(row.get(col_ordenante, '') if col_ordenante else '')
                    if score >= 0.95: break # Found a strong match, no need to search further for this movement


        if mejor_piso:
            mov["piso"] = mejor_piso
            mov["metodo_piso"] = mejor_metodo
            mov["es_historico"] = True # Set this flag for the frontend
            if is_mario:
                print(f"[DEBUG MARIO] ¡IDENTIFICADO! Piso: {mejor_piso} via {mejor_metodo} (Score: {mejor_score:.2f})")


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