import { Component, OnInit, HostListener } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { Community, ComunidadDB, Profile } from './models';
import { SupabaseService } from './supabase.service'; 
import { ModalService } from './modal.service';

// Interfaz para el payload de la solicitud de optimización
interface OptimizationPayload {
  numEmployees: number;
  communities: Community[];
  month: number;
  year: number;
  region: string;
  manualHolidays: string[];
  manualWorkingDays: string[];
  employeeStartLocations: { latitude: number; longitude: number; }[];
}


@Component({
  selector: 'app-optimizacion',
  templateUrl: './optimizacion.component.html',
  styleUrls: ['./optimizacion.component.css']
})
export class OptimizacionComponent implements OnInit {
  loading = false;
  loadingMessage = 'Procesando documentos...';
  error = '';
  
  // Exponer Number para evitar TypeError en plantillas minificadas
  public Number = Number;

  // Estado de Configuración
  mostrarConfiguracionOptimizacion = false;
  mostrarModalEdicionComunidad = false;
  editandoId: number | null = null;
  nuevaComunidadForm = { 
    nombre: '', direccion: '', servicios: 'Limpieza',
    cleaningHours: 1.0, cleaningDaysPerWeek: 1,
    latitude: 0, longitude: 0
  };
  hasUnsavedHolidayChanges: boolean = false;
  selectedRegion: string = 'ES';

  // Datos de Optimización
  numEmployees: number = 2;
  communities: Community[] = [];
  comunidadesDB: ComunidadDB[] = [];
  optimizationResult: any = null;
  diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  // Estado del Calendario
  viewDate: Date = new Date();
  calendarDays: (Date | null)[] = [];
  fetchedRegionalHolidays: Map<string, string> = new Map(); // New: To store holidays fetched from backend (date -> name)
  manualHolidays: Set<string> = new Set(); // Stores only dates for manual overrides
  manualWorkingDays: Set<string> = new Set(); // Stores dates forced to be laborable
  employeeStartLocations: { id: string, latitude: number, longitude: number }[] = []; // Ubicaciones de inicio de empleados
  empleadosConUbicacion: Profile[] = []; // Lista completa de empleados para el modal de edición
  mostrarModalEditarEmpleados = false;
  mostrarModalGestionarLimpiadoras = false;
  numLimpiadorasExternas = 2;
  limpiadoras: { nombre: string; home_address: string; home_latitude: number | null; home_longitude: number | null }[] = [];


  // List of Spanish Autonomous Communities for dropdown
  autonomousCommunities = [
    { name: 'Andalucía', code: 'AN' },
    { name: 'Aragón', code: 'AR' },
    { name: 'Asturias', code: 'AS' },
    { name: 'Baleares', code: 'IB' },
    { name: 'Canarias', code: 'CN' },
    { name: 'Cantabria', code: 'CB' },
    { name: 'Castilla-La Mancha', code: 'CM' },
    { name: 'Castilla y León', code: 'CL' },
    { name: 'Cataluña', code: 'CT' },
    { name: 'Ceuta', code: 'CE' },
    { name: 'Comunidad Valenciana', code: 'VC' },
    { name: 'Extremadura', code: 'EX' },
    { name: 'Galicia', code: 'GA' },
    { name: 'La Rioja', code: 'RI' },
    { name: 'Madrid', code: 'MD' },
    { name: 'Melilla', code: 'ML' },
    { name: 'Murcia', code: 'MC' },
    { name: 'Navarra', code: 'NC' },
    { name: 'País Vasco', code: 'PV' }
  ].sort((a, b) => a.name.localeCompare(b.name));

  constructor(private http: HttpClient, private supabase: SupabaseService, private modalService: ModalService) {}

  async ngOnInit() {
    const savedRegion = localStorage.getItem('optifincas_preferred_region');
    if (savedRegion) {
      this.selectedRegion = savedRegion;
    }

    this.generateCalendar();
    await this.cargarComunidades();
    await this.fetchRegionalHolidays();
    await this.cargarPlanificacion();

    // Cargar limpiadoras guardadas
    this.cargarLimpiadorasDeLocalStorage();
    
    // Si no hay limpiadoras guardadas, inicializar por defecto
    if (this.limpiadoras.length === 0) {
      this.numLimpiadorasExternas = this.numEmployees;
      this.rebuildLimpiadorasTable();
    }
  }

