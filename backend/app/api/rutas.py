from fastapi import APIRouter, Depends, UploadFile, File, Form, Body, HTTPException
from typing import List, Dict, Optional, Any, Union
from app.controllers.movimientos_bancarios_controller import importar_movimientos_controller, get_movimientos_by_community_controller, eliminar_extracto_controller, get_extractos_by_community_controller, get_finanzas_comunidad_controller
from app.controllers.pisos_controller import importar_censo_pisos_controller, get_piso_controller, create_piso_controller, update_piso_controller, delete_piso_controller, borrar_censo_comunidad_controller, get_pisos_by_community_controller, buscar_piso_por_email_controller
from app.controllers.extracto_controller import procesar_extracto_db_controller, confirmar_controller, descargar_controller, descargar_excel_controller, entrenar_controller, opciones_controller, persistir_extracto_db_controller
from app.servicios.auth_supabase import get_current_user
from app.schemas import PisoCreate, PisoUpdate, FinanzasReportRequest, MovimientoClasificado
from app.servicios.evaluacion import ejecutar_test_accuracy

router = APIRouter()

@router.get("/comunidades/{community_id}/pisos", tags=["Pisos"], summary="Listar censo desencriptado")
async def get_pisos_comunidad_route(community_id: int, user_id: str = Depends(get_current_user)):
    """Obtiene el censo completo de una comunidad con datos legibles."""
    return get_pisos_by_community_controller(community_id)

# --- Rutas para Movimientos Bancarios (Funcionalidad 2 - Dashboard de Comunidad) ---
@router.post(
    "/comunidades/{community_id}/importar-movimientos",
    tags=["Movimientos"],
    summary="Importar extracto histórico",
    description="Carga movimientos desde un Excel con múltiples hojas (mes/año) y los registra en el histórico de la comunidad."
)
async def importar_movimientos_route(
    community_id: int,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """
    Importa movimientos bancarios desde un archivo Excel para una comunidad específica.
    """
    return await importar_movimientos_controller(community_id, file, user_id)

@router.get(
    "/comunidades/{community_id}/movimientos",
    tags=["Movimientos"],
    summary="Listar movimientos de la comunidad",
    description="Obtiene todos los movimientos bancarios registrados para una comunidad específica."
)
async def get_movimientos_by_community_route(
    community_id: int,
    extracto_id: Optional[int] = None,
    piso_codigo: Optional[str] = None, # Add this parameter
    user_id: str = Depends(get_current_user)
):
    """
    Obtiene todos los movimientos bancarios de una comunidad específica.
    """
    return await get_movimientos_by_community_controller(community_id, user_id, extracto_id, piso_codigo)

@router.get(
    "/comunidades/{community_id}/finanzas",
    tags=["Movimientos"],
    summary="Informe financiero mensual",
    description="Calcula el balance, resumen de ingresos por piso y detalle de gastos para un mes específico."
)
async def get_finanzas_comunidad_route(community_id: int, mes: int, anio: int, user_id: str = Depends(get_current_user)):
    """Obtiene el resumen financiero calculado por el servidor."""
    return await get_finanzas_comunidad_controller(community_id, mes, anio)

@router.delete(
    "/extractos/{extracto_id}",
    tags=["Movimientos"],
    summary="Eliminar extracto procesado",
    description="Borra un registro de extracto y todos sus movimientos asociados (vía borrado en cascada)."
)
async def eliminar_extracto_route(
    extracto_id: int,
    user_id: str = Depends(get_current_user)
):
    """
    Elimina un extracto/registro y sus movimientos.
    """
    return await eliminar_extracto_controller(extracto_id)

# --- Rutas para Pisos (Funcionalidad 2 - Dashboard de Comunidad) ---
@router.post(
    "/comunidades/{community_id}/importar-censo",
    tags=["Pisos"],
    summary="Importar censo de propietarios",
    description="Procesa un Excel con la lista de propietarios y encripta los datos sensibles antes de guardarlos."
)
async def importar_censo_route(
    community_id: int,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user)
):
    """
    Importa el censo de propietarios (pisos) desde un Excel para una comunidad.
    """
    return importar_censo_pisos_controller(community_id, file, user_id)

@router.delete(
    "/comunidades/{community_id}/censo",
    tags=["Pisos"],
    summary="Borrar censo completo"
)
async def borrar_censo_comunidad_route(
    community_id: int,
    user_id: str = Depends(get_current_user)
):
    """
    Elimina todos los pisos de una comunidad específica.
    """
    return borrar_censo_comunidad_controller(community_id)

@router.get("/pisos/{piso_id}", tags=["Pisos"], summary="Obtener detalle de piso")
async def get_piso_route(piso_id: int, user_id: str = Depends(get_current_user)):
    """Obtiene un piso por su ID."""
    return get_piso_controller(piso_id, user_id)

