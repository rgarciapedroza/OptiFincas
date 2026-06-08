// frontend/src/app/comunidad-piso-movimientos.component.ts
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { MovimientoBancario, Piso } from './models';
import { ModalService } from './modal.service';
import { UtilsService } from './utils.service';

@Component({
  selector: 'app-comunidad-piso-movimientos',
  template: `
    <div class="card-container" style="max-width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px;">
        <h3 style="margin: 0; font-size: 1.3rem; font-weight: 900; color: #1e293b;">
          Historial de {{ piso?.propietario }} <span style="color: #94a3b8; font-weight: 500; font-size: 0.9rem; margin-left: 10px;">· {{ utils.formatearPiso(piso?.codigo) }}</span>
        </h3>
        <div style="display: flex; gap: 12px;">
          <button class="btn btn-primary" (click)="goToRegistros()" style="font-size: 0.85rem; border-radius: 25px; padding: 10px 22px; display: flex; align-items: center; gap: 10px; background: #6366f1; border: none; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25); color: white; font-weight: 700;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Registros Contables
          </button>
          <button class="btn btn-secondary" (click)="goBack()" style="font-size: 0.85rem; border-radius: 25px; padding: 10px 22px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600;">
            ← Volver al Censo
          </button>
        </div>
      </div>

      <!-- Saldo Virtual (Crédito Acumulado) -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
        <div class="card" style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); border: none; padding: 25px 40px; border-radius: 24px; display: flex; gap: 40px; align-items: center; box-shadow: 0 20px 25px -5px rgba(99, 102, 241, 0.3); color: white;">
          <div>
            <span style="display: block; font-size: 0.75rem; color: rgba(255,255,255,0.7); font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Saldo Virtual Disponible</span>
            <span style="font-size: 2.5rem; font-weight: 900; letter-spacing: -0.02em;">{{ totalCredito | number:'1.2-2' }}€</span>
          </div>
          <div style="background: rgba(255,255,255,0.15); color: white; padding: 15px; border-radius: 20px; backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,0.1);">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
        </div>
      </div>

      <!-- Botón para ver Recibos Pendientes -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 25px;">
        <button class="btn" 
                [style.border]="mostrarPendientes ? '2px solid #64748b' : '2px solid #ef4444'" 
                [style.color]="mostrarPendientes ? '#64748b' : '#ef4444'"
                style="background: transparent; padding: 8px 25px; border-radius: 25px; font-weight: 700; font-size: 0.85rem; display: flex; align-items: center; gap: 8px; transition: all 0.2s;"
                (click)="togglePendientes()">
          <svg *ngIf="!mostrarPendientes" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <svg *ngIf="mostrarPendientes" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
          {{ mostrarPendientes ? 'Volver al Historial' : 'Ver Recibos Pendientes' }}
        </button>
      </div>

      <!-- Sección de Recibos Pendientes -->
      <div *ngIf="mostrarPendientes && !loading" style="animation: fadeIn 0.3s ease;">
        <h4 style="margin-bottom: 15px; color: #dc2626; font-size: 1rem; border-bottom: 2px solid #fee2e2; padding-bottom: 8px;">
          Listado de Deuda Pendiente
        </h4>
        <div *ngIf="allPendingReceipts.length === 0" class="no-tasks">
          ¡Excelente! Este propietario está al corriente de pago.
        </div>
        <div *ngFor="let item of allPendingReceipts" class="card" style="margin-bottom: 10px; padding: 15px; border-radius: 12px; border: 1px solid #e2e8f0; background: white;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span style="font-weight: 700; color: #1e293b; font-size: 0.95rem;">
                {{ item.mesNombre }} {{ item.anio }}
              </span>
              <span class="badge" 
                    [style.background]="item.status === 'PARCIAL' ? '#fef3c7' : '#fee2e2'" 
                    [style.color]="item.status === 'PARCIAL' ? '#92400e' : '#991b1b'"
                    style="margin-left: 10px;">
                {{ item.status }}
              </span>
            </div>
            <div style="text-align: right;">
              <div style="font-weight: 800; color: #ef4444; font-size: 1.1rem;">{{ (item.cuota - item.total) | number:'1.2-2' }}€</div>
              <div style="font-size: 0.7rem; color: #94a3b8; font-weight: 600;">Deuda sobre cuota de {{ item.cuota | number:'1.2-2' }}€</div>
              <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 12px;">
                <span *ngIf="totalCredito > 0" style="font-size: 0.65rem; font-weight: 700; color: #6366f1; background: #f5f3ff; padding: 4px 10px; border-radius: 6px; border: 1px solid #e0e7ff;">
                  {{ totalCredito | number:'1.2-2' }}€ disponible
                </span>
                <button class="btn btn-success" (click)="abrirModalPagoManual(item)" [disabled]="totalCredito <= 0"
                        style="font-size: 0.75rem; padding: 6px 15px; border-radius: 8px; font-weight: 700; display: flex; align-items: center; gap: 6px;" [style.opacity]="totalCredito <= 0 ? '0.5' : '1'">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                  Aplicar Entrega
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Selector de Año Profesional -->
      <div *ngIf="!loading && !mostrarPendientes" style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 12px; border-radius: 50px; border: 1px solid #e2e8f0; width: fit-content; margin-left: auto; margin-right: auto;">
        <button class="btn-action" (click)="changeYear(-1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <span style="font-weight: 800; color: #1e293b; font-size: 1.1rem; min-width: 60px; text-align: center;">{{ selectedYear }}</span>
        <button class="btn-action" (click)="changeYear(1)" style="background: white; border-radius: 50%; padding: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
        </button>
      </div>

      <div *ngIf="loading" class="no-tasks">Cargando movimientos...</div>
      <div *ngIf="!loading && movimientos.length === 0" class="no-tasks">
        No se encontraron movimientos para este propietario.
      </div>

      <!-- Listado de meses al estilo Portal Propietario -->
      <div *ngIf="!loading && movimientos.length > 0 && !mostrarPendientes">
        <div *ngFor="let mData of getMonthsData()" style="margin-bottom: 15px;">
          <div class="card" 
               (click)="toggleMonth(mData.num)"
               style="padding: 20px 30px; border-radius: 18px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); cursor: pointer; background: white;"
               [style.transform]="selectedMonth === mData.num ? 'scale(1.01)' : 'scale(1)'"
               [style.box-shadow]="selectedMonth === mData.num ? '0 12px 20px -5px rgba(0,0,0,0.08)' : 'none'"
               [style.border-color]="selectedMonth === mData.num ? '#6366f1' : '#e2e8f0'">
            <div style="display: flex; align-items: center; gap: 15px;">
              <span style="font-weight: 800; color: #1e293b; font-size: 1.15rem; min-width: 130px;">{{ mData.nombre }}</span>
              <span class="badge" 
                    [style.background]="mData.status === 'PAGADO' ? '#dcfce7' : (mData.status === 'PARCIAL' ? '#fef3c7' : '#fee2e2')" 
                    [style.color]="mData.status === 'PAGADO' ? '#166534' : (mData.status === 'PARCIAL' ? '#92400e' : '#991b1b')">
                {{ mData.status }}
              </span>
              <span *ngIf="mData.isFromCredit && mData.paid" style="font-size: 0.65rem; color: #6366f1; font-weight: 900; background: #f5f3ff; padding: 5px 14px; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #e0e7ff;">
                Entrega a cuenta
              </span>
            </div>
            
            <div style="display: flex; align-items: center; gap: 20px;">
              <span style="font-weight: 800; color: #1e293b;">{{ mData.total | number:'1.2-2' }}€</span>
              <svg *ngIf="mData.movs.length > 0" 
                   [style.transform]="selectedMonth === mData.num ? 'rotate(180deg)' : 'none'"
                   style="transition: transform 0.3s; color: #94a3b8;" 
                   width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </div>
          </div>

          <!-- Detalle de movimientos si el mes está expandido -->
          <div *ngIf="selectedMonth === mData.num && mData.movs.length > 0" style="padding: 10px 20px; background: #f8fafc; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; margin-top: -5px; animation: slideDown 0.2s ease-out;">
            <table class="movimientos-table" style="margin-top: 10px; font-size: 0.8rem; background: transparent;">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Concepto Original</th>
                  <th style="text-align: right;">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let mov of mData.movs">
                  <td>{{ mov.fecha | date:'dd/MM/yyyy' }}</td> 
                  <td>{{ mov.concepto_original || '-' }}</td>
                  <td style="text-align: right;">
                    <div [style.color]="mov.importe > 0 ? '#10b981' : '#ef4444'" style="font-weight: 700;">
                      {{ (mov.importe_mes || mov.importe) | number:'1.2-2' }}€
                    </div>
                    <div *ngIf="mov.es_reparto" style="font-size: 0.65rem; color: #94a3b8; margin-top: 2px;">
                      de un pago de {{ mov.importe | number:'1.2-2' }}€
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Modal Pago Manual -->
      <div class="modal-overlay" *ngIf="mostrarModalPago" style="z-index: 2000;">
        <div class="modal-card" style="max-width: 400px; animation: slideUp 0.3s ease;">
          <div class="modal-header">
            <h3>Aplicar Entrega a Cuenta</h3>
            <button class="btn-action" (click)="mostrarModalPago = false">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div class="modal-body" style="padding: 25px;">
            <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 20px; line-height: 1.5;">
              Se utilizará la <strong>Entrega a cuenta</strong> acumulada del propietario para cubrir la deuda de <strong>{{ reciboSeleccionado?.mesNombre }} {{ reciboSeleccionado?.anio }}</strong>.
            </p>
            <div class="form-group" style="margin-bottom: 20px;">
              <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">Importe a Descontar</label>
              <div style="position: relative;">
                <input type="number" [(ngModel)]="pagoManualForm.importe" class="input-standard" style="width: 100%; font-size: 1.2rem; font-weight: 800; padding: 12px; border-radius: 10px; border: 2px solid #e2e8f0;">
                <span style="position: absolute; right: 15px; top: 50%; transform: translateY(-50%); font-weight: 800; color: #94a3b8;">€</span>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 20px;">
              <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">Fecha del Cobro</label>
              <input type="date" [(ngModel)]="pagoManualForm.fecha" class="input-standard" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0;">
            </div>
            <div class="form-group">
              <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; margin-bottom: 8px;">Notas / Concepto</label>
              <input type="text" [(ngModel)]="pagoManualForm.concepto" class="input-standard" placeholder="Ej: Uso de crédito acumulado" style="width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #e2e8f0;">
            </div>
          </div>
          <div class="modal-footer" style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 15px 25px; display: flex; gap: 12px;">
            <button class="btn btn-secondary" (click)="mostrarModalPago = false" style="flex: 1;">Cancelar</button>
        <button class="btn btn-success" (click)="confirmarPagoManual()" [disabled]="loading || pagoManualForm.importe <= 0 || (pagoManualForm.importe > totalCredito + 0.01)" style="flex: 1.5; font-weight: 700;">
              {{ loading ? 'Guardando...' : 'Confirmar Pago' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css'] // Reusing styles
})
export class ComunidadPisoMovimientosComponent implements OnInit {
  communityId: string | null = null;
  pisoId: number | null = null;
  piso: Piso | null = null;
  movimientos: MovimientoBancario[] = [];
  groupedMovimientos: { [year: number]: { [month: number]: MovimientoBancario[] } } = {};
  years: number[] = [];
  selectedYear: number = new Date().getFullYear();
  selectedMonth: number | null = null;
  mostrarPendientes: boolean = false;
  totalCredito: number = 0;
  extractos: any[] = [];
  loading = false;

  // Estado Modal Pago Manual
  mostrarModalPago: boolean = false;
  reciboSeleccionado: any = null;
  pagoManualForm = { 
    fecha: new Date().toISOString().split('T')[0], 
    importe: 0, 
    concepto: 'Pago manual' 
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private supabase: SupabaseService,
    public utils: UtilsService,
    public modalService: ModalService
  ) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    const pisoIdStr = this.route.snapshot.paramMap.get('pisoId');
    if (pisoIdStr) {
      this.pisoId = parseInt(pisoIdStr, 10);
    }

    if (this.communityId && this.pisoId) {
      await this.loadPisoDetails();
      await this.loadExtractos();
      await this.loadMovimientos();
    } else {
      this.modalService.showAlert('Error', 'Faltan parámetros para cargar los movimientos del propietario.');
      this.router.navigate(['../censo'], { relativeTo: this.route.parent });
    }
  }

  async loadPisoDetails() {
    if (!this.pisoId) return;
    this.loading = true;
    try {
      const pisoDetails = await this.supabase.getPiso(this.pisoId);
      this.piso = pisoDetails;
    } catch (e: any) {
      console.error('Error loading piso details:', e);
      this.modalService.showAlert('Error', 'No se pudieron cargar los detalles del propietario: ' + e.message);
    } finally {
      this.loading = false;
    }
  }

  async loadExtractos() {
    if (!this.communityId) return;
    const { data } = await this.supabase.getExtractosByCommunity(this.communityId);
    this.extractos = data || [];
  }

  async loadMovimientos() {
    if (!this.communityId || !this.pisoId) return;
    this.loading = true;
    try {
      const { data, error } = await this.supabase.getMovimientosByPiso(this.communityId, this.pisoId);
      if (error) throw error;
      this.movimientos = data || [];
      this.calculateTotalCredito();
      this.groupMovimientos();
    } catch (e: any) {
      console.error('Error loading movimientos:', e);
      this.modalService.showAlert('Error', 'No se pudieron cargar los movimientos bancarios: ' + e.message);
    } finally {
      this.loading = false;
    }
  }

  calculateTotalCredito() {
    let credit = 0;
    this.movimientos.forEach(mov => {
      const asigs = (mov as any).detalle_asignacion_cuotas;
      if (Array.isArray(asigs)) {
        asigs.forEach((a: any) => {
          if (a.mes_destino === 'CREDITO_ACUMULADO') credit += this.utils.asNumber(a.importe_aplicado);
          if (a.pago_id === 'CREDITO_PREVIO') credit -= this.utils.asNumber(a.importe_aplicado);
        });
      }
    });
    this.totalCredito = Math.max(0, credit);
  }

  groupMovimientos() {
    this.groupedMovimientos = {};
    this.movimientos.forEach(mov => {
      // Usamos split para evitar desfases por zona horaria (UTC vs Local)
      // mov.fecha viene como "YYYY-MM-DD"
      const dateParts = mov.fecha.split('-');
      if (dateParts.length < 3) return;
      
      const year = parseInt(dateParts[0], 10);
      const month = parseInt(dateParts[1], 10);

      if (!this.groupedMovimientos[year]) {
        this.groupedMovimientos[year] = {};
      }
      if (!this.groupedMovimientos[year][month]) {
        this.groupedMovimientos[year][month] = [];
      }
      this.groupedMovimientos[year][month].push(mov);
    });
    this.years = Object.keys(this.groupedMovimientos).map(y => parseInt(y, 10)).sort((a, b) => b - a);
    
    // Si el año actual no tiene movimientos, mostramos el año más reciente que sí tenga
    if (this.years.length > 0 && !this.years.includes(this.selectedYear)) {
      this.selectedYear = this.years[0];
    }
  }

  /**
   * Genera la lista de los 12 meses para el año seleccionado con su estado de pago.
   */
  getMonthsData() {
    const data = [];
    const cuotaEsperada = (this.piso as any)?.cuota_base || (this.piso as any)?.comunidades?.cuota_base || 25; // Fallback a 25 si no hay config

    for (let m = 1; m <= 12; m++) {
      // Solo incluir el mes si hay un registro contable (extracto) en la base de datos
      const hasExtract = this.extractos.some(e => e.anio_contable === this.selectedYear && e.mes_contable === m);
      if (!hasExtract) continue;

      const targetMonthStr = `${this.selectedYear}-${String(m).padStart(2, '0')}`;
      let totalAbonado = 0;
      const movsParaMes: any[] = [];
      let isFromCredit = false;

      this.movimientos.forEach(mov => {
        const asigs = (mov as any).detalle_asignacion_cuotas;
        if (Array.isArray(asigs) && asigs.length > 0) {
          const match = asigs.find((a: any) => a.mes_destino === targetMonthStr);
          if (match) {
            const montoAsignado = this.utils.asNumber(match.importe_aplicado);
            totalAbonado += montoAsignado;
            movsParaMes.push({ 
              ...mov, 
              importe_mes: montoAsignado,
              es_reparto: this.utils.asNumber(mov.importe) > montoAsignado
            });
            
            // Detectar si el pago proviene de un saldo a cuenta (pago en otro mes o crédito previo)
            const dateParts = mov.fecha.split('-');
            const movY = parseInt(dateParts[0], 10);
            const movM = parseInt(dateParts[1], 10);
            
            if (match.pago_id === 'CREDITO_PREVIO' || movY !== this.selectedYear || movM !== m) {
              isFromCredit = true;
            }
          }
        } else {
          // Fallback: Si no tiene desglose (ej: pago manual recién creado), usamos la fecha del movimiento
          const dateParts = mov.fecha.split('-');
          if (dateParts.length >= 2 && parseInt(dateParts[0], 10) === this.selectedYear && parseInt(dateParts[1], 10) === m) {
              totalAbonado += this.utils.asNumber(mov.importe);
              movsParaMes.push(mov);
          }
        }
      });

      const isPaid = totalAbonado >= cuotaEsperada && cuotaEsperada > 0;
      const hasSomePayment = totalAbonado > 0;

      let statusLabel = 'PENDIENTE';
      if (isPaid) statusLabel = 'PAGADO';
      else if (hasSomePayment) statusLabel = 'PARCIAL';

      data.push({
        num: m,
        nombre: this.utils.getMesNombre(m),
        total: totalAbonado,
        paid: isPaid,
        status: statusLabel,
        isFromCredit,
        movs: movsParaMes.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      });
    }
    return data.reverse(); // De más reciente a más antiguo
  }

  togglePendientes() {
    this.mostrarPendientes = !this.mostrarPendientes;
    this.selectedMonth = null;
  }

  get allPendingReceipts() {
    const list: any[] = [];
    const cuotaEsperada = (this.piso as any)?.cuota_base || (this.piso as any)?.comunidades?.cuota_base || 25;

    // Solo revisamos meses de los que hay registros en la base de datos (Extractos)
    this.extractos.forEach(ext => {
      const y = ext.anio_contable;
      const m = ext.mes_contable;

      const targetMonthStr = `${y}-${String(m).padStart(2, '0')}`;
      let totalAbonado = 0;

      this.movimientos.forEach(mov => {
        const asigs = (mov as any).detalle_asignacion_cuotas;
        if (Array.isArray(asigs) && asigs.length > 0) {
          const match = asigs.find((a: any) => a.mes_destino === targetMonthStr);
          if (match) totalAbonado += this.utils.asNumber(match.importe_aplicado);
        } else {
          const dateParts = mov.fecha.split('-');
          if (dateParts.length >= 2 && parseInt(dateParts[0], 10) === y && parseInt(dateParts[1], 10) === m) {
              totalAbonado += this.utils.asNumber(mov.importe);
          }
        }
      });

      if (totalAbonado < cuotaEsperada && cuotaEsperada > 0) {
        list.push({
          anio: y,
          mes: m,
          mesNombre: this.utils.getMesNombre(m),
          total: totalAbonado,
          cuota: cuotaEsperada,
          status: totalAbonado > 0 ? 'PARCIAL' : 'PENDIENTE'
        });
      }
    });

    // Ordenar de más reciente a más antiguo
    return list.sort((a, b) => (b.anio * 100 + b.mes) - (a.anio * 100 + a.mes));
  }

  abrirModalPagoManual(item: any) {
    this.reciboSeleccionado = item;
    this.pagoManualForm = {
      fecha: new Date().toISOString().split('T')[0],
      importe: Math.round((item.cuota - item.total) * 100) / 100,
      concepto: `Entrega a cuenta aplicada ${item.mesNombre} ${item.anio}`
    };
    this.mostrarModalPago = true;
  }

  async confirmarPagoManual() {
    if (!this.communityId || !this.piso || !this.reciboSeleccionado) return;
    
    const ext = this.extractos.find(e => e.anio_contable === this.reciboSeleccionado.anio && e.mes_contable === this.reciboSeleccionado.mes);
    
    if (!ext) {
      this.modalService.showAlert('Registro Contable Requerido', 
        'Para registrar un pago manual en este mes, primero debe existir un extracto bancario procesado para dicho periodo.');
      return;
    }

    this.loading = true;
    try {
      const targetMonthStr = `${this.reciboSeleccionado.anio}-${String(this.reciboSeleccionado.mes).padStart(2, '0')}`;
      
      // IMPORTANTE: Normalizar el código para que coincida con la búsqueda posterior (ej: "1º A" -> "1A")
      const pisoCodigoNorm = this.utils.unformatPiso(this.piso.codigo);
      
      const nuevoMovimiento = {
        community_id: Number(this.communityId),
        extracto_id: ext.id,
        fecha: this.pagoManualForm.fecha,
        concepto_original: `[ENTREGA CUENTA] ${this.pagoManualForm.concepto}`,
        importe: 0, // No es flujo de caja nuevo, es consumo de crédito virtual
        piso_detectado: pisoCodigoNorm,
        tipo: 'ingreso',
        categoria: 'Ingreso Cuota',
        editado_manualmente: true,
        // Asignación explícita para que el sistema lo marque como pagado y descuente del saldo virtual inmediatamente
        detalle_asignacion_cuotas: [{
          pago_id: 'CREDITO_PREVIO',
          mes_destino: targetMonthStr,
          importe_aplicado: this.pagoManualForm.importe
        }]
      };

      const { error } = await this.supabase.insertarMovimientos([nuevoMovimiento]);
      if (error) throw error;

      this.modalService.showAlert('Éxito', 'Se ha aplicado correctamente la entrega a cuenta disponible.');
      this.mostrarModalPago = false;
      await this.loadMovimientos();
    } catch (e: any) {
      this.modalService.showAlert('Error', 'No se pudo registrar el pago: ' + e.message);
    } finally {
      this.loading = false;
    }
  }

  toggleMonth(month: number) {
    this.selectedMonth = this.selectedMonth === month ? null : month;
  }

  changeYear(delta: number) {
    this.selectedYear += delta;
    this.selectedMonth = null;
  }

  goToRegistros() {
    // Navegación hacia el dashboard de la comunidad donde residen los extractos/registros
    this.router.navigate(['../../dashboard'], { relativeTo: this.route });
  }

  goBack() {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }
}