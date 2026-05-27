from fastapi import Header, HTTPException
from app.servicios.supabase_db import supabase_client

async def get_current_user(authorization: str = Header(...)) -> str:
    """
    Dependencia para obtener el ID del usuario actual a partir del token JWT de Supabase.
    """
    try:
        scheme, token = authorization.split()
        if scheme.lower() != "bearer":
            raise HTTPException(status_code=401, detail="Esquema de autenticación inválido. Se esperaba 'Bearer'.")
        
        # El método get_user() es síncrono en el cliente estándar.
        # Eliminamos el 'await' para evitar errores de ejecución.
        user_response = await supabase_client.auth.get_user(token)
        
        if user_response and user_response.user:
            return user_response.user.id
        else:
            # Si user_response.user es None, el token no es válido o ha expirado
            raise HTTPException(status_code=401, detail="Token inválido o expirado.")

    except ValueError:
        # Error si el formato del header Authorization no es 'Bearer <token>'
        raise HTTPException(status_code=401, detail="Formato de cabecera de autorización inválido.")
    except HTTPException:
        raise # Re-lanza las excepciones HTTPException ya creadas
    except Exception as e:
        # Captura cualquier otro error inesperado durante la autenticación
        print(f"Error inesperado en la autenticación: {e}")
        raise HTTPException(status_code=500, detail="Error interno del servidor al validar credenciales.")