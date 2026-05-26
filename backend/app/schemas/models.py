from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
class PisoCreate(BaseModel):
    comunidad_id: Optional[int] = None
    nombre: Optional[str] = None
    numero: Optional[int] = None
    orden: Optional[int] = None
    # Permite compatibilidad si llegan campos extra desde el frontend
    extra_fields: Dict[str, Any] = Field(default_factory=dict)
class PisoUpdate(BaseModel):
    nombre: Optional[str] = None
    numero: Optional[int] = None
    orden: Optional[int] = None
    extra_fields: Dict[str, Any] = Field(default_factory=dict)
