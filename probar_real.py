import requests
import pandas as pd

print("=== PROBAR MI EXTRACTO REAL ===\n")

# 1. Verificar que el archivo existe
try:
    df = pd.read_csv("extracto_bbva_real.csv", encoding='latin-1', nrows=2)
    print(f"✅ Archivo encontrado: {len(df)} filas de muestra")
    print(f"📋 Columnas: {list(df.columns)}")
except Exception as e:
    print(f"❌ Error leyendo archivo: {e}")
    exit()

# 2. Verificar que el servidor está corriendo
try:
    resp = requests.get("http://127.0.0.1:8000/", timeout=2)
    print(f"✅ Servidor: {resp.json()}")
except:
    print("❌ ERROR: Servidor no está corriendo")
    print("📌 Abre otra terminal y ejecuta: python backend/app/main.py")
    exit()

# 3. Enviar archivo a la API
print("\n📤 Enviando archivo a la API...")
with open("extracto_bbva_real.csv", "rb") as f:
    respuesta = requests.post(
        "http://127.0.0.1:8000/api/procesar-extracto",
        files={"file": ("extracto_bbva_real.csv", f, "text/csv")}
    )

print(f"Código: {respuesta.status_code}")

if respuesta.status_code == 200:
    datos = respuesta.json()
    print("\n📊 RESULTADOS:")
    print(f"   Total movimientos: {datos.get('total_movimientos', 0)}")
    print(f"   Ingresos: {datos.get('ingresos', 0)}€")
    print(f"   Gastos: {datos.get('gastos', 0)}€")
    print(f"   Saldo: {datos.get('saldo', 0)}€")
else:
    print(f"❌ Error: {respuesta.text}")

print("\n✅ Prueba completada!")