import smtplib
import logging
from email.mime.text import MIMEText
from app.core.config import settings

logger = logging.getLogger(__name__)

def enviar_email_contacto(nombre: str, email_remitente: str, mensaje: str):
    """Envía un correo electrónico al administrador con los datos de contacto."""
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        logger.warning("SMTP no configurado en el archivo .env. No se enviará el correo.")
        return False

    try:
        subject = f"Nuevo contacto: {nombre} - OptiFincas"
        body = (
            f"Has recibido un nuevo mensaje desde la web de OptiFincas:\n\n"
            f"Nombre: {nombre}\n"
            f"Email de contacto: {email_remitente}\n"
            f"Mensaje:\n{mensaje}"
        )

        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = settings.SMTP_USER
        msg['To'] = settings.ADMIN_EMAIL

        with smtplib.SMTP_SSL(settings.SMTP_SERVER, 465) as server:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        
        return True
    except Exception as e:
        logger.error(f"Error al enviar email: {e}")
        return False