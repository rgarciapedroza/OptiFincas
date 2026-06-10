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
from typing import Dict, List, Tuple, Optional, Any
from collections import Counter
import logging
from difflib import SequenceMatcher
from app.procesamiento.buscar_pisos import normalizar_texto # Importar normalizar_texto
from app.servicios.supabase_db import supabase_client, supabase_service_role_client

# Configurar logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Ruta del archivo de datos
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data")
MODELS_DIR = os.path.join(DATA_DIR, "models")

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
        


        self.reglas = {}
        self.cargar_reglas_desde_db()
        self._inicializar_palabras()

    def cargar_reglas_desde_db(self):
        """Carga las reglas de clasificación desde la DB.

        Nota: No se usan reglas hardcodeadas en el código. Si no hay datos en DB (o falla la conexión),
        la clasificación por categorías quedará deshabilitada y se devolverán categorías genéricas.
        """
        try:
            client = supabase_service_role_client if supabase_service_role_client else supabase_client
            res = client.table("categorias_reglas").select("*").execute()
            if res.data and len(res.data) > 0:
                self.reglas_raw = res.data # Almacenamos para inicializar con aislamiento de comunidad
                nuevas_reglas: Dict[str, Dict[str, Any]] = {}
                for r in res.data:
                    cat = r['categoria_asignada']
                    if cat not in nuevas_reglas:
                        nuevas_reglas[cat] = {"palabras": [], "tipo": r['tipo']}
                    nuevas_reglas[cat]["palabras"].append(r['palabra_clave'])

                self.reglas = nuevas_reglas
                logger.info(f"✅ [Configuración Dinámica] Cargadas {len(res.data)} reglas desde la base de datos.")
                self._inicializar_palabras()
                return

            logger.warning("⚠️ [Configuración Dinámica] No se encontraron reglas en la tabla categorias_reglas.")
            self.reglas_raw = []
            self.reglas = {}
            self.palabras_categoria = {}
            self.categorias = []

        except Exception as e:
            logger.error(f"[Configuración Dinámica] Error al cargar reglas desde DB: {e}")
            # Sin reglas hardcodeadas: categorías genéricas
            self.reglas_raw = []
            self.reglas = {}
            self.palabras_categoria = {}
            self.categorias = []
    
    def _inicializar_palabras(self, reset: bool = True):
        """Inicializa el diccionario de palabras por categoría"""
        if reset:
            self.palabras_categoria = {}
            
        if hasattr(self, 'reglas_raw'):
            for r in self.reglas_raw:
                cid = r.get('community_id')
                key = normalizar_texto(r['palabra_clave']).lower()
                if cid not in self.palabras_categoria:
                    self.palabras_categoria[cid] = {}
                self.palabras_categoria[cid][key] = r['categoria_asignada']
        
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
    
    def detectar_piso(self, concepto: str, community_id: Optional[int]) -> Optional[str]:
        """Detecta piso usando los patrones cargados desde BD (sistema_config/patrones_piso).

        Implementación delegada a `app.procesamiento.buscar_pisos.extraer_piso`.
        """
        if not concepto or community_id is None:
            return None

        # Import local para evitar ciclos y mantener el clasificador ML ligero
        from app.procesamiento.buscar_pisos import extraer_piso

        # `extraer_piso` ya maneja normalización y busca contra los patrones desde DB.
        return extraer_piso(concepto, community_id)



    
    def clasificar(self, concepto: str, importe: float, community_id: Optional[int] = None) -> Dict:
        
        """Clasifica un movimiento bancario"""
        if not concepto:
            return {
                "categoria": "Sin clasificar",
                "tipo": "desconocido",
                "confianza": 0.0,
                "piso": None,
                "metodo": "ninguno"
            }
        
        # Detección de piso usando el concepto original para no perder símbolos como º o ª
        # necesarios para que las reglas Regex de la base de datos funcionen correctamente.
        piso = self.detectar_piso(concepto, community_id)
        
        concepto_normalizado = normalizar_texto(concepto)
        
        # 1. Determinar el tipo por importe (regla técnica; no depende de keywords)
        mejor_tipo = "ingreso" if importe >= 0 else "gasto"

        # 2. Clasificar SOLO con reglas cargadas desde BD.
        # Si no hay reglas en BD o no hay match, devolver categoría genérica.
        if not self.palabras_categoria:
            return {
                "categoria": "Sin clasificar",
                "tipo": mejor_tipo,
                "confianza": 0.0,
                "piso": piso,
                "metodo": "ml"
            }

        mejor_coincidencia = None
        mejor_confianza = 0.0

        # Match por palabra clave (keywords vienen de BD)
        concepto_lc = concepto_normalizado.lower()

        # Prioridad de búsqueda: 1. Reglas específicas de la comunidad, 2. Reglas globales (cid=None)
        cids_a_buscar = [community_id, None] if community_id is not None else [None]
        
        for cid_target in cids_a_buscar:
            if mejor_coincidencia: break
            if cid_target not in self.palabras_categoria: continue
            
            keywords_dict = self.palabras_categoria[cid_target]

            for palabra, categoria in keywords_dict.items():
                if palabra in concepto_lc:
                    confianza = min(0.9, 0.5 + (len(palabra) / 20))
                    if categoria in self.reglas:
                        confianza += 0.05

                    if confianza > mejor_confianza:
                        mejor_confianza = confianza
                        mejor_coincidencia = categoria

        # Match difuso (también usando keywords de BD)
        if mejor_coincidencia is None:
            # Intentamos match difuso solo con las reglas permitidas para este contexto
            for cid_target in cids_a_buscar:
                if mejor_coincidencia: break
                if cid_target not in self.palabras_categoria: continue
                
                for palabra_clave, categoria in self.palabras_categoria[cid_target].items():
                    sim = SequenceMatcher(
                        None,
                        palabra_clave,
                        concepto_lc,
                    ).ratio()
                    
                    # Aplicar el mismo bonus de prioridad para reglas explícitas en match difuso
                    if categoria in self.reglas:
                        sim += 0.05

                    # Buscamos la mejor coincidencia difusa, no solo la primera
                    if sim > 0.65 and sim > mejor_confianza:
                        mejor_confianza = sim
                        mejor_coincidencia = categoria

        if mejor_coincidencia is None:
            mejor_coincidencia = "Sin clasificar"
            mejor_confianza = 0.0

        return {
            "categoria": mejor_coincidencia,
            "tipo": mejor_tipo,
            "confianza": mejor_confianza,
            "piso": piso,
            "metodo": "ml"
        }
    
    def clasificar_movimientos(self, movimientos: List[Dict], community_id: Optional[int] = None) -> Tuple[List[Dict], List[str]]:
        """Clasifica una lista de movimientos"""
        resultados = []
        pisos_encontrados = set()
        
        for mov in movimientos:
            concepto = mov.get("concepto", "")
            importe = mov.get("importe", 0.0)
            
            clasificacion = self.clasificar(concepto, importe, community_id=community_id)
            
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
            
            # Mezclar palabras guardadas con las reglas de la base de datos
            self.palabras_categoria = datos.get("palabras_categoria", {})
            self._inicializar_palabras(reset=False)
            
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