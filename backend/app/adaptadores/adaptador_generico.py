import pandas as pd
from .base import AdaptadorBase

class AdaptadorGenerico(AdaptadorBase):
    """
    Adaptador que intenta adivinar las columnas por nombres comunes
    """
    
    def identificar(self, columnas):
        # Siempre intenta como último recurso
        return True
    
    def transformar(self, df):
        df_canonico = pd.DataFrame()
        
        # Intentar encontrar columna de fecha
        col_fecha = None
        for col in df.columns:
            col_lower = col.lower()
            if 'fecha' in col_lower or 'date' in col_lower:
                col_fecha = col
                break
        
        if col_fecha:
            df_canonico["fecha"] = pd.to_datetime(df[col_fecha], dayfirst=True, errors='coerce')
        else:
            df_canonico["fecha"] = pd.NaT
        
        # Intentar encontrar columna de concepto
        col_concepto = None
        for col in df.columns:
            col_lower = col.lower()
            if 'concepto' in col_lower or 'descripcion' in col_lower or 'concept' in col_lower:
                col_concepto = col
                break
        
        if col_concepto:
            df_canonico["concepto_raw"] = df[col_concepto].fillna("").astype(str)
        else:
            # Si no hay columna de concepto, usar la primera columna de texto
            for col in df.columns:
                if df[col].dtype == 'object':
                    df_canonico["concepto_raw"] = df[col].fillna("").astype(str)
                    break
            else:
                df_canonico["concepto_raw"] = ""
        
        df_canonico["concepto_limpio"] = df_canonico["concepto_raw"].apply(self._limpiar_texto)
        
        # Intentar encontrar columna de importe
        col_importe = None
        for col in df.columns:
            col_lower = col.lower()
            if 'importe' in col_lower or 'monto' in col_lower or 'cantidad' in col_lower:
                col_importe = col
                break
        
        if col_importe:
            df_canonico["importe"] = df[col_importe].apply(self._limpiar_importe)
        else:
            # Usar la primera columna numérica
            for col in df.columns:
                if pd.api.types.is_numeric_dtype(df[col]):
                    df_canonico["importe"] = df[col].apply(self._limpiar_importe)
                    break
            else:
                df_canonico["importe"] = 0.0
        
        df_canonico["saldo"] = 0.0
        df_canonico["codigo"] = ""
        df_canonico["oficina"] = ""
        df_canonico["remesa"] = ""
        
        # Eliminar filas sin fecha
        df_canonico = df_canonico.dropna(subset=["fecha"])
        
        return df_canonico