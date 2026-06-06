from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import pandas as pd # type: ignore
import io
import os
import base64
from datetime import datetime, timedelta
import math
import requests
import holidays
from functools import lru_cache
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
@lru_cache(maxsize=64)
def get_matrix_osrm_cached(coords: tuple):
    """Versión cacheada para evitar llamadas repetidas a OSRM con las mismas coordenadas."""
    coords_list = list(coords)
    if not coords:
        return []
    
    # Formatear coordenadas para OSRM (lon,lat;lon,lat...)
    # OSRM espera {longitude},{latitude}
    coords_str = ";".join([f"{c[1]},{c[0]}" for c in coords_list])
    url = f"http://router.project-osrm.org/table/v1/driving/{coords_str}?sources=all&destinations=all&annotations=duration"
    
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "Ok":
                durations = data.get("durations", [])
                # OSRM devuelve segundos. Convertimos a minutos + parking.
                return [
                    [(int(d / 60) + PARKING_TIME_MINS if d is not None and d > 0 else 0) for d in row]
                    for row in durations
                ]
    except Exception as e:
        print(f"Error OSRM Table Service: {e}")

    # Fallback: Matriz basada en Haversine (distancia lineal) si falla el servicio
    num_locs = len(coords_list)
    matrix = [[0 for _ in range(num_locs)] for _ in range(num_locs)]
    for i in range(num_locs):
        for j in range(num_locs):
            if i == j: continue
            dist = haversine_distance(coords_list[i][0], coords_list[i][1], coords_list[j][0], coords_list[j][1])
            # Asumimos una velocidad promedio de 30 km/h
            matrix[i][j] = int((dist / 30.0) * 60) + PARKING_TIME_MINS
    return matrix

def get_matrix_osrm(coords: List[tuple]):
    """Proxy para la función cacheada."""
    return get_matrix_osrm_cached(tuple(coords))

# =========================
# MODELOS
# =========================
class CommunityInput(BaseModel):
    address: str
    cleaningHours: float = Field(..., gt=0)
    cleaningDaysPerWeek: int = Field(..., gt=0, le=7)
    latitude: float
    longitude: float
    region: Optional[str] = None # New: Autonomous community region code (e.g., "CN" for Canarias)
class OptimizationRequest(BaseModel):
    numEmployees: int = Field(2, ge=1, le=10)
    communities: List[CommunityInput]
    month: int = Field(..., ge=1, le=12)
    year: int = Field(...)
    region: Optional[str] = "ES"
    manualHolidays: List[str] = []
    manualWorkingDays: List[str] = []

