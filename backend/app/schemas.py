from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PisoCreate(BaseModel):
    comunidad_id: Optional[int] = Field(default=None)
    nombre: Optional[str] = None
    numero: Optional[int] = None
    orden: Optional[int] = None

    # Algunos flujos del sistema suelen enviar/consumir campos extra.
    # Para evitar romper compatibilidad, permitimos estructuras arbitrarias.
    extra_fields: Dict[str, Any] = Field(default_factory=dict)


class PisoUpdate(BaseModel):
    # campos típicos (opcionales para permitir update parcial)
    nombre: Optional[str] = None
    numero: Optional[int] = None
    orden: Optional[int] = None

    extra_fields: Dict[str, Any] = Field(default_factory=dict)


class MovimientoClasificadoExtracto(BaseModel):
    FECHA: Optional[str] = None
    ORDENANTE: Optional[str] = None
    OBSERVACIONES: Optional[str] = None
    IMPORTE: Optional[float] = None
    SALDO: Optional[float] = None
    CONCEPTO: Optional[str] = None

    piso: Optional[str] = None
    tipo: Optional[str] = None
    categoria: Optional[str] = None

    confianza: Optional[float] = None
    metodo_piso: Optional[str] = None

    # Mantiene compatibilidad si se incluyen claves adicionales
    extra_fields: Dict[str, Any] = Field(default_factory=dict)

    # Permite construir el modelo desde dicts con claves extra.
    @classmethod
    def model_validate(cls, obj: Any, *args: Any, **kwargs: Any) -> "MovimientoClasificadoExtracto":
        # pydantic v2: si llega un dict con claves no definidas, intentamos guardarlas.
        if isinstance(obj, dict):
            known = set(cls.model_fields.keys())
            extra = {k: v for k, v in obj.items() if k not in known}
            payload = {k: v for k, v in obj.items() if k in known}
            payload.setdefault("extra_fields", {}).update(extra)
            return super().model_validate(payload, *args, **kwargs)
        return super().model_validate(obj, *args, **kwargs)


class FinanzasReportRequest(BaseModel):
    # El código la usa como `data.model_dump()` para generar Excel.
    # Por tanto, estos campos deben cubrir la estructura esperada por el frontend/
    # y el generador de excel. Definimos una estructura flexible.

    # Entradas agregadas por categoría/tipo (si aplica)
    ingresos: Optional[List[Dict[str, Any]]] = None
    gastos: Optional[List[Dict[str, Any]]] = None

    # Version alternativa si el payload llega como agregados directos
    resumen: Optional[Dict[str, Any]] = None

    # Campos comunes para reportes financieros
    mes: Optional[int] = None
    anio: Optional[int] = None

    # Mantiene compatibilidad con payloads más ricos
    extra_fields: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def model_validate(cls, obj: Any, *args: Any, **kwargs: Any) -> "FinanzasReportRequest":
        if isinstance(obj, dict):
            known = set(cls.model_fields.keys())
            extra = {k: v for k, v in obj.items() if k not in known}
            payload = {k: v for k, v in obj.items() if k in known}
            payload.setdefault("extra_fields", {}).update(extra)
            return super().model_validate(payload, *args, **kwargs)
        return super().model_validate(obj, *args, **kwargs)

