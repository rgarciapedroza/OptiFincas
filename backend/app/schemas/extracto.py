from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

class MovimientoBase(BaseModel):
    FECHA: str
    OBSERVACIONES: str
    IMPORTE: float
    SALDO: float
    CONCEPTO: str
    ORDENANTE: Optional[str] = None

class MovimientoClasificado(MovimientoBase):
    id: int
    piso: Optional[str] = ""
    tipo: str
    categoria: str
    confianza: float
    metodo_piso: Optional[str] = ""
    es_historico: Optional[bool] = False
    detalle_historico: Optional[Dict[str, Any]] = None

class IngresoPorPiso(BaseModel):
    codigo: str
    fecha: str
    importe: float

class GastoReporte(BaseModel):
    concepto: str
    importe: float

class ResumenCuentas(BaseModel):
    saldoAnterior: float
    ingresosMes: float
    gastosMes: float

class FinanzasReportRequest(BaseModel):
    ingresosPorPiso: List[IngresoPorPiso]
    gastos: List[GastoReporte]
    resumenCuentas: ResumenCuentas

class ConfirmarMensualRequest(BaseModel):
    movimientos: List[MovimientoClasificado]