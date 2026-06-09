# app/api/router_optimizacion.py
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional
import pandas as pd
import io

from .optimizacion_service import process_optimization, get_regional_holidays

router = APIRouter()

# =========================
# MODELOS
# =========================
class CommunityInput(BaseModel):
    address: str
    cleaningHours: float = Field(..., gt=0)
    cleaningDaysPerWeek: int = Field(..., gt=0, le=7)
    latitude: float
    longitude: float
    region: Optional[str] = None


class EmployeeStartLocation(BaseModel):
    latitude: float
    longitude: float


class OptimizationRequest(BaseModel):
    numEmployees: int = Field(2, ge=1, le=10)
    communities: List[CommunityInput]
    month: int = Field(..., ge=1, le=12)
    year: int = Field(...)
    region: Optional[str] = "ES"
    manualHolidays: List[str] = []
    manualWorkingDays: List[str] = []
    employeeStartLocations: List[EmployeeStartLocation]


# =========================
# ENDPOINTS
# =========================
@router.post("/calcular")
async def calcular_optimizacion(request: OptimizationRequest):
    try:
        result = process_optimization(request)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno: {str(e)}")


@router.post("/importar-comunidades")
async def importar_comunidades(file: UploadFile = File(...)):
    try:
        contenido = await file.read()
        df = pd.read_excel(io.BytesIO(contenido))

        if df.empty:
            raise HTTPException(status_code=400, detail="El archivo Excel está vacío.")

        df.columns = [str(c).strip().lower() for c in df.columns]

        mapeo = {
            "comunidad": ["comunidad", "direccion", "nombre", "ubicacion"],
            "horas": ["horas", "duracion", "tiempo"],
            "dias_semana": ["dias_semana", "frecuencia", "dias", "visitas"],
            "latitud": ["latitud", "lat"],
            "longitud": ["longitud", "lon", "lng"]
        }

        comunidades = []
        for i, row in df.iterrows():
            try:
                addr = str(row[next(c for c in mapeo["comunidad"] if c in df.columns)])
                hrs = float(row[next(c for c in mapeo["horas"] if c in df.columns)])
                days = int(row[next(c for c in mapeo["dias_semana"] if c in df.columns)])
                lat = float(row[next(c for c in mapeo["latitud"] if c in df.columns)])
                lon = float(row[next(c for c in mapeo["longitud"] if c in df.columns)])

                comunidades.append({
                    "id": len(comunidades) + 1,
                    "address": addr,
                    "cleaningHours": hrs,
                    "cleaningDaysPerWeek": days,
                    "latitude": lat,
                    "longitude": lon
                })
            except (StopIteration, ValueError, TypeError):
                continue

        return {"status": "ok", "comunidades": comunidades}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el Excel: {str(e)}")


@router.get("/holidays")
async def get_regional_holidays_endpoint(year: int, month: int, region_code: Optional[str] = None):
    return get_regional_holidays(year, month, region_code)