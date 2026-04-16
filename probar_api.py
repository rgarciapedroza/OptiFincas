import requests
import json

print("=== Probando API con CLASIFICACIÓN AUTOMÁTICA ===\n")

with open("test_extracto.csv", "rb") as f:
    archivos = {"file": ("test_extracto.csv", f, "text/csv")}
    respuesta = requests.post("http://127.0.0.1:8000/api/procesar-extracto", files=archivos)

print("Código de respuesta:", respuesta.status_code)
print("\n📊 RESULTADOS:\n")

datos = respuesta.json()

print(f"📁 Archivo: {datos['nombre_archivo']}")
print(f"📈 Total movimientos: {datos['total_movimientos']}")
print(f"💰 Total ingresos: {datos['resumen_general']['total_ingresos']}€")
print(f"💸 Total gastos: {datos['resumen_general']['total_gastos']}€")
print(f"⚖️ Saldo neto: {datos['resumen_general']['saldo_neto']}€")

print("\n📋 MOVIMIENTOS CLASIFICADOS:")
for mov in datos['movimientos_clasificados']:
    tipo_emoji = "📈" if mov['importe'] > 0 else "📉"
    # Mostrar sin el campo 'confianza' que no existe
    print(f"  {tipo_emoji} {mov['categoria']}: {mov['concepto']} - {mov['importe']}€")

print("\n📊 RESUMEN POR CATEGORÍA:")
for cat, stats in datos['resumen_categorias'].items():
    print(f"\n  📌 {cat}:")
    print(f"     Ingresos: {stats['ingresos']}€")
    print(f"     Gastos: {stats['gastos']}€")

print("\n✅ Prueba completada!")