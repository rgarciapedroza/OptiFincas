import io
import base64
import os
import re
import pandas as pd
import logging
from datetime import datetime, timedelta
from fastapi import UploadFile, HTTPException, File, Form
from typing import Optional, Any, Union
from fastapi.responses import StreamingResponse
from collections import defaultdict


from app.servicios.extracto_orquestacion import (
    procesar_extracto_db_service,
    persistir_extracto_db_service,
    descargar_service,
    descargar_excel_service,
    opciones_service,
    entrenar_service,
    confirmar_service,
)


from app.ml.clasificador_ml import crear_clasificador
from app.servicios.procesar_movimientos import procesar_extracto_y_registros, normalizar_piso_tecnico
from app.servicios.procesar_extracto import detectar_columnas, limpiar_importe
from app.servicios.resumen import calcular_resumen_categorias_con_tipo
from app.servicios.supabase_db import supabase_client, supabase_service_role_client
from app.procesamiento.generar_excel import crear_excel_actualizado, crear_excel_informe_finanzas
from app.procesamiento.procesar_excel_contable import obtener_nombre_hoja
from app.controllers.security import encriptar_dato, desencriptar_dato
from app.servicios.gestion_cuotas import LogicaCuotasFincas
from app.schemas import FinanzasReportRequest, MovimientoClasificado as MovimientoClasificadoExtracto


logger = logging.getLogger(__name__)
clasificador = crear_clasificador()




def opciones_controller():
    return opciones_service()




async def entrenar_controller(extracto: UploadFile, excel_contable: UploadFile):
    return await entrenar_service(extracto, excel_contable)




async def procesar_extracto_db_controller(
    extracto: UploadFile,
    community_id: int = Form(...),
):
    return await procesar_extracto_db_service(extracto, community_id)




async def confirmar_controller(
    data: Union[FinanzasReportRequest, list[MovimientoClasificadoExtracto]],
    modo: str = "mensual",
    community_name: Optional[str] = None,
    mes: Optional[int] = None,
    anio: Optional[int] = None,
):
    return await confirmar_service(data, modo, community_name, mes, anio)




async def persistir_extracto_db_controller(data: dict):
    return await persistir_extracto_db_service(data)




async def descargar_controller(
    movimientos_actualizados: list[dict],
    formato: str,
    mes: int = 1,
    anio: int = 2024,
):
    return await descargar_service(movimientos_actualizados, formato, mes, anio)




async def descargar_excel_controller(
    movimientos_actualizados: list[dict],
    mes: int = 1,
    anio: int = 2024,
):
    return await descargar_excel_service(movimientos_actualizados, mes, anio)
