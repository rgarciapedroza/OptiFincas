import re

# Detecta pisos como: 4J, 6º L, 6ªB, 12 B, 3ºA, etc.
PATRON_PISO = re.compile(
    r"\b(\d{1,2}\s*[ºª]?\s*[A-Z])\b",
    re.IGNORECASE
)

def extraer_piso(texto: str) -> str:
    if not texto:
        return ""
    texto = str(texto).upper()
    m = PATRON_PISO.search(texto)
    if not m:
        return ""
    piso = m.group(1)
    piso = piso.replace("º", "").replace("ª", "").replace(" ", "")
    return piso  # Ej: "6L"

def buscar_pisos_en_registro(df_registro, movimientos_sin_piso):
    # Normalizar nombres de columnas
    cols = {c.lower().strip(): c for c in df_registro.columns}

    col_concepto = None
    col_observ = None

    for key, original in cols.items():
        if "concept" in key:
            col_concepto = original
        if "observ" in key:
            col_observ = original

    recuperados = []

    for mov in movimientos_sin_piso:
        concepto_mov = normalizar(mov["concepto"])
        palabras = concepto_mov.split()
        nombre = " ".join(palabras[:3])  # ej: "MARIO RODRIGUEZ"

        mejor_piso = None
        mejor_score = 0

        for _, row in df_registro.iterrows():
            texto_concepto = normalizar(str(row.get(col_concepto, "")))
            texto_observ = normalizar(str(row.get(col_observ, "")))

            # Extraer piso de ambas columnas
            piso_reg = extraer_piso(texto_concepto) or extraer_piso(texto_observ)
            if not piso_reg:
                continue

            # Coincidencia fuerte por nombre exacto
            if nombre in texto_concepto or nombre in texto_observ:
                mejor_piso = piso_reg
                mejor_score = 1.0
                break

            # Coincidencia parcial por palabras
            coincidencias = sum(1 for p in palabras if p and p in texto_concepto)
            score = coincidencias / max(len(palabras), 1)

            if score > mejor_score and score >= 0.40:
                mejor_score = score
                mejor_piso = piso_reg

        mov["piso"] = mejor_piso or ""
        recuperados.append(mov)

    return recuperados

def normalizar(texto):
    if not texto:
        return ""
    texto = str(texto).lower()
    texto = texto.replace("º", "").replace("ª", "")
    texto = re.sub(r"[^\w\s]", " ", texto)
    return " ".join(texto.split())
