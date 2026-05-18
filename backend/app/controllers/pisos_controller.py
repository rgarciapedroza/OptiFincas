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

def encriptar_dato(texto: str, cipher: Cipher) -> str | None:
    """Encripta un texto usando AES-256-CBC."""
    if not texto or str(texto).lower() in ["none", "nan", ""]:
        return None
    padder = padding.PKCS7(128).padder()
    datos_padded = padder.update(texto.encode('utf-8')) + padder.finalize()
    encryptor = cipher.encryptor()
    ct = encryptor.update(datos_padded) + encryptor.finalize()
    return base64.b64encode(ct).decode('utf-8')

def desencriptar_dato(texto_encriptado: str | None, cipher: Cipher) -> str:
    """Desencripta un texto usando AES-256-CBC."""
    if not texto_encriptado:
        return ""
    try:
        ct = base64.b64decode(texto_encriptado)
        decryptor = cipher.decryptor()
        datos_padded = decryptor.update(ct) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(datos_padded) + unpadder.finalize()).decode('utf-8')
    except Exception as e:
        return texto_encriptado # Retornar el original si falla la desencriptación

def importar_censo_pisos_controller(community_id: int, file: UploadFile, user_id: str = None):
    """
    Importa el censo de propietarios (pisos) desde un Excel.
    """
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos Excel")

    try:
        contenido = file.file.read()
        df = pd.read_excel(io.BytesIO(contenido))
        
        # Normalizar columnas
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        print(f"DEBUG: Columnas normalizadas en DataFrame: {df.columns.tolist()}")

        # Mapeo de columnas basado en la nueva estructura
        col_piso = next((c for c in df.columns if "piso" in c or "codigo" in c), None)
        col_nombre = next((c for c in df.columns if c == "nombre"), None)
        col_apellidos = next((c for c in df.columns if "apellido" in c), None)
        col_email = next((c for c in df.columns if "email" in c or "correo" in c), None)
        col_tel1 = next((c for c in df.columns if "1" in c and ("tel" in c or "movil" in c)), None)
        col_tel2 = next((c for c in df.columns if "2" in c and ("tel" in c or "movil" in c)), None)
        col_obs = next((c for c in df.columns if "observaciones" in c or "obs" in c), None)
        
        col_prop_combined = next((c for c in df.columns if "propietario" in c), None)
        col_tel_gen = next((c for c in df.columns if "telefono" in c or "teléfono" in c), None)
        print(f"DEBUG: Columnas detectadas - Piso: {col_piso}, Nombre: {col_nombre}, Apellidos: {col_apellidos}, Email: {col_email}, Tel1: {col_tel1}, Tel2: {col_tel2}, Obs: {col_obs}")

        if not col_piso:
            raise HTTPException(status_code=400, detail="No se encontró la columna de 'Piso' o 'Código'")

        # Pre-creamos el objeto Cipher una sola vez para ganar velocidad
        cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=default_backend())

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
                "user_id": user_id,
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


# --- Nuevas funciones CRUD para Pisos ---

def get_piso_controller(piso_id: int):
    """Obtiene un piso por su ID y desencripta los datos sensibles."""
    response = supabase_client.table("pisos").select("*").eq("id", piso_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Piso no encontrado")

    cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=default_backend())
    piso = response.data
    piso["propietario"] = desencriptar_dato(piso["propietario"], cipher)
    piso["email"] = desencriptar_dato(piso["email"], cipher)
    piso["telefono1"] = desencriptar_dato(piso["telefono1"], cipher)
    piso["telefono2"] = desencriptar_dato(piso["telefono2"], cipher)
    piso["observaciones"] = desencriptar_dato(piso["observaciones"], cipher)
    return piso

def create_piso_controller(piso_data: dict, user_id: str = None):
    """Crea un nuevo piso, encriptando los datos sensibles."""
    cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=default_backend())
    if user_id: piso_data["user_id"] = user_id
    
    for field in ["propietario", "email", "telefono1", "telefono2", "observaciones"]:
        if field in piso_data and piso_data[field]:
            piso_data[field] = encriptar_dato(piso_data[field], cipher)

    response = supabase_client.table("pisos").insert(piso_data).execute()
    if response.data:
        return response.data[0]
    raise HTTPException(status_code=500, detail="Error al crear el piso")

def update_piso_controller(piso_id: int, piso_data: dict, user_id: str = None):
    """Actualiza un piso existente."""
    cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=default_backend())
    
    updates = {}
    for field in ["propietario", "email", "telefono1", "telefono2", "observaciones"]:
        if field in piso_data:
            updates[field] = encriptar_dato(str(piso_data[field]), cipher) if piso_data[field] else None
            
    if "codigo" in piso_data:
        updates["codigo"] = str(piso_data["codigo"]).upper()

    # Primero verificamos si el piso existe y a quién pertenece
    existing = supabase_client.table("pisos").select("user_id").eq("id", piso_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Piso no encontrado")
    
    # Si el piso tiene un user_id y no coincide con el actual, prohibido
    if existing.data.get("user_id") and existing.data["user_id"] != user_id:
         raise HTTPException(status_code=403, detail="No tienes permiso para editar este piso")

    # Si el registro no tiene user_id (dato huérfano), lo asignamos al usuario que lo edita
    if not existing.data.get("user_id") and user_id:
        updates["user_id"] = user_id

    query = supabase_client.table("pisos").update(updates).eq("id", piso_id)
    response = query.execute()

    if response.data:
        updated = response.data[0]
        for field in ["propietario", "email", "telefono1", "telefono2", "observaciones"]:
            updated[field] = desencriptar_dato(updated.get(field), cipher)
        return updated
    raise HTTPException(status_code=403, detail="No tienes permiso para editar este piso")

def delete_piso_controller(piso_id: int, user_id: str = None):
    """Elimina un piso por su ID verificado por user_id."""
    # Verificación similar para permitir borrar si no tiene dueño o es el dueño
    existing = supabase_client.table("pisos").select("user_id").eq("id", piso_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Piso no encontrado")
        
    if existing.data.get("user_id") and existing.data["user_id"] != user_id:
         raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este piso")

    query = supabase_client.table("pisos").delete().eq("id", piso_id)
    response = query.execute()

    if response.data:
        return {"status": "success", "message": "Piso eliminado correctamente"}
    raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este piso o no existe")

def borrar_censo_comunidad_controller(community_id: int):
    """Elimina todos los pisos de una comunidad específica."""
    response = supabase_client.table("pisos").delete().eq("community_id", community_id).execute()
    return {"status": "success", "message": f"Se han eliminado {len(response.data)} registros del censo."}