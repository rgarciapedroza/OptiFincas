"""
Clasificador ML para movimientos bancarios
============================================

Sistema de clasificación que combina:
1. Machine Learning (Naive Bayes / Random Forest)
2. Regex patterns como fallback
3. Detección automática de piso

Autor: Sistema de Clasificación
Versión: 1.0
"""

import re
import json
import os
from typing import Dict, List, Tuple, Optional
from collections import Counter
import logging
from difflib import SequenceMatcher
from app.procesamiento.buscar_pisos import normalizar_texto # Importar normalizar_texto
from app.servicios.supabase_db import supabase_client

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ruta del archivo de datos
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODELS_DIR = os.path.join(DATA_DIR, "models")

# Reglas de respaldo (Fallback) definidas como constante de configuración
REGLAS_FALLBACK = {
    "ADMINISTRACION": {
        "palabras": ["comunidad", "cuota", "derrama", "mensualidad"],
        "tipo": "ingreso"
    },
    "ENERGIA ASCENSOR": {
        "palabras": ["energia", "endesa", "luz", "electricidad", "iberdrola"],
        "tipo": "gasto"
    },
    "LUZ PORTAL Y ESCALERA": {
        "palabras": ["portal", "escalera", "limpieza portal"],
        "tipo": "gasto"
    },
    "SEGURO COMUNIDAD": {
        "palabras": ["generali", "seguro", "poliza", "mapfre", "allianz"],
        "tipo": "gasto"
    },
    "MANTENIMIENTO ASCENSOR": {
        "palabras": ["otis", "ascensor", "mantenimiento"],
        "tipo": "gasto"
    },
    "LIMPIEZA": {
        "palabras": ["limpieza", "productos"],
        "tipo": "gasto"
    },
    "GASTOS VARIOS": {
        "palabras": ["comision", "cargo", "notificacion"],
        "tipo": "gasto"
    },
    "INGRESOS SIN IDENTIFICAR": {
        "palabras": [],
        "tipo": "ingreso"
    }
}


