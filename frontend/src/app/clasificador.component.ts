import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import * as CryptoJS from 'crypto-js';
import { ComunidadDB } from './models';

const ENCRYPT_KEY = CryptoJS.enc.Utf8.parse('OptiFincasSecretKey2024_Security');
const ENCRYPT_IV = CryptoJS.enc.Utf8.parse('OptiFincas_IV_16');

@Component({
  selector: 'app-clasificador',
  templateUrl: './clasificador.component.html',
  styleUrls: ['./clasificador.component.css']
})
export class ClasificadorComponent implements OnInit {
  loading = false;
  pantallaActual = 1;
  clasificadorCommunityId: number | null = null;
  comunidadesDB: ComunidadDB[] = [];
  selectedFileExtracto: File | null = null;
  movimientos: any[] = [];
  resumen = { total_ingresos: 0, total_gastos: 0, saldo_neto: 0 };
  currentExtractoMes: number | null = null;
  currentExtractoAnio: number | null = null;
  error = '';

  // Estado del Tooltip de Histórico
  showHistoricalTooltip = false;
  historicalTooltipContent = '';
  loadingMessage = 'Procesando...';

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.cargarComunidades();
  }

  async cargarComunidades() {
    const { data, error } = await this.supabase.getComunidades();
    if (!error) this.comunidadesDB = data || [];
  }

  onFileSelected(event: any) {
    this.selectedFileExtracto = event.target.files[0];
  }

  get isCsv(): boolean {
    return this.selectedFileExtracto?.name.toLowerCase().endsWith('.csv') || false;
  }

  async procesar() {
    if (!this.selectedFileExtracto || !this.clasificadorCommunityId) return;
    this.loading = true;
    this.error = '';
    const formData = new FormData();
    formData.append('extracto', this.selectedFileExtracto);
    formData.append('community_id', this.clasificadorCommunityId.toString());

    this.http.post<any>('/api/procesar-extracto-db', formData).subscribe({
      next: (data) => {
        this.movimientos = data.movimientos_clasificados;
        this.resumen = data.resumen_general;
        this.currentExtractoMes = data.mes_extracto;
        this.currentExtractoAnio = data.anio_extracto;
        this.pantallaActual = 2;
        this.loading = false;
      },
      error: (err) => { 
        this.loading = false; 
        this.error = 'Error al conectar con el servidor de IA.';
      }
    });
  }

  async guardarEnBaseDeDatos() {
    if (!this.clasificadorCommunityId) return;
    this.loading = true;
    this.loadingMessage = 'Guardando...';
    
    try {
      const nombreArchivo = this.selectedFileExtracto?.name || 'Extracto Clasificado';
      
      // 1. Registrar extracto
      const extractoRes = await this.supabase.crearExtracto(
        this.clasificadorCommunityId,
        nombreArchivo,
        this.currentExtractoMes,
        this.currentExtractoAnio
      );
      if (extractoRes.error) throw extractoRes.error;
      const extractoId = extractoRes.data[0].id;

      // 2. Mapear movimientos (encriptando datos sensibles)
      const movimientosParaDB = this.movimientos.map(m => ({
        community_id: this.clasificadorCommunityId,
        extracto_id: extractoId,
        fecha: this.formatDate(m.FECHA),
        concepto_original: this.encryptVal(m.OBSERVACIONES || ''),
        importe: m.IMPORTE,
        saldo_resultante: m.SALDO,
        ordenante: this.encryptVal(m.ORDENANTE || ''),
        piso_detectado: m.IMPORTE > 0 ? this.unformatPiso(m.CONCEPTO) : 'piso sin identificar',
        tipo: m.IMPORTE > 0 ? 'ingreso' : 'gasto',
        categoria: m.IMPORTE < 0 ? m.CONCEPTO : 'Ingreso Cuota',
        editado_manualmente: true
      }));

      await this.supabase.insertarMovimientos(movimientosParaDB);
      this.pantallaActual = 3;
    } catch (err) {
      this.error = 'Error al persistir los datos.';
    } finally {
      this.loading = false;
    }
  }

  // --- Métodos de Apoyo Visual ---

  showHistoricalDetails(event: MouseEvent, mov: any) {
    if (mov.es_historico && mov.detalle_historico) {
      event.stopPropagation();
      const detalle = mov.detalle_historico;
      this.historicalTooltipContent = `
      <div class="modal-header" style="padding: 25px 35px; border-bottom: 1px solid #e5e7eb; background: #f9fafb;">
        <h3 style="margin: 0; font-size: 1.2rem; font-weight: 700; color: #111827;">Coincidencia Detectada en Historial</h3>
      </div>
      <div class="modal-body" style="padding: 45px; line-height: 1.6;">
        <div style="margin-bottom: 40px; text-align: center;">
          <label style="display: block; font-size: 0.8rem; font-weight: 600; color: #6b7280; text-transform: uppercase; margin-bottom: 15px; letter-spacing: 0.05em;">Piso Identificado</label>
          <div style="color: #6366f1; font-size: 2.2rem; font-weight: 800; background: #f5f3ff; padding: 15px 40px; border-radius: 16px; border: 2px solid #e0e7ff; display: inline-block; box-shadow: 0 4px 12px rgba(99, 102, 241, 0.1);">
            ${mov.CONCEPTO}
          </div>
        </div>

        <div style="background: #f8fafc; padding: 35px; border-radius: 18px; border: 1px solid #edf2f7; margin-bottom: 35px;">
          <label style="display: block; font-size: 0.75rem; font-weight: 700; color: #4a5568; text-transform: uppercase; margin-bottom: 12px; letter-spacing: 0.025em;">Contenido original que provocó la coincidencia:</label>
          <div style="padding: 25px; background: white; border: 1px solid #e2e8f0; border-radius: 12px; font-family: 'Inter', sans-serif; color: #111827; font-size: 1.4rem; font-weight: 600; border-left: 8px solid #6366f1; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
            "${detalle.valor_coincidencia_historico}"
          </div>
          <p style="margin-top: 20px; font-size: 0.95rem; color: #4b5563; font-style: italic;">
            Este movimiento actual ha sido vinculado al piso <b>${mov.CONCEPTO}</b> tras encontrar una coincidencia con la información guardada en registros anteriores.
          </p>
        </div>
      </div>`;
      this.showHistoricalTooltip = true;
    }
  }

  hideHistoricalDetails() {
    this.showHistoricalTooltip = false;
  }

  // --- Utilidades de Formateo ---

  private formatDate(dateStr: string): string {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  }

  private unformatPiso(formattedPiso: string): string {
    if (!formattedPiso || formattedPiso.toLowerCase().includes('sin identificar')) return 'piso sin identificar';
    const match = formattedPiso.match(/^(\d+)º\s*([A-Z])$/i);
    if (match) return `${match[1]}${match[2]}`.toUpperCase();
    return formattedPiso.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  private encryptVal(plaintext: string): string {
    if (!plaintext) return '';
    try {
      const encrypted = CryptoJS.AES.encrypt(plaintext, ENCRYPT_KEY, {
        iv: ENCRYPT_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return encrypted.toString();
    } catch (e) {
      return plaintext;
    }
  }

  reiniciar() {
    this.pantallaActual = 1;
    this.selectedFileExtracto = null;
    this.movimientos = [];
    this.error = '';
  }
}