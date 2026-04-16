import requests
import json
import pandas as pd
from io import StringIO

print("=== PROCESAR MI EXTRACTO BBVA REAL ===\n")

NOMBRE_ARCHIVO = "extracto_bbva_real.csv"

try:
    # 1. Primero, leer el archivo localmente para ver su contenido
    print("📖 Leyendo archivo local...")
    with open(NOMBRE_ARCHIVO, "r", encoding="latin-1") as f:
        contenido = f.read()
    
    print(f"✅ Archivo leído: {len(contenido)} caracteres")
    
    # Mostrar las primeras líneas
    lineas = contenido.split('\n')
    print(f"\n📋 PRIMERAS LÍNEAS DEL ARCHIVO:")
    for i, linea in enumerate(lineas[:5]):
        print(f"   Línea {i+1}: {linea[:100]}...")
    
    # 2. Enviar a la API
    print("\n📤 Enviando a la API...")
    with open(NOMBRE_ARCHIVO, "rb") as f:
        respuesta = requests.post(
            "http://127.0.0.1:8000/api/procesar-extracto",
            files={"file": (NOMBRE_ARCHIVO, f, "text/csv")}
        )
    
    print(f"Código de respuesta: {respuesta.status_code}\n")
    
    if respuesta.status_code == 200:
        datos = respuesta.json()
        
        print("📊 RESULTADOS DE LA API:")
        print(f"   Archivo: {datos.get('nombre_archivo', 'N/A')}")
        print(f"   Total movimientos: {datos.get('total_movimientos', 0)}")
        print(f"   Columnas encontradas: {datos.get('columnas', [])}")
        
        if 'resumen' in datos:
            print(f"\n💰 RESUMEN FINANCIERO:")
            print(f"   Ingresos: {datos['resumen'].get('ingresos', 0)}€")
            print(f"   Gastos: {datos['resumen'].get('gastos', 0)}€")
            print(f"   Saldo neto: {datos['resumen'].get('saldo', 0)}€")
        
        if 'primer_fila' in datos:
            print(f"\n📋 PRIMER MOVIMIENTO:")
            for key, value in datos['primer_fila'].items():
                print(f"   {key}: {value}")
    else:
        print(f"❌ Error en API: {respuesta.text}")
        
except FileNotFoundError:
    print(f"❌ ERROR: No se encuentra el archivo '{NOMBRE_ARCHIVO}'")
    print(f"\n📌 Asegúrate de que el archivo está en:")
    print(f"   C:\\Users\\Esteban 2\\Desktop\\Rosmary\\TFG\\OptiFincas\\{NOMBRE_ARCHIVO}")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n✅ Proceso completado!")