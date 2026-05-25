import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-comunidad-limpieza',
  template: `
    <div class="limpieza-container">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
        <h3 class="dashboard-section-title">Cronograma de Limpieza</h3>
        
        <!-- Navegación de Mes -->
        <div class="dashboard-month-nav">
          <button class="btn-icon-nav" (click)="changeMonth(-1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div class="month-display">
            <span class="month-title">{{ currentMonthLabel }}</span>
          </div>
          <button class="btn-icon-nav" (click)="changeMonth(1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>
      </div>

      <div *ngIf="loading" class="dashboard-loading">
        <div class="spinner"></div>
        <span>Sincronizando cuadrante...</span>
      </div>

      <div *ngIf="!loading && schedule.length > 0">
        <div *ngFor="let day of schedule" class="cleaning-day-card">
          <div class="cleaning-day-header">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            <span class="day-label">{{ day.date | date:'EEEE, d MMMM' }}</span>
          </div>
          <div class="cleaning-tasks-list">
            <div *ngFor="let task of day.tasks; let last = last" class="cleaning-task-item" [style.border-bottom]="!last ? '1px dashed #f1f5f9' : 'none'">
              <div class="task-left">
                <div [class]="task.emp.includes('1') ? 'employee-tag emp1' : 'employee-tag emp2'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                  {{ task.emp }}
                </div>
                <div class="task-details">
                  <span class="task-time-range">{{ task.inicio }} — {{ task.fin }}</span>
                  <span class="task-sub">Servicio de limpieza ordinario</span>
                </div>
              </div>
              <div class="task-right">
                <span class="hours-badge">{{ task.horas }} horas</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="!loading && schedule.length === 0" class="dashboard-empty-state">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
        <p class="empty-title">Sin turnos programados</p>
        <p class="empty-text">No se ha encontrado ninguna planificación para esta finca en el periodo seleccionado.</p>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadLimpiezaComponent implements OnInit {
  communityId: string | null = null;
  communityName: string = '';
  schedule: { date: string, tasks: any[] }[] = [];
  loading = false;
  currentMonthLabel = '';
  viewDate: Date = new Date();

  constructor(private route: ActivatedRoute, private supabase: SupabaseService) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    this.updateMonthLabel();

    if (this.communityId) {
      await this.cargarNombreComunidad();
      await this.cargarPlanificacion();
    }
  }

  async changeMonth(delta: number) {
    this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + delta, 1);
    this.updateMonthLabel();
    await this.cargarPlanificacion();
  }

  updateMonthLabel() {
    this.currentMonthLabel = this.viewDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    this.currentMonthLabel = this.currentMonthLabel.charAt(0).toUpperCase() + this.currentMonthLabel.slice(1);
  }

  async cargarNombreComunidad() {
    const { data } = await this.supabase.getComunidades();
    const com = data?.find(c => c.id == this.communityId);
    if (com) this.communityName = com.nombre;
  }

  async cargarPlanificacion() {
    this.loading = true;
    const mes = this.viewDate.getMonth() + 1;
    const anio = this.viewDate.getFullYear();
    const { data } = await this.supabase.getPlanificacion(mes, anio);

    if (data?.datos?.horarios) {
      const grouped: { [date: string]: any[] } = {};
      
      // Iterar sobre empleados y sus horarios
      for (const [employeeName, dates] of Object.entries(data.datos.horarios)) {
        for (const [dateKey, tasks] of Object.entries(dates as any)) {
          // Filtrar tareas que pertenezcan a esta comunidad específica
          const myTasks = (tasks as any[]).filter(t => t.comunidad.toLowerCase() === this.communityName.toLowerCase());
          
          if (myTasks.length > 0) {
            if (!grouped[dateKey]) grouped[dateKey] = [];
            myTasks.forEach(t => {
              grouped[dateKey].push({
                ...t,
                emp: employeeName
              });
            });
          }
        }
      }

      this.schedule = Object.keys(grouped).sort().map(date => ({
        date,
        tasks: grouped[date]
      }));
    }
    this.loading = false;
  }
}