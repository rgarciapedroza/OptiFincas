import os
import httpx
import logging
from fastapi import APIRouter, HTTPException
import json # Importar el módulo json
from pydantic import BaseModel

# Configuración de logging
logger = logging.getLogger(__name__)

router = APIRouter()

class GenerateRegexRequest(BaseModel):
    prompt: str

@router.post("/ia/generar-regla")
async def generar_regla_ia(request: GenerateRegexRequest):
    """
    Endpoint para generar una expresión regular (Regex) a partir de una descripción en lenguaje natural
    utilizando la API de OpenAI. Actúa como un proxy seguro para la clave de API.
    """
    openai_api_key = os.getenv("OPENAI_API_KEY")
    if not openai_api_key:
        logger.error("OPENAI_API_KEY no está configurada en las variables de entorno del servidor.")
        raise HTTPException(status_code=500, detail="La clave de API de OpenAI no está configurada en el servidor.")

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {openai_api_key}"
    }

    # El system prompt asegura que la IA devuelva solo el regex limpio
    body = {
        "model": "gpt-4o-mini",
        "messages": [
            { "role": "system", "content": "Eres un experto en RegEx para Python. Tu tarea es generar una expresión regular para detectar formatos de pisos o palabras clave de categorías en extractos bancarios. El usuario te dará una descripción. Debes devolver ÚNICAMENTE un objeto JSON con dos claves: 'pattern' (el string de la expresión regular de forma limpia, ej: \\b(PISO)\\s*(\\d+)\\b, sin explicaciones, sin bloques de código y sin comillas adicionales, asegurándote de capturar el valor identificador en un grupo) y 'assigned_value' (el valor que debe asignarse si el patrón coincide, si el usuario no especifica un valor a asignar, este campo debe ser nulo)."},
            { "role": "user", "content": request.prompt }
        ],
        "temperature": 0
    }

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=body, timeout=30.0)
            response.raise_for_status()
            openai_response = response.json()
            
            if openai_response and openai_response.get("choices"):
                ai_content = openai_response["choices"][0]["message"]["content"].strip()
                try:
                    parsed_ai_response = json.loads(ai_content)
                    regex_generada = parsed_ai_response.get("pattern", "").strip()
                    assigned_value = parsed_ai_response.get("assigned_value")
                    if not regex_generada:
                        raise ValueError("AI did not return a valid 'pattern'.")
                    return {"regex": regex_generada, "assigned_value": assigned_value}
                except json.JSONDecodeError:
                    logger.error(f"AI response was not valid JSON: {ai_content}")
                    raise HTTPException(status_code=500, detail="El servicio de IA devolvió un formato inesperado. Intente de nuevo.")
            else:
                raise HTTPException(status_code=500, detail="El servicio de IA devolvió una respuesta vacía.")
        except httpx.RequestError as e:
            logger.error(f"Error de red al conectar con OpenAI: {e}")
            raise HTTPException(status_code=500, detail=f"Error de conexión con el servicio de IA.")
        except httpx.HTTPStatusError as e:
            logger.error(f"Error de la API de OpenAI: {e.response.status_code}")
            raise HTTPException(status_code=e.response.status_code, detail="Error en el servicio de IA.")
        except Exception as e:
            logger.error(f"Error desconocido: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail="Error interno al procesar la solicitud de IA.")