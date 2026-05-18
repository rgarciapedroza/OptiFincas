from fastapi import APIRouter, UploadFile, File, Depends, Header
from app.controllers.extracto_controller import procesar_dos_archivos_controller, entrenar_controller, confirmar_controller, descargar_controller, descargar_excel_controller, opciones_controller
from app.controllers.pisos_controller import importar_censo_pisos_controller, get_piso_controller, create_piso_controller, update_piso_controller, delete_piso_controller, borrar_censo_comunidad_controller
import jwt # Necesitarás instalar pyjwt o usar el cliente de supabase

router = APIRouter()

def get_current_user_id(authorization: str = Header(None)):
    """Helper para extraer el user_id del token JWT de Supabase"""
    if not authorization: return None
    try:
        token = authorization.split(" ")[1]
        # Nota: En desarrollo podemos extraerlo sin verificar firma si confiamos en el proxy
        payload = jwt.decode(token, options={"verify_signature": False})
        return payload.get("sub")
    except: return None

from app.api.movimientos_bancarios_rutas import router as movimientos_bancarios_router

@router.get("/")
def root():
    return {"mensaje": "API de procesamiento de extractos bancarios"}

@router.get("/opciones")
def opciones():
    return opciones_controller()

@router.post("/entrenar")
async def entrenar(extracto: UploadFile = File(...), excel_contable: UploadFile = File(None)):
    return await entrenar_controller(extracto, excel_contable)

@router.post("/procesar-dos-archivos")
async def procesar_dos_archivos(extracto: UploadFile = File(...), registros: UploadFile = File(...)):
    return await procesar_dos_archivos_controller(extracto, registros)

@router.post("/confirmar")
async def confirmar(movimientos_actualizados: list[dict], modo: str = "mensual"):
    return await confirmar_controller(movimientos_actualizados, modo)

@router.post("/descargar")
async def descargar(movimientos_actualizados: list[dict], formato: str = "csv"):
    return await descargar_controller(movimientos_actualizados, formato)

@router.post("/descargar-excel")
async def descargar_excel(movimientos_actualizados: list[dict]):
    return await descargar_excel_controller(movimientos_actualizados)

# Nueva ruta para importar el censo de propietarios
@router.post("/comunidades/{community_id}/importar-censo")
def importar_censo(community_id: int, file: UploadFile = File(...), user_id: str = Depends(get_current_user_id)):
    return importar_censo_pisos_controller(community_id, file, user_id)

# Ruta para borrar el censo completo de una comunidad
@router.delete("/comunidades/{community_id}/censo")
def borrar_censo_comunidad(community_id: int):
    return borrar_censo_comunidad_controller(community_id)

# Rutas CRUD para Pisos
@router.get("/pisos/{piso_id}")
def get_piso(piso_id: int):
    return get_piso_controller(piso_id)

@router.post("/pisos")
def create_piso(piso_data: dict, user_id: str = Depends(get_current_user_id)):
    return create_piso_controller(piso_data, user_id)

@router.put("/pisos/{piso_id}")
def update_piso(piso_id: int, piso_data: dict, user_id: str = Depends(get_current_user_id)):
    return update_piso_controller(piso_id, piso_data, user_id)

@router.delete("/pisos/{piso_id}")
def delete_piso(piso_id: int, user_id: str = Depends(get_current_user_id)):
    return delete_piso_controller(piso_id, user_id)

router.include_router(movimientos_bancarios_router, prefix="/comunidades")