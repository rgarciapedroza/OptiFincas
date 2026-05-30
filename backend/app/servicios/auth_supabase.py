from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.servicios.supabase_db import supabase_client
import logging

logger = logging.getLogger(__name__)

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """
    Dependencia para obtener el ID del usuario actual a partir del token JWT de Supabase.
    """
    try:
        # credentials.credentials contiene el token sin el prefijo 'Bearer'
        token = credentials.credentials
        
        # El cliente estándar de Supabase es síncrono. 
        # Eliminamos 'await' para evitar el error de servidor.
        user_response = supabase_client.auth.get_user(token)
        if user_response and user_response.user:
            return user_response.user.id
        else:
            # Si user_response.user es None, el token no es válido o ha expirado
            raise HTTPException(status_code=401, detail="Token inválido o expirado.")
    except Exception as e:
        if "expired" in str(e).lower():
            raise HTTPException(status_code=401, detail="La sesión ha expirado. Por favor, inicie sesión de nuevo.")
        logger.error(f"Error inesperado en la autenticación: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Error interno del servidor al validar credenciales.")