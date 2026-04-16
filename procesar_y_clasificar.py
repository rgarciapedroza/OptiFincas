import requests
import json
from clasificador_movimientos import ClasificadorMovimientos

print("=== PROCESAR Y CLASIFICAR EXTRACTO BBVA ===\n")

# Inicializar clasificador
clasificador = ClasificadorMovimientos()

# Archivo a procesar
archivo = "extracto_bbva.csv"

try:
    # 1. Enviar archivo a la API
    print("📤 Enviando archivo a la API...")
    with open(archivo, "rb") as f:
        respuesta = requests.post(
            "http://127.0.0.1:8000/api/procesar-extracto",
            files={"file": (archivo, f, "text/csv")}
        )
    
    if respuesta.status_code != 200:
        print(f"❌ Error en la API: {respuesta.text}")
        exit()
    
    datos = respuesta.json()
    print(f"✅ Archivo procesado: {datos['total_movimientos']} movimientos\n")
    
    # 2. Obtener las columnas del archivo
    columnas = datos.get('columnas', [])
    print(f"📋 Columnas encontradas: {columnas}\n")
    
    # 3. Si tenemos la primera fila, clasificarla
    if 'primer_fila' in datos:
        print("🔍 CLASIFICANDO MOVIMIENTOS:\n")
        
        primera_fila = datos['primer_fila']
        
        # Intentar encontrar concepto e importe
        concepto = ""
        importe = 0
        
        for key, value in primera_fila.items():
            key_lower = key.lower()
            if 'concepto' in key_lower or 'descripcion' in key_lower:
                concepto = str(value)
            if 'importe' in key_lower or 'monto' in key_lower:
                try:
                    importe = float(value)
                except:
                    pass
        
        if concepto:
            categoria, tipo = clasificador.clasificar(concepto, importe)
            print(f"📌 Movimiento analizado:")
            print(f"   Concepto: {concepto[:80]}")
            print(f"   Importe: {importe}€")
            print(f"   Categoría: {categoria}")
            print(f"   Tipo: {tipo}")
        else:
            print("⚠️ No se encontraron columnas de concepto o importe")
            print("📌 Las columnas disponibles son:", list(primera_fila.keys()))
    
    # 4. Mostrar resumen
    if 'resumen' in datos:
        print(f"\n📊 RESUMEN DEL EXTRACTO:")
        print(f"   Total ingresos: {datos['resumen'].get('ingresos', 0)}€")
        print(f"   Total gastos: {datos['resumen'].get('gastos', 0)}€")
        print(f"   Saldo neto: {datos['resumen'].get('saldo', 0)}€")
    
except FileNotFoundError:
    print(f"❌ No se encuentra el archivo: {archivo}")
    print("\n📌 Para crear un archivo de prueba, ejecuta:")
    print("   python crear_extracto_prueba.py")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n✅ Proceso completado!")