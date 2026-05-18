from fastapi import Header, HTTPException
from app.servicios.supabase_db import supabase_client

async def get_current_user_id(authorization: str = Header(...)) -> str:
    """
    Extrae el user_id del token JWT de Supabase.
    """
    try:
        # El token viene como "Bearer <token>"
        token = authorization.split(" ")[1]
        response = supabase_client.auth.get_user(token)
        if response.user:
            return response.user.id
        raise HTTPException(status_code=401, detail="Token de autenticación inválido o expirado")
    except Exception:
        raise HTTPException(status_code=401, detail="No autenticado o token malformado")