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
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 25px;">
        <h3 style="margin: 0; font-size: 1.1rem;">
          Movimientos Bancarios de {{ piso?.propietario }} ({{ utils.formatearPiso(piso?.codigo) }})
        </h3>
        <button class="btn btn-secondary" (click)="goBack()" style="font-size: 0.85rem; border-radius: 20px; padding: 8px 20px;">
          ← Volver al Censo
        </button>
      </div>

      <!-- Selector de Año Profesional -->
      <div *ngIf="!loading" style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 12px; border-radius: 50px; border: 1px solid #e2e8f0; width: fit-content; margin-left: auto; margin-right: auto;">
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
      <div *ngIf="!loading && movimientos.length > 0">
        <div *ngFor="let mData of getMonthsData()" style="margin-bottom: 15px;">
          <div class="card" 
               (click)="toggleMonth(mData.num)"
               [style.cursor]="mData.movs.length > 0 ? 'pointer' : 'default'"
               [style.background]="selectedMonth === mData.num ? '#f8fafc' : 'white'"
               style="padding: 15px 25px; border-radius: 12px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <span style="font-weight: 700; color: #1e293b; font-size: 1rem; min-width: 100px;">{{ mData.nombre }}</span>
              <span class="badge" 
                    [style.background]="mData.paid ? '#dcfce7' : (mData.isFuture ? '#f1f5f9' : '#fee2e2')" 
                    [style.color]="mData.paid ? '#166534' : (mData.isFuture ? '#64748b' : '#991b1b')">
                {{ mData.paid ? 'PAGADO' : (mData.isFuture ? 'SIN EMITIR' : 'PENDIENTE') }}
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
                  <td [style.color]="mov.importe > 0 ? '#10b981' : '#ef4444'" style="text-align: right; font-weight: 700;">{{ mov.importe | number:'1.2-2' }}€</td>
                </tr>
              </tbody>
            </table>
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
  loading = false;

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

  async loadMovimientos() {
    if (!this.communityId || !this.pisoId) return;
    this.loading = true;
    try {
      const { data, error } = await this.supabase.getMovimientosByPiso(this.communityId, this.pisoId);
      if (error) throw error;
      this.movimientos = data || [];
      this.groupMovimientos();
    } catch (e: any) {
      console.error('Error loading movimientos:', e);
      this.modalService.showAlert('Error', 'No se pudieron cargar los movimientos bancarios: ' + e.message);
    } finally {
      this.loading = false;
    }
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
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    for (let m = 1; m <= 12; m++) {
      const movs = this.groupedMovimientos[this.selectedYear]?.[m] || [];
      // Solo sumamos ingresos para determinar si ha pagado la cuota
      const total = movs.reduce((acc, curr) => acc + (curr.importe > 0 ? curr.importe : 0), 0);
      const paid = total > 0;
      const isFuture = this.selectedYear > currentYear || (this.selectedYear === currentYear && m > currentMonth);

      data.push({
        num: m,
        nombre: this.utils.getMesNombre(m),
        total,
        paid,
        isFuture,
        movs: movs.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      });
    }
    return data.reverse(); // De más reciente a más antiguo
  }

  toggleMonth(month: number) {
    this.selectedMonth = this.selectedMonth === month ? null : month;
  }

  changeYear(delta: number) {
    this.selectedYear += delta;
    this.selectedMonth = null;
  }

  goBack() {
    this.router.navigate(['../../'], { relativeTo: this.route });
  }
}