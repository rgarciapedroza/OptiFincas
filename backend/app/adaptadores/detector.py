import pandas as pd
import chardet
import os
from .banco_ejemplo import AdaptadorBancoEjemplo
from .adaptador_bbva import AdaptadorBBVA
from .adaptador_generico import AdaptadorGenerico

class DetectorBanco:
    def __init__(self):
        self.adaptadores = []
        self._cargar_adaptadores()
    
    def _cargar_adaptadores(self):
        """Carga todos los adaptadores disponibles"""
        # Adaptadores específicos (ordenados por especificidad)
        self.adaptadores.append(AdaptadorBBVA())      # BBVA primero
        self.adaptadores.append(AdaptadorBancoEjemplo())  # Otro banco ejemplo
        
        # Adaptador genérico (siempre al final como fallback)
        self.adaptadores.append(AdaptadorGenerico())
    
    def _detectar_codificacion(self, ruta_archivo):
        """Detecta la codificación del archivo"""
        with open(ruta_archivo, 'rb') as f:
            raw_data = f.read(10000)
            resultado = chardet.detect(raw_data)
            # Para BBVA suele ser ISO-8859-1 o latin1
            encoding = resultado['encoding'] or 'latin-1'
            if encoding.lower() == 'ascii':
                encoding = 'latin-1'
            return encoding
    
    def _leer_archivo(self, ruta_archivo):
        """Lee el archivo detectando automáticamente el formato"""
        extension = os.path.splitext(ruta_archivo)[1].lower()
        codificacion = self._detectar_codificacion(ruta_archivo)
        
        print(f"📄 Leyendo archivo: {os.path.basename(ruta_archivo)}")
        print(f"🔤 Codificación detectada: {codificacion}")
        
        if extension == '.csv':
            # Probar diferentes separadores
            for sep in [',', ';', '\t']:
                try:
                    df = pd.read_csv(ruta_archivo, encoding=codificacion, sep=sep, nrows=5)
                    if len(df.columns) > 1:
                        df = pd.read_csv(ruta_archivo, encoding=codificacion, sep=sep)
                        print(f"✅ CSV leído con separador: '{sep}'")
                        return df
                except:
                    continue
            
            # Si nada funciona, intentar con encoding diferente
            for enc in ['latin-1', 'utf-8', 'iso-8859-1', 'cp1252']:
                try:
                    df = pd.read_csv(ruta_archivo, encoding=enc)
                    print(f"✅ CSV leído con encoding: {enc}")
                    return df
                except:
                    continue
            
            raise ValueError("No se pudo leer el CSV con ninguna codificación")
        
        elif extension in ['.xls', '.xlsx']:
            return pd.read_excel(ruta_archivo)
        
        else:
            raise ValueError(f"Formato no soportado: {extension}")
    
    def _normalizar_columnas(self, df):
        """Normaliza los nombres de columnas (elimina problemas de codificación)"""
        columnas_normales = []
        for col in df.columns:
            col_limpia = col
            # Reemplazar problemas comunes
            reemplazos = {
                "Ã³": "ó", "Ã©": "é", "Ã±": "ñ", "Ã¡": "á",
                "Ãº": "ú", "Ã": "í", "Ã¼": "ü", "Â": ""
            }
            for mal, bien in reemplazos.items():
                col_limpia = col_limpia.replace(mal, bien)
            columnas_normales.append(col_limpia)
        
        df.columns = columnas_normales
        return df
    
    def procesar_archivo(self, ruta_archivo):
        """Detecta automáticamente el banco y procesa el archivo"""
        try:
            # Leer el archivo
            df = self._leer_archivo(ruta_archivo)
            
            if df is None or len(df) == 0:
                print("❌ No se pudo leer el archivo")
                return None
            
            # Normalizar nombres de columnas
            df = self._normalizar_columnas(df)
            
            print(f"📊 {len(df)} filas encontradas")
            print(f"📋 Columnas: {list(df.columns)}")
            
            # Probar cada adaptador
            for adaptador in self.adaptadores:
                nombre = adaptador.__class__.__name__
                print(f"🔍 Probando adaptador: {nombre}...")
                
                try:
                    if adaptador.identificar(df.columns):
                        print(f"✅ ¡Banco identificado! Usando {nombre}")
                        df_canonico = adaptador.transformar(df)
                        print(f"✅ Transformación completada. {len(df_canonico)} movimientos procesados.")
                        return df_canonico
                    else:
                        print(f"❌ {nombre} no coincide")
                except Exception as e:
                    print(f"⚠️ Error con {nombre}: {str(e)}")
                    continue
            
            print("❌ No se pudo identificar el banco")
            return None
            
        except Exception as e:
            print(f"❌ Error general: {str(e)}")
            return None