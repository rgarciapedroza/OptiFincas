import pandas as pd
import re
from .base import AdaptadorBase

class AdaptadorBBVA(AdaptadorBase):
    """
    Adaptador específico para extractos de BBVA
    
    Formato esperado:
    Fecha Proceso, Fecha Valor, Código, Concepto, Observaciones, Oficina, Importe, Saldo, Remesa
    """
    
    def identificar(self, columnas):
        """Comprueba si las columnas coinciden con el formato BBVA"""
        # Limpiar nombres de columnas (eliminar problemas de codificación)
        columnas_limpias = [self._limpiar_texto(col) for col in columnas]
        
        # Columnas típicas de BBVA
        columnas_bbva = ["Fecha Proceso", "Fecha Valor", "Código", "Concepto", 
                         "Observaciones", "Oficina", "Importe", "Saldo", "Remesa"]
        
        # Verificar si al menos 5 columnas coinciden
        coincidencias = sum(1 for col_limpia in columnas_limpias 
                           for col_bbva in columnas_bbva 
                           if col_bbva.lower() in col_limpia.lower())
        
        return coincidencias >= 4
    
    def transformar(self, df):
        """Convierte el extracto BBVA al formato canónico"""
        # Limpiar nombres de columnas primero
        df.columns = [self._limpiar_texto(col) for col in df.columns]
        
        df_canonico = pd.DataFrame()
        
        # Fecha de operación (usar Fecha Proceso)
        if "Fecha Proceso" in df.columns:
            df_canonico["fecha"] = pd.to_datetime(df["Fecha Proceso"], dayfirst=True, errors='coerce')
        elif "Fecha Valor" in df.columns:
            df_canonico["fecha"] = pd.to_datetime(df["Fecha Valor"], dayfirst=True, errors='coerce')
        else:
            df_canonico["fecha"] = pd.NaT
        
        # Concepto: combinar Concepto + Observaciones para tener información completa
        concepto_parts = []
        
        if "Concepto" in df.columns:
            concepto_parts.append(df["Concepto"].fillna("").astype(str))
        if "Observaciones" in df.columns:
            concepto_parts.append(df["Observaciones"].fillna("").astype(str))
        
        if concepto_parts:
            df_canonico["concepto_raw"] = concepto_parts[0]
            for part in concepto_parts[1:]:
                df_canonico["concepto_raw"] = df_canonico["concepto_raw"] + " " + part
        else:
            df_canonico["concepto_raw"] = ""
        
        # Limpiar concepto (eliminar códigos extraños)
        df_canonico["concepto_limpio"] = df_canonico["concepto_raw"].apply(self._limpiar_concepto_bbva)
        
        # Importe
        if "Importe" in df.columns:
            df_canonico["importe"] = df["Importe"].apply(self._limpiar_importe)
        else:
            df_canonico["importe"] = 0.0
        
        # Saldo
        if "Saldo" in df.columns:
            df_canonico["saldo"] = df["Saldo"].apply(self._limpiar_importe)
        else:
            df_canonico["saldo"] = 0.0
        
        # Información adicional
        df_canonico["codigo"] = df.get("Código", "").fillna("").astype(str)
        df_canonico["oficina"] = df.get("Oficina", "").fillna("").astype(str)
        df_canonico["remesa"] = df.get("Remesa", "").fillna("").astype(str)
        
        # Eliminar filas con fechas nulas
        df_canonico = df_canonico.dropna(subset=["fecha"])
        
        return df_canonico
    
    def _limpiar_concepto_bbva(self, texto):
        """Limpia específicamente los conceptos de BBVA"""
        if not isinstance(texto, str):
            return ""
        
        # Limpiar primero la codificación
        texto = self._limpiar_texto(texto)
        
        # Eliminar números de referencia largos (como N 2026058000097569)
        texto = re.sub(r'N\s+\d+', '', texto)
        
        # Eliminar códigos como ES0182140000067113648247
        texto = re.sub(r'ES\d+', '', texto)
        
        # Eliminar múltiples espacios
        texto = re.sub(r'\s+', ' ', texto).strip()
        
        return texto