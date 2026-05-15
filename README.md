# Sistema de Procesamiento de Extractos Bancarios

## Descripción

Sistema completo para procesar extractos bancarios con las siguientes características:

1. **Reconocimiento automático de piso** (ej: "2J" desde "Carmen Santana Fleitas 2J")
2. **Clasificación automática** de movimientos (ingreso/gasto, categoría)
3. **Edición manual** de clasificaciones antes de descargar
4. **Descarga** en CSV o Excel

## Arquitectura

El sistema se compone de dos partes principales:

1.  **Backend (Python FastAPI):**
    *   Ubicación: `backend/`
    *   Tecnología: Python con el framework FastAPI.
    *   Funcionalidad: Procesa los archivos de extractos bancarios, aplica lógica de Machine Learning y expresiones regulares para la clasificación de movimientos y detección de pisos, y expone una API RESTful para el frontend.

2.  **Frontend (Angular):**
    *   Ubicación: `frontend/`
    *   Tecnología: Angular (TypeScript) con Node.js para el entorno de desarrollo y gestión de dependencias.
    *   Funcionalidad: Proporciona la interfaz de usuario para subir archivos, visualizar y editar los movimientos clasificados, y descargar los resultados.

La comunicación entre el Frontend y el Backend se realiza a través de la API REST.

```
OptiFincas/
├── backend/        # Contiene la aplicación FastAPI (Python)
├── frontend/       # Contiene la aplicación Angular (TypeScript/Node.js)
├── iniciar_proyecto.py # Script para iniciar ambos servidores en desarrollo
└── README.md
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

Para iniciar el sistema completo (Backend y Frontend) en modo desarrollo:

1.  **Abre una terminal** en la carpeta raíz del proyecto (`OptiFincas/`).
2.  **Ejecuta el script de inicio:**
    ```bash
    python iniciar_proyecto.py
    ```
    Este script se encargará de:
    *   Verificar e instalar las dependencias de Python y Node.js.
    *   Iniciar el servidor Backend de FastAPI en `http://127.0.0.1:8000`.
    *   Iniciar el servidor de desarrollo de Angular en `http://localhost:4200`.
    *   Abrir automáticamente tu navegador en la URL del Frontend.

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
