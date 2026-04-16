from abc import ABC, abstractmethod
import pandas as pd
import re

class AdaptadorBase(ABC):
    """Clase base para todos los adaptadores de bancos"""
    
    @abstractmethod
    def identificar(self, columnas):
        """Comprueba si este adaptador puede procesar el archivo"""
        pass
    
    @abstractmethod
    def transformar(self, df):
        """Convierte del formato origen al canónico"""
        pass
    
    def _limpiar_texto(self, texto):
        """Limpia problemas de codificación y normaliza"""
        if not isinstance(texto, str):
            return ""
        
        # Reemplazar problemas comunes de codificación española
        reemplazos = {
            "Ã³": "ó", "Ã©": "é", "Ã±": "ñ", "Ã¡": "á",
            "Ãº": "ú", "Ã": "í", "Ã¼": "ü", "Â": "",
            "Ã‘": "Ñ", "Ã“": "Ó", "Ã‰": "É", "Ã": "Í",
            "CÃ³digo": "Código", "NÃºmero": "Número",
            "Ã€": "À", "Ã§": "ç", "Ã¨": "è"
        }
        for mal, bien in reemplazos.items():
            texto = texto.replace(mal, bien)
        
        # Eliminar caracteres no imprimibles
        texto = re.sub(r'[^\x20-\x7E\xC0-\xFF\u00E0-\u00FC]', ' ', texto)
        
        # Eliminar múltiples espacios
        texto = re.sub(r'\s+', ' ', texto)
        
        return texto.strip()
    
    def _limpiar_importe(self, valor):
        """Convierte un importe a float manejando comas y puntos"""
        if pd.isna(valor):
            return 0.0
        
        if isinstance(valor, (int, float)):
            return float(valor)
        
        valor_str = str(valor).strip()
        
        # Manejar formato español (1.234,56)
        if ',' in valor_str and '.' in valor_str:
            # Si tiene ambos, el punto es miles y la coma es decimal
            valor_str = valor_str.replace('.', '').replace(',', '.')
        elif ',' in valor_str:
            # Solo coma: puede ser decimal español
            # Verificar si es un decimal (tiene 2 dígitos después de la coma)
            partes = valor_str.split(',')
            if len(partes) == 2 and len(partes[1]) <= 2:
                valor_str = valor_str.replace(',', '.')
            else:
                # Es separador de miles
                valor_str = valor_str.replace(',', '')
        
        # Eliminar símbolos de moneda
        valor_str = re.sub(r'[€$£]', '', valor_str)
        # Eliminar espacios
        valor_str = valor_str.strip()
        
        try:
            return float(valor_str)
        except:
            return 0.0