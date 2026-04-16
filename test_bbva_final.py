import requests
import json

print("=== PRUEBA CON EXTRACTO BBVA REAL ===\n")

# Probar con el extracto BBVA
with open("extracto_bbva_real.csv", "rb") as f:
    respuesta = requests.post(
        "http://127.0.0.1:8000/api/procesar-extracto", 
        files={"file": ("extracto_bbva_real.csv", f, "text/csv")}
    )

print(f"Código de respuesta: {respuesta.status_code}\n")

if respuesta.status_code == 200:
    datos = respuesta.json()
    
    print("📊 RESULTADOS:")
    print(f"   Archivo: {datos['nombre_archivo']}")
    print(f"   Total movimientos: {datos['total_movimientos']}")
    print(f"   Ingresos: {datos['resumen']['total_ingresos']}€")
    print(f"   Gastos: {datos['resumen']['total_gastos']}€")
    print(f"   Saldo neto: {datos['resumen']['saldo_neto']}€")
    
    print("\n📋 MOVIMIENTOS:")
    for mov in datos['movimientos']:
        flecha = "⬆️" if mov['importe'] > 0 else "⬇️"
        print(f"   {flecha} {mov['fecha']}: {mov['concepto_limpio'][:50]} - {mov['importe']}€")
else:
    print(f"❌ Error: {datos.get('error', 'Error desconocido')}")

print("\n✅ Prueba completada!")