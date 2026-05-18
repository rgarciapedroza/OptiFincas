import io
import base64
import pandas as pd
from fastapi import UploadFile, HTTPException
from app.servicios.supabase_db import supabase_client
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend

# En un entorno real, estas claves deben estar en variables de entorno (.env)
# La clave debe tener exactamente 32 caracteres para AES-256
ENCRYPT_KEY = b'OptiFincasSecretKey2024_Security' 
ENCRYPT_IV = b'OptiFincas_IV_16' # Vector de inicialización (16 bytes)

def encriptar_dato(texto: str, cipher: Cipher) -> str:
    """Encripta un texto usando AES-256-CBC."""
    if not texto or str(texto).lower() == "none":
        print(f"DEBUG: encriptar_dato recibió None o cadena vacía/none para encriptar. Retornando None.")
        return None
    
    # Padding para que el bloque sea múltiplo de 128 bits
    padder = padding.PKCS7(128).padder()
    datos_padded = padder.update(texto.encode('utf-8')) + padder.finalize()
    
    encryptor = cipher.encryptor()
    ct = encryptor.update(datos_padded) + encryptor.finalize()
    
    return base64.b64encode(ct).decode('utf-8')

def importar_censo_pisos_controller(community_id: int, file: UploadFile):
    """
    Importa el censo de propietarios (pisos) desde un Excel.
    Al quitar 'async', FastAPI ejecuta esto en un threadpool, evitando el 504 Gateway Timeout.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos Excel")

    try:
        # Lectura síncrona del archivo
        contenido = file.file.read()
        df = pd.read_excel(io.BytesIO(contenido))
        
        # Normalizar columnas
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        print(f"DEBUG: Columnas normalizadas en DataFrame: {df.columns.tolist()}")

        # Mapeo de columnas basado en la nueva estructura
        col_piso = next((c for c in df.columns if "piso" in c or "codigo" in c or "código" in c), None)
        col_nombre = next((c for c in df.columns if "nombre" in c and "propietario" not in c), None) # 'nombre'
        col_apellidos = next((c for c in df.columns if "apellido" in c), None) # 'apellidos'
        col_email = next((c for c in df.columns if "email" in c or "correo" in c), None) # 'email'
        col_tel1 = next((c for c in df.columns if "teléfono_1" in c or "telefono_1" in c), None) # 'teléfono_1'
        col_tel2 = next((c for c in df.columns if "teléfono_2" in c or "telefono_2" in c), None) # 'teléfono_2'
        col_obs = next((c for c in df.columns if "observaciones" in c or "obs" in c), None) # 'observaciones'
        col_prop_combined = next((c for c in df.columns if "propietario" in c), None)
        col_tel_gen = next((c for c in df.columns if "telefono" in c or "teléfono" in c), None)
        print(f"DEBUG: Columnas detectadas - Piso: {col_piso}, Nombre: {col_nombre}, Apellidos: {col_apellidos}, Email: {col_email}, Tel1: {col_tel1}, Tel2: {col_tel2}, Obs: {col_obs}")

        if not col_piso:
            raise HTTPException(status_code=400, detail="No se encontró la columna de 'Piso' o 'Código'")

        # Pre-creamos el objeto Cipher una sola vez para ganar velocidad
        cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=default_backend())

        # 1. Limpiar censo anterior de esta comunidad para evitar que aparezcan datos antiguos
        try:
            supabase_client.table("pisos").delete().eq("community_id", community_id).execute()
            print(f"Censo antiguo de la comunidad {community_id} eliminado para nueva carga.")
        except Exception as e:
            # Si falla la limpieza, notificamos pero intentamos seguir
            print(f"Aviso al limpiar censo anterior: {e}")

        def limpiar_valor(val):
            if pd.isna(val):
                return None

            s = str(val).strip()
            # Tratamos el guion, el texto "nan" y las cadenas vacías como valores nulos
            return s if s.lower() != "nan" and s != "" and s != "-" else None

        pisos_a_insertar = []
        for _, row in df.iterrows():
            codigo_piso = limpiar_valor(row.get(col_piso))
            if not codigo_piso:
                continue
                
            codigo = codigo_piso.upper()

            # Combinamos Nombre y Apellidos
            nombre = limpiar_valor(row.get(col_nombre)) or ""
            apellidos = limpiar_valor(row.get(col_apellidos)) or ""
            nombre_completo = f"{nombre} {apellidos}".strip()
            
            # Si Nombre/Apellidos están vacíos, probamos con la columna unificada 'propietario'
            if not nombre_completo and col_prop_combined: # Si no se encontró Nombre/Apellidos, usar 'propietario'
                nombre_completo = limpiar_valor(row.get(col_prop_combined)) or ""

            # Debugging: Show values after cleaning, before encryption
            debug_email_val = limpiar_valor(row.get(col_email))
            val_tel1 = limpiar_valor(row.get(col_tel1)) if col_tel1 else None # Valor de Teléfono_1
            val_tel2 = limpiar_valor(row.get(col_tel2)) if col_tel2 else None # Valor de Teléfono_2
            
            # Fallback para el teléfono si solo hay una columna genérica 'telefono'
            if not val_tel1 and not val_tel2 and col_tel_gen:
                val_tel1 = limpiar_valor(row.get(col_tel_gen))

            debug_obs_val = limpiar_valor(row.get(col_obs))
            print(f"DEBUG: Procesando fila - Codigo: {codigo}, Nombre: '{nombre_completo}', Email: '{debug_email_val}', Tel1: '{val_tel1}', Obs: '{debug_obs_val}'")

            # Encriptamos los datos sensibles
            encrypted_propietario = encriptar_dato(nombre_completo, cipher) if nombre_completo else None
            encrypted_email = encriptar_dato(debug_email_val, cipher) if debug_email_val else None
            encrypted_tel1 = encriptar_dato(val_tel1, cipher) if val_tel1 else None
            encrypted_tel2 = encriptar_dato(val_tel2, cipher) if val_tel2 else None
            encrypted_obs = encriptar_dato(debug_obs_val, cipher) if debug_obs_val else None
            print(f"DEBUG: Valores encriptados - Propietario: {encrypted_propietario[:30] if encrypted_propietario else None}..., Email: {encrypted_email[:30] if encrypted_email else None}...")

            pisos_a_insertar.append({
                "community_id": community_id,
                "codigo": codigo,
                # Encriptamos los datos sensibles antes de enviarlos a la base de datos
                "propietario": encrypted_propietario,
                "email": encrypted_email,
                "telefono1": encrypted_tel1,
                "telefono2": encrypted_tel2,
                "observaciones": encrypted_obs,
                "activo": True
            })

        if not pisos_a_insertar:
            return {"status": "warning", "message": "No se encontraron datos válidos"}

        # Insertar en Supabase (usamos upsert por seguridad, aunque ya hayamos borrado)
        # Nota: La tabla 'pisos' debe tener la restricción _piso_comunidad_uc definida.
        response = supabase_client.table("pisos").upsert(
            pisos_a_insertar, 
            on_conflict="community_id,codigo"
        ).execute()

        return {
            "status": "success", 
            "message": f"Se han procesado {len(pisos_a_insertar)} pisos para la comunidad."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando censo: {str(e)}")