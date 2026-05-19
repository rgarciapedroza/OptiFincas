from fastapi import APIRouter, Depends, UploadFile, File, Form
from typing import List, Dict, Optional
from app.controllers.movimientos_bancarios_controller import importar_movimientos_controller, get_movimientos_by_community_controller, eliminar_extracto_controller
from app.controllers.pisos_controller import importar_censo_pisos_controller, get_piso_controller, create_piso_controller, update_piso_controller, delete_piso_controller, borrar_censo_comunidad_controller
from app.controllers.extracto_controller import procesar_dos_archivos_controller, confirmar_controller, descargar_controller, descargar_excel_controller, entrenar_controller, opciones_controller
from app.servicios.auth_supabase import get_current_user

router = APIRouter()

# --- Rutas para Movimientos Bancarios (Funcionalidad 2 - Dashboard de Comunidad) ---
@router.post("/comunidades/{community_id}/importar-movimientos")
async def importar_movimientos_route(
    community_id: int,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """
    Importa movimientos bancarios desde un archivo Excel para una comunidad específica.
    """
    return await importar_movimientos_controller(str(community_id), file, user_id)

@router.get("/comunidades/{community_id}/movimientos")
async def get_movimientos_by_community_route(
    community_id: str,
    user_id: str = Depends(get_current_user)
):
    """
    Obtiene todos los movimientos bancarios de una comunidad específica.
    """
    return await get_movimientos_by_community_controller(community_id, user_id)

@router.delete("/extractos/{extracto_id}")
async def eliminar_extracto_route(
    extracto_id: int,
    user_id: str = Depends(get_current_user)
):
    """
    Elimina un extracto/registro y sus movimientos.
    """
    return await eliminar_extracto_controller(extracto_id)

# --- Rutas para Pisos (Funcionalidad 2 - Dashboard de Comunidad) ---
@router.post("/comunidades/{community_id}/importar-censo")
async def importar_censo_route(
    community_id: int,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """
    Importa el censo de propietarios (pisos) desde un Excel para una comunidad.
    """
    return importar_censo_pisos_controller(community_id, file, user_id)

@router.delete("/comunidades/{community_id}/censo")
async def borrar_censo_comunidad_route(
    community_id: int,
    user_id: str = Depends(get_current_user)
):
    """
    Elimina todos los pisos de una comunidad específica.
    """
    return borrar_censo_comunidad_controller(community_id)

@router.get("/pisos/{piso_id}")
async def get_piso_route(piso_id: int):
    """Obtiene un piso por su ID."""
    return get_piso_controller(piso_id)

@router.post("/pisos")
async def create_piso_route(
    piso_data: Dict, # Using Dict for now, ideally a Pydantic model
    user_id: str = Depends(get_current_user)
):
    """Crea un nuevo piso."""
    return create_piso_controller(piso_data, user_id)

@router.put("/pisos/{piso_id}")
async def update_piso_route(
    piso_id: int,
    piso_data: Dict, # Using Dict for now, ideally a Pydantic model
    user_id: str = Depends(get_current_user)
):
    """Actualiza un piso existente."""
    return update_piso_controller(piso_id, piso_data, user_id)

@router.delete("/pisos/{piso_id}")
async def delete_piso_route(
    piso_id: int,
    user_id: str = Depends(get_current_user)
):
    """Elimina un piso por su ID."""
    return delete_piso_controller(piso_id, user_id)

# --- Rutas para el Clasificador (Funcionalidad 1) ---
@router.post("/procesar-dos-archivos")
async def procesar_dos_archivos_route(
    extracto: UploadFile = File(...),
    registros: Optional[UploadFile] = File(None),
    community_id: Optional[int] = Form(None)
):
    """Procesa dos archivos (extracto y registros) para clasificación."""
    return await procesar_dos_archivos_controller(extracto, registros, community_id)

@router.post("/confirmar")
async def confirmar_route(
    movimientos_actualizados: List[Dict],
    modo: str = "mensual"
):
    """Confirma los movimientos actualizados y genera un archivo."""
    return await confirmar_controller(movimientos_actualizados, modo)

@router.post("/descargar")
async def descargar_route(
    movimientos_actualizados: List[Dict],
    formato: str
):
    """Descarga los movimientos en el formato especificado."""
    return await descargar_controller(movimientos_actualizados, formato)

@router.post("/descargar-excel")
async def descargar_excel_route(
    movimientos_actualizados: List[Dict]
):
    """Descarga los movimientos en formato Excel."""
    return await descargar_excel_controller(movimientos_actualizados)

@router.post("/entrenar")
async def entrenar_route(
    extracto: UploadFile = File(...),
    excel_contable: UploadFile = File(...)
):
    """Entrena el modelo de clasificación con nuevos datos."""
    return await entrenar_controller(extracto, excel_contable)

@router.get("/opciones")
async def opciones_route():
    """Obtiene las opciones disponibles para el clasificador."""
    return opciones_controller()