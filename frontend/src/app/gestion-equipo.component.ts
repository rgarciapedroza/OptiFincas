import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { Profile } from './models';

@Component({
  selector: 'app-gestion-equipo',
  template: `
    <div class="card-container">
      <!-- SECCIÓN DE NOTIFICACIONES / SOLICITUDES PENDIENTES -->
      <div *ngIf="solicitudes.length > 0" style="margin-bottom: 40px; background: linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%); border: 1px solid #fde68a; border-radius: 16px; padding: 25px; box-shadow: 0 10px 15px -3px rgba(251, 191, 36, 0.1);">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 15px;">
          <div style="background: #f59e0b; color: white; padding: 8px; border-radius: 50%; display: flex; animation: pulse 2s infinite;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>
          </div>
          <h3 style="margin: 0; color: #92400e; font-size: 1.1rem; font-weight: 800;">Solicitudes de Acceso al Despacho</h3>
        </div>
        
        <div *ngFor="let sol of solicitudes" style="display: flex; justify-content: space-between; align-items: center; background: white; padding: 18px 25px; border-radius: 14px; margin-bottom: 12px; border: 1px solid #fef3c7; transition: all 0.2s;">
          <div>
            <div style="font-weight: 800; color: #1e293b; font-size: 1rem;">{{ sol.email }}</div>
            <div style="font-size: 0.8rem; color: #64748b;">Desea unirse como Administrador</div>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn btn-success" style="padding: 6px 15px; font-size: 0.8rem;" (click)="responderSolicitud(sol, 'approved')">Aceptar</button>
            <button class="btn btn-danger" style="padding: 6px 15px; font-size: 0.8rem;" (click)="responderSolicitud(sol, 'denied')">Denegar</button>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;">
        <h2 class="section-title" style="margin: 0;">Gestión de Equipo</h2>
        <button class="btn btn-success" (click)="mostrarModalInvitacion = true" style="border-radius: 20px;">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 8px;"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
          Añadir Administrador
        </button>
      </div>

      <p style="color: #64748b; margin-bottom: 25px; font-size: 0.95rem;">Administra quién tiene acceso a la gestión de las comunidades de tu despacho profesional.</p>

      <table class="movimientos-table" *ngIf="miembros.length > 0">
        <thead>
          <tr>
            <th>Email</th>
            <th>Rol en el Despacho</th>
            <th style="text-align: center;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let m of miembros">
            <td style="font-weight: 600;">{{ m.email }}</td>
            <td>
              <span class="badge" [style.background]="m.role === 'owner' ? '#e0e7ff' : '#f1f5f9'" [style.color]="m.role === 'owner' ? '#4338ca' : '#475569'">
                {{ m.role === 'owner' ? 'Propietario / Dueño' : 'Administrador' }}
              </span>
            </td>
            <td style="text-align: center;">
              <button *ngIf="m.role !== 'owner'" class="btn-action btn-delete" (click)="eliminarMiembro(m)" title="Revocar acceso">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"></path></svg>
              </button>
              <span *ngIf="m.role === 'owner'" style="font-size: 0.75rem; color: #94a3b8; font-style: italic;">Principal</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="loading" class="no-tasks">Cargando equipo...</div>
    </div>

    <!-- Modal de Invitación -->
    <div class="modal-overlay" *ngIf="mostrarModalInvitacion">
      <div class="modal-card" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Añadir Administrador</h3>
          <button class="btn-action" (click)="mostrarModalInvitacion = false">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Correo Electrónico</label>
            <input type="email" [(ngModel)]="nuevoEmail" class="input-concepto-edit" placeholder="ejemplo@correo.com">
          </div>
          <div style="background: #f8fafc; padding: 15px; border-radius: 10px; margin-top: 20px; border-left: 4px solid #3b82f6;">
            <p style="font-size: 0.85rem; color: #475569; margin: 0;">
              El usuario podrá ver y gestionar todas las comunidades vinculadas a tu organización una vez cree su cuenta con este correo.
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="mostrarModalInvitacion = false">Cancelar</button>
          <button class="btn btn-success" (click)="invitarMiembro()" [disabled]="!nuevoEmail">Conceder Acceso</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class GestionEquipoComponent implements OnInit {
  miembros: Profile[] = [];
  solicitudes: Profile[] = [];
  loading = false;
  mostrarModalInvitacion = false;
  nuevoEmail = '';
  orgId: string | null = null;

  constructor(public supabase: SupabaseService, public modalService: ModalService) {}

  async ngOnInit() {
    this.loading = true;
    const session = await this.supabase.getSession();
    if (session) {
      const { data: profile } = await this.supabase.getProfile(session.user.id);
      if (profile && profile.organizacion_id) {
        this.orgId = profile.organizacion_id;
        console.log(`[GESTION-EQUIPO] Owner orgId: ${this.orgId}`);
        await this.cargarMiembros();
        await this.cargarSolicitudes();
      }
    }
    this.loading = false;
  }

  async cargarMiembros() {
    if (!this.orgId) return;
    const { data } = await this.supabase.getOrganizationMembers(this.orgId);
    this.miembros = (data || []).filter(m => m.status === 'approved');
  }

  async cargarSolicitudes() {
    if (!this.orgId) return;
    const { data } = await this.supabase.getPendingRequests(this.orgId);
    console.log(`[GESTION-EQUIPO] Solicitudes cargadas:`, data);
    this.solicitudes = data || [];
  }

  async responderSolicitud(perfil: Profile, nuevoEstado: 'approved' | 'denied') {
    const confirm = await this.modalService.showConfirm(
      nuevoEstado === 'approved' ? 'Aceptar Miembro' : 'Rechazar Solicitud',
      `¿Deseas ${nuevoEstado === 'approved' ? 'conceder' : 'denegar'} el acceso a ${perfil.email}?`
    );
    
    if (confirm) {
      this.loading = true;
      try {
        const { error } = await this.supabase.updateProfile(perfil.id, { status: nuevoEstado });
        if (error) throw error;

        this.modalService.showAlert('Éxito', `La solicitud de ${perfil.email} ha sido ${nuevoEstado === 'approved' ? 'aprobada' : 'rechazada'}.`);
        
        await this.cargarMiembros();
        await this.cargarSolicitudes();

        // Notificar al AppComponent para que limpie el número del sidebar
        this.supabase.solicitudesRefresh$.next();
      } catch (e: any) {
        console.error('[GESTION-EQUIPO] Error al responder solicitud:', e);
        this.modalService.showAlert('Error de Permisos', 'No se ha podido actualizar el estado. Revisa las políticas RLS en Supabase: ' + (e.message || 'Acceso denegado'));
      } finally {
        this.loading = false;
      }
    }
  }

  async invitarMiembro() {
    if (!this.nuevoEmail || !this.orgId) return;
    try {
      // 1. Buscar si el perfil ya existe por email
      const { data: existingProfile } = await this.supabase.getProfileByEmail(this.nuevoEmail);
      
      if (existingProfile) {
        // 2. Si el perfil existe, actualizarlo para añadirlo al equipo
        const { error } = await this.supabase.updateProfile(existingProfile.id, {
          organizacion_id: this.orgId,
          role: 'admin', // Siempre se añade como admin, el owner ya es owner
          status: 'approved'
        });
        if (error) throw error;

        this.modalService.showAlert('Éxito', `Se han concedido permisos a ${this.nuevoEmail}`);
        this.nuevoEmail = '';
        this.mostrarModalInvitacion = false;
        await this.cargarMiembros();
        await this.cargarSolicitudes(); // Recargar solicitudes por si había una pendiente para este email
        this.supabase.solicitudesRefresh$.next();
      } else {
        // 3. Si el perfil NO existe, informar al owner que el usuario debe registrarse primero
        this.modalService.showAlert('Usuario no registrado',
          'El correo indicado no tiene una cuenta en OptiFincas. Pídele que se registre como "Profesional" con el nombre de tu despacho para poder añadirlo al equipo.');
      }
    } catch (e: any) { this.modalService.showAlert('Error', e.message); }
  }

  async eliminarMiembro(miembro: Profile) {
    const confirm = await this.modalService.showConfirm('Revocar Acceso', `¿Quitar permisos de administración a ${miembro.email}?`);
    if (confirm) {
      this.loading = true;
      try {
        // Desvinculamos de la organización y reseteamos el estado a 'pending'
        // por si el usuario intenta volver a entrar en el futuro.
        const { error } = await this.supabase.updateProfile(miembro.id, { 
          organizacion_id: null,
          status: 'pending' 
        });

        if (error) throw error;

        this.modalService.showAlert('Éxito', 'El acceso ha sido revocado correctamente.');
        await this.cargarMiembros(); // Refrescamos la lista directamente desde la DB
      } catch (e: any) {
        console.error('[GESTION-EQUIPO] Error al revocar acceso:', e);
        this.modalService.showAlert('Error', 'No se pudo completar la operación: ' + (e.message || 'Error de permisos RLS'));
      } finally {
        this.loading = false;
      }
    }
  }
}