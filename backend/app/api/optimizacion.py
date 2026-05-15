from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List
import pandas as pd
import io
import base64
from datetime import datetime, timedelta
import math
import requests

router = APIRouter()

# =========================
# CONSTANTES
# =========================
PARKING_TIME = 10 / 60  # 10 minutos en horas
MAX_HORAS = 8.0
HORA_INICIO = datetime.strptime("07:00", "%H:%M")


# =========================
# DISTANCIA
# =========================
def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371

    lat1_rad = math.radians(lat1)
    lon1_rad = math.radians(lon1)
    lat2_rad = math.radians(lat2)
    lon2_rad = math.radians(lon2)

    dlon = lon2_rad - lon1_rad
    dlat = lat2_rad - lat1_rad

    a = math.sin(dlat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def get_travel_time_real(lat1, lon1, lat2, lon2, fallback_speed_kmh=30):
    try:
        if (lat1 == 0 and lon1 == 0) or (lat2 == 0 and lon2 == 0):
            return 0.5

        url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false"
        response = requests.get(url, timeout=3)

        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "Ok" and data.get("routes"):
                return data["routes"][0]["duration"] / 3600.0

    except Exception:
        pass

    return haversine_distance(lat1, lon1, lat2, lon2) / fallback_speed_kmh


# =========================
# MODELOS
# =========================
class CommunityInput(BaseModel):
    address: str
    cleaningHours: float = Field(..., gt=0)
    cleaningDaysPerWeek: int = Field(..., gt=0, le=7)
    latitude: float
    longitude: float


class OptimizationRequest(BaseModel):
    numEmployees: int = Field(2, ge=1, le=2)
    communities: List[CommunityInput]


# =========================
# UTILIDAD BALANCE
# =========================
def carga_total(emp, asignacion):
    return sum(
        c.cleaningHours * c.cleaningDaysPerWeek
        for c in asignacion[emp]
    )


# =========================
# ENDPOINT PRINCIPAL
# =========================
@router.post("/calcular")
async def calcular_optimizacion(request: OptimizationRequest):

    if request.numEmployees != 2:
        raise HTTPException(status_code=400, detail="Solo 2 empleadas soportadas.")

    dias_semana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]

    horarios = {
        "Empleada 1": {d: [] for d in dias_semana},
        "Empleada 2": {d: [] for d in dias_semana}
    }

    carga_horas = {
        "Empleada 1": {d: 0.0 for d in dias_semana},
        "Empleada 2": {d: 0.0 for d in dias_semana}
    }

    no_asignadas = {d: [] for d in dias_semana}

    # =========================================================
    # PASO 1: ASIGNACIÓN INTELIGENTE (DISTANCIA + BALANCE)
    # =========================================================
    asignacion_comunidades = {
        "Empleada 1": [],
        "Empleada 2": []
    }

    for comm in request.communities:

        def coste(emp):
            # Calculamos la carga actual de ambas
            c1 = carga_total("Empleada 1", asignacion_comunidades)
            c2 = carga_total("Empleada 2", asignacion_comunidades)
            
            # Proyectamos la carga sumando la comunidad actual a la empleada evaluada
            carga_nueva = comm.cleaningHours * comm.cleaningDaysPerWeek
            if emp == "Empleada 1":
                c1 += carga_nueva
            else:
                c2 += carga_nueva

            # El balance es la diferencia absoluta proyectada
            balance_proyectado = abs(c1 - c2)

            if not asignacion_comunidades[emp]:
                dist = 0
            else:
                # Distancia mínima al grupo ya asignado a esta empleada
                dist = min(
                    haversine_distance(comm.latitude, comm.longitude, c.latitude, c.longitude)
                    for c in asignacion_comunidades[emp]
                )

            # Multiplicamos el balance por un factor (ej. 20) para que 1h de diferencia 
            # pese tanto como 20km de distancia, forzando un reparto más equitativo.
            return dist + (balance_proyectado * 20.0)

        emp = min(["Empleada 1", "Empleada 2"], key=coste)

        asignacion_comunidades[emp].append(comm)

    # =========================================================
    # PASO 2: ORDENACIÓN DE RUTAS POR PROXIMIDAD
    # =========================================================
    planificacion_diaria = {
        emp: {d: [] for d in dias_semana}
        for emp in asignacion_comunidades
    }

    for emp, comunidades in asignacion_comunidades.items():

        pendientes = comunidades[:]
        dia_idx = 0

        while pendientes and dia_idx < len(dias_semana):

            dia = dias_semana[dia_idx]
            ruta = []
            carga_dia = 0.0

            while pendientes:

                if not ruta:
                    siguiente = max(pendientes, key=lambda x: x.cleaningHours)
                    viaje = 0.0
                else:
                    ultima = ruta[-1]

                    siguiente = min(
                        pendientes,
                        key=lambda x: haversine_distance(
                            ultima.latitude,
                            ultima.longitude,
                            x.latitude,
                            x.longitude
                        )
                    )

                    viaje = get_travel_time_real(
                        ultima.latitude,
                        ultima.longitude,
                        siguiente.latitude,
                        siguiente.longitude
                    ) + PARKING_TIME

                if carga_dia + viaje + siguiente.cleaningHours <= MAX_HORAS:
                    ruta.append(siguiente)
                    pendientes.remove(siguiente)
                    carga_dia += viaje + siguiente.cleaningHours
                else:
                    break

            planificacion_diaria[emp][dia] = ruta
            dia_idx += 1

    # =========================================================
    # PASO 3: GENERACIÓN DE HORARIOS
    # =========================================================
    for emp in horarios:

        for dia in dias_semana:

            tareas = planificacion_diaria[emp][dia]
            tiempo = 0.0
            pos = None

            for i, c in enumerate(tareas):

                if i == 0:
                    viaje = 0.0
                else:
                    viaje = get_travel_time_real(
                        pos[0], pos[1],
                        c.latitude, c.longitude
                    ) + PARKING_TIME

                inicio = HORA_INICIO + timedelta(hours=tiempo + viaje)
                fin = inicio + timedelta(hours=c.cleaningHours)

                horarios[emp][dia].append({
                    "comunidad": c.address,
                    "inicio": inicio.strftime("%H:%M"),
                    "fin": fin.strftime("%H:%M"),
                    "horas": c.cleaningHours,
                    "viaje_previo_horas": round(viaje, 2)
                })

                tiempo += viaje + c.cleaningHours
                pos = (c.latitude, c.longitude)

                carga_horas[emp][dia] = round(tiempo, 2)

                if tiempo > MAX_HORAS:
                    no_asignadas[dia].append(c.address)

    # =========================================================
    # EXPORT EXCEL
    # =========================================================
    rows = []

    for emp, dias in horarios.items():
        for dia, tareas in dias.items():

            if not tareas:
                rows.append({
                    "Empleada": emp,
                    "Día": dia,
                    "Horario": "Sin tareas",
                    "Comunidad": "-"
                })

            for t in tareas:
                rows.append({
                    "Empleada": emp,
                    "Día": dia,
                    "Horario": f"{t['inicio']} - {t['fin']}",
                    "Comunidad": t["comunidad"],
                    "Horas": t["horas"]
                })

    df = pd.DataFrame(rows)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Planificacion")

    excel_data = base64.b64encode(output.getvalue()).decode("utf-8")

    return {
        "status": "ok",
        "excel_archivo": excel_data,
        "nombre_archivo": f"Planificacion_{datetime.now().strftime('%Y%m%d')}.xlsx",
        "horarios": horarios,
        "resumen": carga_horas,
        "no_asignadas": no_asignadas
    }

