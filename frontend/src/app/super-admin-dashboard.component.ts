import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { Profile } from './models';

@Component({
  selector: 'app-super-admin-dashboard',
  template: `
    <div class="card-container">
      <div style="margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;">
        <h2 class="section-title" style="margin: 0;">Panel de Control Global</h2>
        <p style="color: #64748b; font-size: 0.95rem;">Aprobación de nuevas empresas y despachos profesionales.</p>
      </div>

      <!-- SECCIÓN DE KPIs (Métrica de Honor) -->
      <div class="summary-cards" style="grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 35px;">
        <div class="card" style="border-top: 4px solid #6366f1; padding: 20px; background: white;">
          <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Empresas Activas</span>
          <div style="font-size: 1.8rem; font-weight: 900; color: #1e293b; margin-top: 5px;">{{ stats.owners || 0 }}</div>
        </div>
        <div class="card" style="border-top: 4px solid #10b981; padding: 20px; background: white;">
          <span style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">Fincas Gestionadas</span>
          <div style="font-size: 1.8rem; font-weight: 900; color: #1e293b; margin-top: 5px;">{{ stats.communities || 0 }}</div>
        </div>
      </div>

      <!-- Selector de pestañas -->
      <div style="display: flex; gap: 20px; margin-bottom: 25px;">
        <button class="btn" [class.btn-info]="view === 'all'" [class.btn-secondary]="view !== 'all'" (click)="view = 'all'">
          Empresas Registradas
        </button>
        <button class="btn" [class.btn-info]="view === 'pending'" [class.btn-secondary]="view !== 'pending'" (click)="view = 'pending'">
          Solicitudes Pendientes
          <span *ngIf="solicitudes.length > 0" style="background: #ef4444; color: white; margin-left: 8px; border-radius: 10px; padding: 2px 8px; font-size: 0.75rem; font-weight: 800;">
            {{ solicitudes.length }}
          </span>
        </button>
      </div>

      <!-- Barra de búsqueda para la pestaña de registrados -->
      <div *ngIf="view === 'all'" style="margin-bottom: 20px;">
        <div style="position: relative; max-width: 400px;">
          <input type="text" [(ngModel)]="searchTerm" placeholder="Buscar por email o empresa..." 
                 class="input-concepto-edit" style="padding-left: 40px; border-radius: 50px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" 
               style="position: absolute; left: 15px; top: 50%; transform: translateY(-50%);">
            <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      <div *ngIf="loading && (allUsers.length === 0 && solicitudes.length === 0)" class="no-tasks">Cargando datos del sistema...</div>

      <!-- VISTA LISTADO GLOBAL -->
      <div *ngIf="!loading && view === 'all'">
        <table class="movimientos-table">
          <thead>
            <tr>
              <th>Dueño / Responsable</th>
              <th>Rol</th>
              <th>Empresa / Despacho</th>
              <th>Fecha Registro</th>
              <th>Estado Cuenta</th>
              <th style="text-align: center;">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let u of filteredUsers">
              <td>
                <div style="font-weight: 700; color: #1e293b;">{{ u.email }}</div>
                <div style="font-size: 0.7rem; color: #6366f1; font-weight: 700; text-transform: uppercase;">Administrador Principal</div>
              </td>
              <td><span class="badge" style="background: #e0e7ff; color: #4338ca; text-transform: capitalize;">{{ u.role }}</span></td>
              <td style="font-weight: 700; color: #1e293b;">
                {{ u.organizations?.nombre || 'Sin organización' }}
              </td>
              <td style="font-size: 0.8rem; color: #64748b;">{{ u.created_at | date:'dd/MM/yyyy HH:mm' }}</td>
              <td>
                <span class="badge" 
                  [style.background]="u.status === 'approved' ? '#dcfce7' : (u.status === 'pending' ? '#fff7ed' : '#fee2e2')"
                  [style.color]="u.status === 'approved' ? '#166534' : (u.status === 'pending' ? '#9a3412' : '#991b1b')">
                  {{ u.status === 'approved' ? 'ACTIVA' : (u.status === 'pending' ? 'PENDIENTE' : 'BLOQUEADA') }}
                </span>
              </td>
              <td style="text-align: center;">
                <button *ngIf="u.role !== 'superadmin'" class="btn-action btn-delete" (click)="eliminarEmpresa(u)" title="Eliminar Empresa y Datos">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- VISTA PENDIENTES -->
      <div *ngIf="!loading && view === 'pending'">
        <div *ngIf="solicitudes.length === 0" class="dashboard-empty-state">
          <p class="empty-title">No hay empresas pendientes</p>
          <p class="empty-text">Todas las solicitudes han sido procesadas.</p>
        </div>

        <div *ngFor="let sol of solicitudes" class="card" style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center; padding: 20px;">
          <div>
            <div style="font-size: 0.85rem; color: #6366f1; font-weight: 700; text-transform: uppercase; margin-bottom: 4px;">
              {{ sol.organizations?.nombre || 'Empresa sin nombre' }}
            </div>
            <div style="font-weight: 600; color: #1e293b; font-size: 1.1rem;">{{ sol.email }}</div>
            <div style="font-size: 0.85rem; color: #6366f1; font-weight: 600; text-transform: uppercase; margin-top: 4px;">
              Solicitud de Alta (Owner)
            </div>
          </div>
          <div style="display: flex; gap: 12px;">
            <button class="btn btn-success" (click)="procesarSolicitud(sol, 'approved')">Aprobar Empresa</button>
            <button class="btn btn-danger" (click)="procesarSolicitud(sol, 'denied')">Rechazar</button>
          </div>
        </div>
      </div>

    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class SuperAdminDashboardComponent implements OnInit {
  view: 'pending' | 'all' = 'all';
  solicitudes: Profile[] = [];
  allUsers: any[] = [];
  loading = false;
  searchTerm = '';
  stats = { orgs: 0, communities: 0, owners: 0 };

  get filteredUsers() {
    if (!this.searchTerm.trim()) {
      return this.allUsers;
    }
    const term = this.searchTerm.toLowerCase();
    return this.allUsers.filter(u => 
      u.email.toLowerCase().includes(term) || 
      u.organizations?.nombre?.toLowerCase().includes(term)
    );
  }

  constructor(private supabase: SupabaseService, private modalService: ModalService) {}

  async ngOnInit() {
    await this.cargarSolicitudes();
    await this.cargarTodosLosUsuarios();
    await this.cargarStats();
  }

  async cargarStats() {
    this.stats = await this.supabase.getGlobalStats();
  }

  async cargarSolicitudes() {
    this.loading = true;
    const { data, error } = await this.supabase.getGlobalPendingRequests();
    if (error) console.error('[SUPERADMIN] Error cargando solicitudes:', error);
    this.solicitudes = data || [];
    this.loading = false;
  }

  async cargarTodosLosUsuarios() {
    this.loading = true;
    const { data, error } = await this.supabase.getAllProfiles();
    if (error) {
      console.error('[SUPERADMIN] Error cargando todos los usuarios:', error.message);
      console.error('Detalles técnicos:', error);
    }
    // Filtramos la lista para que el Super Admin solo gestione cuentas de tipo 'owner' (Empresas)
    this.allUsers = (data || []).filter(u => u.role === 'owner');
    console.log('[SUPERADMIN] Lista de usuarios cargada:', this.allUsers);
    this.loading = false;
  }

  async procesarSolicitud(perfil: Profile, estado: 'approved' | 'denied') {
    const accion = estado === 'approved' ? 'APROBAR' : 'RECHAZAR';
    const confirm = await this.modalService.showConfirm(
      `${accion} Acceso`,
      `¿Estás seguro de que deseas ${estado === 'approved' ? 'dar de alta' : 'denegar el acceso'} a la empresa asociada a ${perfil.email}?`
    );

    if (confirm) {
      this.loading = true;
      try {
        const { error } = await this.supabase.responderSolicitudRegistroEmpresa(perfil.id, estado);
        if (error) {
          console.error('[SUPERADMIN] Error en responderSolicitud:', error);
          throw error;
        }
        
        this.modalService.showAlert('Operación Exitosa', `La empresa ha sido ${estado === 'approved' ? 'activada' : 'rechazada'} correctamente.`);
        await this.cargarSolicitudes();
        await this.cargarTodosLosUsuarios();
      } catch (e: any) {
        this.modalService.showAlert('Error de Servidor', 'No se pudo actualizar el estado: ' + (e.message || 'Sin respuesta de Supabase'));
      } finally {
        this.loading = false;
      }
    }
  }

  async eliminarEmpresa(usuario: Profile) {
    const orgNombre = usuario.organizations?.nombre || 'esta empresa';
    const confirm = await this.modalService.showConfirm(
      'Eliminar Empresa', 
      `¿Estás seguro de eliminar a "${orgNombre}" (${usuario.email})? Se borrará la organización y todos sus datos asociados. Esta acción es irreversible.`
    );

    if (confirm) {
      this.loading = true;
      try {
        // Delegamos la lógica compleja al servicio (SRP)
        const { error } = await this.supabase.eliminarEmpresaCompleta(usuario);
        if (error) throw error;

        this.modalService.showAlert('Éxito', 'La empresa y sus datos han sido eliminados correctamente.');
        await this.cargarTodosLosUsuarios();
        await this.cargarSolicitudes();
      } catch (e: any) {
        this.modalService.showAlert('Error', 'Fallo al eliminar: ' + e.message);
      } finally {
        this.loading = false;
      }
    }
  }
}