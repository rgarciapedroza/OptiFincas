import io
import logging
import pandas as pd
from fastapi import UploadFile, HTTPException
from app.servicios.supabase_db import supabase_client, supabase_service_role_client
from .security import encriptar_dato, desencriptar_dato

logger = logging.getLogger(__name__)

def buscar_piso_por_email_controller(email: str):
    """Busca un piso por email para el portal del propietario."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    try:
        response = client.table("pisos").select("*, comunidades(*)").ilike("email", email.strip()).execute()
        
        if not response.data:
            return []
            
        for piso in response.data:
            piso["propietario"] = desencriptar_dato(piso.get("propietario"))
            piso["telefono1"] = desencriptar_dato(piso.get("telefono1"))
            piso["telefono2"] = desencriptar_dato(piso.get("telefono2"))
            piso["observaciones"] = desencriptar_dato(piso.get("observaciones"))
            
        return response.data
    except Exception as e:
        logger.error(f"Error en buscar_piso_por_email_controller: {e}")
        raise HTTPException(status_code=500, detail="Error al buscar información del propietario")

def importar_censo_pisos_controller(community_id: int, file: UploadFile, user_id: str = None):
    """Importa el censo de propietarios desde Excel."""
    if not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Solo se admiten archivos Excel")

    try:
        contenido = file.file.read()
        df = pd.read_excel(io.BytesIO(contenido))
        df.columns = [str(c).strip().lower() for c in df.columns]

        col_piso = next((c for c in df.columns if "piso" in c or "codigo" in c), None)
        col_nombre = next((c for c in df.columns if c == "nombre"), None)
        col_apellidos = next((c for c in df.columns if "apellido" in c), None)
        col_email = next((c for c in df.columns if "email" in c or "correo" in c), None)
        col_tel1 = next((c for c in df.columns if "1" in c and ("tel" in c or "movil" in c)), None)
        col_tel2 = next((c for c in df.columns if "2" in c and ("tel" in c or "movil" in c)), None)
        col_obs = next((c for c in df.columns if "observaciones" in c or "obs" in c), None)
        col_prop_combined = next((c for c in df.columns if "propietario" in c), None)
        col_tel_gen = next((c for c in df.columns if "telefono" in c or "teléfono" in c), None)

        if not col_piso:
            raise HTTPException(status_code=400, detail="No se encontró la columna de 'Piso' o 'Código'")

        def limpiar_valor(val):
            if pd.isna(val):
                return None
            s = str(val).strip()
            return s if s.lower() != "nan" and s != "" and s != "-" else None

        pisos_a_insertar = []
        for _, row in df.iterrows():
            codigo_piso = limpiar_valor(row.get(col_piso))
            if not codigo_piso:
                continue
            codigo = codigo_piso.upper()
            nombre = limpiar_valor(row.get(col_nombre)) or ""
            apellidos = limpiar_valor(row.get(col_apellidos)) or ""
            nombre_completo = f"{nombre} {apellidos}".strip()
            
            if not nombre_completo and col_prop_combined:
                nombre_completo = limpiar_valor(row.get(col_prop_combined)) or ""

            debug_email_val = limpiar_valor(row.get(col_email))
            val_tel1 = limpiar_valor(row.get(col_tel1)) if col_tel1 else None
            val_tel2 = limpiar_valor(row.get(col_tel2)) if col_tel2 else None
            
            if not val_tel1 and not val_tel2 and col_tel_gen:
                val_tel1 = limpiar_valor(row.get(col_tel_gen))
            debug_obs_val = limpiar_valor(row.get(col_obs))

            encrypted_propietario = encriptar_dato(nombre_completo) if nombre_completo else None
            encrypted_tel1 = encriptar_dato(val_tel1) if val_tel1 else None
            encrypted_tel2 = encriptar_dato(val_tel2) if val_tel2 else None
            encrypted_obs = encriptar_dato(debug_obs_val) if debug_obs_val else None

            pisos_a_insertar.append({
                "community_id": community_id,
                "codigo": codigo,
                "propietario": encrypted_propietario,
                "email": debug_email_val.strip().lower() if debug_email_val else None,
                "telefono1": encrypted_tel1,
                "telefono2": encrypted_tel2,
                "observaciones": encrypted_obs,
                "user_id": user_id,
                "activo": True
            })

        if not pisos_a_insertar:
            return {"status": "warning", "message": "No se encontraron datos válidos"}

        client = supabase_service_role_client if supabase_service_role_client else supabase_client
        response = client.table("pisos").upsert(
            pisos_a_insertar, 
            on_conflict="community_id,codigo"
        ).execute()

        return {
            "status": "success", 
            "message": f"Se han procesado {len(pisos_a_insertar)} pisos para la comunidad."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error procesando censo: {str(e)}")

# --- CRUD Pisos ---

def get_piso_controller(piso_id: int, user_id: str):
    """Obtiene un piso y desencripta sus datos."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    response = client.table("pisos").select("*, comunidades(id, nombre, cuota_base)").eq("id", piso_id).single().execute()
    if not response.data:
        raise HTTPException(status_code=404, detail="Piso no encontrado")

    piso = response.data

    piso["propietario"] = desencriptar_dato(piso.get("propietario"))
    piso["telefono1"] = desencriptar_dato(piso.get("telefono1"))
    piso["telefono2"] = desencriptar_dato(piso.get("telefono2"))
    piso["observaciones"] = desencriptar_dato(piso.get("observaciones"))

    return piso

