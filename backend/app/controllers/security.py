import os
import base64
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
from dotenv import load_dotenv
from typing import Any, Optional

# Intentar cargar las variables de entorno desde el archivo .env
load_dotenv()

# Configuración AES-256-CBC compatible con datos existentes (ej: "NidAA...")
ENCRYPT_KEY = os.getenv("ENCRYPT_KEY", "OptiFincasSecretKey2024_Security").encode('utf-8')
if len(ENCRYPT_KEY) < 32:
    ENCRYPT_KEY = ENCRYPT_KEY.ljust(32, b'\0')
elif len(ENCRYPT_KEY) > 32:
    ENCRYPT_KEY = ENCRYPT_KEY[:32]

ENCRYPT_IV = os.getenv("ENCRYPT_IV", "OptiFincas_IV_16").encode('utf-8')
if len(ENCRYPT_IV) < 16:
    ENCRYPT_IV = ENCRYPT_IV.ljust(16, b'\0')
elif len(ENCRYPT_IV) > 16:
    ENCRYPT_IV = ENCRYPT_IV[:16]

backend = default_backend()

def encriptar_dato(dato: Any) -> Optional[str]:
    """
    Encripta una cadena de texto o valor usando AES-256-CBC.
    """
    if dato is None or str(dato).strip() == "" or str(dato).lower() == "nan":
        return None
    try:
        texto = str(dato)
        padder = padding.PKCS7(128).padder()
        padded_data = padder.update(texto.encode('utf-8')) + padder.finalize()
        
        cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=backend)
        encryptor = cipher.encryptor()
        ct = encryptor.update(padded_data) + encryptor.finalize()
        return base64.b64encode(ct).decode('utf-8')
    except Exception:
        return str(dato)

def desencriptar_dato(token: Any) -> Optional[str]:
    """
    Desencripta un token generado por AES-256-CBC. 
    Si el token no es válido o ya es texto plano, devuelve el valor original.
    """
    if token is None or str(token).strip() == "" or str(token).lower() == "nan":
        return None
    try:
        ct = base64.b64decode(str(token).encode('utf-8'))
        cipher = Cipher(algorithms.AES(ENCRYPT_KEY), modes.CBC(ENCRYPT_IV), backend=backend)
        decryptor = cipher.decryptor()
        padded_data = decryptor.update(ct) + decryptor.finalize()
        
        unpadder = padding.PKCS7(128).unpadder()
        return (unpadder.update(padded_data) + unpadder.finalize()).decode('utf-8')
    except Exception:
        # Fallback al valor original si la desencriptación falla (útil para datos antiguos no cifrados)
        return str(token)