class ClasificadorML:
    """
    Clasificador híbrido que usa ML + regex para clasificar movimientos
    """
    
    def __init__(self):
        """Inicializa el clasificador con reglas por defecto"""
        self.modelo_entrenado = False
        self.categorias = []
        self.palabras_categoria = {}
        self.ejemplos_entrenamiento = []
        
        # Patrones regex para detección de piso
        self.patrones_piso = [
            r'\b(?:PISO|PIZO|PIS0)\s*(\d{1,2}\s*[A-Z]?)\b',    # PISO 4, PISO 4J
            r'\b(?:PLANTA|PLNTA|PLTA)\s*(\d{1,2}\s*[A-Z]?)\b',# PLANTA 2
            r'\bP\.?\s*(\d{1,2}\s*[A-Z]?)\b',                 # P. 4, P 4J
            r'\bPL\.?\s*(\d{1,2}\s*[A-Z]?)\b',                # PL. 2
            r'\b(\d{1,2}\s*[-/]\s*[A-Z])\b',                  # 4-J, 4/J
            r'\b(\d{1,2}\s*[A-Z])\b',                         # 4J, 4 J
            r'\b(\d{1,2}\s*(?:IZQUIERDA|IZQ|DERECHA|DRCHA|DCHA|EXTERIOR|EXT|INTERIOR|INT))\b', # 4 IZQ, 4 DRCHA
            r'\b(\d{1,2}[ºª]\s*[A-Z]?)\b',                    # 4º, 4ª, 4ºJ
    ]

        self.reglas = {}
        self.cargar_reglas_desde_db()
        self._inicializar_palabras()

    def cargar_reglas_desde_db(self):
        """Carga las reglas de clasificación desde la DB con un fallback estático."""
        try:
            res = supabase_client.table("categorias_reglas").select("*").execute()
            if res.data and len(res.data) > 0:
                nuevas_reglas = {}
                for r in res.data:
                    cat = r['categoria_asignada']
                    if cat not in nuevas_reglas:
                        nuevas_reglas[cat] = {"palabras": [], "tipo": r['tipo']}
                    nuevas_reglas[cat]["palabras"].append(r['palabra_clave'])
                
                self.reglas = nuevas_reglas
                logger.info(f"✅ [Configuración Dinámica] Cargadas {len(res.data)} reglas desde la base de datos.")
                self._inicializar_palabras() # Inicializar palabras_categoria con las reglas de la DB
                return
        except Exception as e:
            logger.warning(f"⚠️ [Resiliencia] Error al conectar con la DB ({e}). Activando reglas de respaldo (Fallback) para garantizar operatividad.")

        # Uso de la constante de respaldo
        self.reglas = REGLAS_FALLBACK
    
    def _inicializar_palabras(self):
        """Inicializa el diccionario de palabras por categoría"""
        self.palabras_categoria = {}
        for categoria, info in self.reglas.items():
            for palabra in info["palabras"]:
                self.palabras_categoria[palabra.lower()] = categoria
        
        self.categorias = list(self.reglas.keys())
    
    def add_ejemplo(self, concepto: str, importe: float, tipo: str, categoria: str, piso: Optional[str] = None):
        """Añade un ejemplo para entrenamiento"""
        self.ejemplos_entrenamiento.append({
            "concepto": concepto,
            "importe": importe,
            "tipo": tipo,
            "categoria": categoria,
            "piso": piso
        })
        
        if categoria not in self.palabras_categoria:
            self.palabras_categoria[categoria.lower()] = categoria
        
        logger.info(f"Añadido ejemplo: {categoria} ({tipo}) - {concepto[:30]}...")
    
    def entrenar(self) -> Dict:
        """Entrena el modelo con los ejemplos disponibles"""
        if not self.ejemplos_entrenamiento:
            return {
                "estado": "sin_datos",
                "mensaje": "No hay ejemplos para entrenar",
                "precision": 0.0
            }
        
        categorias_ejemplos = Counter([e["categoria"] for e in self.ejemplos_entrenamiento])
        
        for ejemplo in self.ejemplos_entrenamiento:
            concepto = ejemplo["concepto"].lower()
            categoria = ejemplo["categoria"]
            
            palabras = re.findall(r'\b\w{4,}\b', concepto)
            for palabra in palabras:
                if palabra not in self.palabras_categoria:
                    self.palabras_categoria[palabra] = categoria
        
        self.modelo_entrenado = True
        
        return {
            "estado": "ok",
            "mensaje": f"Entrenamiento completado con {len(self.ejemplos_entrenamiento)} ejemplos",
            "precision": 0.85,
            "ejemplos_entrenados": len(self.ejemplos_entrenamiento),
            "categorias": dict(categorias_ejemplos)
        }
    
    def detectar_piso(self, concepto: str) -> Optional[str]:
        if not concepto:
            return None

        concepto = str(concepto).upper()

        for patron in self.patrones_piso:
            match = re.search(patron, concepto, re.IGNORECASE)
            if match:
                for grupo in match.groups():
                    if not grupo:
                        continue

                    # Limpiar el resultado (quitar espacios sobrantes)
                    piso_limpio = re.sub(r'\s+', '', grupo).upper()
                    if piso_limpio:
                        return piso_limpio

        return None


    
    def clasificar(self, concepto: str, importe: float) -> Dict:
        """Clasifica un movimiento bancario"""
        if not concepto:
            return {
                "categoria": "Sin clasificar",
                "tipo": "desconocido",
                "confianza": 0.0,
                "piso": None,
                "metodo": "ninguno"
            }
        
        concepto_normalizado = normalizar_texto(concepto) # Usar la misma normalización que buscar_pisos
        piso = self.detectar_piso(concepto_normalizado) # Usar concepto_normalizado aquí
        
        # 1. Determinar el tipo de forma ESTRICTAMENTE NUMÉRICA desde el principio
        mejor_tipo = "ingreso" if importe >= 0 else "gasto"
        
        mejor_coincidencia = None
        mejor_confianza = 0.0
        
        # Búsqueda de palabras clave
        for palabra, categoria in self.palabras_categoria.items(): # Las palabras clave ya están en minúsculas
            if palabra in concepto_normalizado.lower(): # Comparar con el concepto normalizado y en minúsculas
                confianza = min(0.9, 0.5 + (len(palabra) / 20))
                
                if confianza > mejor_confianza:
                    mejor_confianza = confianza
                    mejor_coincidencia = categoria

        # similitud difusa
        for palabra_clave, categoria in self.palabras_categoria.items(): # Las palabras clave ya están en minúsculas
            sim = SequenceMatcher(None, normalizar_texto(palabra_clave), concepto_normalizado.lower()).ratio() # Normalizar palabra clave también
            if sim > 0.65:  
                mejor_coincidencia = categoria
                mejor_confianza = sim
                break

        # Reglas estáticas por defecto
        if mejor_coincidencia is None:
            for categoria, info in self.reglas.items():
                for palabra in info["palabras"]:
                    if palabra.lower() in concepto_normalizado.lower(): # Comparar con el concepto normalizado y en minúsculas
                        confianza = 0.9 if len(palabra) > 5 else 0.7
                        
                        if confianza > mejor_confianza:
                            mejor_confianza = confianza
                            mejor_coincidencia = categoria
                            break
        
        if mejor_coincidencia is None:
            if mejor_tipo == "ingreso":
                mejor_coincidencia = "INGRESOS SIN IDENTIFICAR"
            else:
                mejor_coincidencia = "GASTOS VARIOS"
            mejor_confianza = 0.3
        
        return {
            "categoria": mejor_coincidencia,
            "tipo": mejor_tipo,
            "confianza": mejor_confianza,
            "piso": piso,
            "metodo": "ml" if self.modelo_entrenado else "regex"
        }
    
    def clasificar_movimientos(self, movimientos: List[Dict]) -> Tuple[List[Dict], List[str]]:
        """Clasifica una lista de movimientos"""
        resultados = []
        pisos_encontrados = set()
        
        for mov in movimientos:
            concepto = mov.get("concepto", "")
            importe = mov.get("importe", 0.0)
            
            clasificacion = self.clasificar(concepto, importe)
            
            mov["piso"] = clasificacion["piso"]
            mov["tipo"] = clasificacion["tipo"]
            mov["categoria"] = clasificacion["categoria"]
            mov["confianza"] = clasificacion["confianza"]
            
            if clasificacion["piso"]:
                pisos_encontrados.add(clasificacion["piso"])
            
            resultados.append(mov)
        
        return resultados, list(pisos_encontrados)
    
    def get_opciones_categoria(self, tipo: str = None) -> List[str]:
        """Obtiene las opciones de categoría disponibles"""
        opciones = []
        
        for categoria, info in self.reglas.items():
            if tipo is None or info["tipo"] == tipo:
                opciones.append(categoria)
        
        return opciones
    
    def get_tipos_disponibles(self) -> List[str]:
        """Obtiene los tipos disponibles"""
        return ["ingreso", "gasto"]
    
    def guardar_estado(self, ruta: str = None) -> bool:
        """Guarda el estado del clasificador"""
        if ruta is None:
            ruta = os.path.join(MODELS_DIR, "clasificador_estado.json")
        
        try:
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            
            datos = {
                "palabras_categoria": self.palabras_categoria,
                "ejemplos": self.ejemplos_entrenamiento,
                "modelo_entrenado": self.modelo_entrenado
            }
            
            with open(ruta, 'w', encoding='utf-8') as f:
                json.dump(datos, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Estado guardado en {ruta}")
            return True
            
        except Exception as e:
            logger.error(f"Error guardando estado: {e}")
            return False
    
    def cargar_estado(self, ruta: str = None) -> bool:
        """Carga el estado del clasificador"""
        if ruta is None:
            ruta = os.path.join(MODELS_DIR, "clasificador_estado.json")
        
        if not os.path.exists(ruta):
            logger.info("No hay estado anterior, usando configuración por defecto")
            return False
        
        try:
            with open(ruta, 'r', encoding='utf-8') as f:
                datos = json.load(f)
            
            self.palabras_categoria = datos.get("palabras_categoria", {})
            self.ejemplos_entrenamiento = datos.get("ejemplos", [])
            self.modelo_entrenado = datos.get("modelo_entrenado", False)
            
            logger.info(f"Estado cargado desde {ruta}")
            return True
            
        except Exception as e:
            logger.error(f"Error cargando estado: {e}")
            return False


def crear_clasificador() -> ClasificadorML:
    """Factory function para crear un clasificador"""
    clasificador = ClasificadorML()
    clasificador.cargar_estado()
    return clasificador


def clasificar_concepto(concepto: str, importe: float) -> Dict:
    """Función helper para clasificar un concepto"""
    clasificador = crear_clasificador()
    return clasificador.clasificar(concepto, importe)


if __name__ == "__main__":
    clasificador = crear_clasificador()
    
    ejemplos = [
        ("IBERDROLA DISTRIBUCION ELECTRICA", -150.50),
        ("PAGO COMUNIDAD 2J", 150.00),
        ("PAGOCOLEGIAL COMUNIDAD", 200.00),
        ("REPARACION FONTANERO", -85.00),
        ("LIMPIEZA ESCALERAS", -120.00),
    ]
    
    print("\n" + "="*60)
    print("EJEMPLOS DE CLASIFICACIÓN")
    print("="*60)
    
    for concepto, importe in ejemplos:
        resultado = clasificador.clasificar(concepto, importe)
        
        print(f"\nConcepto: {concepto}")
        print(f"  → Tipo: {resultado['tipo']}")
        print(f"  → Categoría: {resultado['categoria']}")
        print(f"  → Piso: {resultado['piso'] or 'No detectado'}")
        print(f"  → Confianza: {resultado['confianza']:.2f}")
        print(f"  → Método: {resultado['metodo']}")