import re
import unicodedata
from difflib import SequenceMatcher

print(">>> CARGANDO buscar_pisos.py DESDE:", __file__)

def similar(a, b):
    return SequenceMatcher(None, a, b).ratio()

def normalizar_texto(texto: str) -> str:
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    texto = re.sub(r"[^A-Za-z0-9\s]", " ", texto)
    texto = re.sub(r"\s+", " ", texto)
    return texto.strip().upper()

PATRON_PISO = re.compile(
    r"\b(\d{1,2}\s*[A-Z])\b",
    re.IGNORECASE
)

def extraer_piso(texto: str) -> str:
    if not texto:
        return ""
    texto = str(texto).upper().replace(",", " ").replace(".", " ")
    m = PATRON_PISO.search(texto)
    if not m:
        return ""
    return m.group(1).replace(" ", "")

def buscar_pisos_en_registro(df_registro, movimientos_sin_piso):

    cols = {str(c).strip().lower(): c for c in df_registro.columns}

    col_concepto = None
    col_observ = None

    for key, original in cols.items():
        if "concept" in key:
            col_concepto = original
        if "observ" in key:
            col_observ = original

    recuperados = []

    for mov in movimientos_sin_piso:
        concepto_mov = normalizar_texto(mov["concepto"])
        palabras = concepto_mov.split()
        nombre_mov = " ".join(palabras[:3])

        mejor_piso = None
        mejor_score = 0.0

        for _, row in df_registro.iterrows():
            texto_concepto = normalizar_texto(str(row.get(col_concepto, "")))
            texto_observ = normalizar_texto(str(row.get(col_observ, "")))

            piso_reg = extraer_piso(texto_concepto) or extraer_piso(texto_observ)
            if not piso_reg:
                continue

            if nombre_mov and (nombre_mov in texto_concepto or nombre_mov in texto_observ):
                mejor_piso = piso_reg
                mejor_score = 1.0
                break

            coincidencias = sum(1 for p in palabras if p and p in texto_concepto)
            score_palabras = coincidencias / max(len(palabras), 1)

            sim_concepto = similar(nombre_mov, texto_concepto)
            sim_observ = similar(nombre_mov, texto_observ)
            score_fuzzy = max(sim_concepto, sim_observ)

            score_total = max(score_palabras, score_fuzzy)

            if score_total > mejor_score and score_total >= 0.40:
                mejor_score = score_total
                mejor_piso = piso_reg

        mov["piso"] = mejor_piso or ""
        recuperados.append(mov)

    return recuperados

def buscar_pisos_en_historico(excel_registros, movimientos_sin_piso):

    pendientes = [mov.copy() for mov in movimientos_sin_piso]
    recuperados = []

    if isinstance(excel_registros, dict):
        hojas = excel_registros.items()
    else:
        hojas = [(nombre, None) for nombre in excel_registros.sheet_names]

    for nombre_hoja, df_csv in hojas:

        if df_csv is not None:
            df_registro = df_csv

        else:
            df_raw = excel_registros.parse(nombre_hoja, header=None)

            header_row = None
            for i, row in df_raw.iterrows():
                fila = " ".join(str(x).lower() for x in row.values)
                if "fecha contable" in fila or "observ" in fila or "importe" in fila:
                    header_row = i
                    break

            if header_row is None:
                continue

            df_registro = excel_registros.parse(nombre_hoja, header=header_row)
            df_registro.columns = [str(c).strip().lower() for c in df_registro.columns]

        nuevos = buscar_pisos_en_registro(df_registro, pendientes)

        encontrados = [mov for mov in nuevos if mov.get("piso")]
        no_encontrados = [mov for mov in nuevos if not mov.get("piso")]

        recuperados.extend(encontrados)
        pendientes = no_encontrados

        if not pendientes:
            break

    recuperados.extend(pendientes)
    return recuperados
