import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Anuncio, Piso } from './models';
import { ModalService } from './modal.service';
import { UtilsService } from './utils.service';

@Component({
  selector: 'app-comunidad-anuncios',
  template: `
    <div class="card-container" style="max-width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
        <h3 class="section-title" style="margin: 0;">Tablón de Anuncios</h3>
        <button *ngIf="!isPropietario" class="btn btn-success" (click)="mostrarModal = true" style="border-radius: 20px;">
          + Publicar Anuncio
        </button>
      </div>

      <div *ngIf="loading" class="no-tasks">Cargando comunicados...</div>
      
      <div *ngIf="!loading && anuncios.length === 0" class="dashboard-empty-state">
        <p class="empty-title">No hay anuncios publicados</p>
        <p class="empty-text">Los comunicados importantes de la administración aparecerán aquí.</p>
      </div>

      <div *ngFor="let a of anuncios" class="card" style="margin-bottom: 20px; border-left: 5px solid" [style.border-left-color]="a.es_importante ? '#ef4444' : '#6366f1'">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
          <h4 style="margin: 0; font-weight: 800; color: #1e293b;">
            {{ a.titulo }}
            <span *ngIf="a.es_importante" class="badge" style="background: #fee2e2; color: #ef4444; margin-left: 10px;">IMPORTANTE</span>
            <span *ngIf="!isPropietario && a.anuncios_leidos" style="font-size: 0.75rem; color: #94a3b8; font-weight: 600; margin-left: 10px; cursor: pointer;" (click)="verLectores(a)">
              ({{ a.anuncios_leidos[0]?.count || 0 }} lecturas)
            </span>
          </h4>
          <div style="display: flex; gap: 8px;">
            <button *ngIf="!isPropietario" class="btn-action" (click)="verLectores(a)" title="Ver lectores" style="color: #6366f1;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
            </button>
            <button *ngIf="!isPropietario" class="btn-action btn-delete" (click)="eliminarAnuncio(a.id!)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </div>
        <p style="color: #475569; white-space: pre-wrap; margin-bottom: 15px;">{{ a.contenido }}</p>
        <div style="font-size: 0.75rem; color: #94a3b8; font-weight: 600;">
          Publicado el {{ a.fecha_publicacion | date:'dd/MM/yyyy HH:mm' }}
        </div>
      </div>
    </div>

    <!-- Modal para nuevo anuncio -->
    <div class="modal-overlay" *ngIf="mostrarModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>Nuevo Comunicado</h3>
          <button class="btn-action" (click)="mostrarModal = false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="modal-body">
          <div class="form-group" style="margin-bottom: 20px;">
            <label>Título del anuncio</label>
            <input [(ngModel)]="nuevoAnuncio.titulo" placeholder="Ej: Corte de agua programado" class="input-concepto-edit">
          </div>
          <div class="form-group" style="margin-bottom: 20px;">
            <label>Contenido</label>
            <textarea [(ngModel)]="nuevoAnuncio.contenido" rows="5" placeholder="Detalle del anuncio..." class="input-concepto-edit"></textarea>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <input type="checkbox" [(ngModel)]="nuevoAnuncio.es_importante" id="imp">
            <label for="imp" style="margin: 0; cursor: pointer;">Marcar como importante (resaltado en rojo)</label>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="mostrarModal = false">Cancelar</button>
          <button class="btn btn-success" (click)="publicar()" [disabled]="!nuevoAnuncio.titulo || !nuevoAnuncio.contenido">Publicar Ahora</button>
        </div>
      </div>
    </div>

    <!-- Modal de Lectores -->
    <div class="modal-overlay" *ngIf="mostrarModalLectores" style="z-index: 1300;">
      <div class="modal-card" style="max-width: 650px;">
        <div class="modal-header">
          <h3>Confirmaciones de Lectura</h3>
          <button class="btn-action" (click)="mostrarModalLectores = false"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom: 20px; font-weight: 600; color: #475569;">Anuncio: {{ tituloAnuncioSeleccionado }}</p>
          
          <div *ngIf="loadingLectores" class="no-tasks">Obteniendo lista de confirmaciones...</div>
          <div *ngIf="!loadingLectores && lectores.length === 0" class="no-tasks">Aún no hay registros de lectura para este comunicado.</div>
          
          <table class="movimientos-table" *ngIf="!loadingLectores && lectores.length > 0" style="margin-top: 0;">
            <thead>
              <tr>
                <th>Piso</th>
                <th>Propietario</th>
                <th>Fecha Confirmación</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let l of lectores">
                <td style="font-weight: 700;">{{ l.piso }}</td>
                <td>{{ l.propietario }}</td>
                <td style="font-size: 0.8rem; color: #64748b;">{{ l.fecha | date:'dd/MM/yyyy HH:mm' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" (click)="mostrarModalLectores = false">Cerrar</button>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadAnunciosComponent implements OnInit {
  communityId: string | null = null;
  anuncios: Anuncio[] = [];
  loading = false;
  isPropietario = false;
  mostrarModal = false;
  mostrarModalLectores = false;
  loadingLectores = false;
  lectores: any[] = [];
  tituloAnuncioSeleccionado = '';
  nuevoAnuncio: Anuncio = { community_id: 0, titulo: '', contenido: '', es_importante: false };

  constructor(
    private route: ActivatedRoute, 
    private supabase: SupabaseService, 
    private modalService: ModalService,
    public utils: UtilsService
  ) {}

  async ngOnInit() {
    const idFromSnapshot = (r: ActivatedRoute | null): string | null => {
      if (!r) return null;
      return r.snapshot.paramMap.get('id') || idFromSnapshot(r.parent);
    };
    this.communityId = idFromSnapshot(this.route);

    const session = await this.supabase.getSession();
    if (session) {
      const { data: profile } = await this.supabase.getProfile(session.user.id);
      this.isPropietario = profile?.role === 'propietario';
    }

    if (this.communityId) {
      this.nuevoAnuncio.community_id = parseInt(this.communityId);
      await this.cargarAnuncios();
    }
  }

  async cargarAnuncios() {
    this.loading = true;
    const { data } = await this.supabase.getAnuncios(this.communityId!); // Usar el nuevo método simple
    this.anuncios = data || [];
    this.loading = false;
  }

  async verLectores(anuncio: Anuncio) {
    if (!anuncio.id || !this.communityId) return;
    this.loadingLectores = true;
    this.tituloAnuncioSeleccionado = anuncio.titulo;
    this.mostrarModalLectores = true;
    this.lectores = [];

    try {
      console.log(`[ADMIN ANUNCIOS] Ver lectores para anuncio ID: ${anuncio.id}`);
      const { data: readerLogs } = await this.supabase.getLectoresAnuncio(anuncio.id);
      console.log('[ADMIN ANUNCIOS] Reader Logs recibidos:', readerLogs);
      const { data: floors } = await this.supabase.getPisos(this.communityId);
      console.log('[ADMIN ANUNCIOS] Pisos de la comunidad recibidos:', floors);

      this.lectores = (readerLogs || []).map((log: any) => {
        // Soporte para ambos formatos de respuesta de Supabase (objeto o array)
        const profilesData = log.profiles;
        const email = Array.isArray(profilesData) ? profilesData[0]?.email : profilesData?.email;
        
        console.log(`[ADMIN ANUNCIOS] Buscando piso para email: ${email}`);
        const floor = (floors || []).find((f: Piso) => f.email?.toLowerCase() === email?.toLowerCase());
        console.log(`[ADMIN ANUNCIOS] Piso encontrado para ${email}:`, floor);
        return {
          piso: floor ? this.utils.formatearPiso(floor.codigo) : 'N/A',
          propietario: floor ? floor.propietario : 'Usuario externo',
          fecha: log.fecha_lectura
        };
      });
      console.log('[ADMIN ANUNCIOS] Lista final de lectores:', this.lectores);
    } catch (e) {
      this.modalService.showAlert('Error', 'No se pudieron cargar los detalles de lectura.');
    } finally {
      this.loadingLectores = false;
    }
  }

  async publicar() {
    await this.supabase.createAnuncio(this.nuevoAnuncio);
    this.mostrarModal = false;
    this.nuevoAnuncio = { ...this.nuevoAnuncio, titulo: '', contenido: '', es_importante: false };
    await this.cargarAnuncios();
  }

  async eliminarAnuncio(id: number) {
    if (await this.modalService.showConfirm('Eliminar', '¿Deseas quitar este anuncio del tablón?')) {
      await this.supabase.deleteAnuncio(id);
      await this.cargarAnuncios();
    }
  }
}