@router.post(
    "/pisos",
    tags=["Pisos"],
    summary="Crear piso manualmente"
)
async def create_piso_route(
    piso_data: Dict = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Crea un nuevo piso."""
    return create_piso_controller(piso_data, user_id)

@router.put(
    "/pisos/{piso_id}",
    tags=["Pisos"],
    summary="Actualizar piso"
)
async def update_piso_route(
    piso_id: int,
    piso_data: Dict = Body(...),
    user_id: str = Depends(get_current_user)
):
    """Actualiza un piso existente."""
    return update_piso_controller(piso_id, piso_data, user_id)

@router.delete(
    "/pisos/{piso_id}",
    tags=["Pisos"],
    summary="Eliminar piso individual"
)
async def delete_piso_route(
    piso_id: int,
    user_id: str = Depends(get_current_user)
):
    """Elimina un piso por su ID."""
    return delete_piso_controller(piso_id, user_id)

@router.put("/movimientos/batch", tags=["Movimientos"])
async def update_movimientos_batch_route(data: Dict = Body(...), user_id: str = Depends(get_current_user)):
    """Actualiza múltiples movimientos encriptando los datos sensibles."""
    # Reutilizamos la lógica de persistencia que maneja la encriptación AES
    return await persistir_extracto_db_controller(data)

# --- Rutas para Extractos Procesados ---
@router.get(
    "/comunidades/{community_id}/extractos",
    tags=["Movimientos"],
    summary="Listar extractos por comunidad"
)
async def get_extractos_by_community_route(
    community_id: int,
    user_id: str = Depends(get_current_user)
):
    """Obtiene todos los extractos procesados de una comunidad específica."""
    return await get_extractos_by_community_controller(community_id, user_id)

# --- Rutas para el Clasificador (Funcionalidad 1) ---
@router.post(
    "/procesar-extracto-db",
    tags=["Inteligencia Artificial"],
    summary="Procesar extracto nuevo",
    description="Analiza un extracto bancario usando modelos de ML y el histórico para asignar pisos automáticamente."
)
async def procesar_extracto_db_route(
    extracto: UploadFile = File(...),
    community_id: int = Form(...)
):
    """Procesa un extracto bancario utilizando datos históricos de la base de datos para clasificación."""
    return await procesar_extracto_db_controller(extracto, community_id)

@router.post(
    "/confirmar",
    tags=["Inteligencia Artificial"],
    summary="Confirmar y Generar Excel",
    description="Recibe los movimientos editados por el usuario y genera el archivo Excel final de contabilidad."
)
async def confirmar_route(
    data: Union[FinanzasReportRequest, List[MovimientoClasificado]] = Body(...),
    modo: str = "mensual",
    community_name: Optional[str] = None,
    mes: Optional[int] = None,
    anio: Optional[int] = None
):
    """Confirma los movimientos actualizados y genera un archivo."""
    return await confirmar_controller(data, modo, community_name, mes, anio)

@router.post(
    "/persistir-extracto",
    tags=["Inteligencia Artificial"],
    summary="Guardar resultados en DB",
    description="Persiste los movimientos clasificados en la base de datos, encriptando automáticamente los datos sensibles."
)
async def persistir_extracto_route(data: Dict = Body(...)):
    return await persistir_extracto_db_controller(data)

@router.post("/descargar", tags=["Inteligencia Artificial"], summary="Descargar CSV")
async def descargar_route(
    movimientos_actualizados: List[Dict] = Body(...),
    formato: str = "csv",
    mes: int = 1,
    anio: int = 2024
):
    """Descarga los movimientos en el formato especificado."""
    return await descargar_controller(movimientos_actualizados, formato, mes, anio)

@router.post("/descargar-excel", tags=["Inteligencia Artificial"], summary="Descargar Excel")
async def descargar_excel_route(
    movimientos_actualizados: List[Dict] = Body(...),
    mes: int = 1,
    anio: int = 2024
):
    """Descarga los movimientos en formato Excel."""
    return await descargar_excel_controller(movimientos_actualizados, mes, anio)

@router.post("/entrenar", tags=["Inteligencia Artificial"], summary="Entrenar clasificador")
async def entrenar_route(
    extracto: UploadFile = File(...),
    excel_contable: UploadFile = File(...)
):
    """Entrena el modelo de clasificación con nuevos datos."""
    return await entrenar_controller(extracto, excel_contable)

@router.get("/opciones", tags=["Inteligencia Artificial"], summary="Listar tipos y categorías")
async def opciones_route():
    """Obtiene las opciones disponibles para el clasificador."""
    return opciones_controller()

@router.get(
    "/evaluacion/reporte",
    tags=["Calidad y Metricas"],
    summary="Generar reporte de precisión",
    description="Ejecuta el sistema contra un dataset de prueba etiquetado y devuelve métricas de exactitud para la memoria del TFG."
)
async def obtener_reporte_evaluacion(community_id: Optional[int] = None, user_id: str = Depends(get_current_user)):
    """Endpoint exclusivo para auditoría técnica y defensa del TFG."""
    return ejecutar_test_accuracy(community_id)

@router.post("/contacto", tags=["Comunicación"])
async def contacto_route(data: Dict = Body(...)):
    """Recibe los datos del formulario de contacto y envía un correo."""
    from app.servicios.email_service import enviar_email_contacto
    
    nombre = data.get("nombre")
    email = data.get("email")
    mensaje = data.get("mensaje")

    if not all([nombre, email, mensaje]):
        raise HTTPException(status_code=400, detail="Todos los campos son obligatorios.")

    exito = enviar_email_contacto(nombre, email, mensaje)
    
    if not exito:
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo. Revisa la configuración del servidor.")

    return {"status": "success", "message": "Mensaje enviado correctamente."}

@router.get("/portal/mi-piso", tags=["Portal Propietario"])
async def get_piso_propietario_route(email: str, user_id: str = Depends(get_current_user)):
    """Busca y desencripta la información del piso para el portal del propietario."""
    # Este controlador debe buscar en la DB y aplicar la desencriptación AES
    return buscar_piso_por_email_controller(email)