# backend/app/models.py
from sqlalchemy import Column, Integer, String, Float, Date
from .database import Base

# Example model
class Asiento(Base):
    __tablename__ = "asientos"
    id = Column(Integer, primary_key=True, index=True)
    descripcion = Column(String)
    importe = Column(Float)
    fecha = Column(Date)

