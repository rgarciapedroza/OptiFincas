from fastapi import APIRouter, UploadFile, File
from backend.app.controllers.extracto_controller import procesar_dos_archivos_controller, entrenar_controller, confirmar_controller, descargar_controller, descargar_excel_controller, opciones_controller

router = APIRouter()

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