def create_piso_controller(piso_data: dict, user_id: str = None):
    """Crea un nuevo piso con datos encriptados."""
    if "extra_fields" in piso_data and isinstance(piso_data["extra_fields"], dict):
        piso_data.update(piso_data.pop("extra_fields"))

    community_id = piso_data.get("community_id") or piso_data.get("communityId")
    codigo = str(piso_data.get("codigo") or "").strip().upper()
    propietario = piso_data.get("propietario")
    email = (piso_data.get("email") or "").lower().strip() or None
    tel1 = piso_data.get("telefono1")
    tel2 = piso_data.get("telefono2")

    if community_id is None:
        raise HTTPException(status_code=400, detail="Error de sistema: No se ha vinculado la comunidad.")
    
    if not codigo:
        raise HTTPException(status_code=400, detail="El campo 'Piso / Código' es obligatorio.")
        
    if not propietario:
        raise HTTPException(status_code=400, detail="El nombre del propietario es obligatorio.")
        
    if not (email or tel1 or tel2):
        raise HTTPException(status_code=400, detail="Debe indicar al menos un medio de contacto (Email o Teléfono).")

    cargo = piso_data.get("cargo")
    if email and cargo and cargo != "Ninguno":
        check = client.table("pisos").select("cargo", "codigo").eq("community_id", community_id).eq("email", email).execute()
        for p in check.data:
            if p.get("cargo") and p.get("cargo") != "Ninguno":
                raise HTTPException(status_code=400, detail=f"Esta persona ya tiene el cargo de {p['cargo']} en el piso {p['codigo']}.")
    
    if cargo and cargo != "Ninguno":
        existing_cargo_holder = client.table("pisos") \
            .select("codigo") \
            .eq("community_id", community_id) \
            .eq("cargo", cargo) \
            .maybe_single() \
            .execute()
        if existing_cargo_holder.data:
            raise HTTPException(status_code=400, detail=f"Ya existe un '{cargo}' en el piso {existing_cargo_holder.data['codigo']} de esta comunidad. Solo puede haber uno de cada cargo.")

    datos_a_insertar = {
        "community_id": community_id,
        "codigo": codigo,
        "propietario": encriptar_dato(str(propietario)),
        "email": email,
        "telefono1": encriptar_dato(str(tel1)) if tel1 else None,
        "telefono2": encriptar_dato(str(tel2)) if tel2 else None,
        "observaciones": encriptar_dato(str(piso_data.get("observaciones"))) if piso_data.get("observaciones") else None,
        "user_id": user_id,
        "activo": piso_data.get("activo", True),
        "cargo": piso_data.get("cargo")
    }

    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    response = client.table("pisos").insert(datos_a_insertar).execute()
    
    if response.data:
        if email:
            target_email = email.lower().strip()
            profile_res = client.table("profiles").select("id").eq("email", target_email).maybe_single().execute()
            if profile_res.data:
                client.table("profiles").update({
                    "full_name": propietario,
                    "phone1": tel1,
                    "phone2": tel2
                }).eq("id", profile_res.data["id"]).execute()
                logger.info(f"Perfil sincronizado tras creación de piso para {email}")

        return response.data[0]
    raise HTTPException(status_code=500, detail="Error al crear el piso")

