import pandas as pd

print("=== VER ESTRUCTURA DE MI EXTRACTO BBVA ===\n")

NOMBRE_ARCHIVO = "extracto_bbva_real.csv"

try:
    # Leer solo las primeras filas para ver la estructura
    df = pd.read_csv(NOMBRE_ARCHIVO, encoding='latin-1', nrows=5)
    
    print(f"📋 NOMBRES DE COLUMNAS:")
    for i, col in enumerate(df.columns):
        print(f"   {i+1}. '{col}'")
    
    print(f"\n📊 PRIMERAS FILAS:")
    print(df.to_string())
    
    print(f"\n🔍 TIPOS DE DATOS:")
    for col in df.columns:
        print(f"   {col}: {df[col].dtype}")
    
except FileNotFoundError:
    print(f"❌ No se encuentra el archivo: {NOMBRE_ARCHIVO}")
    print(f"\n📌 Asegúrate de que el archivo está en la carpeta actual")
    print(f"   Carpeta actual: {os.getcwd()}")
except Exception as e:
    print(f"❌ Error: {e}")