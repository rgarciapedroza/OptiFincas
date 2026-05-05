#!/usr/bin/env python
"""
Script para inicializar el proyecto completo
=====================================

Usage:
    python iniciar_proyecto.py

Esto abrirá:
1. El servidor backend en http://127.0.0.1:8000
2. El frontend en tu navegador
"""

import os
import sys
import webbrowser
import subprocess
import time
import signal

# Rutas
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_HTML = os.path.join(BASE_DIR, "frontend", "index.html")

# Colores para la terminal
class Colores:
    VERDE = '\033[92m'
    AZUL = '\033[94m'
    AMARILLO = '\033[93m'
    ROJO = '\033[91m'
    RESET = '\033[0m'


def print_success(msg):
    print(f"{Colores.VERDE}✓{Colores.RESET} {msg}")


def print_info(msg):
    print(f"{Colores.AZUL}ℹ{Colores.RESET} {msg}")


def print_warning(msg):
    print(f"{Colores.AMARILLO}⚠{Colores.RESET} {msg}")


def print_error(msg):
    print(f"{Colores.ROJO}✗{Colores.RESET} {msg}")


def check_dependencies():
    """Verifica que las dependencias estén instaladas"""
    print_info("Verificando dependencias...")
    
    required = ['fastapi', 'uvicorn', 'pandas', 'openpyxl', 'scikit-learn']
    missing = []
    
    for package in required:
        try:
            __import__(package.replace('-', '_'))
        except ImportError:
            missing.append(package)
    
    if missing:
        print_warning(f"Dependencias faltantes: {', '.join(missing)}")
        print_info("Instalando...")
        
        # Intentar instalar
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install"] + missing,
            cwd=BACKEND_DIR,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print_success("Dependencias instaladas")
            return True
        else:
            print_error(f"Error instalando: {result.stderr}")
            return False
    
    print_success("Dependencias OK")
    return True


def install_requirements():
    """Instala los requirements.txt"""
    requirements_file = os.path.join(BACKEND_DIR, "requirements.txt")
    
    if not os.path.exists(requirements_file):
        print_warning("No encontrado requirements.txt, usando pip install básico")
        return True
    
    print_info("Instalando dependencias desde requirements.txt...")
    
    result = subprocess.run(
        [sys.executable, "-m", "pip", "install", "-r", "requirements.txt"],
        cwd=BACKEND_DIR,
        capture_output=True,
        text=True
    )
    
    if result.returncode == 0:
        print_success("Dependencias instaladas")
        return True
    else:
        print_warning(f"Algunos errores: {result.stderr[:200]}")
        return True  # Continuar de todos modos


def start_backend():
    """Inicia el servidor backend"""
    print_info("Iniciando servidor backend...")
    print_info("  URL: http://127.0.0.1:8000")
    print_info("  API Docs: http://127.0.0.1:8000/docs")
    
    # Cambiar al directorio backend
    os.chdir(BACKEND_DIR)
    
    # Iniciar uvicorn
    process = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "app.main:app", 
         "--host", "127.0.0.1", "--port", "8000", "--reload"],
        cwd=BACKEND_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )
    
    # Esperar a que el servidor arranque
    time.sleep(3)
    
    # Verificar si arrancó
    if process.poll() is not None:
        # El proceso terminó, error
        output, _ = process.communicate()
        print_error(f"Error iniciando: {output}")
        return None
    
    print_success("Servidor backend iniciado")
    return process


def open_frontend():
    """Abre el frontend en el navegador"""
    print_info("Abriendo frontend en el navegador...")
    
    # Convertir a ruta absoluta
    abs_path = os.path.abspath(FRONTEND_HTML)
    
    # Abrir con el navegador
    webbrowser.open(f"file://{abs_path}")
    print_success("Frontend abierto")


def main():
    """Función principal"""
    print("\n" + "="*50)
    print("  🏦 INICIANDO PROCESADOR DE EXTRACTOS")
    print("="*50 + "\n")
    
    # 1. Verificar/instalar dependencias
    install_requirements()
    
    # 2. Iniciar backend
    backend_process = start_backend()
    
    if backend_process is None:
        print_error("No se pudo iniciar el backend")
        print_info("Intenta manualmente:")
        print(f"  cd {BACKEND_DIR}")
        print(f"  {sys.executable} -m uvicorn app.main:app --reload")
        return
    
    # 3. Abrir frontend
    time.sleep(2)
    open_frontend()
    
    print("\n" + "="*50)
    print("  ✅ SISTEMA INICIADO")
    print("="*50)
    print("\n  Frontend: Abre el archivo frontend/index.html")
    print("  Backend:  http://127.0.0.1:8000")
    print("  API Docs: http://127.0.0.1:8000/docs")
    print("\n  Presiona Ctrl+C para detener el servidor")
    print("="*50 + "\n")
    
    try:
        # Mantener el proceso alive
        while True:
            time.sleep(1)
            if backend_process.poll() is not None:
                print_error("El servidor se detuvo")
                break
    except KeyboardInterrupt:
        print_info("\nDeteniendo servidor...")
        backend_process.terminate()
        backend_process.wait()
        print_success("Servidor detenido")


if __name__ == "__main__":
    main()
