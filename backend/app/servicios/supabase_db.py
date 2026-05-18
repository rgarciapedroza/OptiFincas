import os
from supabase import create_client, Client

# Cargar variables de entorno (si no están ya cargadas)
from dotenv import load_dotenv
load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Las variables de entorno SUPABASE_URL y SUPABASE_KEY deben estar configuradas.")

supabase_client: Client = create_client(SUPABASE_URL, SUPABASE_KEY)