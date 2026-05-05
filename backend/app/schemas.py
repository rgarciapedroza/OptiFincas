from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


# ==================== Esquemas de Movimiento ====================

class MovimientoBase(BaseModel):
    """Base schema for movimiento"""
    fecha: Optional[date] = None
    concepto: str = Field(..., description="Concepto del movimiento")
    concepto_original: Optional[str] = None
    importe: float
    saldo: Optional[float] = None


class MovimientoCreate(MovimientoBase):
    """Schema for creating a movimiento"""
    piso: Optional[str] = None
    tipo: str
    categoria: str
    mes: Optional[int] = None
    año: Optional[int] = None


class MovimientoUpdate(BaseModel):
    """Schema for updating a movimiento"""
    piso: Optional[str] = None
    tipo: Optional[str] = None
    categoria: Optional[str] = None
    confianza: Optional[float] = None


class MovimientoResponse(MovimientoBase):
    """Schema for movimiento response"""
    id: int
    piso: Optional[str] = None
    tipo: str
    categoria: str
    confianza: float
    mes: Optional[int] = None
    año: Optional[int] = None
    banco: Optional[str] = None
    estado: str
    created_at: datetime
    
    class Config:
        from_attributes = True


class MovimientoClasificado(MovimientoBase):
    """Schema for classified movement (returned to frontend)"""
    id: int
    piso: Optional[str] = None
    tipo: str
    categoria: str
    confianza: float
    editable: bool = True  # Can be edited by user
    
    class Config:
        from_attributes = True


class MovimientoEditable(MovimientoBase):
    """Schema for editable movement in frontend"""
    id: int
    piso: Optional[str] = ""
    tipo: str
    categoria: str
    confianza: float
    tipo_opciones: List[str] = ["ingreso", "gasto"]
    categoria_opciones: List[str] = []
    
    class Config:
        from_attributes = True


# ==================== Esquemas de Piso ====================

class PisoBase(BaseModel):
    """Base schema for piso"""
    codigo: str = Field(..., description="Código del piso (ej: 2J, 1A)")
    propietario: Optional[str] = None
    telefono: Optional[str] = None
    email: Optional[str] = None
    observaciones: Optional[str] = None


class PisoCreate(PisoBase):
    """Schema for creating a piso"""
    pass


class PisoResponse(PisoBase):
    """Schema for piso response"""
    id: int
    activo: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ==================== Esquemas de Categoría ====================

class CategoriaBase(BaseModel):
    """Base schema for categoria"""
    nombre: str
    tipo: str  # ingreso/gasto
    descripcion: Optional[str] = None
    palabras_clave: Optional[List[str]] = None


class CategoriaCreate(CategoriaBase):
    """Schema for creating a categoria"""
    pass


class CategoriaResponse(CategoriaBase):
    """Schema for categoria response"""
    id: int
    activo: bool
    
    class Config:
        from_attributes = True


# ==================== Esquemas de MovimientoAprendizaje ====================

class MovimientoAprendizajeBase(BaseModel):
    """Base schema for movimiento de aprendizaje"""
    concepto: str
    importe: float
    piso_correcto: Optional[str] = None
    tipo_correcto: str
    categoria_correcta: str


class MovimientoAprendizajeCreate(MovimientoAprendizajeBase):
    """Schema for creating aprendizaje data"""
    pass


class MovimientoAprendizajeResponse(MovimientoAprendizajeBase):
    """Schema for aprendizaje response"""
    id: int
    fecha_clasificacion: datetime
    fuente: str
    
    class Config:
        from_attributes = True


# ==================== Esquemas de Procesamiento ====================

class ProcesarRequest(BaseModel):
    """Request para procesar movimentos"""
    mes: int = Field(..., ge=1, le=12)
    año: int = Field(..., ge=2000, le=2100)
    force_retrain: bool = False


class ProcesarResponse(BaseModel):
    """Response del procesamiento"""
    estado: str
    total_movimientos: int
    movimientos_clasificados: List[MovimientoEditable]
    resumen: dict
    pisos_encontrados: List[str]
    errores: List[str] = []


class EntrenarResponse(BaseModel):
    """Response del entrenamiento"""
    estado: str
    mensajes: List[str]
    precision: Optional[float] = None
    ejemplos_entrenados: int = 0


class DescargarRequest(BaseModel):
    """Request para descargar"""
    formato: str = "csv"  # csv/excel
    tipo_contenido: str = "clasificado"  # clasificado/completo


class DescargarResponse(BaseModel):
    """Response para descarga"""
    nombre_archivo: str
    contenido: str  # Base64 encoded
    mime_type: str


# ==================== Esquemas de Resumen ====================

class ResumenGeneral(BaseModel):
    """Resumen general de movimientos"""
    total_ingresos: float
    total_gastos: float
    saldo_neto: float
    num_movimientos: int


class ResumenCategoria(BaseModel):
    """Resumen por categoría"""
    categoria: str
    tipo: str
    total: float
    num_movimientos: int


class ResumenPiso(BaseModel):
    """Resumen por piso"""
    piso: str
    ingresos: float
    gastos: float
    saldo: float


# ==================== Esquemas de Error ====================

class ErrorResponse(BaseModel):
    """Schema for error responses"""
    detalle: str
    codigo: Optional[str] = None


class SuccessResponse(BaseModel):
    """Schema for success responses"""
    mensaje: str
    datos: Optional[dict] = None
