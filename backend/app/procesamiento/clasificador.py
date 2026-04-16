# backend/app/clasificador.py
import re
from typing import Dict, List

class ClasificadorMovimientos:
    def __init__(self):
        # Reglas de clasificación para gastos e ingresos
        self.reglas = {
            "Ingreso Cuota": {
                "palabras": ["comunidad", "cuota", "derrama", "gasto comunidad"],
                "tipo": "ingreso"
            },
            "Ingreso Alquiler": {
                "palabras": ["alquiler", "renta", "arrendamiento"],
                "tipo": "ingreso"
            },
            "Gasto Luz": {
                "palabras": ["iberdrola", "endesa", "luz", "electricidad", "suministro electrico", "luz del"],
                "tipo": "gasto"
            },
            "Gasto Agua": {
                "palabras": ["agua", "canal", "aqualia", "suministro agua", "aguas"],
                "tipo": "gasto"
            },
            "Gasto Gas": {
                "palabras": ["gas natural", "gas", "butano", "propano", "gasista"],
                "tipo": "gasto"
            },
            "Gasto Limpieza": {
                "palabras": ["limpieza", "productos limpieza", "servicio limpieza", "limpiador"],
                "tipo": "gasto"
            },
            "Gasto Mantenimiento": {
                "palabras": ["reparacion", "mantenimiento", "fontanero", "electricista", "arreglo", "reparación"],
                "tipo": "gasto"
            },
            "Gasto Seguro": {
                "palabras": ["seguro", "mapfre", "allianz", "generali", "aseguradora"],
                "tipo": "gasto"
            },
            "Gasto Basura": {
                "palabras": ["basura", "residuos", "recogida"],
                "tipo": "gasto"
            },
            "Gasto Varios": {
                "palabras": [],
                "tipo": "gasto"
            }
        }
    
    def clasificar(self, concepto: str, importe: float) -> Dict:
        """
        Clasifica un movimiento bancario
        Retorna: {"categoria": str, "tipo": str, "confianza": float}
        """
        if not concepto:
            return {"categoria": "Sin clasificar", "tipo": "desconocido", "confianza": 0}
        
        concepto_limpio = concepto.lower()
        
        # Eliminar caracteres especiales
        concepto_limpio = re.sub(r'[^\w\s]', ' ', concepto_limpio)
        
        # Buscar coincidencias
        for categoria, info in self.reglas.items():
            for palabra in info["palabras"]:
                if palabra in concepto_limpio:
                    confianza = 0.9 if len(palabra) > 5 else 0.7
                    return {
                        "categoria": categoria,
                        "tipo": info["tipo"],
                        "confianza": confianza
                    }
        
        # Si no hay coincidencia, clasificar por tipo de importe
        if importe > 0:
            return {"categoria": "Ingreso Otros", "tipo": "ingreso", "confianza": 0.5}
        else:
            return {"categoria": "Gasto Otros", "tipo": "gasto", "confianza": 0.5}
    
    def clasificar_movimientos(self, movimientos: List[Dict]) -> List[Dict]:
        """Clasifica una lista de movimientos"""
        for movimiento in movimientos:
            clasificacion = self.clasificar(
                movimiento.get("concepto", ""),
                movimiento.get("importe", 0)
            )
            movimiento["categoria"] = clasificacion["categoria"]
            movimiento["tipo"] = clasificacion["tipo"]
            movimiento["confianza"] = clasificacion["confianza"]
        
        return movimientos