from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.api.rutas import router as api_router
from app.api.optimizacion import router as optimizacion_router
import os

app = FastAPI(title="API Procesador de Extractos")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(optimizacion_router, prefix="/api/optimizacion")

# --- Servir archivos estáticos de Angular (tras hacer npm run build) ---
# Calculamos la ruta absoluta a la carpeta 'dist' del frontend
base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
frontend_dist_root = os.path.join(base_dir, "frontend", "dist")

frontend_path = None

print(f"--- Diagnóstico de Frontend ---")
print(f"Ruta raíz buscada: {frontend_dist_root}")

# Estrategias para encontrar el 'index.html' dentro de la carpeta 'dist'
# 1. Directamente en 'dist/' (ej: frontend/dist/index.html)
if os.path.exists(os.path.join(frontend_dist_root, "index.html")):
    frontend_path = frontend_dist_root
# 2. En un subdirectorio de 'dist/' (ej: frontend/dist/optifincas/index.html)
elif os.path.isdir(frontend_dist_root):
    print(f"Contenido de dist: {os.listdir(frontend_dist_root)}")
    for entry in os.listdir(frontend_dist_root):
        potential_dir = os.path.join(frontend_dist_root, entry)
        if os.path.isdir(potential_dir) and os.path.exists(os.path.join(potential_dir, "index.html")):
            frontend_path = potential_dir
            break
        # 3. En un subdirectorio 'browser' dentro de un subdirectorio (ej: frontend/dist/optifincas/browser/index.html)
        if os.path.isdir(potential_dir):
            browser_path = os.path.join(potential_dir, "browser")
            if os.path.exists(os.path.join(browser_path, "index.html")):
                frontend_path = browser_path
                break

if frontend_path and os.path.exists(os.path.join(frontend_path, "index.html")):
    print(f"✅ Frontend detectado y listo en: {frontend_path}")
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="static")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        return FileResponse(os.path.join(frontend_path, "index.html"))
else:
    print(f"⚠️  ERROR: No se encontró index.html en {frontend_dist_root} o sus subdirectorios.")
    print("Asegúrate de haber ejecutado 'npm run build' en la carpeta frontend.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
