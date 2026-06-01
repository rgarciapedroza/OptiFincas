import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ExtractoProcesado, MovimientoBancario } from './models';
import { ModalService } from './modal.service';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { UtilsService } from './utils.service';

@Component({
  selector: 'app-comunidad-extractos',
  template: `
    <div class="card-container" style="max-width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 1.1rem;">
          {{ extractoSeleccionado ? 'Movimientos del Registro' : 'Registros Mensuales' }}
        </h3>
        
        <div *ngIf="!extractoSeleccionado" style="display: flex; gap: 10px;">
          <!-- Caso 1: No hay datos -> Subir Histórico -->
          <label *ngIf="extractos.length === 0" class="btn btn-info" style="font-size: 0.85rem; cursor: pointer; display: flex; align-items: center; gap: 8px; border-radius: 20px; padding: 8px 18px;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Cargar Registro Histórico
            <input type="file" (change)="onFileSelected($event)" accept=".xlsx, .xls" hidden>
          </label>

          <!-- Caso 2: Ya hay datos -> Nueva Entrada (Clasificador) -->
          <button *ngIf="extractos.length > 0" class="btn btn-primary" (click)="irAlClasificador()" style="font-size: 0.85rem; border-radius: 20px; padding: 8px 18px;">
            + Subir Nueva Entrada
          </button>
        </div>
        
        <button *ngIf="extractoSeleccionado" class="btn btn-secondary" (click)="extractoSeleccionado = null" style="font-size: 0.85rem;">
          ← Volver al listado
        </button>
      </div>

      <!-- Navegación de Año -->
      <div *ngIf="!extractoSeleccionado" style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px;">
        <button class="btn-action" (click)="cambiarAnio(-1)" style="background: #f1f5f9; border-radius: 50%; padding: 10px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <h3 style="margin: 0; color: #111827; min-width: 80px; text-align: center;">{{ currentYear }}</h3>
        <button class="btn-action" (click)="cambiarAnio(1)" style="background: #f1f5f9; border-radius: 50%; padding: 10px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <!-- Listado de Meses -->
      <table class="movimientos-table" *ngIf="!extractoSeleccionado">
        <thead>
          <tr>
            <th (click)="toggleOrdenMes()" style="cursor: pointer; user-select: none;">
              MES {{ ordenMes === 'desc' ? '▼' : '▲' }}
            </th>
            <th style="text-align: center;">Nº MOVIMIENTOS</th>
            <th style="text-align: center;">ACCIONES</th>
          </tr>
        </thead>
        <tbody>
          <tr *ngFor="let ext of extractosFiltrados" (click)="seleccionarExtracto(ext)" style="cursor: pointer;">
            <td style="font-weight: 600;">{{ utils.getMesNombre(ext.mes_contable) }}</td>
            <td style="text-align: center; color: #6366f1; font-weight: 600;">{{ ext.movimientos_count || 0 }}</td>
            <td style="text-align: center;">
              <button class="btn-action btn-delete" (click)="eliminar($event, ext.id)" title="Eliminar">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Detalle de Movimientos -->
      <div *ngIf="extractoSeleccionado">
        <!-- Navegación de Mes Superior -->
        <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #edf2f7;">
          <button class="btn-action" (click)="changeMonthExtractos(-1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div style="text-align: center; min-width: 160px;">
            <span style="font-size: 1.15rem; font-weight: 800; color: #1e293b;">{{ getMesAnioLabel() }}</span>
          </div>
          <button class="btn-action" (click)="changeMonthExtractos(1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <table class="movimientos-table">
          <thead>
            <tr>
              <th (click)="toggleOrdenFecha()" style="cursor: pointer; user-select: none;">
                FECHA {{ ordenFecha === 'desc' ? '▼' : '▲' }}
              </th>
              <th>ORDENANTE</th>
              <th>CONCEPTO ORIGINAL</th>
              <th style="text-align: right;">IMPORTE</th>
              <th style="text-align: center;">CONCEPTO</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let mov of movimientosOrdenados">
              <td>{{ mov.fecha | date:'dd/MM/yyyy' }}</td> 
              <td style="font-size: 0.9rem;">{{ mov.ordenante || '-' }}</td>
              <td style="font-size: 0.9rem;">{{ mov.concepto_original || '-' }}</td>
              <td [style.color]="mov.importe > 0 ? '#2ecc71' : '#e74c3c'" style="text-align: right; font-weight: bold;">
                {{ mov.importe | number:'1.2-2' }}€
              </td>
              <td style="text-align: center;">
                <div style="display: flex; align-items: center; justify-content: center; width: 100%;">
                  <input [(ngModel)]="mov.CONCEPTO" (ngModelChange)="cambiosRealizados = true" class="input-concepto-edit" style="text-align: center;">
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <div class="actions" style="margin-top: 25px; display: flex; justify-content: center; gap: 10px;">
          <button *ngIf="cambiosRealizados" class="btn btn-info" (click)="actualizarMovimientosDashboard()">Guardar Cambios</button>
          <button class="btn btn-secondary" (click)="generarReportePDF()" style="background: #94a3b8;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px; vertical-align: middle;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Exportar Excel Mensual
          </button>
        </div>
      </div>

      <div *ngIf="loading" class="no-tasks">Cargando datos...</div>
      <div *ngIf="!loading && extractosFiltrados.length === 0 && !extractoSeleccionado" class="no-tasks">
        No hay registros para el año {{ currentYear }}.
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadExtractosComponent implements OnInit {
  communityId: string | null = null;
  extractos: ExtractoProcesado[] = [];
  comunidad: any = null;
  extractoSeleccionado: ExtractoProcesado | null = null;
  movimientos: MovimientoBancario[] = [];
  currentYear = new Date().getFullYear();
  ordenMes: 'asc' | 'desc' = 'desc';
  ordenFecha: 'asc' | 'desc' = 'desc';
  cambiosRealizados = false;
  loading = false;

  constructor(
    private route: ActivatedRoute, 
    private router: Router,
    private supabase: SupabaseService, 
    private http: HttpClient, 
    public utils: UtilsService,
    public modalService: ModalService
  ) {}

  async ngOnInit() {
    // El ID viene del componente padre (ComunidadDashboard)
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarExtractos();
    }
    // Cargar info de comunidad para el reporte
    const { data: coms } = await this.supabase.getComunidades();
    this.comunidad = coms?.find(c => c.id == this.communityId);
  }

  getMesAnioLabel() {
    if (!this.extractoSeleccionado) return '';
    return this.utils.getMesNombre(this.extractoSeleccionado.mes_contable) + ' ' + this.extractoSeleccionado.anio_contable;
  }

  get extractosFiltrados() {
    return (this.extractos || [])
      .filter((e: ExtractoProcesado) => e.anio_contable === this.currentYear)
      .sort((a: ExtractoProcesado, b: ExtractoProcesado) => {
        return this.ordenMes === 'desc' 
          ? b.mes_contable - a.mes_contable 
          : a.mes_contable - b.mes_contable;
      });
  }

  get movimientosOrdenados() {
    return [...this.movimientos].sort((a: MovimientoBancario, b: MovimientoBancario) => {
      const da = new Date(a.fecha).getTime();
      const db = new Date(b.fecha).getTime();
      return this.ordenFecha === 'desc' ? db - da : da - db;
    });
  }

  cambiarAnio(delta: number) {
    this.currentYear += delta;
  }

  toggleOrdenMes() {
    this.ordenMes = this.ordenMes === 'desc' ? 'asc' : 'desc';
  }

  toggleOrdenFecha() {
    this.ordenFecha = this.ordenFecha === 'desc' ? 'asc' : 'desc';
  }

  async changeMonthExtractos(delta: number) {
    if (!this.extractoSeleccionado) return;
    const currentIndex = this.extractos.findIndex(e => e.id === this.extractoSeleccionado?.id);
    if (currentIndex !== -1) {
      // delta 1 (Derecha) -> Mes más reciente (hacia arriba en el array desc)
      // delta -1 (Izquierda) -> Mes más antiguo (hacia abajo en el array desc)
      const nextIndex = currentIndex - delta;

      if (nextIndex >= 0 && nextIndex < this.extractos.length) {
        await this.seleccionarExtracto(this.extractos[nextIndex]);
      } else {
        this.modalService.showAlert('Navegación', 'No hay más registros en esta dirección.');
      }
    }
  }

  async cargarExtractos() {
    this.loading = true;
    const { data, error } = await this.supabase.getExtractosByCommunity(this.communityId!);
    if (data) {
      // Mapeamos el conteo que viene de la relación anidada de Supabase
      this.extractos = data.map((ext: any) => ({
        ...ext,
        movimientos_count: ext.movimientos?.[0]?.count || 0
      }));
    }
    this.loading = false;
  }

  async seleccionarExtracto(ext: ExtractoProcesado) {
    this.extractoSeleccionado = ext;
    this.loading = true;
    // Obtener movimientos ya desencriptados desde el backend
    const session = await this.supabase.getSession();
    const headers = { 'Authorization': `Bearer ${session?.access_token}` }; // Aseguramos que el token se envía
    const movimientosDesencriptados = await lastValueFrom(this.http.get<any[]>(`/api/comunidades/${this.communityId}/movimientos?extracto_id=${ext.id}`, { headers }));
    this.movimientos = (movimientosDesencriptados || []).map((m: MovimientoBancario) => {
      const processed = {
        ...m,
      };
      // Inicializar propiedad de UI
      (processed as any).CONCEPTO = m.tipo === 'ingreso' 
        ? this.utils.formatearPiso(m.piso_detectado) 
        : (m.categoria || 'Sin categoría');
      return processed;
    });
    this.cambiosRealizados = false;
    this.loading = false;
  }

  async actualizarMovimientosDashboard() {
    if (!this.extractoSeleccionado) return;
    this.loading = true;
    try {
      // Sincronizamos los cambios del input (CONCEPTO) con los campos técnicos antes de guardar
      this.movimientos.forEach((m: any) => {
        if (m.tipo === 'ingreso') {
          // Para ingresos, CONCEPTO es el piso. Lo desformateamos y truncamos si es necesario.
          const unformattedPiso = this.utils.unformatPiso(m.CONCEPTO || '');
          m.piso_detectado = (unformattedPiso && unformattedPiso.trim() !== '') ? unformattedPiso.substring(0, 20) : null;
          m.categoria = null; // Los ingresos no tienen categoría en este contexto
        } else {
          // Para gastos, CONCEPTO es la categoría.
          m.categoria = m.CONCEPTO || 'Sin Categoría';
          m.piso_detectado = null; // Los gastos no tienen piso_detectado
        }
      });

      const movimientosParaDB = this.movimientos.map(m => ({
        id: m.id,
        community_id: m.community_id,
        extracto_id: m.extracto_id,
        fecha: m.fecha,
        concepto_original: m.concepto_original || '', // El backend encriptará esto
        importe: m.importe,
        saldo_resultante: m.saldo_resultante,
        ordenante: m.ordenante || '', // El backend encriptará esto
        piso_detectado: m.piso_detectado, // Ya es null o el piso truncado
        tipo: m.tipo,
        editado_manualmente: true,
        categoria: (m.categoria || 'Sin Categoría').substring(0, 50),
        confianza_clasificacion: m.confianza_clasificacion || 0
      }));

      const session = await this.supabase.getSession();
      const headers = { 'Authorization': `Bearer ${session?.access_token}` };
      const payload = {
        community_id: this.communityId,
        movimientos: movimientosParaDB,
        mes: this.extractoSeleccionado.mes_contable,
        anio: this.extractoSeleccionado.anio_contable,
        nombre_archivo: this.extractoSeleccionado.nombre_archivo
      };

      await lastValueFrom(this.http.put('/api/movimientos/batch', payload, { headers }));

      this.cambiosRealizados = false;
      this.modalService.showAlert('Éxito', 'Los cambios en los movimientos se han guardado correctamente.');
    } catch (err: any) {
      console.error('Error al actualizar movimientos:', err);
      this.modalService.showAlert('Error', 'No se pudieron guardar los cambios: ' + (err.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  async generarReportePDF() {
    if (!this.extractoSeleccionado) return;
    this.loading = true;

    const comName = this.comunidad?.nombre || 'Comunidad';
    const mes = this.extractoSeleccionado.mes_contable;
    const anio = this.extractoSeleccionado.anio_contable;

    const datosAEnviar = this.movimientos.map(m => ({
      FECHA: new Date(m.fecha).toLocaleDateString('es-ES'),
      ORDENANTE: m.ordenante || '',
      OBSERVACIONES: m.concepto_original || '',
      IMPORTE: m.importe,
      SALDO: m.saldo_resultante,
      CONCEPTO: m.tipo === 'ingreso' ? this.utils.formatearPiso(m.piso_detectado) : m.categoria
    }));

    const session = await this.supabase.getSession();
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    };

    try {
      const url = `/api/confirmar?modo=mensual&community_name=${encodeURIComponent(comName)}&mes=${mes}&anio=${anio}`;

      const resData: any = await lastValueFrom(this.http.post(url, datosAEnviar, { headers }));
      
      const byteCharacters = atob(resData.excel_contenido);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const urlBlob = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = urlBlob;
      a.download = resData.nombre_archivo;
      a.click();
    } catch (e) {
      this.modalService.showAlert('Error', 'Hubo un fallo al intentar generar el archivo Excel.');
    } finally {
      this.loading = false;
    }
  }

  irAlClasificador() {
    this.router.navigate(['/clasificador'], { queryParams: { comunidad: this.communityId } });
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && this.communityId) {
      this.loading = true;
      await this.supabase.importarMovimientosBancarios(this.communityId, file);
      await this.cargarExtractos();
    }
  }

  async eliminar(event: Event, id: number) {
    event.stopPropagation();
    const confirmado = await this.modalService.showConfirm('Confirmar Borrado', '¿Deseas eliminar este extracto? Esta acción borrará permanentemente todos sus movimientos.');
    if (confirmado) {
      await this.supabase.eliminarExtracto(id);
      await this.cargarExtractos();
    }
  }
}