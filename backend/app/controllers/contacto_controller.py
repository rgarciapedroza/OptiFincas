from typing import Any, Dict


from fastapi import HTTPException


from app.servicios.email_service import enviar_email_contacto




def contacto_controller(data: Dict[str, Any]) -> Dict[str, str]:
    """Controlador: valida el payload y delega el envío del correo."""
    nombre = data.get("nombre")
    email = data.get("email")
    mensaje = data.get("mensaje")


    if not all([nombre, email, mensaje]):
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios.")


    exito = enviar_email_contacto(nombre, email, mensaje)
    if not exito:
        raise HTTPException(
            status_code=500,
            detail="No se pudo enviar el correo. Revisa la configuración del servidor.",
        )


    return {"status": "success", "message": "Mensaje enviado correctamente."}
