from sqlalchemy import Column, Integer, String, Float, Date, Boolean, Text, ForeignKey, DateTime, UniqueConstraint
from sqlalchemy.orm import relationship
from .database import Base
from datetime import datetime


class Movimiento(Base):
    """
    Modelo para almacenar movimientos bancarios procesados
    """
    __tablename__ = "movimientos"
    
    id = Column(Integer, primary_key=True, index=True)
    extracto_id = Column(Integer, ForeignKey("extractos_procesados.id", ondelete="CASCADE"), nullable=True)
    fecha = Column(Date, nullable=True)
    concepto = Column(String(500), nullable=False)
    concepto_original = Column(String(500), nullable=True)
    importe = Column(Float, nullable=False)
    saldo = Column(Float, nullable=True)
    ordenante = Column(String(255), nullable=True)
    
    # Campos específicos del esquema de base de datos compartido
    piso_detectado = Column(String(20), nullable=True)
    confianza_clasificacion = Column(Float, nullable=True)
    editado_manualmente = Column(Boolean, default=False)
    community_id = Column(Integer, ForeignKey("comunidades.id", ondelete="CASCADE"), nullable=True)
    user_id = Column(String(255), nullable=True) # UUID de Supabase
    
    # Clasificación
    piso = Column(String(10), nullable=True)  # Piso identificado (ej: "2J")
    tipo = Column(String(20), nullable=False)  # ingreso/gasto
    categoria = Column(String(50), nullable=False)  # Gasto Luz, Ingreso Cuota, etc.
    confianza = Column(Float, default=0.0)  # 0-1
    
    # Metadatos
    mes = Column(Integer, nullable=True)
    año = Column(Integer, nullable=True)
    banco = Column(String(50), nullable=True)
    estado = Column(String(20), default='pendiente')  # pendiente/procesado/conciliado
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<Movimiento {self.id}: {self.concepto} - {self.importe}>"

class ExtractoProcesado(Base):
    """
    Modelo para registrar la subida de un archivo de extracto
    """
    __tablename__ = "extractos_procesados"
    
    id = Column(Integer, primary_key=True, index=True)
    comunidad_id = Column(Integer, ForeignKey("comunidades.id", ondelete="CASCADE"), nullable=False)
    nombre_archivo = Column(String(255), nullable=False)
    fecha_subida = Column(DateTime, default=datetime.utcnow)
    mes_contable = Column(Integer, nullable=True)
    anio_contable = Column(Integer, nullable=True)
    user_id = Column(String(255), nullable=True)

    def __repr__(self):
        return f"<ExtractoProcesado {self.nombre_archivo}>"


class Piso(Base):
    """
    Modelo para almacenar los pisos/unidades de la comunidad
    """
    __tablename__ = "pisos"
    
    id = Column(Integer, primary_key=True, index=True)
    community_id = Column(Integer, ForeignKey("comunidades.id", ondelete="CASCADE"), nullable=False)
    codigo = Column(String(10), nullable=False)  # Ej: "2J", "1A", "BAJO"
    propietario = Column(String(200), nullable=True)
    telefono = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    observaciones = Column(Text, nullable=True)
    
    # El user_id permite que un vecino se loguee y vea este piso
    user_id = Column(String(255), nullable=True) # ID de Supabase Auth
    
    # Estado
    activo = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Restricción: El código de piso es único dentro de una comunidad
    __table_args__ = (
        UniqueConstraint('community_id', 'codigo', name='_piso_comunidad_uc'),
    )
    
    def __repr__(self):
        return f"<Piso {self.codigo}>"


class Categoria(Base):
    """
    Modelo para categorías de clasificación
    """
    __tablename__ = "categorias"
    
    id = Column(Integer, primary_key=True, index=True)
    nombre = Column(String(50), unique=True, nullable=False)  # Gasto Luz, Ingreso Alquiler, etc.
    tipo = Column(String(20), nullable=False)  # ingreso/gasto
    descripcion = Column(Text, nullable=True)
    
    # Palabras clave para regex (JSON)
    palabras_clave = Column(Text, nullable=True)  # JSON array: ["iberdrola", "luz", "electricidad"]
    
    # Estado
    activo = Column(Boolean, default=True)
    
    def __repr__(self):
        return f"<Categoria {self.nombre}>"


class MovimientoAprendizaje(Base):
    """
    Modelo para almacenar movimientos clasificados manualmente (training data)
    """
    __tablename__ = "movimientos_aprendizaje"
    
    id = Column(Integer, primary_key=True, index=True)
    concepto = Column(String(500), nullable=False)
    importe = Column(Float, nullable=False)
    
    # Clasificación correcta (labeled)
    piso_correcto = Column(String(10), nullable=True)
    tipo_correcto = Column(String(20), nullable=False)
    categoria_correcta = Column(String(50), nullable=False)
    
    # Metadatos
    fecha_clasificacion = Column(DateTime, default=datetime.utcnow)
    fuente = Column(String(50), default='manual')  # manual/extrato/excel
    
    def __repr__(self):
        return f"<MovimientoAprendizaje {self.id}: {self.categoria_correcta}>"


class Configuracion(Base):
    """
    Configuración del sistema
    """
    __tablename__ = "configuracion"
    
    id = Column(Integer, primary_key=True, index=True)
    clave = Column(String(50), unique=True, nullable=False)
    valor = Column(Text, nullable=False)
    descripcion = Column(Text, nullable=True)
    
    def __repr__(self):
        return f"<Configuracion {self.clave}>"