# =========================
# UTILIDAD BALANCE
# =========================
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

    # 2. Generar Matriz de Tiempos Global (Optimizado: una sola petición por mes)
    matrix = get_matrix_osrm(all_locations_coords)

    if not matrix or len(matrix) != num_locations:
        raise HTTPException(status_code=500, detail="No se pudo obtener la matriz de tiempos de OSRM.")

    # 3. Identificación de días laborables reales en el mes
    region_code = request.region if request.region and request.region != "ES" else None
    regional_holidays_obj = holidays.Spain(subdiv=region_code, years=[request.year])
    
    effective_holidays = set()
    # Añadir festivos regionales que NO han sido marcados como laborables manualmente
    for day, name in regional_holidays_obj.items():
        if day.month == request.month and day.year == request.year:
            date_str = day.strftime("%Y-%m-%d")
            if date_str not in request.manualWorkingDays:
                effective_holidays.add(day)
                
    # Añadir festivos marcados manualmente (si no están ya en manualWorkingDays)
    for h_str in request.manualHolidays:
        try:
            d = datetime.strptime(h_str, "%Y-%m-%d").date()
            if d.month == request.month and d.year == request.year and h_str not in request.manualWorkingDays:
                effective_holidays.add(d)
        except ValueError:
            pass # Ignorar fechas mal formadas
    
    laborables_por_semana = {}
    
    # ... (rest of the code for calculating laborables_por_semana remains the same, but uses effective_holidays)
    # Calculamos el inicio de la primera semana que toca el mes
    primer_dia = datetime(request.year, request.month, 1)
    fecha_aux = primer_dia - timedelta(days=primer_dia.weekday()) # Lunes de la semana inicial
    
    while True:
        isocal = fecha_aux.isocalendar()
        week_key = f"{isocal.year}-W{isocal.week}"
        
        dias_semana_completa = []
        tiene_dia_en_mes = False
        
        for i in range(5): # L-V
            dia = fecha_aux + timedelta(days=i)
            if dia.month == request.month:
                tiene_dia_en_mes = True
            if dia.date() not in effective_holidays: # Use effective_holidays here
                dias_semana_completa.append(dia)
        
        # Si la semana ya no tiene días en el mes objetivo y hemos pasado el inicio, paramos
        if not tiene_dia_en_mes and fecha_aux > primer_dia:
            break
            
        if tiene_dia_en_mes and dias_semana_completa:
            laborables_por_semana[week_key] = dias_semana_completa
            
        fecha_aux += timedelta(days=7)

    # 4. Distribución dinámica de tareas en días laborables
    plan_por_dia_especifico = {}
    sorted_comms = sorted(request.communities, key=lambda x: x.cleaningHours, reverse=True)

    # Mantenemos un estado de la semana "estándar" para calcular los días ideales optimizados geográficamente
    standard_week_plan = {i: [] for i in range(5)}

    def get_valid_patterns(freq):
        """Genera combinaciones de días que favorecen la limpieza intercalada (L-X-V, etc.)."""
        if freq <= 0: return []
        if freq >= 5: return [[0, 1, 2, 3, 4]]
        if freq == 1: return [[0], [1], [2], [3], [4]]
        if freq == 2: return [[0, 2], [0, 3], [0, 4], [1, 3], [1, 4], [2, 4]]
        if freq == 3: return [[0, 2, 4]]
        if freq == 4: return [[0, 1, 3, 4], [0, 2, 3, 4], [1, 2, 3, 4]]
        return []

    for i_comm, comm in enumerate(sorted_comms):
        # 1. Definimos los días ideales en una semana estándar de 5 días (Lunes a Viernes)
        # usando la lógica de patrones y puntuación geográfica para maximizar el clustering (agrupación).
        patterns = get_valid_patterns(min(comm.cleaningDaysPerWeek, 5))
        
        def calcular_puntuacion_patron(pattern):
            score_total = 0
            for d_idx in pattern:
                carga_actual = sum(c.cleaningHours for c in standard_week_plan[d_idx])
                # Penalización por carga para equilibrar los días de la semana
                score_dia = carga_actual * 40
                if standard_week_plan[d_idx]:
                    # Bonus por proximidad geográfica a comunidades ya asignadas ese día
                    dist_min = min(
                        haversine_distance(comm.latitude, comm.longitude, c.latitude, c.longitude)
                        for c in standard_week_plan[d_idx]
                    )
                    if dist_min < 0.5: score_dia -= 150 # Prioridad máxima: misma calle o zona
                    elif dist_min < 2.0: score_dia -= 40
                score_total += score_dia
            return score_total

        indices_objetivo = min(patterns, key=calcular_puntuacion_patron) if patterns else []
        # Actualizamos el plan estándar para que las siguientes comunidades tengan contexto geográfico
        for idx in indices_objetivo:
            standard_week_plan[idx].append(comm)

        for week_key, dias_laborables in laborables_por_semana.items():
            # Mapeamos qué días de la semana (0-4) son laborables en esta semana específica.
            # laborables_por_semana ya contiene la semana completa aunque comparta días con otros meses.
            mapa_laborables = {d.weekday(): d for d in dias_laborables}
            
            asignados_esta_semana = []
            # 2. Asignación Primaria: Intentamos asignar los días ideales.
            # En semanas normales (5 días), esto siempre asignará los mismos días.
            for idx_ideal in indices_objetivo:
                if idx_ideal in mapa_laborables:
                    asignados_esta_semana.append(mapa_laborables[idx_ideal])
            
            # 3. REORGANIZACIÓN POR FESTIVOS (Distribuida):
            # Si hay festivos que impiden cumplir el cupo, buscamos huecos alternativos.
            num_final_objetivo = min(len(dias_laborables), comm.cleaningDaysPerWeek)
            if len(asignados_esta_semana) < num_final_objetivo:
                huecos_disponibles = [d for d in dias_laborables if d not in asignados_esta_semana]
                necesarios = num_final_objetivo - len(asignados_esta_semana)
                
                if huecos_disponibles:
                    for j in range(necesarios):
                        # Selección circular basada en el índice de la comunidad para distribuir el impacto
                        # de los festivos entre todos los días laborables restantes de la semana.
                        idx_hueco = (i_comm + j) % len(huecos_disponibles)
                        asignados_esta_semana.append(huecos_disponibles.pop(idx_hueco))

            for dia_asignado in asignados_esta_semana:
                # Filtro final: Solo guardamos la tarea si el día pertenece al mes solicitado.
                # Esto permite que las semanas compartidas se calculen con contexto de 5 días pero se filtren correctamente.
                if dia_asignado.month == request.month:
                    fecha_str = dia_asignado.strftime("%Y-%m-%d")
                    plan_por_dia_especifico.setdefault(fecha_str, []).append(comm)

    # 5. Resolver VRP para cada día laborable del mes (SECUENCIAL PARA BALANCEO DE CARGA)
    horarios = {f"Empleada {i+1}": {} for i in range(request.numEmployees)}
    carga_horas_semanal = {f"Empleada {i+1}": 0.0 for i in range(request.numEmployees)}
    carga_horas_total_mes = {f"Empleada {i+1}": 0.0 for i in range(request.numEmployees)}
    last_week_key = None
    no_asignadas = {}
    total_horas_planificacion_mes = 0.0 # Total de horas de limpieza asignadas en el mes

    for fecha_str in sorted(plan_por_dia_especifico.keys()):
        comunidades_hoy = plan_por_dia_especifico[fecha_str]
        if not comunidades_hoy: continue

        # Reiniciar carga semanal si cambiamos de semana para balancear costes correctamente
        fecha_dt = datetime.strptime(fecha_str, "%Y-%m-%d")
        current_week_key = f"{fecha_dt.isocalendar().year}-W{fecha_dt.isocalendar().week}"
        if current_week_key != last_week_key:
            for emp in carga_horas_semanal: carga_horas_semanal[emp] = 0.0
            last_week_key = current_week_key

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
        
        # Restauramos el coeficiente de equilibrio diario para que las jornadas
        # se repartan equitativamente entre las empleadas disponibles.
        if request.numEmployees > 1:
            time_dimension.SetGlobalSpanCostCoefficient(100)

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
        search_parameters.time_limit.seconds = 1 # Resolución ultra-rápida por cada día (1 segundo)

        for vehicle_id in range(request.numEmployees):
            emp_name = f"Empleada {vehicle_id + 1}"
            # Coste de activación dinámico para balancear carga SEMANAL.
            # Esto evita saturar a una empleada a principio de mes solo porque el acumulado mensual sea bajo.
            coste_dinamico = 300 + int(carga_horas_semanal[emp_name] * 20)
            routing.SetFixedCostOfVehicle(coste_dinamico, vehicle_id)

        assignment = routing.SolveWithParameters(search_parameters)

        if assignment:
            for vehicle_id in range(request.numEmployees):
                emp_name = f"Empleada {vehicle_id + 1}"
                if fecha_str not in horarios[emp_name]: horarios[emp_name][fecha_str] = []
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

                    horarios[emp_name][fecha_str].append({
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
                carga_horas_semanal[emp_name] += (total_mins / 60.0)
                # Sumar a carga mensual (estimación simplificada por día)
                carga_horas_total_mes[emp_name] += (total_mins / 60.0)
                total_horas_planificacion_mes += (total_mins / 60.0) # Accumulate total hours
        else:
            no_asignadas[fecha_str] = [c.address for c in comunidades_hoy]

    # Calcular promedio semanal para el resumen
    num_semanas = len(laborables_por_semana) or 1

    rows = []
    for emp, fechas in horarios.items():
        for f_str, tareas in fechas.items():
            for t in tareas:
                rows.append({
                    "Empleada": emp,
                    "Fecha": f_str,
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
        "resumen": {emp: round(h / num_semanas, 2) for emp, h in carga_horas_total_mes.items()},
        "no_asignadas": no_asignadas,
        "total_horas_planificacion": round(total_horas_planificacion_mes, 2), # Total hours for the month
        "total_horas_por_empleada": {emp: round(h, 2) for emp, h in carga_horas_total_mes.items()}, # Total hours for the month per employee
        "manual_holidays": request.manualHolidays,
        "manual_working_days": request.manualWorkingDays,
        "region": request.region
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

@router.get("/holidays")
async def get_regional_holidays(year: int, month: int, region_code: Optional[str] = None):
    """Endpoint para previsualizar los festivos antes de planificar."""
    subdiv_code = region_code if region_code and region_code != 'ES' else None
    regional_holidays_obj = holidays.Spain(subdiv=subdiv_code, years=[year])
    
    res = {}
    for day, name in regional_holidays_obj.items():
        if day.month == month and day.year == year:
            res[day.strftime("%Y-%m-%d")] = name
    
    # Sort by date for consistent output
    return dict(sorted(res.items()))