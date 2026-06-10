from typing import List, Dict, Any, Optional
from fastapi import HTTPException
from app.servicios.supabase_db import supabase_service_role_client
from app.servicios.extracto_orquestacion import clasificador

async def get_all_category_rules_service() -> List[Dict]:
    """Obtiene todas las reglas de palabras clave para categorías."""
    res = supabase_service_role_client.table("categorias_reglas").select("*").order("categoria_asignada").execute()
    return res.data

async def create_category_rule_service(data: Dict) -> Dict:
    """Inserta una nueva palabra clave asociada a una categoría y tipo."""
    res = supabase_service_role_client.table("categorias_reglas").insert(data).execute()
    return res.data

async def update_category_rule_service(regla_id: int, data: Dict) -> Dict:
    """Actualiza una regla de categoría existente."""
    res = supabase_service_role_client.table("categorias_reglas").update(data).eq("id", regla_id).execute()
    return res.data

async def delete_category_rule_service(regla_id: int, user_id: str):
    """Borra una regla de categoría de la base de datos, si el usuario tiene permisos."""

    # 1. Obtener el perfil del usuario que realiza la solicitud
    profile_res = supabase_service_role_client.table("profiles").select("role, organizacion_id").eq("id", user_id).single().execute()
    user_profile = profile_res.data
    if not user_profile:
        raise HTTPException(status_code=403, detail="Usuario no autorizado.")

    user_role = user_profile["role"]
    user_org_id = user_profile.get("organizacion_id")

    # 2. Obtener la regla de categoría que se intenta eliminar
    rule_res = supabase_service_role_client.table("categorias_reglas").select("id, community_id").eq("id", regla_id).single().execute()
    rule_data = rule_res.data
    if not rule_data:
        raise HTTPException(status_code=404, detail="Regla de categoría no encontrada.")

    rule_community_id = rule_data.get("community_id")

    # 3. Determinar los permisos de eliminación
    if user_role == "superadmin":
        # Superadministrador puede eliminar cualquier regla
        pass
    elif user_role in ["owner", "admin"] and user_org_id:
        if rule_community_id is None:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar reglas globales del sistema.")
        
        # Obtener la organización a la que pertenece la comunidad de la regla
        community_res = supabase_service_role_client.table("comunidades").select("organizacion_id").eq("id", rule_community_id).single().execute()
        community_data = community_res.data
        if not community_data or community_data.get("organizacion_id") != user_org_id:
            raise HTTPException(status_code=403, detail="No tienes permiso para eliminar reglas de otras organizaciones o reglas no asociadas a tu comunidad.")
    else:
        raise HTTPException(status_code=403, detail="No tienes permiso para eliminar esta regla de categoría.")
    
    res = supabase_service_role_client.table("categorias_reglas").delete().eq("id", regla_id).execute()
    return res.data

async def get_all_piso_patterns_service() -> List[Dict]:
    """Obtiene la lista de patrones regex configurados para detección de pisos."""
    res = supabase_service_role_client.table("patrones_piso_config").select("*").order("priority", desc=True).execute()
    return res.data

async def create_piso_pattern_service(data: Dict) -> Dict:
    """Crea un nuevo patrón de detección."""
    if "pattern" in data:
        data["pattern"] = data["pattern"].replace('\x08', r'\b')
    res = supabase_service_role_client.table("patrones_piso_config").insert(data).execute()
    return res.data

async def update_piso_pattern_service(patron_id: int, data: Dict) -> Dict:
    """Actualiza la configuración de un patrón regex."""
    if "pattern" in data:
        data["pattern"] = data["pattern"].replace('\x08', r'\b')
    res = supabase_service_role_client.table("patrones_piso_config").update(data).eq("id", patron_id).execute()
    return res.data

async def delete_piso_pattern_service(patron_id: int) -> Dict:
    """Elimina un patrón de detección del sistema."""
    res = supabase_service_role_client.table("patrones_piso_config").delete().eq("id", patron_id).execute()
    return res.data

async def reload_classifier_rules_service() -> Dict:
    """
    Fuerza al clasificador global a recargar las reglas desde la base de datos.
    Útil después de hacer cambios masivos en el panel de administración.
    """
    try:
        # Import dinámico para evitar colisiones circulares en rutas
        clasificador.cargar_reglas_desde_db()
        return {"status": "success", "message": "Reglas recargadas correctamente en el clasificador."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al recargar reglas: {e}")