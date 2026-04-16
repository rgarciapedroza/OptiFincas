import requests
import pandas as pd
from clasificador_movimientos import ClasificadorMovimientos

print("=== CLASIFICAR EXTRACTO BBVA REAL ===\n")

NOMBRE_ARCHIVO = "extracto_bbva_real.csv"
clasificador = ClasificadorMovimientos()

try:
    # 1. Leer el archivo directamente con pandas
    print(f"📖 Leyendo archivo: {NOMBRE_ARCHIVO}")
    
    # Probar diferentes codificaciones
    df = None
    for encoding in ['latin-1', 'utf-8', 'iso-8859-1', 'cp1252']:
        try:
            df = pd.read_csv(NOMBRE_ARCHIVO, encoding=encoding)
            print(f"✅ Leído con encoding: {encoding}")
            break
        except:
            continue
    
    if df is None:
        print("❌ No se pudo leer el archivo con ninguna codificación")
        exit()
    
    print(f"📊 Total filas: {len(df)}")
    print(f"📋 Columnas: {list(df.columns)}\n")
    
    # 2. Identificar columnas de concepto e importe
    col_concepto = None
    col_importe = None
    
    for col in df.columns:
        col_lower = col.lower()
        if 'concepto' in col_lower or 'descripcion' in col_lower:
            col_concepto = col
        if 'importe' in col_lower or 'monto' in col_lower:
            col_importe = col
    
    # Si no encuentra, usar la primera columna de texto y la primera numérica
    if col_concepto is None:
        for col in df.columns:
            if df[col].dtype == 'object':
                col_concepto = col
                break
    
    if col_importe is None:
        for col in df.columns:
            if pd.api.types.is_numeric_dtype(df[col]):
                col_importe = col
                break
    
    print(f"🔍 Columnas identificadas:")
    print(f"   Concepto: {col_concepto}")
    print(f"   Importe: {col_importe}\n")
    
    # 3. Clasificar cada movimiento
    print("🔍 CLASIFICANDO MOVIMIENTOS:\n")
    print("-" * 80)
    
    resultados = []
    total_ingresos = 0
    total_gastos = 0
    
    for idx, row in df.iterrows():
        concepto = str(row[col_concepto]) if col_concepto else "Sin concepto"
        importe = float(row[col_importe]) if col_importe and pd.notna(row[col_importe]) else 0
        
        categoria, tipo = clasificador.clasificar(concepto, importe)
        
        if importe > 0:
            total_ingresos += importe
        else:
            total_gastos += abs(importe)
        
        resultados.append({
            "fecha": row.get(df.columns[0], "N/A"),
            "concepto": concepto[:60],
            "importe": importe,
            "categoria": categoria,
            "tipo": tipo
        })
        
        # Mostrar primeros 10 movimientos
        if idx < 10:
            flecha = "⬆️" if importe > 0 else "⬇️"
            print(f"{flecha} {categoria}: {concepto[:50]}... {importe}€")
    
    print("-" * 80)
    print(f"\n📊 RESUMEN TOTAL:")
    print(f"   Total movimientos procesados: {len(resultados)}")
    print(f"   Total ingresos: {round(total_ingresos, 2)}€")
    print(f"   Total gastos: {round(total_gastos, 2)}€")
    print(f"   Saldo neto: {round(total_ingresos - total_gastos, 2)}€")
    
    # 4. Resumen por categoría
    print(f"\n📊 RESUMEN POR CATEGORÍA:")
    resumen_cat = {}
    for r in resultados:
        if r['categoria'] not in resumen_cat:
            resumen_cat[r['categoria']] = {"ingresos": 0, "gastos": 0, "total": 0}
        
        if r['importe'] > 0:
            resumen_cat[r['categoria']]["ingresos"] += r['importe']
        else:
            resumen_cat[r['categoria']]["gastos"] += abs(r['importe'])
        
        resumen_cat[r['categoria']]["total"] += r['importe']
    
    for cat, valores in resumen_cat.items():
        print(f"\n   📌 {cat}:")
        print(f"      Ingresos: {round(valores['ingresos'], 2)}€")
        print(f"      Gastos: {round(valores['gastos'], 2)}€")
        print(f"      Neto: {round(valores['total'], 2)}€")
    
except FileNotFoundError:
    print(f"❌ No se encuentra el archivo: {NOMBRE_ARCHIVO}")
    print(f"\n📌 Coloca tu archivo en: C:\\Users\\Esteban 2\\Desktop\\Rosmary\\TFG\\OptiFincas\\{NOMBRE_ARCHIVO}")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n✅ Clasificación completada!")