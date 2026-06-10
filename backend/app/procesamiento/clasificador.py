from typing import Dict, List


class ClasificadorMovimientos:
    """Clasificador legacy (legacy/compatibilidad).

    Nota de arquitectura:
    - Este módulo NO debe contener reglas de negocio (keywords hardcodeadas).
    - La clasificación real de categorías debe resolverse en `ClasificadorML`
      consultando la tabla `categorias_reglas` en BD.

    Este clasificador se mantiene solo por compatibilidad con código existente,
    devolviendo categorías genéricas.
    """

    def clasificar(self, concepto: str, importe: float) -> Dict:
        """Devuelve categorías genéricas (sin reglas hardcodeadas)."""
        tipo = "ingreso" if importe > 0 else "gasto"
        return {
            "categoria": "Sin clasificar",
            "tipo": tipo,
            "confianza": 0.0,
        }

    def clasificar_movimientos(self, movimientos: List[Dict]) -> List[Dict]:
        """Clasifica una lista de movimientos (genérico)."""
        for movimiento in movimientos:
            clasificacion = self.clasificar(
                movimiento.get("concepto", ""),
                movimiento.get("importe", 0),
            )
            movimiento["categoria"] = clasificacion["categoria"]
            movimiento["tipo"] = clasificacion["tipo"]
            movimiento["confianza"] = clasificacion["confianza"]
        return movimientos

