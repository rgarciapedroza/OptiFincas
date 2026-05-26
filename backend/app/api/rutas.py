from fastapi import APIRouter, Depends, UploadFile, File, Form, Body
from typing import List, Dict, Optional, Any, Union
from app.controllers.movimientos_bancarios_controller import importar_movimientos_controller, get_movimientos_by_community_controller, eliminar_extracto_controller, get_extractos_by_community_controller
from app.controllers.pisos_controller import importar_censo_pisos_controller, get_piso_controller, create_piso_controller, update_piso_controller, delete_piso_controller, borrar_censo_comunidad_controller
from app.controllers.extracto_controller import procesar_extracto_db_controller, confirmar_controller, descargar_controller, descargar_excel_controller, entrenar_controller, opciones_controller
from app.servicios.auth_supabase import get_current_user
from ..schemas.models import PisoCreate, PisoUpdate

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
    piso_data: PisoCreate,
    user_id: str = Depends(get_current_user)
):
    """Crea un nuevo piso."""
    # Usamos model_dump(exclude_none=True) para no enviar valores nulos innecesarios
    return create_piso_controller(piso_data.model_dump(exclude_none=True), user_id)

@router.put("/pisos/{piso_id}")
async def update_piso_route(
    piso_id: int,
    piso_data: PisoUpdate,
    user_id: str = Depends(get_current_user)
):
    """Actualiza un piso existente."""
    # exclude_unset=True evita sobrescribir campos que el usuario no ha enviado
    return update_piso_controller(piso_id, piso_data.model_dump(exclude_unset=True, exclude_none=True), user_id)

@router.delete("/pisos/{piso_id}")
async def delete_piso_route(
    piso_id: int,
    user_id: str = Depends(get_current_user)
):
    """Elimina un piso por su ID."""
    return delete_piso_controller(piso_id, user_id)

# --- Rutas para Extractos Procesados ---
@router.get("/comunidades/{community_id}/extractos")
async def get_extractos_by_community_route(
    community_id: str,
    user_id: str = Depends(get_current_user)
):
    """Obtiene todos los extractos procesados de una comunidad específica."""
    return await get_extractos_by_community_controller(community_id, user_id)

# --- Rutas para el Clasificador (Funcionalidad 1) ---
@router.post("/procesar-extracto-db")
async def procesar_extracto_db_route(
    extracto: UploadFile = File(...),
    community_id: int = Form(...)
):
    """Procesa un extracto bancario utilizando datos históricos de la base de datos para clasificación."""
    return await procesar_extracto_db_controller(extracto, community_id)

@router.post("/confirmar")
async def confirmar_route(
    data: Any = Body(...), # Body(...) es obligatorio para evitar el error 422 con Any
    modo: str = "mensual",
    community_name: Optional[str] = None,
    mes: Optional[int] = None,
    anio: Optional[int] = None
):
    """Confirma los movimientos actualizados y genera un archivo."""
    return await confirmar_controller(data, modo, community_name, mes, anio)

@router.post("/descargar")
async def descargar_route(
    movimientos_actualizados: List[Dict] = Body(...),
    formato: str = "csv",
    mes: int = 1,
    anio: int = 2024
):
    """Descarga los movimientos en el formato especificado."""
    return await descargar_controller(movimientos_actualizados, formato, mes, anio)

@router.post("/descargar-excel")
async def descargar_excel_route(
    movimientos_actualizados: List[Dict] = Body(...),
    mes: int = 1,
    anio: int = 2024
):
    """Descarga los movimientos en formato Excel."""
    return await descargar_excel_controller(movimientos_actualizados, mes, anio)

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