def update_piso_controller(piso_id: int, piso_data: dict, user_id: str = None):
    """Actualiza un piso existente y sincroniza el perfil."""
    if "extra_fields" in piso_data and isinstance(piso_data["extra_fields"], dict):
        piso_data = {**piso_data, **piso_data["extra_fields"]}

    updates = {}
    for field in ["propietario", "telefono1", "telefono2", "observaciones"]:
        if field in piso_data:
            updates[field] = encriptar_dato(str(piso_data[field])) if piso_data[field] else None
            
    if "codigo" in piso_data:
        updates["codigo"] = str(piso_data["codigo"]).upper()
    if "email" in piso_data:
        updates["email"] = piso_data["email"].lower().strip() if piso_data["email"] else None
    if "cargo" in piso_data:
        new_cargo = piso_data["cargo"]
        if new_cargo and new_cargo != "Ninguno":
            client = supabase_service_role_client if supabase_service_role_client else supabase_client
            curr_piso_res = client.table("pisos").select("community_id, email").eq("id", piso_id).single().execute()
            if not curr_piso_res.data:
                raise HTTPException(status_code=404, detail="Piso no encontrado para validación de cargo.")
            
            target_cid = curr_piso_res.data.get("community_id")
            target_email = updates.get("email", curr_piso_res.data.get("email"))

            if target_email and target_cid:
                check_person_cargo = client.table("pisos").select("id, cargo, codigo") \
                    .eq("community_id", target_cid) \
                    .eq("email", target_email) \
                    .neq("id", piso_id) \
                    .not_.is_("cargo", None) \
                    .not_.eq("cargo", "Ninguno") \
                    .execute()
                if check_person_cargo.data:
                    raise HTTPException(status_code=400, detail=f"Esta persona ya tiene el cargo de {check_person_cargo.data[0]['cargo']} en el piso {check_person_cargo.data[0]['codigo']}. Solo se permite un cargo por persona.")

            existing_cargo_holder_type = client.table("pisos") \
                .select("codigo") \
                .eq("community_id", target_cid) \
                .eq("cargo", new_cargo) \
                .neq("id", piso_id) \
                .maybe_single() \
                .execute()
            if existing_cargo_holder_type and existing_cargo_holder_type.data:
                raise HTTPException(status_code=400, detail=f"Ya existe un '{new_cargo}' en el piso {existing_cargo_holder_type.data['codigo']} de esta comunidad. Solo puede haber uno de cada cargo.")

        updates["cargo"] = piso_data["cargo"]

    client = supabase_service_role_client if supabase_service_role_client else supabase_client

    existing = client.table("pisos").select("id").eq("id", piso_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Piso no encontrado")
    
    if user_id:
        updates["user_id"] = user_id

    query = client.table("pisos").update(updates).eq("id", piso_id)
    response = query.execute()

    if response.data:
        updated = response.data[0]
        target_email = updated.get("email") or piso_data.get("email")
        if target_email:
            profile_res = client.table("profiles").select("id").eq("email", target_email).maybe_single().execute()
            if profile_res and getattr(profile_res, "data", None):
                profile_updates = {
                    "full_name": desencriptar_dato(updated.get("propietario")),
                    "phone1": desencriptar_dato(updated.get("telefono1")),
                    "phone2": desencriptar_dato(updated.get("telefono2"))
                }
                client.table("profiles").update(profile_updates).eq("id", profile_res.data["id"]).execute()
                logger.info(f"Perfil sincronizado tras actualización de censo para {target_email}")

        for field in ["propietario", "telefono1", "telefono2", "observaciones"]:
            updated[field] = desencriptar_dato(updated.get(field))
        return updated
    raise HTTPException(status_code=403, detail="No tienes permiso para editar este piso")

def delete_piso_controller(piso_id: int, user_id: str = None):
    """Elimina un piso de la base de datos."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    existing = client.table("pisos").select("id").eq("id", piso_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Piso no encontrado")

    query = client.table("pisos").delete().eq("id", piso_id)
    response = query.execute()

    if response.data:
        return {"status": "success", "message": "Piso eliminado correctamente"}
    raise HTTPException(status_code=403, detail="No tienes permiso para eliminar este piso o no existe")

def borrar_censo_comunidad_controller(community_id: int):
    """Elimina todos los pisos de una comunidad específica."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    response = client.table("pisos").delete().eq("community_id", community_id).execute()
    return {"status": "success", "message": f"Se han eliminado {len(response.data)} registros del censo."}

def get_pisos_by_community_controller(community_id: int):
    """Obtiene todos los pisos de una comunidad y desencripta los datos, incluyendo info de perfil."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client
    
    response = client.table("pisos").select("*").eq("community_id", community_id).order("codigo").execute()
    
    if not response.data:
        return []
    pisos_data = response.data
    
    unique_emails = {piso["email"].lower().strip() for piso in pisos_data if piso.get("email")}
    
    profiles_map = {}
    if unique_emails:
        profiles_res = client.table("profiles").select("email, full_name, avatar_url").in_("email", list(unique_emails)).execute()
        if profiles_res.data:
            profiles_map = {profile["email"].lower().strip(): profile for profile in profiles_res.data}

    for piso in pisos_data:
        piso["propietario"] = desencriptar_dato(piso.get("propietario"))
        piso["telefono1"] = desencriptar_dato(piso.get("telefono1"))
        piso["telefono2"] = desencriptar_dato(piso.get("telefono2"))
        piso["observaciones"] = desencriptar_dato(piso.get("observaciones"))
        
        if piso.get("email") and piso["email"].lower().strip() in profiles_map:
            profile_info = profiles_map[piso["email"].lower().strip()]
            piso["profile_full_name"] = profile_info.get("full_name")
            piso["profile_avatar_url"] = profile_info.get("avatar_url")
        else:
            piso["profile_full_name"] = None
            piso["profile_avatar_url"] = None
            
    return pisos_data

async def sync_pisos_from_profile_controller(user_id: str, full_name: str, phone1: str, phone2: str):
    """Sincroniza cambios del perfil hacia la tabla de pisos."""
    client = supabase_service_role_client if supabase_service_role_client else supabase_client

    profile_res = client.table("profiles").select("email").eq("id", user_id).single().execute()
    if not profile_res.data:
        raise HTTPException(status_code=404, detail="Perfil no encontrado")
    
    email = profile_res.data.get("email").lower().strip()
    
    updates = {}
    if full_name:
        updates["propietario"] = encriptar_dato(full_name)
    if phone1 is not None:
        updates["telefono1"] = encriptar_dato(phone1)
    if phone2 is not None:
        updates["telefono2"] = encriptar_dato(phone2)
    
    if not updates:
        return {"status": "info", "message": "No hay datos de contacto para sincronizar"}

    response = client.table("pisos").update(updates).eq("email", email).execute()
    return {"status": "success", "message": f"Se han actualizado {len(response.data)} propiedades vinculadas a su perfil."}