  @HostListener('window:beforeunload', ['$event'])
  unloadNotification($event: any) {
    if (this.hasUnsavedHolidayChanges) {
      $event.returnValue = true;
    }
  }

  async buscarCoordenadasLimpiadora(limpiadora: any) {
    if (!limpiadora?.home_address || limpiadora.home_address.trim() === '') {
      this.modalService.showAlert('Dirección requerida', 'Introduce una dirección para calcular coordenadas.');
      return;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(limpiadora.home_address)}`;
    this.loading = true;
    try {
      const data = await lastValueFrom(this.http.get<any[]>(url));
      if (data?.length) {
        limpiadora.home_latitude = parseFloat(data[0].lat);
        limpiadora.home_longitude = parseFloat(data[0].lon);
        this.modalService.showAlert('Ubicación Encontrada', 'Coordenadas obtenidas correctamente.');
      } else {
        this.modalService.showAlert('Ubicación No Encontrada', 'No se encontraron coordenadas para esa dirección.');
      }
    } catch (err) {
      console.error('Error geocoding:', err);
      this.modalService.showAlert('Error de Conexión', 'No se pudo contactar con el servicio de geocodificación.');
    } finally {
      this.loading = false;
    }
  }

  // Reemplaza la función abrirModalGestionarLimpiadoras con esta:
  abrirModalGestionarLimpiadoras() {
    console.log('Abriendo modal de limpiadoras'); // Para debugging
    // Inicializar limpiadoras si están vacías
    if (this.limpiadoras.length === 0) {
      this.numLimpiadorasExternas = Math.max(1, this.numEmployees);
      this.rebuildLimpiadorasTable();
    }
    this.mostrarModalGestionarLimpiadoras = true;
  }

  // Método para cerrar modal de limpiadoras (sin llamar a funciones inexistentes)
  cerrarModalLimpiadoras() {
    this.mostrarModalGestionarLimpiadoras = false;
  }


  //////////////////////////////////////////////////////////////////////////////////////////

  private guardarLimpiadorasEnLocalStorage() {
    const datosGuardar = {
      numLimpiadoras: this.numLimpiadorasExternas,
      limpiadoras: this.limpiadoras.map(l => ({
        home_address: l.home_address,
        home_latitude: l.home_latitude,
        home_longitude: l.home_longitude
      }))
    };
    localStorage.setItem('optifincas_limpiadoras', JSON.stringify(datosGuardar));
  }

  private cargarLimpiadorasDeLocalStorage() {
    const guardado = localStorage.getItem('optifincas_limpiadoras');
    if (guardado) {
      try {
        const datos = JSON.parse(guardado);
        this.numLimpiadorasExternas = datos.numLimpiadoras || 2;
        this.limpiadoras = datos.limpiadoras.map((l: any, idx: number) => ({
          nombre: `Empleada ${idx + 1}`,
          home_address: l.home_address || '',
          home_latitude: l.home_latitude ?? null,
          home_longitude: l.home_longitude ?? null
        }));
        
        // Actualizar employeeStartLocations
        this.employeeStartLocations = this.limpiadoras.map((l, idx) => ({
          id: `limpiadora_${idx + 1}`,
          latitude: l.home_latitude ?? 0,
          longitude: l.home_longitude ?? 0
        }));
        
        this.numEmployees = this.limpiadoras.length;
      } catch (e) {
        console.error('Error cargando limpiadoras:', e);
      }
    }
  }

  // Modifica guardarCambiosLimpiadoras para que guarde en localStorage:
  async guardarCambiosLimpiadoras() {
    const sinCoordenadas = this.limpiadoras.filter(l => !l.home_latitude || !l.home_longitude);
    if (sinCoordenadas.length > 0) {
      const confirmed = await this.modalService.showConfirm(
        'Coordenadas Pendientes',
        `Hay ${sinCoordenadas.length} limpiadora(s) sin ubicación definida. ¿Deseas continuar?`
      );
      if (!confirmed) return;
    }

    const confirmed = await this.modalService.showConfirm('Guardar Cambios', '¿Guardar ubicaciones de limpiadoras?');
    if (!confirmed) return;

    // Actualizar employeeStartLocations
    this.employeeStartLocations = this.limpiadoras.map((l, idx) => ({
      id: `limpiadora_${idx + 1}`,
      latitude: l.home_latitude ?? 0,
      longitude: l.home_longitude ?? 0,
    }));

    this.numEmployees = this.limpiadoras.length;
    
    // Guardar en localStorage
    this.guardarLimpiadorasEnLocalStorage();

    this.modalService.showAlert('Éxito', `Configuración guardada. Total de empleadas: ${this.numEmployees}`);
    this.mostrarModalGestionarLimpiadoras = false;
  }

  // Modifica rebuildLimpiadorasTable para preservar datos existentes:
  rebuildLimpiadorasTable() {
    const n = Math.max(1, Number(this.numLimpiadorasExternas) || 1);
    const nuevasLimpiadoras: { nombre: string; home_address: string; home_latitude: number | null; home_longitude: number | null }[] = [];

    for (let i = 0; i < n; i++) {
      const existente = this.limpiadoras[i];
      nuevasLimpiadoras.push({
        nombre: `Empleada ${i + 1}`,
        home_address: existente?.home_address || '',
        home_latitude: existente?.home_latitude ?? null,
        home_longitude: existente?.home_longitude ?? null,
      });
    }
    this.limpiadoras = nuevasLimpiadoras;
    this.guardarLimpiadorasEnLocalStorage();
  }


  async cargarComunidades() {
    try {
      const { data, error } = await this.supabase.getComunidades();
      if (error) throw error;
      this.comunidadesDB = data || [];
      console.log('[DEBUG] Comunidades cargadas en optimización:', this.comunidadesDB.length);
    } catch (err) {
      console.error('[ERROR] Fallo al cargar comunidades:', err);
      this.comunidadesDB = [];
    }
  }

  get comunidadesLimpieza(): any[] {
    // Retornamos una copia para asegurar que Angular detecte cambios en el renderizado
    return [...this.comunidadesDB];
  }

  generateCalendar() {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    let startDayIdx = firstDay.getDay(); 
    if (startDayIdx === 0) startDayIdx = 7; 
    startDayIdx--; 

    this.calendarDays = [];
    for (let i = 0; i < startDayIdx; i++) this.calendarDays.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) this.calendarDays.push(new Date(year, month, d));
  }

  async changeMonth(delta: number) {
    if (this.hasUnsavedHolidayChanges) {
      const confirmed = await this.modalService.showConfirm('Cambios no guardados', 'Tienes cambios manuales en los festivos de este mes. ¿Deseas descartarlos y cambiar de mes?');
      if (!confirmed) {
        return; // Cancelar el cambio de mes
      }
    }
    this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + delta, 1);
    this.generateCalendar();
    await this.fetchRegionalHolidays(); 
    await this.cargarPlanificacion();
    
    // Al cambiar de mes con éxito, el estado de "cambios pendientes" se limpia 
    // porque cargamos lo que hay en la base de datos.
    this.hasUnsavedHolidayChanges = false;
  }

  getViewDateLabel(): string {
    const month = this.viewDate.toLocaleString('es-ES', { month: 'long' });
    return month.charAt(0).toUpperCase() + month.slice(1) + ' ' + this.viewDate.getFullYear();
  }

  async cargarPlanificacion() {
    const mes = this.viewDate.getMonth() + 1;
    const anio = this.viewDate.getFullYear();
    this.optimizationResult = null;
    const { data } = await this.supabase.getPlanificacion(mes, anio);
    if (data && data.datos) {
      this.optimizationResult = { ...data.datos };
      const currentMonthKey = `${this.viewDate.getFullYear()}-${String(this.viewDate.getMonth() + 1).padStart(2, '0')}`;
      
      // Cargamos solo los ajustes que pertenecen al mes que estamos visualizando
      this.manualHolidays = new Set((this.optimizationResult.manual_holidays || []).filter((h: string) => h.startsWith(currentMonthKey)));
      this.manualWorkingDays = new Set((this.optimizationResult.manual_working_days || []).filter((h: string) => h.startsWith(currentMonthKey)));
      
      if (this.optimizationResult.region && this.optimizationResult.region !== this.selectedRegion) {
        this.selectedRegion = this.optimizationResult.region;
        await this.fetchRegionalHolidays();
      }
      this.hasUnsavedHolidayChanges = false;
    }
  }

  async fetchRegionalHolidays() {
    const year = this.viewDate.getFullYear();
    const month = this.viewDate.getMonth() + 1;
    const region = this.selectedRegion || 'ES';

    try {
      const url = `/api/optimizacion/holidays?year=${year}&month=${month}&region_code=${region}`;
      const holidaysData: { [key: string]: string } = await lastValueFrom(this.http.get<{ [key: string]: string }>(url));
      this.fetchedRegionalHolidays = new Map(Object.entries(holidaysData ?? {}));
    } catch (error) {
      console.error('Error fetching regional holidays:', error);
      this.modalService.showAlert('Error', 'No se pudieron cargar los festivos regionales.');
      this.fetchedRegionalHolidays = new Map();
    }
  }

  getTasksForDate(date: Date | null): any[] {
    if (!date || !this.optimizationResult || !this.optimizationResult.horarios) return [];
    const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const tasks: any[] = [];
    
    for (const [empName, planSemanal] of Object.entries(this.optimizationResult.horarios)) {
      const tareas = (planSemanal as any)[dateKey] || [];
      tareas.forEach((t: any, idx: number) => {
        tasks.push({ 
          ...t, 
          emp: empName, 
          dayName: dateKey, 
          index: idx, 
          cssClass: empName.includes('1') ? 'emp-1-task' : 'emp-2-task' 
        });
      });
    }
    return tasks;
  }

  getEmployeeList(): string[] {
    if (!this.optimizationResult || !this.optimizationResult.horarios) return [];
    return Object.keys(this.optimizationResult.horarios);
  }

  getWeeklyTasks(emp: string, dayName: string): any[] {
    if (!this.optimizationResult || !this.optimizationResult.horarios) return [];
    
    // Buscamos la primera semana que tenga datos para este día en el mes
    const planEmp = this.optimizationResult.horarios[emp];
    const dateKeys = Object.keys(planEmp).sort();
    
    const targetDayIndex = this.diasSemana.indexOf(dayName) + 1; // Lunes = 1

    for (const dateStr of dateKeys) {
      const d = new Date(dateStr);
      // d.getDay() devuelve 1 para Lunes, etc.
      if (d.getDay() === targetDayIndex) {
        return planEmp[dateStr];
      }
    }
    return [];
  }

  async resetManualHolidays() {
    const currentMonthKey = `${this.viewDate.getFullYear()}-${String(this.viewDate.getMonth() + 1).padStart(2, '0')}`;
    const holidaysToRemove: string[] = [];
    this.manualHolidays.forEach(holidayKey => {
      if (holidayKey.startsWith(currentMonthKey)) {
        holidaysToRemove.push(holidayKey);
      }
    });
    const workingDaysToRemove: string[] = [];
    this.manualWorkingDays.forEach(workingDayKey => {
      if (workingDayKey.startsWith(currentMonthKey)) {
        workingDaysToRemove.push(workingDayKey);
      }
    });

    if (holidaysToRemove.length > 0 || workingDaysToRemove.length > 0) {
      const confirmed = await this.modalService.showConfirm('Restablecer Calendario', `¿Estás seguro de que quieres eliminar todos los ajustes manuales de ${this.getViewDateLabel()}?`);
      if (confirmed) {
        const newHolidays = new Set(this.manualHolidays);
        const newWorking = new Set(this.manualWorkingDays);
        holidaysToRemove.forEach(key => newHolidays.delete(key));
        // También limpiar working days del mes actual
        Array.from(this.manualWorkingDays).filter(k => k.startsWith(currentMonthKey)).forEach(k => newWorking.delete(k));
        this.hasUnsavedHolidayChanges = false;
        
        this.manualHolidays = newHolidays;
        this.manualWorkingDays = newWorking;
        this.modalService.showAlert('Calendario Restablecido', 'Se han restaurado los festivos estándar del mes. Los cambios manuales han sido eliminados.');
      }
    } else {
      this.modalService.showAlert('Sin Ajustes Manuales', 'No hay festivos o días laborables marcados manualmente para restablecer en este mes.');
    }
  }

  async calcularOptimizacion() {
    let validationError = false;
    const validatedCommunities: Community[] = [];

    // 1. Validar comunidades de la base de datos (comunidadesLimpieza)
    for (const c of this.comunidadesLimpieza) {
      if (!c.nombre || c.nombre.trim() === '') {
        this.modalService.showAlert('Error de Validación', `Una comunidad de la base de datos no tiene un nombre válido.`);
        validationError = true;
        break;
      }
      if (!c.direccion || c.direccion.trim() === '') {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.nombre}" no tiene una dirección válida.`);
        validationError = true;
        break;
      }
      if (!c.cleaning_hours || c.cleaning_hours <= 0) {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.nombre}" debe tener horas de limpieza mayores que 0.`);
        validationError = true;
        break;
      }
      if (!c.cleaning_days_per_week || c.cleaning_days_per_week <= 0) {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.nombre}" debe tener días de limpieza por semana mayores que 0.`);
        validationError = true;
        break;
      }
      if (!c.latitude || !c.longitude || (Number(c.latitude) === 0 && Number(c.longitude) === 0)) {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.nombre}" no tiene una ubicación válida (latitud y longitud no pueden ser 0,0).`);
        validationError = true;
        break;
      }
      validatedCommunities.push({
        id: c.id,
        address: c.nombre, // Usamos nombre como address para consistencia con CommunityInput para el backend
        cleaningHours: c.cleaning_hours,
        cleaningDaysPerWeek: c.cleaning_days_per_week,
        latitude: c.latitude,
        longitude: c.longitude,
        region: c.region || this.selectedRegion // Heredar región global si no tiene una específica
      });
    }

    if (validationError) return;

    // 2. Validar comunidades importadas de Excel (this.communities)
    for (const c of this.communities) {
      if (!c.address || c.address.trim() === '') {
        this.modalService.showAlert('Error de Validación', `Una comunidad importada de Excel no tiene una dirección válida.`);
        validationError = true;
        break;
      }
      if (c.cleaningHours <= 0) {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.address}" debe tener horas de limpieza mayores que 0.`);
        validationError = true;
        break;
      }
      if (c.cleaningDaysPerWeek <= 0) {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.address}" debe tener días de limpieza por semana mayores que 0.`);
        validationError = true;
        break;
      }
      if (!c.latitude || !c.longitude || (Number(c.latitude) === 0 && Number(c.longitude) === 0)) {
        this.modalService.showAlert('Error de Validación', `La comunidad "${c.address}" no tiene una ubicación válida (latitud y longitud no pueden ser 0,0).`);
        validationError = true;
        break;
      }
      validatedCommunities.push(c);
    }

    if (validationError) return;

    if (validatedCommunities.length === 0) {
      this.modalService.showAlert('Error de Validación', 'Debe añadir al menos una comunidad para la planificación.');
      return;
    }

    const allCommunities = validatedCommunities; // Usamos la lista validada y fusionada

    this.loading = true;
    this.error = '';

    try {
      const m = this.viewDate.getMonth() + 1;
      const y = this.viewDate.getFullYear();
      
      const datePrefix = `${y}-${String(m).padStart(2, '0')}`;
      const currentManualHolidays = Array.from(this.manualHolidays).filter(h => h.startsWith(datePrefix));
      const currentManualWorking = Array.from(this.manualWorkingDays).filter(h => h.startsWith(datePrefix));
      
      const payload: OptimizationPayload = {
        // Incluimos employeeStartLocations directamente en la inicialización del objeto
        numEmployees: this.numEmployees, 
        communities: allCommunities, 
        month: m, 
        year: y, 
        manualHolidays: currentManualHolidays, 
        manualWorkingDays: currentManualWorking, 
        region: this.selectedRegion,
        employeeStartLocations: this.employeeStartLocations.map(loc => ({ latitude: loc.latitude, longitude: loc.longitude }))
      };
      
      this.loadingMessage = `Calculando rutas para ${this.getViewDateLabel()}...`;
      const data = await lastValueFrom(this.http.post<any>('/api/optimizacion/calcular', payload));
      await this.supabase.guardarPlanificacion(m, y, data);
      
      this.optimizationResult = { ...data };
      this.hasUnsavedHolidayChanges = false;
      this.mostrarConfiguracionOptimizacion = false;
      
      // Guardar región para persistencia de usuario
      localStorage.setItem('optifincas_preferred_region', this.selectedRegion);

      this.modalService.showAlert('Éxito', `Planificación de ${this.getViewDateLabel()} actualizada correctamente.`);
    } catch (err: any) {
      this.modalService.showAlert('Error en la Planificación', 'Hubo un error al generar la planificación: ' + (err.error?.detail || err.message || 'Error desconocido'));
      this.hasUnsavedHolidayChanges = true; // Si falla, los cambios manuales siguen sin guardar
      this.error = 'Error en el cálculo';
    }
    finally { this.loading = false; }
  }

  // --- Métodos de apoyo ---
  isHoliday(date: Date | null): boolean {
    if (!date) return false;
    const dateKey = this.getDateKey(date);
    // 1. Prioridad: Anulación manual (Día laborable forzado)
    if (this.manualWorkingDays.has(dateKey)) return false;
    // 2. Prioridad: Festivo marcado manualmente
    if (this.manualHolidays.has(dateKey)) return true;
    // 3. Prioridad: Festivo regional oficial
    return this.fetchedRegionalHolidays.has(dateKey);
  }

  isManualWorkingDay(date: Date | null): boolean {
    if (!date) return false;
    return this.manualWorkingDays.has(this.getDateKey(date));
  }

  getHolidayTitle(date: Date | null): string {
    if (!date) return '';
    const dateKey = this.getDateKey(date);
    if (this.manualWorkingDays.has(dateKey)) return 'Ajuste Manual: Este día se ha forzado como LABORABLE.';
    if (this.manualHolidays.has(dateKey)) return 'Ajuste Manual: Este día se ha marcado como FESTIVO.';
    const regionalName = this.getHolidayName(date);
    return regionalName ? `Festivo Oficial: ${regionalName}` : 'Día Laborable Estándar';
  }

  getHolidayName(date: Date | null): string | null {
    if (!date) return null;
    return this.fetchedRegionalHolidays.get(this.getDateKey(date)) || null;
  }
  
  isManualHoliday(date: Date | null): boolean {
    if (!date) return false;
    return this.manualHolidays.has(this.getDateKey(date));
  }

  toggleManualHoliday(date: Date | null) {
    if (!date) return;
    this.hasUnsavedHolidayChanges = true;
    const key = this.getDateKey(date);
    const isCurrentlyHoliday = this.isHoliday(date);
    
    const newManualHolidays = new Set(this.manualHolidays);
    const newManualWorking = new Set(this.manualWorkingDays);

    if (isCurrentlyHoliday) {
      // Queremos que sea laborable
      newManualHolidays.delete(key);
      if (this.fetchedRegionalHolidays.has(key)) newManualWorking.add(key);
    } else {
      // Queremos que sea festivo
      newManualWorking.delete(key);
      if (!this.fetchedRegionalHolidays.has(key)) newManualHolidays.add(key);
    }
    
    this.manualHolidays = newManualHolidays;
    this.manualWorkingDays = newManualWorking;
  }

  isToday(date: Date | null): boolean {
    return date?.toDateString() === new Date().toDateString();
  }

  isPast(date: Date | null): boolean {
    if (!date) return false;
    const today = new Date();
    today.setHours(0,0,0,0);
    return date < today;
  }

  private getDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  prepararNuevaFinca() {
    this.editandoId = null;
    this.nuevaComunidadForm = { nombre: '', direccion: '', servicios: 'Limpieza', cleaningHours: 1, cleaningDaysPerWeek: 1, latitude: 0, longitude: 0 };
    this.mostrarModalEdicionComunidad = true;
  }

  prepararEdicion(com: any) {
    this.editandoId = com.id;
    this.nuevaComunidadForm = { ...com, cleaningHours: com.cleaning_hours, cleaningDaysPerWeek: com.cleaning_days_per_week };
    this.mostrarModalEdicionComunidad = true;
  }

  async guardarComunidad() {
    // Validación de campos antes de guardar
    if (!this.nuevaComunidadForm.nombre || this.nuevaComunidadForm.nombre.trim() === '') {
      this.modalService.showAlert('Error de Validación', 'El nombre de la comunidad es obligatorio.');
      return;
    }
    if (!this.nuevaComunidadForm.direccion || this.nuevaComunidadForm.direccion.trim() === '') {
      this.modalService.showAlert('Error de Validación', 'La dirección de la comunidad es obligatoria.');
      return;
    }
    if (this.nuevaComunidadForm.cleaningHours <= 0) {
      this.modalService.showAlert('Error de Validación', 'Las horas de limpieza deben ser mayores que 0.');
      return;
    }
    if (this.nuevaComunidadForm.cleaningDaysPerWeek <= 0) {
      this.modalService.showAlert('Error de Validación', 'Los días de limpieza por semana deben ser mayores que 0.');
      return;
    }
    if (!this.nuevaComunidadForm.latitude || !this.nuevaComunidadForm.longitude || (Number(this.nuevaComunidadForm.latitude) === 0 && Number(this.nuevaComunidadForm.longitude) === 0)) {
      this.modalService.showAlert('Error de Validación', 'La latitud y longitud no pueden ser 0,0. Por favor, use el botón de ubicación o introduzca coordenadas válidas.');
      return;
    }

    const payload = {
      nombre: this.nuevaComunidadForm.nombre,
      direccion: this.nuevaComunidadForm.direccion,
      servicios: this.nuevaComunidadForm.servicios,
      cleaning_hours: this.nuevaComunidadForm.cleaningHours,
      cleaning_days_per_week: this.nuevaComunidadForm.cleaningDaysPerWeek,
      latitude: this.nuevaComunidadForm.latitude,
      longitude: this.nuevaComunidadForm.longitude,
    };
    
    let res;
    if (this.editandoId !== null) {
      res = await this.supabase.updateComunidad(this.editandoId, payload);
    } else {
      res = await this.supabase.insertComunidad(payload);
    }

    if (res.error) {
      this.modalService.showAlert('Error de Guardado', 'No se pudieron salvar los cambios: ' + res.error.message);
    }
    
    this.mostrarModalEdicionComunidad = false;
    await this.cargarComunidades();
  }

  async eliminarComunidad(id: any) {
    const confirmed = await this.modalService.showConfirm('Eliminar Comunidad', '¿Estás seguro de que quieres eliminar esta comunidad de la base de datos?');
    if (confirmed) {
      await this.supabase.deleteComunidad(id);
      await this.cargarComunidades();
    }
  }

  importarExcelComunidades(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    this.loading = true;
    const formData = new FormData();
    formData.append('file', file);
    this.http.post<any>('/api/optimizacion/importar-comunidades', formData).subscribe({
      next: (data) => {
        if (data.comunidades && data.comunidades.length > 0) {
          const existingAddresses = new Set(this.communities.map(c => c.address.toLowerCase()));
          const filtradas = data.comunidades.filter((c: any) => !existingAddresses.has(c.address.toLowerCase()));

          if (filtradas.length === 0) {
            this.modalService.showAlert('Importación de Excel', 'Todas las comunidades del archivo ya existen en la lista.');
            this.loading = false;
            return;
          }

          const startingId = this.communities.length > 0 ? Math.max(...this.communities.map(c => c.id)) + 1 : 1;
          const nuevas = filtradas.map((c: any, index: number) => ({ ...c, id: startingId + index }));
          
          this.communities = [...this.communities, ...nuevas];
          this.modalService.showAlert('Importación de Excel', `Se han importado ${filtradas.length} comunidades correctamente.`);
        }
        this.loading = false;
      },
      error: () => { this.loading = false; this.modalService.showAlert('Error de Importación', 'Error al importar el archivo Excel. Asegúrese de que el formato es correcto.'); }
    });
  }

  removeCommunity(id: number) {
    this.communities = this.communities.filter(c => c.id !== id);
  }

  clearAllCommunities() {
    this.modalService.showConfirm('Borrar Comunidades', '¿Estás seguro de que quieres borrar todas las comunidades de la lista temporal?').then(confirmed => {
      if (confirmed) {
      this.communities = [];
      }
    });
  }

  async buscarCoordenadas() {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.nuevaComunidadForm.direccion)}`;
    this.http.get<any[]>(url).subscribe({
      next: data => {
        if (data?.length) {
          this.nuevaComunidadForm.latitude = parseFloat(data[0].lat);
          this.nuevaComunidadForm.longitude = parseFloat(data[0].lon);
          this.modalService.showAlert('Ubicación Encontrada', 'Coordenadas obtenidas correctamente.');
        } else {
          this.modalService.showAlert('Ubicación No Encontrada', 'No se pudieron encontrar coordenadas para la dirección proporcionada. Por favor, inténtelo de nuevo o introduzca las coordenadas manualmente.');
        }
      },
      error: err => {
        console.error('Error al buscar coordenadas:', err);
        this.modalService.showAlert('Error de Conexión', 'No se pudo contactar con el servicio de geocodificación. Verifique su conexión a internet o inténtelo de nuevo más tarde.');
      }
    });
  }

  descargarExcelOptimizacion() {
    if (!this.optimizationResult) return;
    const byteCharacters = atob(this.optimizationResult.excel_archivo);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = this.optimizationResult.nombre_archivo;
    a.click();
  }
}