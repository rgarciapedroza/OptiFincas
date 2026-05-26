from fastapi import APIRouter, UploadFile, File, Form, HTTPException
import smtplib
from email.message import EmailMessage
import os
from app.servicios.supabase_db import supabase_service_role_client, supabase_client
from datetime import datetime
from app.core.config import settings

router = APIRouter()

@router.post("/enviar")
async def enviar_contacto(
    userName: str = Form(...), 
    userEmail: str = Form(...),
    communityId: int = Form(None), # Puede ser None si no hay piso seleccionado
    reason: str = Form(...), 
    message: str = Form(...), 
    photo: UploadFile = File(None)
):
    try:
        # 0. LÓGICA PROFESIONAL: Buscar el email del administrador de la comunidad específica
        destinatario_final = settings.ADMIN_EMAIL # Fallback por si no hay comunidad
        nombre_comunidad = "General"

        if communityId:
            # Consultamos usando service_role para evitar problemas de RLS y quitamos .single() para evitar el error PGRST116
            res_com = supabase_service_role_client.table("comunidades").select("nombre, email_admin").eq("id", communityId).execute()
            
            if res_com.data and len(res_com.data) > 0:
                com_data = res_com.data[0]
                nombre_comunidad = com_data.get("nombre", "Comunidad")
                email_db = com_data.get("email_admin")
                if email_db:
                    destinatario_final = email_db
                    print(f"[CONTACTO] Email obtenido de la DB para {nombre_comunidad}: {destinatario_final}")
        
        if not destinatario_final:
            print("[ERROR] No hay destinatario configurado ni en DB ni en .env")
            raise ValueError("No se ha podido determinar el email del administrador.")

        # 1. Guardar la incidencia en la base de datos
        photo_filename = None
        # En un sistema real, aquí subirías la foto a Supabase Storage y guardarías la URL
        if photo:
            photo_filename = photo.filename # Por ahora solo guardamos el nombre del archivo
            # Ejemplo de cómo subirías a Supabase Storage (requiere configuración adicional)
            # path_in_storage = f"incidencias/{uuid.uuid4()}_{photo.filename}"
            # supabase_service_role_client.storage.from_('incidencias').upload(path_in_storage, await photo.read())
            # photo_url = supabase_service_role_client.storage.from_('incidencias').get_public_url(path_in_storage)

        incidencia_data = {
            "user_email": userEmail,
            "user_name": userName,
            "community_id": communityId,
            "reason": reason,
            "message": message,
            "status": "Pendiente",
            "photo_filename": photo_filename,
            "created_at": datetime.now().isoformat()
        }
        supabase_service_role_client.table("incidencias").insert(incidencia_data).execute()

        SMTP_SERVER = "smtp.gmail.com"
        SMTP_PORT = 587
        EMAIL_SENDER = settings.SMTP_USER # Este es el "De:" (el sistema)
        EMAIL_PASSWORD = settings.SMTP_PASSWORD # Contraseña de aplicación

        if not EMAIL_SENDER:
            print("[ERROR SMTP] Falta la variable SMTP_USER configurada.")
            raise ValueError("Falta configurar SMTP_USER en el archivo .env")
        
        if not EMAIL_PASSWORD:
            print("[ERROR SMTP] Falta la variable SMTP_PASSWORD configurada.")
            raise ValueError("Falta configurar SMTP_PASSWORD en el archivo .env")

        msg = EmailMessage()
        msg['Subject'] = f"[{nombre_comunidad}] Nueva Incidencia: {reason}"
        msg['From'] = EMAIL_SENDER
        msg['To'] = destinatario_final

        # Cuerpo del correo (incluyendo el email del remitente)
        cuerpo = f"Remitente: {userName} ({userEmail})\nMotivo: {reason}\n\nMensaje:\n{message}"
        msg.set_content(cuerpo)

        # Adjuntar foto si existe
        if photo:
            content = await photo.read()
            msg.add_attachment(
                content,
                maintype='image',
                subtype=photo.content_type.split('/')[-1] if photo.content_type else 'octet-stream',
                filename=photo.filename
            )

        # Envío mediante smtplib
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.send_message(msg)

        return {"status": "success", "detail": "Correo enviado correctamente"}

    except smtplib.SMTPAuthenticationError:
        error_msg = "Error de autenticación SMTP: La contraseña de aplicación de Gmail no es correcta o el usuario es erróneo."
        print(f"[ERROR] {error_msg}")
        raise HTTPException(status_code=401, detail=error_msg)
    except Exception as e:
        print(f"Error enviando email: {e}")
        raise HTTPException(status_code=500, detail=str(e))