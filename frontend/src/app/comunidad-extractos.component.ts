import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ExtractoProcesado, MovimientoBancario } from './models';
import * as CryptoJS from 'crypto-js';

const ENCRYPT_KEY = CryptoJS.enc.Utf8.parse('OptiFincasSecretKey2024_Security');
const ENCRYPT_IV = CryptoJS.enc.Utf8.parse('OptiFincas_IV_16');

@Component({
  selector: 'app-comunidad-extractos',
  template: `
    <div class="card-container" style="max-width: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h3 style="margin: 0; font-size: 1.1rem;">
          {{ extractoSeleccionado ? 'Movimientos del Registro' : 'Registros Mensuales' }}
        </h3>
        
        <div *ngIf="!extractoSeleccionado" style="display: flex; gap: 10px;">
          <button class="btn btn-primary" style="font-size: 0.85rem;">+ Subir Nueva Entrada</button>
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
            <td style="font-weight: 600;">{{ getMesNombre(ext.mes_contable) }}</td>
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
        <table class="movimientos-table">
          <thead>
            <tr>
              <th (click)="toggleOrdenFecha()" style="cursor: pointer; user-select: none;">
                FECHA {{ ordenFecha === 'desc' ? '▼' : '▲' }}
              </th>
              <th>OBSERVACIONES</th>
              <th style="text-align: right;">IMPORTE</th>
              <th style="text-align: center;">CONCEPTO</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let mov of movimientosOrdenados">
              <td>{{ mov.fecha | date:'dd/MM/yyyy' }}</td>
              <td style="font-size: 0.9rem;">{{ decryptVal(mov.concepto_original) || '-' }}</td>
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

  constructor(private route: ActivatedRoute, private supabase: SupabaseService) {}

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

  get extractosFiltrados() {
    return this.extractos
      .filter(e => e.anio_contable === this.currentYear)
      .sort((a, b) => {
        return this.ordenMes === 'desc' 
          ? b.mes_contable - a.mes_contable 
          : a.mes_contable - b.mes_contable;
      });
  }

  get movimientosOrdenados() {
    return [...this.movimientos].sort((a, b) => {
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

  formatearPiso(piso: string | undefined): string {
    if (!piso || piso.trim() === '' || piso.toLowerCase() === 'nan' || piso.toLowerCase() === 'none' || piso.toLowerCase().includes('identificar')) return 'piso sin identificar';
    const upper = piso.trim().toUpperCase();
    const match = upper.match(/^(\d+)([A-Z])$/);
    return match ? `${match[1]}º ${match[2]}` : upper;
  }

  async seleccionarExtracto(ext: ExtractoProcesado) {
    this.extractoSeleccionado = ext;
    this.loading = true;
    const { data } = await this.supabase.getMovimientosByExtracto(ext.id);
    this.movimientos = (data || []).map(m => {
      const decrypted = {
        ...m,
        concepto_original: this.decryptVal(m.concepto_original),
        ordenante: this.decryptVal(m.ordenante)
      };
      // Inicializar CONCEPTO para el input de la UI (Piso para ingresos, Categoría para gastos)
      decrypted.CONCEPTO = m.tipo === 'ingreso' 
        ? this.formatearPiso(m.piso_detectado) 
        : (m.categoria || 'Sin categoría');
      return decrypted;
    });
    this.cambiosRealizados = false;
    this.loading = false;
  }

  async actualizarMovimientosDashboard() {
    if (!this.extractoSeleccionado) return;
    this.loading = true;
    try {
      // Sincronizamos los cambios del input (CONCEPTO) con los campos técnicos antes de guardar
      this.movimientos.forEach(m => {
        if (m.tipo === 'ingreso') {
          m.piso_detectado = this.unformatPiso(m.CONCEPTO || '');
        } else {
          m.categoria = m.CONCEPTO || 'Sin Categoría';
        }
      });

      const movimientosParaDB = this.movimientos.map(m => ({
        id: m.id,
        community_id: m.community_id,
        extracto_id: m.extracto_id,
        fecha: m.fecha,
        concepto_original: this.encryptVal(m.concepto_original || ''),
        importe: m.importe,
        saldo_resultante: m.saldo_resultante,
        ordenante: this.encryptVal(m.ordenante || ''),
        piso_detectado: (m.piso_detectado && m.piso_detectado.trim() !== '') ? m.piso_detectado.substring(0, 20) : 'piso sin identificar',
        tipo: m.tipo,
        editado_manualmente: true,
        categoria: (m.categoria || 'Sin Categoría').substring(0, 50),
        confianza_clasificacion: m.confianza_clasificacion || 0
      }));

      const { error } = await this.supabase.upsertMovimientos(movimientosParaDB);
      if (error) throw error;

      this.cambiosRealizados = false;
      alert('Cambios guardados correctamente en la base de datos.');
    } catch (err: any) {
      console.error('Error al actualizar movimientos:', err);
      alert('Error al guardar: ' + (err.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  encryptVal(plaintext: string): string {
    if (!plaintext) return '';
    try {
      const encrypted = CryptoJS.AES.encrypt(plaintext, ENCRYPT_KEY, {
        iv: ENCRYPT_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return encrypted.toString();
    } catch (e) { return plaintext; }
  }

  unformatPiso(formattedPiso: string): string {
    if (!formattedPiso || formattedPiso.toLowerCase().includes('desconocido') || formattedPiso.toLowerCase().includes('identificar') || formattedPiso.toLowerCase().includes('asignar')) return '';
    const match = formattedPiso.match(/^(\d+)º\s*([A-Z])$/i);
    return match ? `${match[1]}${match[2]}`.toUpperCase() : formattedPiso.toUpperCase().replace(/[^A-Z0-9]/g, '');
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
      CONCEPTO: m.tipo === 'ingreso' ? this.formatearPiso(m.piso_detectado) : m.categoria
    }));

    try {
      const url = `/api/confirmar?modo=mensual&community_name=${encodeURIComponent(comName)}&mes=${mes}&anio=${anio}`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosAEnviar)
      });
      
      const resData = await response.json();
      
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
      alert('Error al exportar los movimientos');
    } finally {
      this.loading = false;
    }
  }

  getMesNombre(mes: number): string {
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return meses[mes - 1] || 'Desconocido';
  }

  decryptVal(ciphertext: string | undefined): string {
    if (!ciphertext || ciphertext === '-' || ciphertext === 'nan') return '';
    try {
      const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPT_KEY, {
        iv: ENCRYPT_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return decrypted.toString(CryptoJS.enc.Utf8) || ciphertext;
    } catch (e) { return ciphertext || ''; }
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
    if (confirm('¿Eliminar este extracto y todos sus movimientos?')) {
      await this.supabase.eliminarExtracto(id);
      await this.cargarExtractos();
    }
  }
}