import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Community, ComunidadDB } from './models';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-optimizacion',
  templateUrl: './optimizacion.component.html',
  styleUrls: ['./optimizacion.component.css']
})
export class OptimizacionComponent implements OnInit {
  loading = false;
  loadingMessage = 'Procesando documentos...';
  error = '';
  
  // Estado de Configuración
  mostrarConfiguracionOptimizacion = false;
  mostrarModalEdicionComunidad = false;
  editandoId: string | null = null;
  nuevaComunidadForm = { 
    nombre: '', direccion: '', servicios: 'Limpieza',
    cleaningHours: 1.0, cleaningDaysPerWeek: 1,
    latitude: 0, longitude: 0
  };

  // Datos de Optimización
  numEmployees: number = 2;
  communities: Community[] = [];
  comunidadesDB: ComunidadDB[] = [];
  optimizationResult: any = null;
  diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  // Estado del Calendario
  viewDate: Date = new Date();
  calendarDays: (Date | null)[] = [];

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  async ngOnInit() {
    this.generateCalendar();
    await this.cargarComunidades();
    await this.cargarPlanificacion();
  }

  async cargarComunidades() {
    const { data } = await this.supabase.getComunidades();
    this.comunidadesDB = data || [];
  }

  get comunidadesLimpieza(): any[] {
    return this.comunidadesDB.filter(c => 
      c.servicios?.toLowerCase().includes('limpieza')
    );
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
    this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + delta, 1);
    this.generateCalendar();
    await this.cargarPlanificacion();
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

  async calcularOptimizacion() {
    const allCommunities = [
      ...this.comunidadesLimpieza.map(c => ({
        address: c.nombre,
        cleaningHours: Math.max(0.5, c.cleaning_hours || 1),
        cleaningDaysPerWeek: Math.max(1, c.cleaning_days_per_week || 1),
        latitude: c.latitude, longitude: c.longitude
      })),
      ...this.communities.map(c => ({
        address: c.address,
        cleaningHours: c.cleaningHours,
        cleaningDaysPerWeek: c.cleaningDaysPerWeek,
        latitude: c.latitude, longitude: c.longitude
      }))
    ];

    if (allCommunities.length === 0) return alert('Debe añadir al menos una comunidad.');

    this.loading = true;
    this.error = '';
    const startMonth = this.viewDate.getMonth();
    const startYear = this.viewDate.getFullYear();
    let completedMonths = 0;

    const monthTasks = Array.from({ length: 12 }, async (_, i) => {
      const d = new Date(startYear, startMonth + i, 1);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      const payload = { numEmployees: this.numEmployees, communities: allCommunities, month: m, year: y };
      
      const data = await this.http.post<any>('/api/optimizacion/calcular', payload).toPromise();
      await this.supabase.guardarPlanificacion(m, y, data);
      completedMonths++;
      this.loadingMessage = `Cargando: ${completedMonths} de 12 meses listos`;
      if (i === 0) this.optimizationResult = { ...data };
    });

    try {
      await Promise.all(monthTasks);
      this.mostrarConfiguracionOptimizacion = false;
      alert('Planificación anual completada.');
    } catch (err) { this.error = 'Error en el cálculo'; }
    finally { this.loading = false; }
  }

  // --- Métodos de apoyo ---
  isHoliday(date: Date | null): boolean {
    if (!date) return false;
    const h = ['1-1', '6-1', '1-5', '30-5', '15-8', '12-10', '1-11', '6-12', '8-12', '25-12'];
    return h.includes(`${date.getDate()}-${date.getMonth() + 1}`);
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
    const payload = {
      nombre: this.nuevaComunidadForm.nombre,
      direccion: this.nuevaComunidadForm.direccion,
      servicios: this.nuevaComunidadForm.servicios,
      cleaning_hours: this.nuevaComunidadForm.cleaningHours,
      cleaning_days_per_week: this.nuevaComunidadForm.cleaningDaysPerWeek,
      latitude: this.nuevaComunidadForm.latitude,
      longitude: this.nuevaComunidadForm.longitude
    };
    if (this.editandoId) await this.supabase.updateComunidad(this.editandoId, payload);
    else await this.supabase.insertComunidad(payload);
    this.mostrarModalEdicionComunidad = false;
    await this.cargarComunidades();
  }

  async eliminarComunidad(id: any) {
    if (confirm('¿Eliminar comunidad?')) {
      await this.supabase.deleteComunidad(id.toString());
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
            alert('Todas las comunidades del archivo ya existen en la lista.');
            this.loading = false;
            return;
          }

          const startingId = this.communities.length > 0 ? Math.max(...this.communities.map(c => c.id)) + 1 : 1;
          const nuevas = filtradas.map((c: any, index: number) => ({ ...c, id: startingId + index }));
          
          this.communities = [...this.communities, ...nuevas];
          alert(`Se han importado ${filtradas.length} comunidades correctamente.`);
        }
        this.loading = false;
      },
      error: () => { this.loading = false; alert('Error al importar Excel'); }
    });
  }

  removeCommunity(id: number) {
    this.communities = this.communities.filter(c => c.id !== id);
  }

  clearAllCommunities() {
    if (confirm('¿Estás seguro de que quieres borrar todas las comunidades de la lista temporal?')) {
      this.communities = [];
    }
  }

  async buscarCoordenadas() {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.nuevaComunidadForm.direccion)}`;
    this.http.get<any[]>(url).subscribe(data => {
      if (data?.length) {
        this.nuevaComunidadForm.latitude = parseFloat(data[0].lat);
        this.nuevaComunidadForm.longitude = parseFloat(data[0].lon);
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