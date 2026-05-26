from supabase import create_client, Client
from app.core.config import settings

if not settings.SUPABASE_URL or not settings.SUPABASE_KEY:
    raise ValueError("Las credenciales de Supabase no están configuradas en el entorno.")

supabase_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

if settings.SUPABASE_SERVICE_ROLE_KEY:
    supabase_service_role_client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
else:
    supabase_service_role_client = None # Fallback, aunque debería estar configurada para operaciones de admin