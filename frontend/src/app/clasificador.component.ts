import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ComunidadDB, ExtractoProcesado } from './models';
import { UtilsService } from './utils.service';
import { ModalService } from './modal.service';

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

  // Estado del Modal de Edición
  mostrarModalEdicion = false;
  movimientoEnEdicion: any = null;
  tempConcepto: string = '';

  constructor(
    private http: HttpClient, 
    private supabase: SupabaseService, 
    public utils: UtilsService,
    private router: Router,
    private modalService: ModalService
  ) {}

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
      error: (err: any) => { 
        this.loading = false; 
        this.error = 'Error al conectar con el servidor de IA: ' + (err.message || 'Error desconocido');
      }
    });
  }

  async guardarEnBaseDeDatos() {
    if (!this.clasificadorCommunityId) return;

    // 1. Verificar si ya existe un registro para este mes y año en esta comunidad
    const { data: existing } = await this.supabase.getExtractosByCommunity(this.clasificadorCommunityId);
    const duplicado = (existing || []).find((e: ExtractoProcesado) => 
      e.mes_contable === this.currentExtractoMes && 
      e.anio_contable === this.currentExtractoAnio
    );

    if (duplicado) {
      const mesTxt = this.utils.getMesNombre(this.currentExtractoMes);
      const ok = await this.modalService.showConfirm('Mes ya registrado', 
        `Ya existe información contable para ${mesTxt} de ${this.currentExtractoAnio}. Si continúas, la información anterior se borrará y se sobrescribirá con estos nuevos datos. ¿Estás seguro?`);
      
      if (!ok) return; // Detenemos el proceso si el usuario cancela
    }
    
    this.loading = true;
    this.loadingMessage = 'Guardando...';

    try {
      const payload = {
        community_id: this.clasificadorCommunityId,
        nombre_archivo: this.selectedFileExtracto?.name || 'Extracto IA',
        mes: this.currentExtractoMes,
        anio: this.currentExtractoAnio,
        movimientos: this.movimientos.map(m => ({
          fecha: this.utils.formatToISODate(m.FECHA),
          concepto_original: m.OBSERVACIONES || '',
          importe: m.IMPORTE,
          saldo_resultante: m.SALDO,
          ordenante: m.ORDENANTE || '',
          piso_detectado: m.IMPORTE > 0 ? this.utils.unformatPiso(m.CONCEPTO) : 'piso sin identificar',
          tipo: m.IMPORTE > 0 ? 'ingreso' : 'gasto',
          categoria: m.IMPORTE < 0 ? m.CONCEPTO : 'Ingreso Cuota'
        }))
      };

      await this.supabase.persistirExtracto(payload);
      this.pantallaActual = 3;
    } catch (err: any) {
      this.error = 'Error al persistir los datos: ' + (err.message || 'Error desconocido');
    } finally {
      this.loading = false;
    }
  }

  goToClassifiedExtracto() {
    if (this.clasificadorCommunityId && this.currentExtractoMes && this.currentExtractoAnio) {
      this.router.navigate(
        [`/comunidades/${this.clasificadorCommunityId}/extractos`],
        { queryParams: { mes: this.currentExtractoMes, anio: this.currentExtractoAnio } }
      );
    } else {
      this.modalService.showAlert('Error', 'No se pudo determinar el registro para navegar.');
    }
  }

  // --- Métodos de Edición ---
  abrirEdicion(mov: any) {
    this.movimientoEnEdicion = mov;
    this.tempConcepto = mov.CONCEPTO;
    this.mostrarModalEdicion = true;
  }

  cerrarEdicion() {
    this.mostrarModalEdicion = false;
    this.movimientoEnEdicion = null;
  }

  confirmarEdicion() {
    if (this.movimientoEnEdicion) {
      this.movimientoEnEdicion.CONCEPTO = this.tempConcepto;
    }
    this.cerrarEdicion();
  }

  // --- Métodos de Apoyo Visual ---
  showHistoricalDetails(event: MouseEvent, mov: any) {
    if (!mov.es_historico || !mov.detalle_historico) {
      this.hideHistoricalDetails();
      return;
    }

    // Asegurarse de que el evento no se propague para evitar conflictos con otros clics
    event.stopPropagation();

    if (mov.es_historico && mov.detalle_historico) {
      event.stopPropagation();
      const detalle = mov.detalle_historico;
      const mesNombre = this.utils.getMesNombre(detalle.mes_historico);
      
      this.historicalTooltipContent = `
      <div style="background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
        <div style="padding: 25px 30px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;">
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 800; color: #1e293b; display: flex; align-items: center; gap: 10px;">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2.5"><path d="M12 2a10 10 0 1 0 10 10H12V2z"></path><path d="M12 12L2.69 7"></path></svg>
          Vínculo Histórico Detectado
          </h3>
        </div>
        <div style="padding: 35px; background: white;">
          <div style="margin-bottom: 25px;">
            <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 15px; line-height: 1.5;">Este ingreso coincide con patrones registrados anteriormente en <strong>${mesNombre} ${detalle.anio_historico}</strong>:</p>
            <div style="padding: 20px 25px; background: #f5f3ff; border-radius: 14px; border: 1px solid #e0e7ff; border-left: 5px solid #6366f1;">
              <span style="font-weight: 800; color: #1e293b; font-size: 1.1rem;">${mov.CONCEPTO}</span>
              <div style="font-size: 0.7rem; color: #6366f1; text-transform: uppercase; margin-top: 8px; font-weight: 800; letter-spacing: 0.05em;">Referencia anterior: "${detalle.valor_coincidencia_historico}"</div>
            </div>
          </div>
          <div style="font-size: 0.85rem; color: #94a3b8; font-style: italic; border-top: 1px solid #f1f5f9; padding-top: 20px; line-height: 1.4;">
            Asignación basada en la consistencia de pagos anteriores registrados en la comunidad.
          </div>
        </div>
      </div>`;
      this.showHistoricalTooltip = true;
    }
  }

  hideHistoricalDetails() {
    this.showHistoricalTooltip = false;
  }

  reiniciar() {
    this.pantallaActual = 1;
    this.selectedFileExtracto = null;
    this.movimientos = [];
    this.error = '';
  }
}