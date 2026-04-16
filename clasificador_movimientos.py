import re

class ClasificadorMovimientos:
    def __init__(self):
        self.reglas = {
            "Gasto Comunidad": {
                "palabras": ["comunidad", "derrama", "comunidades", "ayuda"],
                "tipo": "gasto"
            },
            "Ingreso Nomina": {
                "palabras": ["nomina", "salario", "transferencia recibida"],
                "tipo": "ingreso"
            },
            "Gasto Luz": {
                "palabras": ["iberdrola", "endesa", "luz", "electricidad"],
                "tipo": "gasto"
            },
            "Gasto Agua": {
                "palabras": ["agua", "aqualia", "canal"],
                "tipo": "gasto"
            },
            "Gasto Seguro": {
                "palabras": ["seguro", "mapfre", "allianz", "generali"],
                "tipo": "gasto"
            },
            "Gasto Tarjeta": {
                "palabras": ["tarjeta", "compra", "carrefour", "mercadona"],
                "tipo": "gasto"
            },
            "Gasto Mantenimiento": {
                "palabras": ["reparacion", "mantenimiento", "fontanero"],
                "tipo": "gasto"
            },
            "Ingreso Otros": {
                "palabras": [],
                "tipo": "ingreso"
            },
            "Gasto Otros": {
                "palabras": [],
                "tipo": "gasto"
            }
        }
    
    def clasificar(self, concepto, importe):
        if not concepto:
            return "Sin clasificar", "desconocido"
        
        concepto_limpio = concepto.lower()
        
        for categoria, info in self.reglas.items():
            for palabra in info["palabras"]:
                if palabra in concepto_limpio:
                    return categoria, info["tipo"]
        
        # Si no hay coincidencia, clasificar por signo del importe
        if importe > 0:
            return "Ingreso Otros", "ingreso"
        else:
            return "Gasto Otros", "gasto"

# Probar el clasificador
if __name__ == "__main__":
    c = ClasificadorMovimientos()
    
    pruebas = [
        ("ADEUDO A SU CARGO AYUDA R E COMUNIDADES S.L", -99.7),
        ("TRANSFERENCIA RECIBIDA INGRESO NOMINA", 1250.0),
        ("PAGO TARJETA COMPRA CARREFOUR", -45.30),
        ("SEGURO MAPFRE CUOTA SEGURO HOGAR", -32.50),
        ("IBERDROLA FACTURA ELECTRICIDAD", -67.80),
    ]
    
    print("=== PRUEBA DEL CLASIFICADOR ===\n")
    for concepto, importe in pruebas:
        categoria, tipo = c.clasificar(concepto, importe)
        print(f"Concepto: {concepto[:50]}")
        print(f"  -> Categoría: {categoria} ({tipo})")
        print()