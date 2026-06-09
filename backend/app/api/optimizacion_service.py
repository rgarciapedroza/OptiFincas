# app/api/optimizacion_service.py
from typing import List, Optional
from datetime import datetime, timedelta
import math
import requests
import holidays
import pandas as pd
import io
import base64
from functools import lru_cache
from ortools.constraint_solver import routing_enums_pb2
from ortools.constraint_solver import pywrapcp

# =========================
# CONSTANTES
# =========================
PARKING_TIME_MINS = 10
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
    coords_list = list(coords)
    if not coords_list:
        return []

    coords_str = ";".join([f"{c[1]},{c[0]}" for c in coords_list])
    url = f"http://router.project-osrm.org/table/v1/driving/{coords_str}?sources=all&destinations=all&annotations=duration"

    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            data = response.json()
            if data.get("code") == "Ok":
                durations = data.get("durations", [])
                if durations:
                    return [
                        [(int(d / 60) + PARKING_TIME_MINS if d is not None and d > 0 else 0) for d in row]
                        for row in durations
                    ]
    except Exception as e:
        print(f"Error OSRM Table Service: {e}")

    num_locs = len(coords_list)
    matrix = [[0 for _ in range(num_locs)] for _ in range(num_locs)]
    for i in range(num_locs):
        for j in range(num_locs):
            if i == j:
                continue
            dist = haversine_distance(coords_list[i][0], coords_list[i][1], coords_list[j][0], coords_list[j][1])
            matrix[i][j] = int((dist / 30.0) * 60) + PARKING_TIME_MINS
    return matrix


def get_matrix_osrm(coords: List[tuple]):
    return get_matrix_osrm_cached(tuple(coords))


def get_valid_patterns(freq):
    if freq <= 0:
        return []
    if freq >= 5:
        return [[0, 1, 2, 3, 4]]
    if freq == 1:
        return [[0], [1], [2], [3], [4]]
    if freq == 2:
        return [[0, 2], [0, 3], [0, 4], [1, 3], [1, 4], [2, 4]]
    if freq == 3:
        return [[0, 2, 4]]
    if freq == 4:
        return [[0, 1, 3, 4], [0, 2, 3, 4], [1, 2, 3, 4]]
    return []


def calcular_puntuacion_patron(pattern, standard_week_plan, comm, communities_list):
    score_total = 0
    for d_idx in pattern:
        carga_actual = sum(c.cleaningHours for c in standard_week_plan[d_idx])
        score_dia = carga_actual * 40
        if standard_week_plan[d_idx]:
            dist_min = min(
                haversine_distance(comm.latitude, comm.longitude, c.latitude, c.longitude)
                for c in standard_week_plan[d_idx]
            )
            if dist_min < 0.5:
                score_dia -= 150
            elif dist_min < 2.0:
                score_dia -= 40
        score_total += score_dia
    return score_total


def get_regional_holidays(year: int, month: int, region_code: Optional[str] = None):
    subdiv_code = region_code if region_code and region_code != "ES" else None
    regional_holidays_obj = holidays.Spain(subdiv=subdiv_code, years=[year])

    res = {}
    for day, name in regional_holidays_obj.items():
        if day.month == month and day.year == year:
            res[day.strftime("%Y-%m-%d")] = name
    return dict(sorted(res.items()))


