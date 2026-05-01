from pydantic import BaseModel
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class TipoMovimiento(str, Enum):
    INGRESO = "ingreso"
    GASTO = "gasto"
    DESCONOCIDO = "desconocido"


class MovimientoExtracto(BaseModel):
    """Movimiento normalizado del extracto bancario"""
    id_original: Optional[int] = None
    fecha: Optional[str] = None
    concepto: str
    importe: float
    tipo: TipoMovimiento
    categoria: Optional[str] = None
    confianza: Optional[float] = None
    concepto_normalizado: Optional[str] = None


class MovimientoContable(BaseModel):
    """Movimiento del Excel contable"""
    id_original: Optional[int] = None
    fecha: Optional[str] = None
    concepto: str
    importe: float
    tipo: TipoMovimiento
    categoria: Optional[str] = None
    conciliado: bool = False
    id_extracto_matched: Optional[int] = None


class ConciliacionResultado(BaseModel):
    """Resultado de un movimiento conciliado"""
    movimiento_extracto: MovimientoExtracto
    movimiento_contable: Optional[MovimientoContable]
    estado: str  # "conciliado", "no_conciliado", "duplicado", "diferencia"
    diferencia_importe: Optional[float] = None


class ResumenConciliacion(BaseModel):
    """Resumen de la conciliación"""
    mes: str
    año: int
    total_extracto: float
    total_contable: float
    ingresos_conciliados: int
    gastos_conciliados: int
    ingresos_nuevos: int
    gastos_nuevos: int
    duplicados: int
    diferencias: float
    pendiente: int


class RequestUploadExtracto(BaseModel):
    """Request para subir extracto bancario"""
    mes: int
    año: int


class ResponseUploadExtracto(BaseModel):
    """Response после subir extracto"""
    success: bool
    mensaje: str
    total_movimientos: int
    movimientos: List[Dict[str, Any]]
    resumen: Dict[str, Any]


class RequestUploadExcelContable(BaseModel):
    """Request para subir Excel contable"""
    nombre_archivo: str
    hoja_mes: Optional[int] = None


class ResponseUploadExcelContable(BaseModel):
    """Response después de subir Excel contable"""
    success: bool
    mensaje: str
    hoja: str
    total_ingresos: int
    total_gastos: int
    movimientos: List[Dict[str, Any]]


class RequestConciliar(BaseModel):
    """Request para realizar conciliación"""
    mes: int
    año: int


class ResponseConciliar(BaseModel):
    """Response después de conciliación"""
    success: bool
    mensaje: str
    conciliados: List[Dict[str, Any]]
    no_conciliados: List[Dict[str, Any]]
    diferencias: List[Dict[str, Any]]
    resumen: Dict[str, Any]


class AsientoBase(BaseModel):
    descripcion: str
    importe: float
    fecha: date


class AsientoCreate(AsientoBase):
    pass


class Asiento(AsientoBase):
    id: int

    class Config:
        from_attributes = True
