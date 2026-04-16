# backend/app/schemas.py
from pydantic import BaseModel
from datetime import date
from typing import Optional

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