@router.post("/importar-comunidades")
async def importar_comunidades(file: UploadFile = File(...)):
    """Procesa un Excel y extrae la lista de comunidades."""
    try:
        contenido = await file.read()
        df = pd.read_excel(io.BytesIO(contenido))
        
        if df.empty:
            raise HTTPException(status_code=400, detail="El archivo Excel está vacío.")
        
        # Normalizar nombres de columnas para facilitar el mapeo
        df.columns = [str(c).strip().lower() for c in df.columns]
        
        mapeo = {
            "comunidad": ["comunidad", "direccion", "nombre", "ubicacion"],
            "horas": ["horas", "duracion", "tiempo"],
            "dias_semana": ["dias_semana", "frecuencia", "dias", "visitas"],
            "latitud": ["latitud", "lat"],
            "longitud": ["longitud", "lon", "lng"]
        }
        
        comunidades = []
        for i, row in df.iterrows():
            try:
                # Intentar encontrar las columnas por alias
                addr = str(row[next(c for c in mapeo["comunidad"] if c in df.columns)])
                hrs = float(row[next(c for c in mapeo["horas"] if c in df.columns)])
                days = int(row[next(c for c in mapeo["dias_semana"] if c in df.columns)])
                lat = float(row[next(c for c in mapeo["latitud"] if c in df.columns)])
                lon = float(row[next(c for c in mapeo["longitud"] if c in df.columns)])

                comunidades.append({
                    "id": len(comunidades) + 1,
                    "address": addr,
                    "cleaningHours": hrs,
                    "cleaningDaysPerWeek": days,
                    "latitude": lat,
                    "longitude": lon
                })
            except (StopIteration, ValueError, TypeError):
                continue # Saltar filas con errores o falta de datos críticos
            
        return {"status": "ok", "comunidades": comunidades}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer el Excel: {str(e)}")