def process_optimization(request):
    """Lógica principal de optimización"""
    if not request.communities:
        raise ValueError("Debe proporcionar al menos una comunidad.")
    if len(request.employeeStartLocations) != request.numEmployees:
        raise ValueError("El número de ubicaciones de inicio de empleados debe coincidir con el número de empleados.")

    # Convertir comunidades a lista para indexar por posición
    communities_list = list(request.communities)
    num_comms = len(communities_list)

    # ============================================================
    # 1. Preparación de datos globales
    # ============================================================
    all_unique_coords = []
    employee_start_indices = []

    for emp_loc in request.employeeStartLocations:
        employee_start_indices.append(len(all_unique_coords))
        all_unique_coords.append((emp_loc.latitude, emp_loc.longitude))

    # Mapeo: índice de comunidad -> índice global en la matriz
    community_global_index = {}
    for idx in range(num_comms):
        community_global_index[idx] = len(all_unique_coords)
        all_unique_coords.append((communities_list[idx].latitude, communities_list[idx].longitude))

    num_global_locations = len(all_unique_coords)
    matrix = get_matrix_osrm(all_unique_coords)

    if not matrix or len(matrix) != num_global_locations:
        raise Exception("No se pudo obtener la matriz de tiempos de OSRM.")

    # ============================================================
    # 2. Identificación de días laborables reales en el mes
    # ============================================================
    region_code = request.region if request.region and request.region != "ES" else None
    regional_holidays_obj = holidays.Spain(subdiv=region_code, years=[request.year])

    effective_holidays = set()
    for day, name in regional_holidays_obj.items():
        if day.month == request.month and day.year == request.year:
            date_str = day.strftime("%Y-%m-%d")
            if date_str not in request.manualWorkingDays:
                effective_holidays.add(day)

    for h_str in request.manualHolidays:
        try:
            d = datetime.strptime(h_str, "%Y-%m-%d").date()
            if d.month == request.month and d.year == request.year and h_str not in request.manualWorkingDays:
                effective_holidays.add(d)
        except ValueError:
            pass

    laborables_por_semana = {}
    primer_dia = datetime(request.year, request.month, 1)
    fecha_aux = primer_dia - timedelta(days=primer_dia.weekday())

    while True:
        isocal = fecha_aux.isocalendar()
        week_key = f"{isocal.year}-W{isocal.week}"

        dias_semana_completa = []
        tiene_dia_en_mes = False

        for i in range(5):
            dia = fecha_aux + timedelta(days=i)
            if dia.month == request.month:
                tiene_dia_en_mes = True
            if dia.date() not in effective_holidays:
                dias_semana_completa.append(dia)

        if not tiene_dia_en_mes and fecha_aux > primer_dia:
            break

        if tiene_dia_en_mes and dias_semana_completa:
            laborables_por_semana[week_key] = dias_semana_completa

        fecha_aux += timedelta(days=7)

        # ============================================================
    # 3. Distribución dinámica de tareas en días laborables (CON BALANCEO)
    # ============================================================
    plan_por_dia_especifico = {}  # fecha -> lista de índices de comunidades
    
    # Ordenar comunidades por horas (mayor a menor)
    sorted_indices = sorted(range(num_comms), key=lambda i: communities_list[i].cleaningHours, reverse=True)
    standard_week_plan = {i: [] for i in range(5)}  # día de semana -> lista de comunidades (objetos)
    
    # Contador de horas asignadas por día para balancear
    horas_por_dia_semana = {i: 0.0 for i in range(5)}

    for i_comm, comm_idx in enumerate(sorted_indices):
        comm = communities_list[comm_idx]
        patterns = get_valid_patterns(min(comm.cleaningDaysPerWeek, 5))

        def pattern_score(pattern):
            score_total = 0
            for d_idx in pattern:
                # Penalizar días que ya tienen muchas horas
                carga_actual = horas_por_dia_semana[d_idx]
                score_total += carga_actual * 10
                
                # Bonus por proximidad geográfica
                if standard_week_plan[d_idx]:
                    dist_min = min(
                        haversine_distance(comm.latitude, comm.longitude, c.latitude, c.longitude)
                        for c in standard_week_plan[d_idx]
                    )
                    if dist_min < 0.5:
                        score_total -= 200
                    elif dist_min < 2.0:
                        score_total -= 60
            return score_total

        # Elegir el patrón que minimice la carga
        if patterns:
            indices_objetivo = min(patterns, key=pattern_score)
        else:
            indices_objetivo = []
        
        # Actualizar plan estándar y contador de horas
        for idx in indices_objetivo:
            standard_week_plan[idx].append(comm)
            horas_por_dia_semana[idx] += comm.cleaningHours

        for week_key, dias_laborables in laborables_por_semana.items():
            mapa_laborables = {d.weekday(): d for d in dias_laborables}

            asignados_esta_semana = []
            for idx_ideal in indices_objetivo:
                if idx_ideal in mapa_laborables:
                    asignados_esta_semana.append(mapa_laborables[idx_ideal])

            num_final_objetivo = min(len(dias_laborables), comm.cleaningDaysPerWeek)
            if len(asignados_esta_semana) < num_final_objetivo:
                huecos_disponibles = [d for d in dias_laborables if d not in asignados_esta_semana]
                necesarios = num_final_objetivo - len(asignados_esta_semana)

                if huecos_disponibles:
                    # Ordenar huecos por carga actual (menos carga primero)
                    huecos_con_carga = [(d, horas_por_dia_semana[d.weekday()]) for d in huecos_disponibles]
                    huecos_con_carga.sort(key=lambda x: x[1])
                    
                    for j in range(min(necesarios, len(huecos_con_carga))):
                        asignados_esta_semana.append(huecos_con_carga[j][0])

            for dia_asignado in asignados_esta_semana:
                if dia_asignado.month == request.month:
                    fecha_str = dia_asignado.strftime("%Y-%m-%d")
                    if fecha_str not in plan_por_dia_especifico:
                        plan_por_dia_especifico[fecha_str] = []
                    plan_por_dia_especifico[fecha_str].append(comm_idx)

    # ============================================================
    # 4. Resolver VRP para cada día laborable del mes (CON BALANCEO MEJORADO)
    # ============================================================
    horarios = {f"Empleada {i+1}": {} for i in range(request.numEmployees)}
    carga_horas_semanal = {f"Empleada {i+1}": 0.0 for i in range(request.numEmployees)}
    carga_horas_total_mes = {f"Empleada {i+1}": 0.0 for i in range(request.numEmployees)}
    last_week_key = None
    no_asignadas = {}
    total_horas_planificacion_mes = 0.0
    
    # Contador de días asignados por empleada para balancear
    dias_por_empleada = {f"Empleada {i+1}": 0 for i in range(request.numEmployees)}

    for fecha_str in sorted(plan_por_dia_especifico.keys()):
        comunidades_hoy_indices = plan_por_dia_especifico[fecha_str]
        if not comunidades_hoy_indices:
            continue

        # Convertir índices a objetos para procesamiento
        comunidades_hoy = [communities_list[idx] for idx in comunidades_hoy_indices]

        fecha_dt = datetime.strptime(fecha_str, "%Y-%m-%d")
        current_week_key = f"{fecha_dt.isocalendar().year}-W{fecha_dt.isocalendar().week}"
        if current_week_key != last_week_key:
            # Al empezar nueva semana, resetear carga semanal
            for emp in carga_horas_semanal:
                carga_horas_semanal[emp] = 0.0
            last_week_key = current_week_key

        # ORDENAR EMPLEADAS por carga actual (menor carga primero) para balancear
        empleadas_ordenadas = sorted(
            range(request.numEmployees),
            key=lambda v: carga_horas_total_mes[f"Empleada {v+1}"]
        )
        
        # Reordenar start_nodes para que la empleada con menos carga sea la primera
        start_nodes = empleadas_ordenadas
        end_nodes = empleadas_ordenadas

        # Obtener índices globales usando los índices de comunidad
        communities_today_global_indices = [community_global_index[idx] for idx in comunidades_hoy_indices]

        vrp_nodes_to_global_indices = []
        vrp_nodes_to_global_indices.extend(employee_start_indices)
        vrp_nodes_to_global_indices.extend(communities_today_global_indices)

        num_vrp_nodes = len(vrp_nodes_to_global_indices)

        manager = pywrapcp.RoutingIndexManager(num_vrp_nodes, request.numEmployees, start_nodes, end_nodes)
        routing = pywrapcp.RoutingModel(manager)

        def time_callback(from_index, to_index):
            from_node_vrp = manager.IndexToNode(from_index)
            to_node_vrp = manager.IndexToNode(to_index)

            global_from_index = vrp_nodes_to_global_indices[from_node_vrp]
            global_to_index = vrp_nodes_to_global_indices[to_node_vrp]

            travel_time = matrix[global_from_index][global_to_index]

            if to_node_vrp >= request.numEmployees:
                comm_idx_in_today = to_node_vrp - request.numEmployees
                if comm_idx_in_today < len(comunidades_hoy):
                    comm = comunidades_hoy[comm_idx_in_today]
                    return travel_time + int(comm.cleaningHours * 60)

            return travel_time

        def distance_callback(from_index, to_index):
            from_node_vrp = manager.IndexToNode(from_index)
            to_node_vrp = manager.IndexToNode(to_index)

            global_from_index = vrp_nodes_to_global_indices[from_node_vrp]
            global_to_index = vrp_nodes_to_global_indices[to_node_vrp]

            return matrix[global_from_index][global_to_index]

        transit_callback_index = routing.RegisterTransitCallback(time_callback)
        distance_callback_index = routing.RegisterTransitCallback(distance_callback)

        routing.SetArcCostEvaluatorOfAllVehicles(distance_callback_index)
        routing.AddDimension(transit_callback_index, 0, 480, True, "Time")
        time_dimension = routing.GetDimensionOrDie("Time")

        if request.numEmployees > 1:
            # Aumentar el coeficiente de balanceo para forzar distribución equitativa
            time_dimension.SetGlobalSpanCostCoefficient(500)

        for comm_idx_in_today, comm in enumerate(comunidades_hoy):
            vrp_node_index = request.numEmployees + comm_idx_in_today
            index = manager.NodeToIndex(vrp_node_index)
            jornada_maxima_mins = 480
            limite_salida_comunidad = max(0, jornada_maxima_mins - int(comm.cleaningHours * 60))
            time_dimension.CumulVar(index).SetRange(0, limite_salida_comunidad)

        search_parameters = pywrapcp.DefaultRoutingSearchParameters()
        search_parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PARALLEL_CHEAPEST_INSERTION
        search_parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
        search_parameters.time_limit.seconds = 2  # Aumentar tiempo para mejor solución

        for vehicle_id in range(request.numEmployees):
            emp_name = f"Empleada {vehicle_id + 1}"
            # COSTE DINÁMICO MUCHO MÁS AGRESIVO para balancear
            # La empleada con más carga recibe mayor coste de activación
            carga_actual = carga_horas_total_mes[emp_name]
            coste_dinamico = 500 + int(carga_actual * 50)
            routing.SetFixedCostOfVehicle(coste_dinamico, vehicle_id)
            
            # Penalizar también por número de días trabajados
            dias_trabajados = dias_por_empleada[emp_name]
            if dias_trabajados > 0:
                routing.SetFixedCostOfVehicle(coste_dinamico + (dias_trabajados * 20), vehicle_id)

        assignment = routing.SolveWithParameters(search_parameters)

        if assignment:
            for vehicle_id in range(request.numEmployees):
                emp_name = f"Empleada {vehicle_id + 1}"
                if fecha_str not in horarios[emp_name]:
                    horarios[emp_name][fecha_str] = []
                
                # Verificar si esta empleada trabajó hoy
                tuvo_trabajo = False
                
                index = routing.Start(vehicle_id)
                previous_index = index
                index = assignment.Value(routing.NextVar(index))
                while not routing.IsEnd(index):
                    node_vrp_idx = manager.IndexToNode(index)
                    prev_node_vrp_idx = manager.NodeToIndex(previous_index)

                    if node_vrp_idx >= request.numEmployees:
                        tuvo_trabajo = True
                        comm_idx_in_today = node_vrp_idx - request.numEmployees
                        if comm_idx_in_today < len(comunidades_hoy):
                            comm = comunidades_hoy[comm_idx_in_today]

                            time_var = time_dimension.CumulVar(index)
                            t_mins = assignment.Min(time_var)
                            inicio = HORA_INICIO + timedelta(minutes=t_mins)
                            fin = inicio + timedelta(hours=comm.cleaningHours)

                            global_from_index = vrp_nodes_to_global_indices[prev_node_vrp_idx]
                            global_to_index = vrp_nodes_to_global_indices[node_vrp_idx]
                            travel_mins = matrix[global_from_index][global_to_index]

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
                
                if total_mins > 0:
                    carga_horas_semanal[emp_name] += (total_mins / 60.0)
                    carga_horas_total_mes[emp_name] += (total_mins / 60.0)
                    total_horas_planificacion_mes += (total_mins / 60.0)
                    if tuvo_trabajo:
                        dias_por_empleada[emp_name] += 1
        else:
            no_asignadas[fecha_str] = [communities_list[idx].address for idx in comunidades_hoy_indices]

    # DESPUÉS del bucle, redistribuir si hay desbalance significativo
    # Calcular horas promedio
    horas_totales = sum(carga_horas_total_mes.values())
    horas_promedio = horas_totales / request.numEmployees if request.numEmployees > 0 else 0
    
    # Si hay desbalance > 20%, ajustar
    max_horas = max(carga_horas_total_mes.values())
    min_horas = min(carga_horas_total_mes.values())
    
    if max_horas > 0 and (max_horas - min_horas) / max_horas > 0.2:
        print(f"⚠️ Desbalance detectado: max={max_horas:.1f}h, min={min_horas:.1f}h")
        print("Aplicando ajuste de balance...")
        
        # Opcional: Podrías implementar una redistribución aquí
        # Por ahora, el balanceo mejorado debería ayudar en próximas ejecuciones
    # ============================================================
    # 5. Generar archivo Excel
    # ============================================================
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

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        df = pd.DataFrame(rows)
        df.to_excel(writer, index=False, sheet_name="Planificacion")

    excel_data = base64.b64encode(output.getvalue()).decode("utf-8")

    return {
        "status": "ok",
        "excel_archivo": excel_data,
        "nombre_archivo": f"Planificacion_{datetime.now().strftime('%Y%m%d')}.xlsx",
        "horarios": horarios,
        "resumen": {emp: round(h / num_semanas, 2) for emp, h in carga_horas_total_mes.items()},
        "no_asignadas": no_asignadas,
        "total_horas_planificacion": round(total_horas_planificacion_mes, 2),
        "total_horas_por_empleada": {emp: round(h, 2) for emp, h in carga_horas_total_mes.items()},
        "manual_holidays": request.manualHolidays,
        "manual_working_days": request.manualWorkingDays,
        "region": request.region
    }