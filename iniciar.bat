@echo off
echo ========================================
echo INICIANDO PROCESADOR DE EXTRACTOS
echo ========================================
echo.
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
pause