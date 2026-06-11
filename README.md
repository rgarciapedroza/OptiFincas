# OptiFincas - Plataforma Integral de Gestión de Comunidades

## Descripción
OptiFincas es una solución web diseñada para la digitalización y optimización de la administración de fincas. La plataforma combina el procesamiento inteligente de datos financieros con la optimización logística de servicios de limpieza, proporcionando una herramienta integral tanto para administradores profesionales como para propietarios.

## Arquitectura
El sistema utiliza una arquitectura moderna basada en microservicios desacoplados y persistencia en la nube:

- **Backend**: API REST desarrollada con **Python 3.12** y **FastAPI**. Implementa motores de búsqueda difusa, clasificadores híbridos y algoritmos de optimización.
- **Frontend**: Aplicación SPA desarrollada con **Angular 18**, con un diseño orientado a la experiencia de usuario (UX) y gestión de roles.
- **Base de Datos y Auth**: **Supabase** (PostgreSQL) para la gestión de datos en tiempo real, almacenamiento de documentos y autenticación segura.
- **Infraestructura**: Despliegue mediante contenedores **Docker** para asegurar la reproducibilidad del entorno.

```
OptiFincas/
├── backend/        # Contiene la aplicación FastAPI (Python)
├── frontend/       # Contiene la aplicación Angular (TypeScript/Node.js)
├── docker-compose.yml # Orquestación de contenedores
└── README.md
```

## Cómo Funciona

### Flujo de 3 Pantallas

**Pantalla 1: Subir Archivos**
- Sube el extracto bancario (CSV/Excel)
- (Opcional) Sube el Excel contable
- El sistema procesa y entrena el modelo automáticamente
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

**Pantalla 4: Optimización de Rutas y Horarios**
- Introduce el número de empleadas (actualmente 2).
- Añade las comunidades a visitar, especificando:
  - Dirección
  - Horas de limpieza necesarias
  - Días a la semana que requiere limpieza
- Haz clic en "Calcular Ruta Óptima" para obtener el horario y la ruta más eficiente.

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

Categorías por defecto:
- **Ingresos**: Ingreso Cuota, Ingreso Alquiler, Ingreso Otros
- **Gastos**: Gasto Luz, Gasto Agua, Gasto Gas, Gasto Limpieza, Gasto Mantenimiento, Gasto Seguro, Gasto Basura, Gasto Varios

## Manual de Instalación y Ejecución (para el TFG)

### Requisitos
- Docker Desktop instalado (recomendado para evitar problemas de dependencias).

### Instalación
1. Abre una terminal en la carpeta raíz del proyecto (`OptiFincas/`).
2. Ejecuta el siguiente comando para construir y levantar todos los contenedores (Backend + Frontend + Postgres):
   ```bash
   docker compose up --build
   ```

### Ejecución
3. Espera a que los contenedores terminen de iniciarse.
4. Abre el Frontend en: `http://localhost:4200`.
5. Abre la documentación del Backend (API) en: `http://localhost:8000/docs`.

### Si se ejecuta sin Docker (solo por compatibilidad)
- Es necesario configurar el archivo `backend/.env` (incluido `DATABASE_URL`) y asegurar que existe un Postgres accesible.

### Verificación rápida
- Si el Frontend carga correctamente y en `/docs` se muestran los endpoints de FastAPI, la instalación es correcta.


## API Endpoints

| Endpoint | Método | Descripción |
|----------|--------|-------------|
| `/api/opciones` | GET | Opciones para selects |
| `/api/entrenar` | POST | Entrenar modelo |
| `/api/procesar` | POST | Procesar movimientos |
| `/api/confirmar` | POST | Confirmar y descargar CSV |
| `/api/descargar-excel` | POST | Descargar Excel completo |
| `/api/optimizacion/calcular` | POST | Calcula la ruta y el horario óptimo para las empleadas |

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
