# Sistema de Procesamiento de Extractos Bancarios

## Descripción

Sistema completo para procesar extractos bancarios con las siguientes características:

1. **Reconocimiento automático de piso** (ej: "2J" desde "Carmen Santana Fleitas 2J")
2. **Clasificación automática** de movimientos (ingreso/gasto, categoría)
3. **Edición manual** de clasificaciones antes de descargar
4. **Descarga** en CSV o Excel

## Arquitectura

```
OptiFincas/
├── backend/
│   ├── app/
│   │   ├── main.py           # API FastAPI principal
│   │   ├── models.py        # Modelos SQLAlchemy
│   │   ├── schemas.py     # Schemas Pydantic
│   │   ├── ml/
│   │   │   └── clasificador_ml.py  # Clasificador ML + Regex
│   │   └── procesamiento/
│   │       └── clasificador.py  # Clasificador base
│   └── requirements.txt
├── frontend/
│   ├── index.html      # Página principal
│   ├── styles.css     # Estilos
│   ├── app.js        # App principal
│   ├── pantalla1.js # Subir archivos
│   ├── pantalla2.js # Editar tabla
│   ├── pantalla3.js # Descargas
│   └── utils/
│       ├── api.js    # Cliente API
│       └── tipos.js # Tipos
└── TODO.md
```

## Cómo Funciona

### Flujo de 3 Pantallas

**Pantalla 1: Subir Archivos**
- Sube el extracto bancario (CSV/Excel)
- (Opcional) Sube el Excel contable
- Haz clic en "Entrenar Modelo" para procesar
- Haz clic en "Siguiente" para ir a编辑ar

**Pantalla 2: Revisar y Editar**
- Verifica las clasificaciones automáticas
- Edita si es necesario:
  - **Tipo**: Ingreso / Gasto
  - **Categoría**: Selecciona de la lista
  - **Piso**: Escribe el piso (ej: "2J")
- Haz clic en "Confirmar y Descargar" para generar el CSV

**Pantalla 3: Descargas**
- Descarga el CSV clasificado
- Descarga el Excel completo con resumen

### Detección de Piso

El sistema detecta automáticamente patrones como:
- `2J`, `1A`, `3B` (número + letra)
- `A1`, `B2` (letra + número)
- `piso 2`, `planta 3`

Ejemplo:
- Concepto: "Carmen Santana Fleitas 2J"
- → Piso detectado: "2J"

### Clasificación Automática

El sistema usa:
1. **Machine Learning** - Aprende de los ejemplos
2. **Regex** - Detección por palabras clave
3. **Importe** - Si es positivo = ingreso, negativo = gasto

Categorías por defecto:
- **Ingresos**: Ingreso Cuota, Ingreso Alquiler, Ingreso Otros
- **Gastos**: Gasto Luz, Gasto Agua, Gasto Gas, Gasto Limpieza, Gasto Mantenimiento, Gasto Seguro, Gasto Basura, Gasto Varios

## Ejecutar el Sistema

### 1. Instalar dependencias

```bash
cd backend
pip install -r requirements.txt
```

### 2. Iniciar el servidor

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

### 3. Abrir el frontend

Abre el archivo `frontend/index.html` en el navegador:

```bash
# En Windows
start frontend/index.html

# O directamente en el navegador
http://127.0.0.1:8000
```

## API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/opciones` | GET | Opciones para selects |
| `/api/entrenar` | POST | Entrenar modelo |
| `/api/procesar` | POST | Procesar movimientos |
| `/api/confirmar` | POST | Confirmar y descargar CSV |
| `/api/descargar-excel` | POST | Descargar Excel completo |

## Estructura del CSV de Salida

```csv
fecha,concepto,importe,piso,tipo,categoria,confianza
2024-01-15,Carmen Santana Fleitas 2J,150.00,2J,ingreso,Ingreso Cuota,0.85
2024-01-16,IBERDROLA DISTRIBUCION,-45.00,,gasto,Gasto Luz,0.90
```

## Personalización

### Añadir más categorías

Edita `backend/app/ml/clasificador_ml.py`:

```python
self.reglas = {
    "Nueva Categoría": {
        "palabras": ["palabra1", "palabra2"],
        "tipo": "gasto"  # o "ingreso"
    },
    # ...
}
```

### Cambiar patrones de piso

Edita los patrones regex en `patrones_piso`:

```python
self.patrones_piso = [
    r'\b(\d+[A-Za-z])\b',  # 2J
    r'\b([A-Za-z]\d+)\b',  # J2
    # Añade más patrones...
]
```

## Solución de Problemas

### Error: No se pudo leer el archivo
- Verifica que el archivo sea CSV o Excel válido
- Comprueba que tenga columna de "importe"

### Error: CORS
- El servidor debe tener CORS habilitado (ya configurado)

### No detecta el piso
- Verifica que el concepto contenga el formato correcto (ej: "2J")
- Prueba con mayúsculas o minúsculas

## Licencia

MIT - Sistema creado para gestión de comunidades de propietarios
