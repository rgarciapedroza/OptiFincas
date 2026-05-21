#!/usr/bin/env python
"""
Script para inicializar el proyecto completo
=====================================

Usage:
    python iniciar_proyecto.py
"""

import os
import platform
import sys
import webbrowser
import subprocess
import time
import signal

# Rutas
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(BASE_DIR, "backend")
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

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

    # Mapeo de nombre de paquete pip a nombre de importación en Python
    packages = {
        'fastapi': 'fastapi',
        'uvicorn': 'uvicorn',
        'pandas': 'pandas',
        'openpyxl': 'openpyxl',
        'scikit-learn': 'sklearn',
        'supabase': 'supabase',
        'cryptography': 'cryptography',
        'python-dotenv': 'dotenv'
    }
    
    missing = []
    
    for package, import_name in packages.items():
        try:
            globals()[import_name] = __import__(import_name)
        except ImportError:
            missing.append((package, import_name))
    
    if missing: # Si hay dependencias faltantes, intentar instalarlas
        print_warning(f"Dependencias faltantes: {', '.join([m[0] for m in missing])}")
        print_info("Instalando...")
        
        # Intentar instalar
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install"] + [m[0] for m in missing],
            cwd=BACKEND_DIR,
            stdout=sys.stdout, # Mostrar la salida de pip install
            stderr=sys.stderr, # Mostrar errores de pip install
        )
        
        if result.returncode == 0:
            # Verificar de nuevo tras instalar
            for _, import_name in missing:
                try: __import__(import_name)
                except: 
                    print_error(f"Fallo crítico: No se pudo cargar {import_name} tras instalar.")
                    return False
            print_success("Dependencias instaladas y verificadas")
            return True
        else:
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
        stdout=sys.stdout, # Mostrar la salida de pip install
        stderr=sys.stderr, # Mostrar errores de pip install
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
         "--host", "0.0.0.0", "--port", "8000", "--reload"],
        cwd=BACKEND_DIR,
        stdout=sys.stdout, # Mostrar la salida de Uvicorn
        stderr=sys.stderr, # Mostrar errores de Uvicorn
        text=True,
        bufsize=1
    )
    
    # Esperar a que el servidor arranque
    time.sleep(3)
    
    # Verificar si el proceso terminó. 
    # Nota: Con --reload uvicorn a veces sigue vivo aunque la app no cargue, 
    # revisa los logs de la terminal para ver errores de ModuleNotFoundError.
    if process.poll() is not None:
        print_error("El servidor backend falló al iniciar. Revisa los errores anteriores.")
        return None
    
    print_success("Servidor backend iniciado")
    return process


def start_frontend():
    """Inicia el servidor de desarrollo de Angular (Node)"""
    print_info("Iniciando servidor de desarrollo de Angular...")

    # Determinar comando npm según el SO
    npm_cmd = "npm.cmd" if platform.system() == "Windows" else "npm"
    
    # Asegurar instalación de dependencias de seguridad del frontend (crypto-js)
    print_info("Verificando dependencias de frontend (crypto-js)...")
    subprocess.run(
        [npm_cmd, "install", "crypto-js", "@types/crypto-js"],
        cwd=FRONTEND_DIR,
        stdout=sys.stdout, # Mostrar la salida de npm install
        stderr=sys.stderr, # Mostrar errores de npm install
    )

    try:
        process = subprocess.Popen(
            [npm_cmd, "start"],
            cwd=FRONTEND_DIR,
            stdout=sys.stdout, # Mostrar la salida de Angular CLI
            stderr=sys.stderr, # Mostrar errores de Angular CLI
            text=True,
            bufsize=1,
            shell=True if platform.system() == "Windows" else False
        )
        
        print_info("  URL: http://localhost:4200")
        time.sleep(5) # Dar tiempo a que Node empiece a compilar
        
        # Abrir navegador
        webbrowser.open("http://localhost:4200")
        return process
    except Exception as e:
        print_error(f"No se pudo iniciar Angular: {e}")
        return None


def main():
    """Función principal"""
    print("\n" + "="*50)
    print("  🏦 INICIANDO PROCESADOR DE EXTRACTOS")
    print("="*50 + "\n")

    # 0. Verificar Node.js
    if subprocess.run(["node", "--version"], capture_output=True).returncode != 0:
        print_error("Node.js no está instalado o no está en el PATH")
        return

    # 1. Verificar/instalar dependencias
    check_dependencies()
    install_requirements()

    # 2. Iniciar backend
    backend_process = start_backend()
    
    if backend_process is None:
        print_error("No se pudo iniciar el backend")
        print_info("Intenta manualmente:")
        print(f"  cd {BACKEND_DIR}")
        print(f"  {sys.executable} -m uvicorn app.main:app --reload")
        return

    # 3. Iniciar frontend (Angular/Node)
    frontend_process = start_frontend()
    
    print("\n" + "="*50)
    print("  ✅ SISTEMA INICIADO")
    print("="*50)
    print("\n  Frontend: http://localhost:4200")
    print("  Backend:  http://127.0.0.1:8000")
    print("  API Docs: http://127.0.0.1:8000/docs")
    print("\n  Presiona Ctrl+C para detener ambos servidores")
    print("="*50 + "\n")
    
    try:
        while True:
            time.sleep(1)
            if backend_process.poll() is not None:
                print_error("El backend se detuvo")
                break
            if frontend_process and frontend_process.poll() is not None:
                print_error("El frontend se detuvo")
                break
    except KeyboardInterrupt:
        print_info("\nDeteniendo servidores...")
        try:
            backend_process.terminate()
            backend_process.wait(timeout=2)
        except:
            pass
        if frontend_process:
            try:
                frontend_process.terminate()
            except:
                pass
        print_success("Sistema detenido correctamente")


if __name__ == "__main__":
    main()
