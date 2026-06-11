# Guía Detallada de Instalación - OptiFincas

Este documento detalla los requisitos y pasos necesarios para desplegar el sistema OptiFincas, tanto en entornos de desarrollo como de producción.

## 1. Requisitos Previos

- **Docker & Docker Compose**: Versión mínima 20.10.
- **Node.js**: v18+ (Solo para desarrollo sin Docker).
- **Python**: 3.12+ (Solo para desarrollo sin Docker).
- **Supabase Account**: Se requiere un proyecto activo en Supabase para la base de datos y autenticación.

## 2. Configuración de Variables de Entorno

El sistema requiere un archivo `.env` en la carpeta `backend/` con los siguientes parámetros:

```env
DATABASE_URL=tu_url_de_supabase_postgres
SUPABASE_URL=tu_url_api_supabase
SUPABASE_KEY=tu_anon_key
SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key
OPENAI_API_KEY=tu_key_para_clasificacion_avanzada
```

En el frontend, configure `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  supabaseUrl: 'tu_url_api_supabase',
  supabaseKey: 'tu_anon_key'
};
```

## 3. Instalación con Docker (Recomendado)

Docker garantiza que todas las dependencias (Pandas, FastAPI, Angular, OR-Tools) se instalen correctamente sin conflictos en el sistema anfitrión.

```bash
docker compose up --build
```

## 4. Instalación Manual (Modo Desarrollo)

### Backend
1. `cd backend`
2. `python -m venv venv`
3. `source venv/bin/activate` (o `venv\Scripts\activate` en Windows)
4. `pip install -r requirements.txt`
5. `uvicorn app.main:app --reload`

### Frontend
1. `cd frontend`
2. `npm install`
3. `ng serve`

## 5. Solución de Problemas Comunes

### Error: No se pudo conectar a la base de datos
Verifique que su IP esté autorizada en el panel de control de Supabase (Network Restrictions) o que la cadena de conexión sea correcta.

### Error de CORS en el navegador
Asegúrese de que `BACKEND_URL` esté correctamente configurado en la lógica de middlewares de FastAPI para permitir peticiones desde `localhost:4200`.