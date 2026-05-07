import re
import unicodedata
from difflib import SequenceMatcher

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

    # 2. Normalización estándar
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
    posibles_columnas = [c for c in df_registro.columns if "observ" in c or "concept" in c]
    for _, row in df_registro.iterrows():
        for col in posibles_columnas:
            texto = normalizar_texto(str(row.get(col, "")))
            for p in PATRON_PISO.findall(texto):
                pisos.add(p.replace(" ", ""))
    return pisos

def buscar_pisos_en_registro(df_registro, movimientos_sin_piso):

    cols = {str(c).strip().lower(): c for c in df_registro.columns}
    col_concepto = next((v for k, v in cols.items() if "concept" in k), None)
    col_observ = next((v for k, v in cols.items() if "observ" in k), None)

    recuperados = []
    pisos_validos = obtener_pisos_validos(df_registro)

    for mov in movimientos_sin_piso:
        concepto_mov = normalizar_texto(mov.get("concepto_original", mov["concepto"]))
        palabras = concepto_mov.split()
        palabras_nombre = [p for p in palabras if es_nombre_o_apellido(p)]

        if len(palabras_nombre) < 2:
            mov["piso"] = ""
            recuperados.append(mov)
            continue

        nombre1, nombre2 = palabras_nombre[:2]

        mejor_piso = None
        mejor_score = 0.0

        for _, row in df_registro.iterrows():
            texto_concepto = normalizar_texto(str(row.get(col_concepto, "")))
            texto_observ = normalizar_texto(str(row.get(col_observ, "")))

            piso_reg = extraer_piso(texto_concepto) or extraer_piso(texto_observ)
            if not piso_reg or piso_reg not in pisos_validos:
                continue

            palabras_registro = texto_concepto.split() + texto_observ.split()
            sim1 = max(similar(nombre1, pr) for pr in palabras_registro)
            sim2 = max(similar(nombre2, pr) for pr in palabras_registro)

            if sim1 >= 0.85 and sim2 >= 0.85:
                score_total = (sim1 + sim2) / 2
                if score_total > mejor_score:
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
            header_row = detectar_fila_cabecera(df_raw)
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
