import os
from supabase import create_client, Client

# Cargar variables de entorno (si no están ya cargadas)
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Las variables de entorno SUPABASE_URL y SUPABASE_KEY deben estar configuradas.")

supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

if SUPABASE_SERVICE_ROLE_KEY:
    supabase_service_role_client: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
else:
    supabase_service_role_client = None # Fallback, aunque debería estar configurada para operaciones de admin