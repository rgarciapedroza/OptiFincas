import logging
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.api.ia import router as ia_router
from app.api.rutas import router as api_router
from app.api.router_optimizacion import router as optimizacion_router
from app.api.contacto import router as contacto_router

# Configuración de Logging Profesional
logging.basicConfig(
    level=logging.INFO, 
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("OptiFincas")

app = FastAPI(
    title="OptiFincas API",
    description="Sistema inteligente de gestión de comunidades y optimización de recursos.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(contacto_router, prefix="/api/contacto")
app.include_router(optimizacion_router, prefix="/api/optimizacion")
app.include_router(ia_router, prefix="/api") # Incluye el router de IA

# --- Manejador Global de Excepciones ---

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Captura cualquier error no controlado y devuelve un JSON estándar."""
    logger.error(f"Error no controlado en {request.url}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "status": "error",
            "message": "Ocurrió un error interno en el servidor de OptiFincas.",
            "detail": str(exc) if app.debug else "Consulte los logs para más información."
        }
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Maneja errores de validación de Pydantic (Datos mal formados)."""
    logger.warning(f"Error de validación en {request.url}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "status": "error",
            "message": "Los datos enviados no son válidos.",
            "errors": exc.errors()
        }
    )

@app.get("/", tags=["Estado"])
async def root():
    """Endpoint de comprobación de salud de la API."""
    return {
        "app": "OptiFincas API",
        "status": "online",
        "documentation": "/docs"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
