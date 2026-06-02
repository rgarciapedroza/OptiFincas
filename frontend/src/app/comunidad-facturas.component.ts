import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Factura, ExtractoProcesado, MovimientoBancario } from './models';
import { ModalService } from './modal.service';
import { UtilsService } from './utils.service';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-comunidad-facturas',
  template: `
    <div class="container" style="padding-top: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 1.1rem;">
          {{ extractoSeleccionado ? 'Justificantes de Gastos - ' + getViewDateLabel() : 'Gestión de Facturas por Registro' }}
        </h3>
        <button *ngIf="extractoSeleccionado" class="btn btn-secondary" (click)="extractoSeleccionado = null" style="font-size: 0.85rem;">
          ← Volver al listado
        </button>
      </div>

      <!-- VISTA LISTADO: Navegación por Años y Meses -->
      <div *ngIf="!extractoSeleccionado">
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 12px; border-radius: 50px; border: 1px solid #e2e8f0; width: fit-content; margin-left: auto; margin-right: auto;">
          <button class="btn-action" (click)="changeYear(-1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg></button>
          <span style="font-weight: 800; color: #1e293b; font-size: 1.1rem; min-width: 60px; text-align: center;">{{ currentYear }}</span>
          <button class="btn-action" (click)="changeYear(1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg></button>
        </div>

        <div class="card-container" style="max-width: 800px; margin: 0 auto; padding: 20px;">
          <p style="color: #64748b; font-size: 0.9rem; margin-bottom: 20px; text-align: center;">Selecciona un mes con registros bancarios para gestionar sus justificantes.</p>
          
          <table class="movimientos-table">
            <thead>
              <tr>
                <th>MES</th>
                <th style="text-align: center;">ESTADO</th>
                <th style="text-align: center;">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let ext of extractosFiltrados" (click)="seleccionarExtracto(ext)" style="cursor: pointer;">
                <td style="font-weight: 700; color: #1e293b;">{{ utils.getMesNombre(ext.mes_contable) }}</td>
                <td style="text-align: center;">
                  <span class="badge" style="background: #f0fdf4; color: #166534; font-size: 0.65rem;">CONTABILIZADO</span>
                </td>
                <td style="text-align: center;">
                  <button class="btn-action" style="color: #6366f1;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          
          <div *ngIf="extractosFiltrados.length === 0" class="empty-state-tab" style="padding: 40px;">
            <p>No se han encontrado registros bancarios procesados para el año {{ currentYear }}.</p>
          </div>
        </div>
      </div>

      <!-- VISTA DETALLE: Gastos del mes y sus facturas -->
      <div *ngIf="extractoSeleccionado">
        <div class="card-container" style="max-width: 100%; margin: 0; padding: 30px;">
          <h3 class="section-title" style="color: #ef4444; font-size: 1rem; border-bottom: 2px solid #fee2e2; padding-bottom: 8px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M12 19V5M5 12l7 7 7-7"/></svg>
            Relación de Gastos y Justificantes
          </h3>
          
          <table class="movimientos-table" style="font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-top: 20px;">
            <thead>
              <tr>
                <th>Concepto del Gasto</th>
                <th style="text-align: right;">Importe</th>
                <th style="text-align: center;">Justificante vinculado</th>
              </tr>
            </thead>
            <tbody style="background: white;">
              <tr *ngFor="let g of gastos">
                <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">
                  <div style="font-weight: 600; color: #1e293b;">{{ g.categoria }}</div>
                  <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">{{ g.concepto_original }}</div>
                </td>
                <td style="text-align: right; font-weight: 700; color: #ef4444; padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">{{ g.importe | number:'1.2-2' }}€</td>
                <td style="text-align: center; border-bottom: 1px solid #e2e8f0;">
                  <div style="display: flex; justify-content: center; gap: 12px; align-items: center;">
                    <ng-container *ngIf="getFacturaGasto(g) as fac; else noFactura">
                      <!-- Ver Factura -->
                      <button (click)="verFactura(fac)" class="btn-action" title="Ver Documento" style="color: #6366f1;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                      </button>
                      
                      <!-- Borrar Factura (Solo Admin) -->
                      <button *ngIf="!isPropietario" (click)="eliminarFactura(fac)" class="btn-action btn-delete" title="Quitar Justificante">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      </button>
                    </ng-container>

                    <ng-template #noFactura>
                      <!-- Subir Factura (Solo Admin) -->
                      <label *ngIf="!isPropietario" class="btn-action" style="cursor: pointer; color: #10b981;" title="Vincular Factura">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                        <input type="file" (change)="onFacturaSelected($event, g)" accept=".pdf,image/*" hidden>
                      </label>
                      <span style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">Pendiente</span>
                    </ng-template>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          
          <div *ngIf="gastos.length === 0" class="empty-state-tab" style="margin-top: 20px;">
            <p>No se han identificado gastos en el registro de este mes.</p>
          </div>
        </div>
      </div>

      <div *ngIf="loading" class="loading-overlay">
        <div class="spinner"></div>
        <span style="font-weight: 600; color: #475569;">{{ loadingMessage }}</span>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadFacturasComponent implements OnInit {
  communityId: number | null = null;
  extractos: ExtractoProcesado[] = [];
  extractoSeleccionado: ExtractoProcesado | null = null;
  gastos: MovimientoBancario[] = []; // Ahora contendrá MovimientoBancario individuales
  facturasMes: Factura[] = [];
  loading = false;
  loadingMessage = 'Cargando...';
  isPropietario: boolean = false;
  currentYear = new Date().getFullYear();

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabase: SupabaseService,
    private modalService: ModalService,
    public utils: UtilsService,
    private http: HttpClient
  ) {}

  async ngOnInit() {
    // Determinar rol
    const session = await this.supabase.getSession();
    if (session?.user?.id) {
      const { data: profile } = await this.supabase.getProfile(session.user.id);
      this.isPropietario = profile?.role === 'propietario';
    }

    const idFromSnapshot = (r: ActivatedRoute | null): string | null => {
      if (!r) return null;
      return r.snapshot.paramMap.get('id') || idFromSnapshot(r.parent);
    };

    const communityIdStr = idFromSnapshot(this.route);
    if (communityIdStr) {
      this.communityId = parseInt(communityIdStr, 10);
      await this.cargarExtractos();
      console.log(`[FACTURAS] Componente cargado para comunidad ${this.communityId}`);
    }
  }

  async cargarExtractos() {
    if (!this.communityId) return;
    this.loading = true;
    const { data } = await this.supabase.getExtractosByCommunity(this.communityId);
    this.extractos = data || [];
    this.loading = false;
  }

  get extractosFiltrados() {
    return (this.extractos || [])
      .filter(e => e.anio_contable === this.currentYear)
      .sort((a, b) => b.mes_contable - a.mes_contable);
  }

  changeYear(delta: number) {
    this.currentYear += delta;
    this.extractoSeleccionado = null;
  }

  getViewDateLabel(): string {
    if (!this.extractoSeleccionado) return '';
    return `${this.utils.getMesNombre(this.extractoSeleccionado.mes_contable)} ${this.extractoSeleccionado.anio_contable}`;
  }

  async seleccionarExtracto(ext: ExtractoProcesado) {
    this.extractoSeleccionado = ext;
    await this.cargarGastosYFacturas();
  }

  async cargarGastosYFacturas() {
    if (!this.communityId || !this.extractoSeleccionado) return;
    this.loading = true;
    
    try {
      const mes = this.extractoSeleccionado.mes_contable;
      const anio = this.extractoSeleccionado.anio_contable;
      const session = await this.supabase.getSession();
      const headers = { 'Authorization': `Bearer ${session?.access_token}` };
      
      // Cargamos los movimientos ya desencriptados desde el backend (API) para evitar ver texto cifrado
      const movimientosDesencriptados = await lastValueFrom(this.http.get<any[]>(
        `/api/comunidades/${this.communityId}/movimientos?extracto_id=${this.extractoSeleccionado.id}`, 
        { headers }
      ));
      
      // Filtramos solo los gastos para esta vista
      this.gastos = (movimientosDesencriptados || []).filter(m => m.tipo === 'gasto') as MovimientoBancario[];
      
      // Cargamos las facturas ya vinculadas
      const { data: facs } = await this.supabase.getFacturas(this.communityId);
      this.facturasMes = facs || [];

      console.log(`[FACTURAS] Gastos cargados: ${this.gastos.length}. Facturas en DB: ${this.facturasMes.length}`);
      if (this.gastos.length > 0) console.log('[FACTURAS] Ejemplo de gasto:', this.gastos[0]);
      
    } catch (e) {
      this.modalService.showAlert('Error', 'No se han podido cargar los datos financieros de este mes.');
    } finally {
      this.loading = false;
    }
  }

  getFacturaGasto(gasto: MovimientoBancario): Factura | undefined {
    if (!this.facturasMes || !gasto) return undefined;
    const movementId = gasto.id; // Ahora 'gasto' es MovimientoBancario, usamos directamente 'id'
    if (!movementId) return undefined;
    console.log(`[FACTURAS] Buscando factura para movimiento ID: ${movementId}`);

    // Buscamos coincidencia asegurando comparación numérica
    const encontrada = this.facturasMes.find(f => Number(f.movimiento_id) === Number(movementId));
    return encontrada;
  }

  async onFacturaSelected(event: any, gasto: MovimientoBancario) {
    if (this.isPropietario) return;
    const movimientoId = gasto.id; // Ahora 'gasto' es MovimientoBancario, usamos directamente 'id'
    
    if (!movimientoId) {
      this.modalService.showAlert('Error', 'No se ha detectado el identificador del movimiento.');
      return;
    }

    const file = event.target.files[0];
    if (file && this.communityId) {
      this.loading = true;
      this.loadingMessage = 'Vinculando documento...';
      try {
        await this.supabase.uploadFactura(this.communityId, file, movimientoId);
        await this.cargarGastosYFacturas();
        this.modalService.showAlert('Éxito', 'El justificante ha sido guardado y vinculado correctamente.');
      } catch (e: any) {
        console.error('[FACTURAS] Error al subir:', e);
        this.modalService.showAlert('Error', 'Hubo un problema al procesar el archivo.');
      } finally {
        this.loading = false;
        event.target.value = ''; // Resetear input
      }
    }
  }

  async eliminarFactura(factura: Factura) {
    if (this.isPropietario) return;
    const confirm = await this.modalService.showConfirm('Quitar Justificante', 
      `¿Deseas desvincular y eliminar el documento "${factura.nombre_archivo}"?`);
    
    if (confirm) {
      this.loading = true;
      try {
        await this.supabase.deleteFactura(factura);
        await this.cargarGastosYFacturas();
        this.modalService.showAlert('Éxito', 'El documento ha sido eliminado.');
      } catch (e: any) {
        this.modalService.showAlert('Error', 'No se pudo eliminar: ' + e.message);
      } finally {
        this.loading = false;
      }
    }
  }

  async editarNombre(factura: Factura) {
    if (this.isPropietario) return;
    const nuevoNombre = window.prompt('Introduce la nueva descripción para este justificante:', factura.nombre_archivo);
    if (nuevoNombre && nuevoNombre.trim() !== '' && nuevoNombre !== factura.nombre_archivo) {
      this.loading = true;
      try {
        const { error } = await this.supabase.updateFacturaName(factura.id!, nuevoNombre.trim());
        if (error) throw error;
        await this.cargarGastosYFacturas();
        this.modalService.showAlert('Éxito', 'Descripción actualizada correctamente.');
      } catch (e: any) {
        this.modalService.showAlert('Error', 'No se pudo actualizar la descripción.');
      } finally {
        this.loading = false;
      }
    }
  }

  verFactura(factura: Factura) {
    window.open(factura.url_archivo, '_blank');
  }
}