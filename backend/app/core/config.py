from __future__ import annotations
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    # Proyecto
    PROJECT_NAME: str = "OptiFincas API"
    VERSION: str = "1.0.0"
    ENV: str = "dev"

    # Supabase
    SUPABASE_URL: str
    SUPABASE_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

    # SMTP / Email
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    SMTP_SERVER: str = "smtp.gmail.com"
    ADMIN_EMAIL: str = "rosmarygp11@gmail.com"

    # Seguridad (AES-256)
    ENCRYPT_KEY: str = "OptiFincasSecretKey2024_Security"
    ENCRYPT_IV: str = "OptiFincas_IV_16"

    # OSRM
    OSRM_ROUTING_URL: str = "http://router.project-osrm.org"

    # Base de datos local (Docker)
    DATABASE_URL: Optional[str] = None

    # Cargar desde .env
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
