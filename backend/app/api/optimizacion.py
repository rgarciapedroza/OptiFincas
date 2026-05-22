from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List
import pandas as pd
import io
import os
import base64
from datetime import datetime, timedelta
import math
import requests
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp
from dotenv import load_dotenv

router = APIRouter()

# Cargar variables de entorno desde el archivo .env
load_dotenv()

# =========================
# CONSTANTES
# =========================
PARKING_TIME_MINS = 10 
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


def get_travel_time_osrm(lat1, lon1, lat2, lon2):
    """Obtiene el tiempo de viaje en minutos usando OSRM."""
    try:
        # OSRM no tiene tráfico en tiempo real, usa el más rápido.
        # La URL de OSRM es para un par de puntos. Para una matriz, se harían múltiples llamadas.
        # Para simplificar, usaremos una instancia local o pública de OSRM.
        # router.project-osrm.org es una instancia pública, pero puede tener límites de uso.
        url = f"http://router.project-osrm.org/route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=false"
        response = requests.get(url, timeout=5)
        response.raise_for_status() # Lanza un error para códigos de estado HTTP erróneos
        data = response.json()
        
        if data.get("code") == "Ok" and data.get("routes"):
            # Duración en segundos, convertimos a minutos y añadimos parking
            duration_mins = (data["routes"][0]["duration"] / 60.0) + PARKING_TIME_MINS
            return int(duration_mins)
        else:
            print(f"OSRM no pudo encontrar ruta entre ({lat1},{lon1}) y ({lat2},{lon2}).")
            return 999 # Penalización
    except Exception as e:
        print(f"Error OSRM: {e}")
        # Fallback a distancia haversine si OSRM falla
        # Asumimos una velocidad promedio para convertir distancia a tiempo
        return int((haversine_distance(lat1, lon1, lat2, lon2) / 30.0) * 60) + PARKING_TIME_MINS # 30 km/h

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
    if not request.communities:
        raise HTTPException(status_code=400, detail="Debe proporcionar al menos una comunidad.")

    # 1. Preparación de datos globales
    depot_coords = (28.1281, -15.4468) 
    all_locations_coords = [(depot_coords[0], depot_coords[1])]
    all_locations_coords += [(c.latitude, c.longitude) for c in request.communities]
    num_locations = len(all_locations_coords)

    # 2. Generar Matriz de Tiempos Global (se calcula una vez para todos los puntos)
    matrix = [[0 for _ in range(num_locations)] for _ in range(num_locations)]
    for i in range(num_locations):
        for j in range(num_locations):
            if i == j: continue
            matrix[i][j] = get_travel_time_osrm(all_locations_coords[i][0], all_locations_coords[i][1],
                                              all_locations_coords[j][0], all_locations_coords[j][1])

    if not matrix:
        raise HTTPException(status_code=500, detail="No se pudo obtener la matriz de tiempos de OSRM.")

    # 3. Distribución de Frecuencia Semanal (Proximidad e Intercalado Aware)
    dias_semana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"]
    plan_por_dia = {d: [] for d in dias_semana}
    
    def get_valid_patterns(freq):
        """Genera combinaciones de días que favorecen la limpieza intercalada."""
        if freq <= 0: return []
        if freq >= 5: return [dias_semana]
        
        # Frecuencia 1: Cualquier día individual es válido
        if freq == 1:
            return [[d] for d in dias_semana]
        
        # Frecuencia 2: Prioriza días con separación (mínimo 1 día en medio)
        if freq == 2:
            return [
                ["Lunes", "Miércoles"], ["Lunes", "Jueves"], ["Lunes", "Viernes"],
                ["Martes", "Jueves"], ["Martes", "Viernes"], ["Miércoles", "Viernes"]
            ]
        
        # Frecuencia 3: El patrón óptimo es Lunes-Miércoles-Viernes
        if freq == 3:
            return [["Lunes", "Miércoles", "Viernes"]]
        
        # Frecuencia 4: Se deja libre un día intermedio o un extremo
        if freq == 4:
            return [
                ["Lunes", "Martes", "Jueves", "Viernes"],
                ["Lunes", "Miércoles", "Jueves", "Viernes"],
                ["Martes", "Miércoles", "Jueves", "Viernes"]
            ]
        return []

    # Repartir comunidades según frecuencia buscando el equilibrio de carga Y la cercanía geográfica.
    # Ordenamos por horas de mayor a menor para asignar primero lo más pesado.
    for comm in sorted(request.communities, key=lambda x: x.cleaningHours, reverse=True):
        patterns = get_valid_patterns(min(comm.cleaningDaysPerWeek, 5))
        if not patterns: continue

        def calcular_puntuacion_patron(pattern):
            score_total = 0
            for dia in pattern:
                carga_actual = sum(c.cleaningHours for c in plan_por_dia[dia])
                
                # Penalización por carga (para equilibrar los días de la semana)
                score_dia = carga_actual * 40
                
                if plan_por_dia[dia]:
                    # Puntuación por proximidad: ¿Este día ya tiene una comunidad cerca?
                    dist_min = min(
                        haversine_distance(comm.latitude, comm.longitude, c.latitude, c.longitude)
                        for c in plan_por_dia[dia]
                    )
                    # Bonus fuerte si hay una comunidad a menos de 500m (misma zona)
                    if dist_min < 0.5:
                        score_dia -= 150 # Prioridad máxima para agrupar
                    elif dist_min < 2.0:
                        score_dia -= 40
                
                score_total += score_dia
            return score_total

        # Seleccionamos la combinación de días (patrón) que tenga menor coste acumulado
        mejor_patron = min(patterns, key=calcular_puntuacion_patron)
        for d in mejor_patron:
            plan_por_dia[d].append(comm)

    # 4. Resolver un VRP por cada día de la semana
    horarios = {f"Empleada {i+1}": {d: [] for d in dias_semana} for i in range(request.numEmployees)}
    carga_horas = {f"Empleada {i+1}": {d: 0.0 for d in dias_semana} for i in range(request.numEmployees)}
    no_asignadas = {d: [] for d in dias_semana}
    total_horas_semanales = 0.0
    total_horas_por_empleada = {f"Empleada {i+1}": 0.0 for i in range(request.numEmployees)}

    for dia in dias_semana:
        comunidades_hoy = plan_por_dia[dia]
        if not comunidades_hoy: continue

        # Mapear índices locales de hoy a índices globales de la matriz
        # Depot es 0, y luego las comunidades de hoy mapeadas a sus índices originales en request.communities
        indices_mapeados = [0]
        for c_hoy in comunidades_hoy:
            idx_original = request.communities.index(c_hoy) + 1
            indices_mapeados.append(idx_original)

        num_locs_hoy = len(indices_mapeados)
        manager = pywrapcp.RoutingIndexManager(num_locs_hoy, request.numEmployees, 0)
        routing = pywrapcp.RoutingModel(manager)

        def time_callback(from_index, to_index):
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            global_from = indices_mapeados[from_node]
            global_to = indices_mapeados[to_node]
            travel_time = matrix[global_from][global_to]
            
            if to_node == 0: return travel_time
            
            comm = comunidades_hoy[to_node - 1]
            return travel_time + int(comm.cleaningHours * 60)

        def distance_callback(from_index, to_index):
            """Callback que devuelve SOLO el tiempo de viaje para el cálculo de costes."""
            from_node = manager.IndexToNode(from_index)
            to_node = manager.IndexToNode(to_index)
            global_from = indices_mapeados[from_node]
            global_to = indices_mapeados[to_node]
            return matrix[global_from][global_to]

        transit_callback_index = routing.RegisterTransitCallback(time_callback)
        distance_callback_index = routing.RegisterTransitCallback(distance_callback)

        # Definimos que el coste principal a minimizar es el tiempo de viaje (distancia)
        routing.SetArcCostEvaluatorOfAllVehicles(distance_callback_index)

        routing.AddDimension(transit_callback_index, 480, 480, True, "Time")
        time_dimension = routing.GetDimensionOrDie("Time")
        
        # Eliminamos el coeficiente de equilibrio diario (SpanCost).
        # Al ponerlo a 0, permitimos que una empleada haga todo el trabajo de una zona
        # en un mismo día sin forzar el reparto, ahorrando trayectos innecesarios.
        # El equilibrio global se gestiona en la fase de distribución semanal (Paso 3).
        time_dimension.SetGlobalSpanCostCoefficient(0)

        for loc_idx in range(1, num_locs_hoy):
            index = manager.NodeToIndex(loc_idx)
            comm = comunidades_hoy[loc_idx - 1]
            # Ventana de 9:00 (120 min) a 15:00 (480 min - duración)
            start_max = 480 - int(comm.cleaningHours * 60)
            if start_max < 120: start_max = 120
            time_dimension.CumulVar(index).SetRange(120, start_max)

        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
        search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        search_parameters.time_limit.seconds = 2 # Resolución rápida por cada día

        # Incentivamos el uso de un solo vehículo por día para mantener la eficiencia geográfica.
        # Además, ajustamos el coste de activación de cada empleada según sus horas acumuladas en la semana.
        # La que menos horas lleve acumuladas será la "más barata" de activar, convirtiéndose en la principal hoy.
        for vehicle_id in range(request.numEmployees):
            emp_name = f"Empleada {vehicle_id + 1}"
            # Base 300 mins + penalización de 15 mins por cada hora ya trabajada esta semana.
            coste_dinamico = 300 + int(total_horas_por_empleada[emp_name] * 15)
            routing.SetFixedCostOfVehicle(coste_dinamico, vehicle_id)

        assignment = routing.SolveWithParameters(search_parameters)

        if assignment:
            for vehicle_id in range(request.numEmployees):
                emp_name = f"Empleada {vehicle_id + 1}"
                index = routing.Start(vehicle_id)
                previous_index = index
                index = assignment.Value(routing.NextVar(index))
                while not routing.IsEnd(index):
                    node_idx = manager.IndexToNode(index)
                    prev_node_idx = manager.IndexToNode(previous_index)
                    comm = comunidades_hoy[node_idx - 1]

                    time_var = time_dimension.CumulVar(index)
                    t_mins = assignment.Min(time_var)
                    inicio = HORA_INICIO + timedelta(minutes=t_mins)
                    fin = inicio + timedelta(hours=comm.cleaningHours)

                    global_from = indices_mapeados[prev_node_idx]
                    global_to = indices_mapeados[node_idx]
                    travel_mins = matrix[global_from][global_to]

                    horarios[emp_name][dia].append({
                        "comunidad": comm.address,
                        "inicio": inicio.strftime("%H:%M"),
                        "fin": fin.strftime("%H:%M"),
                        "horas": comm.cleaningHours,
                        "viaje_previo_horas": round(travel_mins / 60.0, 2)
                    })
                    previous_index = index
                    index = assignment.Value(routing.NextVar(index))

                end_index = routing.End(vehicle_id)
                total_mins = assignment.Min(time_dimension.CumulVar(end_index))
                carga_horas[emp_name][dia] = round(total_mins / 60.0, 2)
                total_horas_semanales += (total_mins / 60.0)
                total_horas_por_empleada[emp_name] += (total_mins / 60.0)
        else:
            # Si un día falla, lo marcamos para el usuario
            no_asignadas[dia] = [c.address for c in comunidades_hoy]

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
        "no_asignadas": no_asignadas,
        "total_horas_planificacion": round(total_horas_semanales, 2),
        "total_horas_por_empleada": {emp: round(horas, 2) for emp, horas in total_horas_por_empleada.items()}
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