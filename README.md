# OptiFincas

Aplicación para optimización financiera de fincas mediante procesamiento de extractos bancarios.

## Estructura del proyecto

```
OptiFincas/
├── backend/          # API FastAPI
├── data/             # Datos raw y procesados
├── frontend/         # (por desarrollar)
└── docker-compose.yml
```

## Desarrollo

1. Instalar dependencias: `cd backend && pip install -r requirements.txt`
2. Ejecutar API: `cd backend && uvicorn app.main:app --reload`
3. Colocar extractos en `data/raw/`

## Docker

```bash
docker-compose up --build
```

