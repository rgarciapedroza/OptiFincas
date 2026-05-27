import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { FinanzasData } from './models';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { UtilsService } from './utils.service';

@Component({
  selector: 'app-comunidad-finanzas',
  template: `
    <div class="container" style="padding-top: 10px;">
      <!-- Alerta de Error -->
      <div *ngIf="error" class="error-banner" style="margin-bottom: 20px; padding: 12px; background: #fff5f5; border: 1px solid #feb2b2; color: #c53030; border-radius: 8px; font-size: 0.9rem;">
        {{ error }}
      </div>

      <!-- Navegación de Mes -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 20px; margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 12px; border: 1px solid #edf2f7;">
        <button class="btn-action" (click)="changeMonth(-1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div style="text-align: center; min-width: 160px;">
          <span style="font-size: 1.15rem; font-weight: 800; color: #1e293b;">{{ getViewDateLabel() }}</span>
        </div>
        <button class="btn-action" (click)="changeMonth(1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <!-- Cabecera de Resumen Rápido -->
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

      <div *ngIf="extractoActual; else noData" style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px;">
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

        <!-- Tabla de Gastos -->
        <div class="card-container" style="max-width: 100%; margin: 0;">
          <h3 class="section-title" style="color: #ef4444; font-size: 1rem;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;"><path d="M12 19V5M5 12l7 7 7-7"/></svg>
            Detalle de Gastos
          </h3>
          <table class="movimientos-table" style="font-size: 0.85rem;">
            <thead>
              <tr>
                <th>Concepto</th>
                <th style="text-align: right;">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let g of data.gastos">
                <td>{{ g.concepto }}</td>
                <td style="text-align: right; font-weight: 700; color: #ef4444;">{{ g.importe | number:'1.2-2' }}€</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style="border-top: 2px solid #ef4444; background: #fef2f2;">
                <td style="font-weight: 800; color: #ef4444; padding: 10px;">TOTAL GASTOS</td>
                <td style="text-align: right; font-weight: 800; color: #ef4444; padding: 10px;">{{ data.resumenCuentas.gastosMes | number:'1.2-2' }}€</td>
              </tr>
            </tfoot>
          </table>
          
          <!-- Resumen de Cuentas (Estilo Original) -->
          <div class="card-container" style="max-width: 100%; margin: 30px 0 0 0; background: #1a252f; color: white; padding: 20px;">
            <h3 class="section-title" style="color: white; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 10px; font-size: 1rem;">
              Resumen de Cuentas
            </h3>
            <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 10px;">
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                <span style="color: #9ca3af;">Saldo Anterior:</span>
                <span style="font-weight: 600;">{{ data.resumenCuentas.saldoAnterior | number:'1.2-2' }}€</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                <span style="color: #10b981;">(+) Ingresos Mes:</span>
                <span style="font-weight: 600; color: #10b981;">{{ data.resumenCuentas.ingresosMes | number:'1.2-2' }}€</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.9rem;">
                <span style="color: #ef4444;">(-) Gastos Mes:</span>
                <span style="font-weight: 600; color: #ef4444;">{{ data.resumenCuentas.gastosMes | number:'1.2-2' }}€</span>
              </div>
              <div style="border-top: 1px solid rgba(255,255,255,0.2); padding-top: 12px; margin-top: 5px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 1rem; font-weight: 700;">SALDO TOTAL:</span>
                <span style="font-size: 1.15rem; font-weight: 800; color: #6366f1;">{{ data.resumenCuentas.saldoTotal | number:'1.2-2' }}€</span>
              </div>
            </div>
          </div>

          <div class="actions" style="margin-top: 20px;">
            <button class="btn btn-info" (click)="generarReportePDF()" style="width: 100%; font-size: 0.85rem;">Generar Informe PDF</button>
          </div>
        </div>
      </div>

      <ng-template #noData>
        <div class="empty-state" style="text-align: center; padding: 60px; background: white; border-radius: 16px; border: 2px dashed #e2e8f0; color: #94a3b8;">
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
  extractoActual: any = null;
  viewDate: Date = new Date();
  data: FinanzasData = {
    ingresosPorPiso: [],
    gastos: [],
    resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 }
  };

  constructor(
    private route: ActivatedRoute, 
    private supabase: SupabaseService, 
    private router: Router, 
    private http: HttpClient,
    public utils: UtilsService
  ) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarDatos();
    }
    const { data: coms } = await this.supabase.getComunidades();
    this.comunidad = coms?.find(c => c.id == this.communityId);
  }

  /**
   * Cambia el mes de visualización y recarga los cálculos desde el servidor.
   * @param delta -1 para mes anterior, 1 para mes siguiente.
   */
  async changeMonth(delta: number) {
    this.viewDate = new Date(this.viewDate.getFullYear(), this.viewDate.getMonth() + delta, 1);
    this.error = '';
    await this.cargarDatos();
  }

  getViewDateLabel(): string {
    const month = this.viewDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    return month.charAt(0).toUpperCase() + month.slice(1);
  }

  /**
   * Solicita al backend el resumen financiero procesado.
   */
  async cargarDatos() {
    if (!this.communityId) return;
    this.loading = true;
    const targetMes = this.viewDate.getMonth() + 1;
    const targetAnio = this.viewDate.getFullYear();

    const { data: extData } = await this.supabase.getExtractosByCommunity(this.communityId);
    this.extractoActual = extData?.find((e: any) => e.mes_contable === targetMes && e.anio_contable === targetAnio) || null;

    if (!this.extractoActual) {
      this.data = {
        ingresosPorPiso: [],
        gastos: [],
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
        this.data = result;
      } else {
        this.extractoActual = null;
      }
    } catch (err: any) {
      this.error = 'No se han podido calcular los datos financieros de este mes.';
      this.extractoActual = null;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Envía los datos al generador de informes del backend y descarga el Excel.
   */
  async generarReportePDF() {
    if (!this.extractoActual) return;
    this.loading = true;
    
    const comName = this.comunidad?.nombre || 'Comunidad';
    const mes = this.extractoActual.mes_contable;
    const anio = this.extractoActual.anio_contable;
    const session = await this.supabase.getSession();
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    };

    try {
      const url = `/api/confirmar?modo=finanzas&community_name=${encodeURIComponent(comName)}&mes=${mes}&anio=${anio}`;
      
      // Cambiado fetch por HttpClient para consistencia arquitectónica
      const resData: any = await lastValueFrom(this.http.post(url, this.data, { headers }));
      
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
      alert('Error al generar el reporte financiero');
    } finally {
      this.loading = false;
    }
  }

}