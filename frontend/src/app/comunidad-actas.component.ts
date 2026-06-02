import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Acta } from './models';
import { ModalService } from './modal.service';
import { UtilsService } from './utils.service';

@Component({
  selector: 'app-comunidad-actas',
  template: `
    <div class="card-container" style="max-width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
        <h3 class="section-title" style="margin: 0;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          Libro de Actas
        </h3>
        
        <div style="display: flex; align-items: center; gap: 20px; background: #f8fafc; padding: 10px 20px; border-radius: 50px; border: 1px solid #e2e8f0;">
          <button class="btn-action" (click)="changeYear(-1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
          <span style="font-weight: 800; color: #1e293b; font-size: 1.1rem; min-width: 60px; text-align: center;">{{ currentYear }}</span>
          <button class="btn-action" (click)="changeYear(1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
        </div>
      </div>

      <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 25px;">Registro histórico de actas de las juntas de propietarios. Sube el documento firmado en formato PDF.</p>

      <table class="movimientos-table">
        <thead>
          <tr>
            <th>Mes</th>
            <th>Documento Acta</th>
            <th *ngIf="!isPropietario" style="text-align: center;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let m of meses; let i = index">
            <td style="font-weight: 700; color: #1e293b; width: 200px; vertical-align: top; padding-top: 15px;">{{ m }}</td>
            <td style="vertical-align: top;">
              <div *ngFor="let acta of getActasMes(i + 1)" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; padding: 10px; background: white; border-radius: 10px; border: 1px solid #e2e8f0;">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                  <span style="font-size: 0.9rem; color: #475569; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">{{ acta.nombre_archivo }}</span>
                </div>
                <div style="display: flex; gap: 10px; flex-shrink: 0;">
                  <button class="btn-action" (click)="verActa(acta)" title="Ver" style="color: #6366f1;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                  <button *ngIf="!isPropietario" class="btn-action" (click)="editarNombre(acta)" title="Renombrar" style="color: #f59e0b;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                  </button>
                  <button *ngIf="!isPropietario" class="btn-action btn-delete" (click)="eliminarActa(acta)" title="Borrar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
              <span *ngIf="getActasMes(i + 1).length === 0" style="color: #94a3b8; font-style: italic; font-size: 0.85rem; padding: 10px; display: block;">Sin actas registradas</span>
            </td>
            <td *ngIf="!isPropietario" style="text-align: center; vertical-align: top; padding-top: 15px;">
              <label class="btn-action" style="cursor: pointer; color: #10b981;" title="Subir Acta">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <input type="file" (change)="onFileSelected($event, i + 1)" accept=".pdf" hidden>
              </label>
            </td>
          </tr>
        </tbody>
      </table>

      <div *ngIf="loading" class="loading-overlay">
        <div class="spinner"></div>
        <span style="font-weight: 600; color: #475569;">{{ loadingMessage }}</span>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadActasComponent implements OnInit {
  communityId: string | null = null;
  currentYear = new Date().getFullYear();
  actas: Acta[] = [];
  loading = false;
  loadingMessage = 'Cargando actas...';
  meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  isPropietario: boolean = false;

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService,
    private modalService: ModalService,
    public utils: UtilsService
  ) {}

  async ngOnInit() {
    // Detección robusta: buscamos en la ruta actual, luego en la del padre, 
    // y finalmente en la del "abuelo" (por si hay más niveles de nesting)
    const idFromSnapshot = (r: ActivatedRoute | null): string | null => {
      if (!r) return null;
      return r.snapshot.paramMap.get('id') || idFromSnapshot(r.parent);
    };

    this.communityId = idFromSnapshot(this.route);

    if (this.communityId) {
      await this.cargarActas();
    }

    // Determinar si el usuario actual es un propietario
    const session = await this.supabase.getSession();
    if (session?.user?.id) {
      const { data: profile } = await this.supabase.getProfile(session.user.id);
      this.isPropietario = profile?.role === 'propietario';
    }
  }

  async cargarActas() {
    this.loading = true;
    const { data } = await this.supabase.getActas(this.communityId!);
    this.actas = data || [];
    this.loading = false;
  }

  getActasMes(mes: number): Acta[] {
    return this.actas.filter(a => a.mes === mes && a.anio === this.currentYear);
  }

  changeYear(delta: number) {
    this.currentYear += delta;
  }

  async onFileSelected(event: any, mes: number) {
    const file = event.target.files[0];
    if (file && this.communityId) {
      this.loading = true;
      this.loadingMessage = 'Subiendo acta...';
      try {
        await this.supabase.uploadActa(this.communityId, this.currentYear, mes, file);
        await this.cargarActas();
        this.modalService.showAlert('Éxito', 'El acta se ha subido correctamente.');
      } catch (e: any) {
        console.error('[ACTAS] Error en subida:', e);
        this.modalService.showAlert('Error', 'No se pudo subir el archivo: ' + e.message);
      } finally {
        this.loading = false;
        event.target.value = ''; // Resetear input
      }
    }
  }

  async eliminarActa(acta: Acta) {
    const confirm = await this.modalService.showConfirm('Eliminar Acta', `¿Estás seguro de eliminar el acta de ${this.meses[acta.mes - 1]} ${acta.anio}?`);
    if (confirm) {
      this.loading = true;
      try {
        await this.supabase.deleteActa(acta);
        await this.cargarActas();
        this.modalService.showAlert('Éxito', 'El acta ha sido eliminada.');
      } catch (e: any) {
        this.modalService.showAlert('Error', 'No se pudo eliminar: ' + e.message);
      } finally {
        this.loading = false;
      }
    }
  }

  async editarNombre(acta: Acta) {
    const nuevoNombre = window.prompt('Introduce el nuevo nombre para el documento:', acta.nombre_archivo);
    if (nuevoNombre && nuevoNombre.trim() !== '' && nuevoNombre !== acta.nombre_archivo) {
      this.loading = true;
      try {
        const { error } = await this.supabase.updateActaName(acta.id!, nuevoNombre.trim());
        if (error) throw error;
        await this.cargarActas();
        this.modalService.showAlert('Éxito', 'Nombre actualizado correctamente.');
      } catch (e: any) {
        this.modalService.showAlert('Error', 'No se pudo actualizar el nombre: ' + e.message);
      } finally {
        this.loading = false;
      }
    }
  }

  verActa(acta: Acta) {
    window.open(acta.url_archivo, '_blank');
  }
}