import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { FinanzasData, ExtractoProcesado, Factura, IngresoPorPisoReport, GastoReport, IngresoSinIdentificarReport, ResumenCuentasReport } from './models';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { UtilsService } from './utils.service';
import { ModalService } from './modal.service';

@Component({
  selector: 'app-comunidad-finanzas',
  template: `
    <div class="container" style="padding-top: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 1.1rem;">
          {{ extractoSeleccionado ? 'Informe Financiero Mensual' : 'Registros Financieros Anuales' }}
        </h3>
        <button *ngIf="extractoSeleccionado" class="btn btn-secondary" (click)="extractoSeleccionado = null" style="font-size: 0.85rem;">
          ← Volver al listado
        </button>
      </div>

      <!-- VISTA LISTADO (Años y Meses) -->
      <div *ngIf="!extractoSeleccionado">
        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 20px;">
          <button class="btn-action" (click)="cambiarAnio(-1)" style="background: #f1f5f9; border-radius: 50%; padding: 10px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <h3 style="margin: 0; color: #111827; min-width: 80px; text-align: center;">{{ currentYear }}</h3>
          <button class="btn-action" (click)="cambiarAnio(1)" style="background: #f1f5f9; border-radius: 50%; padding: 10px;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <table class="movimientos-table" *ngIf="extractosFiltrados.length > 0">
          <thead>
            <tr>
              <th (click)="toggleOrdenMes()" style="cursor: pointer; user-select: none;">MES {{ ordenMes === 'desc' ? '▼' : '▲' }}</th>
              <th style="text-align: center;">Nº MOVIMIENTOS</th>
              <th style="text-align: center;">ACCIONES</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let ext of extractosFiltrados" (click)="seleccionarExtracto(ext)" style="cursor: pointer;">
              <td style="font-weight: 600;">{{ utils.getMesNombre(ext.mes_contable) }}</td>
              <td style="text-align: center; color: #6366f1; font-weight: 600;">{{ ext.movimientos_count || 0 }}</td>
              <td style="text-align: center;">
                <button class="btn-action btn-info"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg></button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- VISTA DETALLE (Informe Financiero Mensual) -->
      <div *ngIf="extractoSeleccionado">
        <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #edf2f7;">
          <button class="btn-action" (click)="changeMonthFinanzas(-1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </button>
          <div style="text-align: center; min-width: 160px;">
            <span style="font-size: 1.15rem; font-weight: 800; color: #1e293b;">{{ getViewDateLabel() }}</span>
          </div>
          <button class="btn-action" (click)="changeMonthFinanzas(1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
          </button>
        </div>

        <div class="summary-cards" style="grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 30px;">
          <div class="card p-3 text-center" style="border-left: 4px solid #10b981;">
            <small class="text-muted">Ingresos Mes</small>
            <div style="font-size: 1.25rem; font-weight: 800; color: #10b981;">{{ data.resumenCuentas.ingresosMes | number:'1.2-2' }} €</div>
          </div>
          <div class="card p-3 text-center" style="border-left: 4px solid #ef4444;">
            <small class="text-muted">Gastos Mes</small>
            <div style="font-size: 1.25rem; font-weight: 800; color: #ef4444;">{{ data.resumenCuentas.gastosMes | number:'1.2-2' }} €</div>
          </div>
          <div class="card p-3 text-center" style="border-left: 4px solid #6366f1;">
            <small class="text-muted">Saldo Actual</small>
            <div style="font-size: 1.25rem; font-weight: 800; color: #6366f1;">{{ data.resumenCuentas.saldoTotal | number:'1.2-2' }} €</div>
          </div>
        </div>

        <div *ngIf="data.resumenCuentas.saldoTotal !== 0; else noDataForMonth" style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
          <div style="display: flex; flex-direction: column; gap: 30px;">
            <!-- Tabla de Ingresos por Piso -->
            <div class="card-container" style="max-width: 100%; margin: 0;">
            <h3 class="section-title" style="color: #10b981; font-size: 1rem;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M12 5v14M5 12l7-7 7 7"/></svg>
              Ingresos por Piso
            </h3>
            <table class="movimientos-table" style="font-size: 0.85rem;">
              <thead>
                <tr>
                  <th>Piso</th>
                  <th style="text-align: right;">Cantidad</th>
                  <th style="text-align: center;">Fecha</th>
                  <th style="text-align: center;">Estado</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let item of data.ingresosPorPiso">
                  <td style="font-weight: 600;">{{ utils.formatearPiso(item.codigo) }}</td>
                  <td style="text-align: center;" [style.font-weight]="item.pagado ? '700' : 'normal'">
                    {{ item.pagado ? (item.importe | number:'1.2-2') + '€' : '-' }}
                  </td>
                  <td style="text-align: center; color: #64748b; font-size: 0.8rem;">{{ item.fecha | date:'dd/MM/yyyy' }}</td>
                  <td style="text-align: center;">
                    <span class="badge" [style.background]="item.pagado ? '#dcfce7' : '#fee2e2'" [style.color]="item.pagado ? '#166534' : '#991b1b'">
                      {{ item.pagado ? 'Pagado' : 'Pendiente' }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

            <!-- Nueva Tabla: Gastos sin Identificar (Ingresos no asignados) -->
            <div *ngIf="data.ingresosSinIdentificar && data.ingresosSinIdentificar.length > 0" class="card-container" style="max-width: 100%; margin: 0;">
              <h3 class="section-title" style="color: #f59e0b; font-size: 1rem; border-bottom: 2px solid #fef3c7; padding-bottom: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                Ingresos sin Identificar
              </h3>
              <table class="movimientos-table" style="font-size: 0.85rem;">
                <thead>
                  <tr>
                    <th style="background: #fdfaf6;">Observaciones</th>
                    <th style="text-align: center; background: #fdfaf6;">Fecha</th>
                    <th style="text-align: right; background: #fdfaf6;">Importe</th>
                  </tr>
                </thead>
                <tbody style="background: white;">
                  <tr *ngFor="let item of data.ingresosSinIdentificar">
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.8rem;">{{ item.observaciones }}</td>
                    <td style="text-align: center; padding: 10px; border-bottom: 1 solid #e2e8f0; color: #64748b;">{{ item.fecha | date:'dd/MM/yyyy' }}</td>
                    <td style="text-align: right; padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: 700; color: #10b981;">{{ item.importe | number:'1.2-2' }}€</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 30px;">
            <!-- Tabla de Gastos (AHORA PRIMERO) -->
            <div style="max-width: 100%; margin: 0;">
              <h3 class="section-title" style="color: #ef4444; font-size: 1rem; border-bottom: 2px solid #fee2e2; padding-bottom: 8px;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M12 19V5M5 12l7 7 7-7"/></svg>
                Detalle de Gastos
              </h3>
              <table class="movimientos-table" style="font-size: 0.85rem; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
                <thead>
                  <tr>
                    <th style="padding: 12px 10px; border-bottom: 2px solid #f1f5f9; background: #f8fafc;">Concepto</th>
                    <th style="text-align: right; padding: 12px 10px; border-bottom: 2px solid #f1f5f9; background: #f8fafc;">Importe</th>
                    <th style="text-align: center; padding: 12px 10px; border-bottom: 2px solid #f1f5f9; background: #f8fafc;">Factura</th>
                  </tr>
                </thead>
                <tbody style="background: white;">
                  <tr *ngFor="let g of data.gastos">
                    <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">
                      <div style="font-weight: 600; color: #1e293b;">{{ g.categoria }}</div>
                      <div style="font-size: 0.65rem; color: #94a3b8; text-transform: uppercase;">{{ g.concepto }}</div>
                    </td>
                    <td style="text-align: right; font-weight: 700; color: #ef4444; padding: 10px; border-bottom: 1px solid #e2e8f0;">{{ g.importe | number:'1.2-2' }}€</td>
                    <td style="text-align: center; border-bottom: 1px solid #e2e8f0;">
                      <div style="display: flex; justify-content: center; gap: 8px; align-items: center;">
                        <ng-container *ngIf="getFacturaGasto(g.id) as fac; else noFacFin">
                          <!-- Ver Factura -->
                          <button (click)="verFactura(fac)" class="btn-action" title="Ver Factura" style="color: #6366f1;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                          </button>
                          <!-- Borrar Factura (Solo Admin) -->
                          <button *ngIf="!isPropietario" (click)="eliminarFactura(fac)" class="btn-action btn-delete" title="Eliminar">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          </button>
                        </ng-container>
                        <ng-template #noFacFin>
                          <!-- Subir Factura (Solo Admin) -->
                          <label *ngIf="!isPropietario" class="btn-action" style="cursor: pointer; color: #10b981;" title="Subir Factura">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                            <input type="file" (change)="onFacturaSelected($event, g.id)" accept=".pdf,image/*" hidden>
                          </label>
                          <span *ngIf="isPropietario" style="color: #94a3b8; font-size: 0.75rem; font-style: italic;">Pendiente</span>
                        </ng-template>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <!-- Resumen de Cuentas (Saldo Actual - AHORA SEGUNDO) -->
            <div style="max-width: 100%; margin: 0;">
              <h3 class="section-title" style="border-bottom: 2px solid #f1f5f9; padding-bottom: 8px; color: #1e293b;">Resumen</h3>
              <div class="card-container" style="margin: 0; background: white; border: 1px solid #e2e8f0; box-shadow: none; padding: 20px;">
                <div style="display: flex; flex-direction: column; gap: 18px; padding: 0 5px;">
                <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                  <span style="color: #64748b;">Saldo Anterior:</span>
                  <span style="font-weight: 600;">{{ data.resumenCuentas.saldoAnterior | number:'1.2-2' }}€</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                  <span style="color: #10b981;">(+) Ingresos Totales:</span>
                  <span style="font-weight: 600; color: #10b981;">{{ data.resumenCuentas.ingresosMes | number:'1.2-2' }}€</span>
                </div>
                <div style="display: flex; justify-content: space-between; font-size: 0.95rem;">
                  <span style="color: #ef4444;">(-) Gastos Totales:</span>
                  <span style="font-weight: 600; color: #ef4444;">{{ data.resumenCuentas.gastosMes | number:'1.2-2' }}€</span>
                </div>
                <div style="margin-top: 10px; padding-top: 20px; border-top: 2px dashed #e2e8f0; display: flex; justify-content: space-between; align-items: center;">
                  <span style="font-weight: 800; font-size: 1.1rem; color: #1e293b;">SALDO ACTUAL:</span>
                  <span style="font-weight: 900; font-size: 1.8rem; color: #6366f1;">{{ data.resumenCuentas.saldoTotal | number:'1.2-2' }}€</span>
                </div>
                </div>
                <button class="btn btn-info" (click)="generarReportePDF()" style="width: fit-content; margin-top: 25px; font-size: 0.85rem; border-radius: 12px; display: flex; align-items: center; gap: 8px; padding: 8px 18px;">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
                  Informe PDF
                </button>
            </div>
          </div>
        </div>
      </div>

      <ng-template #noDataForMonth>
        <div class="empty-state" style="text-align: center; padding: 60px; background: white; border-radius: 16px; border: 2px dashed #e2e8f0; color: #94a3b8; margin-top: 20px;">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 15px;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
          <p style="font-weight: 600; color: #64748b;">No hay datos contables registrados para este mes.</p>
        </div>
      </ng-template>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadFinanzasComponent implements OnInit {
  communityId: string | null = null;
  loading = false;
  error = '';
  comunidad: any = null;
  data: FinanzasData = { // Initialize with specific types
    ingresosPorPiso: [],
    gastos: [],
    ingresosSinIdentificar: [],
    resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 }
  };
  extractos: ExtractoProcesado[] = [];
  extractoSeleccionado: ExtractoProcesado | null = null;
  ordenMes: 'asc' | 'desc' = 'desc';
  currentYear: number = new Date().getFullYear();
  viewDate: Date = new Date();
  facturasMes: Factura[] = [];
  isPropietario: boolean = false;

  constructor(
    private route: ActivatedRoute, 
    private supabase: SupabaseService, 
    private router: Router, 
    private http: HttpClient,
    public utils: UtilsService,
    public modalService: ModalService
  ) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarExtractos(); // Primero cargamos la lista de extractos
    }

    // Detectar rol del usuario
    const session = await this.supabase.getSession();
    if (session?.user?.id) {
      const { data: profile } = await this.supabase.getProfile(session.user.id);
      this.isPropietario = profile?.role === 'propietario';
    }

    const { data: coms } = await this.supabase.getComunidades();
    this.comunidad = coms?.find(c => c.id == this.communityId);
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

  cambiarAnio(delta: number) {
    this.currentYear += delta;
    this.cargarExtractos(); // Recargar extractos para el nuevo año
  }

  toggleOrdenMes() {
    this.ordenMes = this.ordenMes === 'desc' ? 'asc' : 'desc';
  }

  async cargarExtractos() {
    this.loading = true;
    const { data, error } = await this.supabase.getExtractosByCommunity(this.communityId!);
    if (data) {
      this.extractos = data.map((ext: any) => ({
        ...ext,
        movimientos_count: ext.movimientos?.[0]?.count || 0
      }));
    } else if (error) {
      this.modalService.showAlert('Error', 'No se pudieron cargar los extractos: ' + error.message);
    }
    this.loading = false;
  }

  /**
   * Cambia el mes de visualización y recarga los cálculos desde el servidor.
   * @param delta -1 para mes anterior, 1 para mes siguiente.
   */
  async changeMonthFinanzas(delta: number) {
    if (!this.extractoSeleccionado) return;

    const currentIndex = this.extractos.findIndex(
      (ext: ExtractoProcesado) => ext.id === this.extractoSeleccionado?.id
    );

    if (currentIndex !== -1) {
      // Como la lista está ordenada descendente (más nuevo primero):
      // delta 1 (Siguiente/Futuro) -> índice menor
      // delta -1 (Anterior/Pasado) -> índice mayor
      const nextIndex = currentIndex - delta; 
      
      if (nextIndex >= 0 && nextIndex < this.extractos.length) {
        this.extractoSeleccionado = this.extractos[nextIndex];
        await this.cargarDatos();
      } else {
        this.modalService.showAlert('Navegación', 'No hay más meses en esta dirección.');
      }
    }
  }

  getViewDateLabel(): string {
    if (!this.extractoSeleccionado) return '';
    const date = new Date(this.extractoSeleccionado.anio_contable, this.extractoSeleccionado.mes_contable - 1, 1);
    const month = date.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    return month.charAt(0).toUpperCase() + month.slice(1);
  }

  async seleccionarExtracto(ext: ExtractoProcesado) {
    this.extractoSeleccionado = ext;
    this.error = ''; // Limpiar errores al seleccionar nuevo extracto
    await this.cargarDatos();
  }

  /**
   * Solicita al backend el resumen financiero procesado.
   */
  async cargarDatos() {
    if (!this.communityId || !this.extractoSeleccionado) return;
    this.loading = true;
    const targetMes = this.extractoSeleccionado.mes_contable;
    const targetAnio = this.extractoSeleccionado.anio_contable;

    // No necesitamos buscar el extracto de nuevo, ya lo tenemos en extractoSeleccionado
    // Si no hay extracto seleccionado, o si el extracto no tiene mes/año, no cargamos datos
    if (!this.extractoSeleccionado || !targetMes || !targetAnio) {
      this.data = {
        ingresosPorPiso: [],
        gastos: [],
        ingresosSinIdentificar: [],
        resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 }
      };
      this.loading = false;
      return;
    }

    const session = await this.supabase.getSession();
    const headers = { 'Authorization': `Bearer ${session?.access_token}` };

    try {
      const result = await lastValueFrom(
        this.http.get<FinanzasData>(`/api/comunidades/${this.communityId}/finanzas?mes=${targetMes}&anio=${targetAnio}`, { headers })
      );

      if (result) {
        // Ordenar ingresos por piso de forma alfanumérica natural
        result.ingresosPorPiso.sort((a: any, b: any) => 
          a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' })
        );
        
        this.data = result;
        // Una vez cargados los datos financieros, cargamos las facturas vinculadas
        await this.cargarFacturas();
      } else {
        this.extractoSeleccionado = null; // Si no hay datos, deseleccionamos
      }
    } catch (err: any) {
      this.modalService.showAlert('Error', 'No se han podido calcular los datos financieros de este mes.');
      this.extractoSeleccionado = null;
    } finally {
      this.loading = false;
    }
  }

  async cargarFacturas() {
    if (!this.communityId) return;
    const { data } = await this.supabase.getFacturas(parseInt(this.communityId));
    this.facturasMes = data || [];
  }

  getFacturaGasto(movimientoId: number): Factura | undefined {
    // Coerción a Number para evitar fallos si el ID viene como string desde la API
    return this.facturasMes.find(f => Number(f.movimiento_id) === Number(movimientoId));
  }

  async onFacturaSelected(event: any, movimientoId: number) {
    const file = event.target.files[0];
    if (file && this.communityId) {
      this.loading = true;
      try {
        await this.supabase.uploadFactura(parseInt(this.communityId), file, movimientoId);
      await this.cargarDatos(); // Recargar todos los datos, incluyendo facturas
        this.modalService.showAlert('Éxito', 'Factura vinculada correctamente al gasto.');
      } catch (e: any) {
        console.error('[FINANZAS] Error subiendo factura:', e);
        this.modalService.showAlert('Error', 'No se pudo subir la factura: ' + e.message);
      } finally {
        this.loading = false;
        event.target.value = ''; // Resetear el input para permitir re-selección
      }
    }
  }

  async eliminarFactura(factura: Factura) {
    const confirm = await this.modalService.showConfirm('Eliminar Factura', '¿Deseas quitar el documento vinculado a este gasto?');
    if (confirm) {
      this.loading = true;
      try {
        await this.supabase.deleteFactura(factura);
        await this.cargarDatos(); // Recargar todos los datos, incluyendo facturas
      } catch (e: any) {
        this.modalService.showAlert('Error', e.message);
      } finally {
        this.loading = false;
      }
    }
  }

  verFactura(factura: Factura | undefined) {
    if (factura) {
      window.open(factura.url_archivo, '_blank');
    }
  }

  // Helper para convertir claves de camelCase a snake_case
  private convertToSnakeCase(obj: any): any {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this.convertToSnakeCase(item));
    }
    const newObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const snakeKey = key.replace(/([A-Z])/g, "_$1").toLowerCase();
        newObj[snakeKey] = this.convertToSnakeCase(obj[key]);
      }
    }
    return newObj;
  }

  /**
   * Envía los datos al generador de informes del backend y descarga el Excel.
   */
  async generarReportePDF() {
    if (!this.extractoSeleccionado) return;
    this.loading = true;
    
    const comName = this.comunidad?.nombre || 'Comunidad';
    const mes = this.extractoSeleccionado.mes_contable;
    const anio = this.extractoSeleccionado.anio_contable;
    const session = await this.supabase.getSession();
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    };

    try {
      const url = `/api/confirmar?modo=finanzas&community_name=${encodeURIComponent(comName)}&mes=${mes}&anio=${anio}`;      
      // Convertir el objeto data a snake_case para el backend
      // Construir el payload para que coincida estrictamente con el esquema del backend
      const backendPayload: FinanzasData = {
        ingresosPorPiso: this.data.ingresosPorPiso.map((item: IngresoPorPisoReport) => ({
          codigo: item.codigo,
          pagado: item.pagado,
          importe: item.importe,
          fecha: item.fecha || '',
        })),
        gastos: this.data.gastos.map((item: GastoReport) => ({
          id: item.id,
          categoria: item.categoria,
          concepto: item.concepto,
          importe: item.importe
        })),
        ingresosSinIdentificar: (this.data.ingresosSinIdentificar || []).map((item: IngresoSinIdentificarReport) => ({
          observaciones: item.observaciones,
          fecha: item.fecha || '',
          importe: item.importe
        })),
        resumenCuentas: {
          saldoAnterior: this.data.resumenCuentas.saldoAnterior,
          ingresosMes: this.data.resumenCuentas.ingresosMes,
          gastosMes: this.data.resumenCuentas.gastosMes,
          saldoTotal: this.data.resumenCuentas.saldoTotal // Incluir saldoTotal
        }
      };
      
      // Aplicar la conversión a snake_case para el backend
      const payload = backendPayload; // El backend espera camelCase para FinanzasReportRequest
      
      // Cambiado fetch por HttpClient para consistencia arquitectónica
      const resData: any = await lastValueFrom(this.http.post(url, payload, { headers }));
      
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
      this.modalService.showAlert('Error', 'No se ha podido generar el informe en este momento.');
    } finally {
      this.loading = false;
    }
  }

}