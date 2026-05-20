import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import * as CryptoJS from 'crypto-js';

// Mismas claves que en el backend
const ENCRYPT_KEY = CryptoJS.enc.Utf8.parse('OptiFincasSecretKey2024_Security');
const ENCRYPT_IV = CryptoJS.enc.Utf8.parse('OptiFincas_IV_16');

// Definición de interfaz para Movimientos Bancarios
interface MovimientoBancario {
  id: string;
  community_id: string;
  fecha: string;
  concepto_original: string;
  importe: number;
  saldo_resultante?: number;
  ordenante?: string;
  piso_detectado?: string;
  tipo?: string;
  categoria?: string;
  created_at: string;
}

interface Piso {
  id?: number;
  community_id: number;
  codigo: string;
  propietario?: string;
  telefono1?: string;
  telefono2?: string;
  email?: string;
  observaciones?: string;
}

interface Community {
  id: number;
  address: string;
  cleaningHours: number;
  cleaningDaysPerWeek: number;
  latitude: number;
  longitude: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styles: [`
    .app-layout { display: flex; height: 100vh; font-family: 'Inter', 'Segoe UI', sans-serif; background: #f0f2f5; }
    .sidebar { width: 80px; background: #1a252f; color: white; padding: 0; display: flex; flex-direction: column; box-shadow: 4px 0 10px rgba(0,0,0,0.1); transition: width 0.3s; }
    .sidebar:hover { width: 220px; }
    .sidebar-header { padding: 20px; background: #111827; text-align: center; overflow: hidden; white-space: nowrap; }
    .sidebar-header h2 { margin: 0; font-size: 1.2rem; color: #f9fafb; }
    .sidebar nav { flex: 1; padding: 20px 0; }
    .sidebar-btn { width: 100%; padding: 15px 0; background: none; border: none; color: #9ca3af; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border-left: 3px solid transparent; gap: 15px; }
    .sidebar-btn:hover { background: #374151; color: white; }
    .sidebar-btn.active { background: #374151; color: white; border-left-color: #6366f1; }
    .sidebar-label { display: none; font-size: 0.9rem; font-weight: 500; }
    .sidebar:hover .sidebar-label { display: inline; }
    .sidebar:hover .sidebar-btn { justify-content: flex-start; padding-left: 25px; }
    .main-content { flex: 1; overflow-y: auto; padding: 40px; }
    
    .container { width: 100%; max-width: 1200px; margin: 0 auto; }
    
    /* Tarjetas y Contenedores */
    .card-container { background: white; border-radius: 16px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e1e8ed; max-width: 900px; margin: 0 auto; }
    .section-title { color: #111827; margin-bottom: 25px; font-weight: 600; display: flex; align-items: center; gap: 10px; font-size: 1.25rem; }
    
    .success-card { background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .success-icon { 
      width: 60px; height: 60px; border-radius: 50%; background: #f9fafb; 
      color: #111827; margin: 0 auto 20px;
      border: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: center;
    }
    .reference-box { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb; color: #4b5563; }

    /* Estilos de Botones y Tablas */
    .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; transition: all 0.2s; }
    .btn-success { background: #2ecc71; color: white; }
    .btn-info { background: #3498db; color: white; }
    .btn-secondary { background: #95a5a6; color: white; }
    .btn-danger { background: #e74c3c; color: white; }
    .btn:hover { opacity: 0.9; transform: translateY(-1px); }
    .btn-action { background: transparent; border: none; cursor: pointer; padding: 6px; border-radius: 6px; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; }
    .btn-action:hover { background: rgba(0,0,0,0.05); transform: scale(1.15); }
    .btn-edit { color: #3498db; }
    .btn-delete { color: #e74c3c; }
    
    .active-tab {
      border-color: #6366f1 !important;
      background-color: #f5f3ff !important;
      color: #6366f1 !important;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    }

    .dashboard-tab-icon { margin-bottom: 8px; display: block; margin-left: auto; margin-right: auto; }
    .summary-cards .card { transition: all 0.2s; }
    .summary-cards .card:hover:not(.active-tab) { background-color: #f9fafb; border-color: #d1d5db; }

    .community-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; margin-top: 20px; }
    .community-card-clickable { 
      background: white; border: 1px solid #e2e8f0; border-radius: 12px; 
      padding: 25px; cursor: pointer; transition: all 0.2s; position: relative;
      display: flex; flex-direction: column; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .community-card-clickable:hover { 
      border-color: #6366f1; transform: translateY(-4px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); 
    }
    .community-card-header { font-weight: 700; font-size: 1.1rem; color: #111827; margin-bottom: 10px; }
    .community-card-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

    .movimientos-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .movimientos-table th { background: #f9fafb; padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; color: #4b5563; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; }
    .movimientos-table td { padding: 14px 12px; border-bottom: 1px solid #f3f4f6; color: #1f2937; }
    
    .input-concepto-edit { width: 100%; padding: 8px; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 0.9rem; }
    .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-cards .card { background: white; padding: 20px; border-radius: 12px; border: 1px solid #e5e7eb; font-weight: 500; text-align: center; color: #4b5563; }
    .summary-cards .val { display: block; font-size: 1.25rem; font-weight: 700; color: #111827; margin-top: 5px; }

    .error { 
      background: #fef2f2; color: #991b1b; padding: 15px; border-radius: 8px; 
      margin-bottom: 20px; border: 1px solid #fee2e2; display: none;
    }
    .error.show { display: block; }

    /* Zonas de Carga (Upload Zones) */
    .upload-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 25px; margin-bottom: 30px; }
    .upload-zone { 
      border: 2px dashed #cbd5e0; border-radius: 20px; padding: 50px 20px; 
      text-align: center; transition: all 0.3s ease; background: white; cursor: pointer;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      position: relative; overflow: hidden;
      box-shadow: inset 0 0 0 6px transparent;
    }
    .upload-zone:hover { border-color: #3498db; background: #f7fbff; transform: translateY(-5px); box-shadow: 0 12px 20px rgba(0,0,0,0.05); }
    .upload-zone.dragover { border-color: #2ecc71; background: #fafff5; }
    .upload-zone.has-file { border-style: solid; border-color: #2ecc71; background: #f0fff4; animation: fadeIn 0.5s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
    
    .upload-icon { font-size: 54px; color: #a0aec0; margin-bottom: 15px; transition: all 0.3s; }
    .upload-zone:hover .upload-icon { color: #3498db; }
    .upload-text b { color: #4a5568; display: block; margin-bottom: 5px; }
    .upload-text span { color: #a0aec0; font-size: 0.9rem; }
    
    /* Badges de Archivo */
    .file-upload-badge {
      display: flex; align-items: center; background: white; border-radius: 12px; 
      padding: 15px; width: 90%; border: 1px solid #e2e8f0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.05); animation: slideIn 0.3s ease-out;
    }
    @keyframes slideIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    
    .file-icon { font-size: 24px; margin-right: 12px; }
    .file-details { flex: 1; text-align: left; overflow: hidden; }
    .file-name { display: block; font-weight: 600; color: #2c3e50; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .file-status { display: block; font-size: 11px; color: #38a169; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
    .remove-file-btn { background: #fff5f5; border: none; width: 30px; height: 30px; border-radius: 50%; color: #e53e3e; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
    .remove-file-btn:hover { background: #feb2b2; color: #c53030; }

    /* Botón Procesar */
    .btn-container { display: flex; justify-content: center; margin-top: 30px; width: 100%; }
    .btn-primary { 
      background: #3498db; color: white; border: none; padding: 16px 40px; border-radius: 12px;
      font-size: 1.1rem; font-weight: 600; cursor: pointer; transition: all 0.3s;
      box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
    }
    .btn-primary:hover:not(:disabled) { background: #2980b9; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(52, 152, 219, 0.4); }
    .btn-primary:disabled { background: #cbd5e0; cursor: not-allowed; box-shadow: none; transform: none; }

    /* Contenedor de Acciones (Descarga y Navegación) */
    .actions { display: flex; justify-content: center; gap: 20px; margin-top: 30px; width: 100%; }

    /* Spinner de Carga */
    .loading-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
      background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(4px);
      display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999;
    }
    .spinner {
      width: 50px; height: 50px; border: 5px solid #e2e8f0; border-top: 5px solid #3498db;
      border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }

    /* Tabla de Optimización */
    .info-section { background: #f8fafc; border-left: 4px solid #3498db; padding: 15px; margin-bottom: 20px; border-radius: 0 8px 8px 0; font-size: 0.9rem; color: #475569; }
    .info-section ul { margin: 5px 0 0 20px; padding: 0; }
    .form-group-opt { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 150px; }
    .form-group-opt label { font-size: 0.8rem; font-weight: 600; color: #64748b; text-transform: uppercase; }
    .help-tooltip { cursor: help; color: #3498db; font-size: 0.8rem; margin-left: 5px; }
    .legend { display: flex; gap: 20px; justify-content: center; margin-top: 15px; font-size: 0.85rem; color: #64748b; }
    .legend-item { display: flex; align-items: center; gap: 5px; }

    .optimization-table { width: 100%; border-collapse: collapse; margin-top: 20px; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
    .optimization-table th { background: #2c3e50; color: white; padding: 12px; text-align: center; font-size: 0.9rem; }
    .optimization-table td { border: 1px solid #e1e8ed; padding: 12px; vertical-align: top; width: 18%; }
    .optimization-table .emp-col { background: #f8f9fa; font-weight: bold; width: 10%; vertical-align: middle; color: #2c3e50; }
    .task-preview { font-size: 0.8rem; background: #ebf5ff; padding: 8px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid #3498db; text-align: left; }
    .task-preview b { display: block; color: #2c3e50; margin-bottom: 2px; }
    .task-preview .time { color: #555; font-size: 0.75rem; display: block; margin-bottom: 4px; }
    .hours-badge { font-size: 0.7rem; background: #34495e; padding: 2px 6px; border-radius: 10px; color: white; float: right; }
    .no-tasks { color: #bdc3c7; font-size: 0.8rem; font-style: italic; text-align: center; padding: 10px; }
    
    .logout-section { padding: 20px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: auto; }
    .btn-logout { width: 100%; padding: 10px; background: #e74c3c; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; }

    /* Estilos para el Modal de Edición de Piso */
    .modal-overlay {
      position: fixed; top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
      animation: fadeIn 0.2s ease-out;
    }
    .modal-card {
      background: white; width: 90%; max-width: 600px; border-radius: 16px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
      overflow: hidden; animation: slideUp 0.3s ease-out;
    }
    .modal-header {
      padding: 20px 25px; border-bottom: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center;
      background: #f9fafb;
    }
    .modal-header h3 { margin: 0; font-size: 1.1rem; font-weight: 700; color: #111827; }
    .modal-body { padding: 32px; max-height: 75vh; overflow-y: auto; }
    .modal-footer {
      padding: 20px 30px; border-top: 1px solid #e5e7eb;
      display: flex; justify-content: flex-end; gap: 12px; background: #f9fafb;
    }
    .form-grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 24px 20px; }
    .form-group { margin-bottom: 0; }
    .form-group label { 
      display: flex; align-items: center; gap: 8px;
      font-size: 0.85rem; font-weight: 600; color: #4b5563; margin-bottom: 8px; 
    }
    .form-group label svg { color: #6366f1; opacity: 0.8; }
    .form-group input, .form-group textarea {
      width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 10px;
      font-size: 0.95rem; transition: all 0.2s ease; background: #fcfcfd; color: #1f2937;
      box-sizing: border-box; display: block;
    }
    .form-group input:focus, .form-group textarea:focus { 
      outline: none; border-color: #6366f1; background: white;
      box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1);
    }
    .form-group textarea { resize: none; }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  `]
})
export class AppComponent implements OnInit {
  session: any = null;
  loadingSession = true;
  funcionalidadActiva = 1;
  pantallaActual = 1;
  clasificadorCommunityId: number | null = null;
  
  // Estado del Dashboard de Comunidad
  comunidadSeleccionada: any = null;
  editandoPisoId: number | null = null;
  pisoForm: Piso = { community_id: 0, codigo: '' };
  seccionDashboard: 'propietarios' | 'extractos' | 'finanzas' | 'limpieza' = 'propietarios';
  mostrarModalEdicionPiso: boolean = false; // Controla la visibilidad del modal

  extractos: any[] = [];
  extractoSeleccionado: any = null;
  editandoExtractoId: number | null = null;

  loading = false;
  selectedFileExtracto: File | null = null;
  selectedFileRegistros: File | null = null;
  movimientos: any[] = [];
  // Para la navegación por años en el dashboard de movimientos
  currentYearDashboard: number = new Date().getFullYear();
  filteredMovimientosBancarios: MovimientoBancario[] = [];
  pisos: any[] = [];
  resumen = { total_ingresos: 0, total_gastos: 0, saldo_neto: 0 }; // TODO: Esto es para la funcionalidad 1, no para el dashboard
  error = '';
  archivoReferencia: { nombre: string, blob: Blob } | null = null;

  // Gestión de Comunidades (Persistencia)
  comunidadesDB: any[] = [];
  importProgress: { processed: { name: string, count: number }[], skipped: { name: string, reason: string }[] } | null = null;
  nuevaComunidad = { nombre: '', direccion: '', servicios: '' };
  editandoId: string | null = null;
  availableYears: Set<number> = new Set<number>(); // Almacena los años con extractos disponibles
  
  // Gestión de Movimientos Bancarios
  movimientosBancarios: MovimientoBancario[] = [];

  // Funcionalidad 3: Optimización de Rutas
  numEmployees: number = 2;
  communities: Community[] = [];
  nextCommunityId: number = 1;
  optimizationResult: any = null;
  diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  async ngOnInit() {
    console.log('[DEBUG] Iniciando AppComponent...');
    
    // Centralizamos la lógica en el cambio de estado de autenticación
    this.supabase.authChanges((_, session) => {
      console.log('[DEBUG] Cambio detectado en Auth:', session ? 'Sesión Activa' : 'Sin Sesión');
      this.session = session;
      
      if (session) {
        this.cargarComunidades();
      } else {
        this.comunidadesDB = [];
      }
      this.loadingSession = false;
    });
  }

  get isCsv(): boolean {
    return this.selectedFileExtracto?.name.toLowerCase().endsWith('.csv') || false;
  }

  cambiarFuncionalidad(id: number) {
    console.log('[DEBUG] Cambiando a funcionalidad:', id);
    this.funcionalidadActiva = id;
    if (id === 2 && this.session) {
      this.cargarComunidades();
    }
  }

  // Función robusta para obtener valores usando alias comunes de bancos
  getVal(obj: any, key: string): any {
    if (!obj) return null;
    const target = key.toLowerCase();
    const aliases: any = {
      fecha: ['fecha', 'f_operacion', 'f_valor', 'date', 'periodo', 'proceso', 'operacion', 'valor'],
      observaciones: ['observaciones', 'descrip', 'detalle', 'referencia', 'texto', 'concepto'],
      importe: ['importe', 'valor', 'cantidad', 'monto', 'amount', 'eur'],
      saldo: ['saldo', 'balance'],
      ordenante: ['ordenante', 'beneficiario', 'titular', 'nombre', 'benef'],
      concepto: ['concepto']
    };
    const searchTerms = aliases[target] || [target];
    const keys = Object.keys(obj);
    for (const term of searchTerms) {
      const foundKey = keys.find(k => k.toLowerCase().includes(term));
      if (foundKey) return obj[foundKey];
    }
    return null;
  }

  // Asegura que el valor sea numérico para el pipe de Angular
  asNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (val === undefined || val === null || String(val).trim() === '') return 0;
    const str = String(val).trim().replace(/\./g, '').replace(',', '.');
    const num = parseFloat(str) || 0;
    return Number(num.toFixed(2));
  }

  // Función para desencriptar datos de la base de datos
  decryptVal(ciphertext: string): string {
    if (!ciphertext || ciphertext === '-' || ciphertext === 'nan') return '';
    try {
      const decrypted = CryptoJS.AES.decrypt(ciphertext, ENCRYPT_KEY, {
        iv: ENCRYPT_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      const res = decrypted.toString(CryptoJS.enc.Utf8);
      // Si no devuelve nada, es posible que el dato no estuviera encriptado (datos antiguos)
      return res || ciphertext;
    } catch (e) {
      console.warn('Error desencriptando valor:', ciphertext);
      return ciphertext; // Devolvemos el valor original si falla
    }
  }

  onFileSelected(event: any, type: 'extracto' | 'registros') {
    const file = event.target.files[0];
    if (type === 'extracto') this.selectedFileExtracto = file;
    else this.selectedFileRegistros = file;
  }

  async procesar() {
    if (!this.selectedFileExtracto) return;

    // Ahora validamos que o bien haya un Excel histórico o bien se haya seleccionado una comunidad
    if (!this.selectedFileRegistros && !this.clasificadorCommunityId) {
      alert('Seleccione un archivo de registros históricos o una comunidad para usar los datos del sistema.');
      return;
    }
    
    this.loading = true;
    const formData = new FormData();
    formData.append('extracto', this.selectedFileExtracto);

    if (this.selectedFileRegistros) {
      formData.append('registros', this.selectedFileRegistros);
    } else if (this.clasificadorCommunityId) {
      // Enviamos el ID de la comunidad para que el backend pueda consultar el histórico en la BD
      formData.append('community_id', this.clasificadorCommunityId.toString());
    }

    this.http.post<any>('/api/procesar-dos-archivos', formData).subscribe({
next: (data) => {
        console.log('>>> [FRONTEND] DATOS QUE LLEGAN DEL BACKEND:', data);
        this.movimientos = data.movimientos_clasificados;
        this.resumen = data.resumen_general;

        try {
          const hist = (this.movimientos || []).filter(m => m && m.es_historico);
          console.log('movimientos_clasificados=', this.movimientos?.length || 0);
          console.log(' historicos encontrados=', hist.length);
          console.log(' historicos muestra=', hist.slice(0, 5).map(m => ({ piso: m?.piso, CONCEPTO: m?.CONCEPTO, metodo_piso: m?.metodo_piso })));
          // accesible desde consola
          (window as any).__hist = hist;

        } catch (e) {
          console.warn('[DEBUG] error en debug console logs', e);
        }

        this.pantallaActual = 2;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Error al procesar archivos';
        this.loading = false;
      }
    });
  }

  descargar(modo: string) {
    this.loading = true;
    // Mapeamos los movimientos editados antes de enviar
    const datosAEnviar = this.movimientos.map(m => ({
      FECHA: m.FECHA, // Ya viene procesado del backend
      ORDENANTE: m.ORDENANTE, // Ya viene procesado del backend
      OBSERVACIONES: m.OBSERVACIONES, // Ya viene procesado del backend
      IMPORTE: m.IMPORTE, // Ya viene procesado del backend
      SALDO: m.SALDO, // Ya viene procesado del backend
      CONCEPTO: m.CONCEPTO // Este es el campo editable por el usuario
    }));
    console.log('>>> [FRONTEND] ENVIANDO DATOS AL BACKEND (confirmar):', datosAEnviar);

    this.http.post<any>(`/api/confirmar?modo=${modo}`, datosAEnviar).subscribe({
      next: (data) => {
        console.log('>>> [FRONTEND] RESPUESTA DE CONFIRMACIÓN RECIBIDA:', data);
        const byteCharacters = atob(data.excel_contenido);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.nombre_archivo;
        a.click();

        // Guardamos referencia del archivo para la Funcionalidad 2
        this.archivoReferencia = { nombre: data.nombre_archivo, blob: blob };
        this.pantallaActual = 3;
        this.loading = false;
      },
      error: () => {
        this.error = 'Error en la descarga';
        this.loading = false;
      }
    });
  }

  async guardarEnBaseDeDatos() {
    if (!this.clasificadorCommunityId) {
      alert('Debe seleccionar una comunidad para guardar los movimientos.');
      return;
    }

    this.loading = true;
    try {
      const nombreArchivo = this.selectedFileExtracto?.name || 'Extracto Clasificado';
      
      // 1. Registrar la cabecera del extracto en 'extractos_procesados'
      const extractoRes = await this.supabase.crearExtracto(this.clasificadorCommunityId, nombreArchivo);
      if (extractoRes.error) throw extractoRes.error;
      const extractoId = extractoRes.data[0].id;

      // 2. Mapear los movimientos procesados al esquema de la tabla 'movimientos'
      const movimientosParaDB = this.movimientos.map(m => ({
        community_id: this.clasificadorCommunityId,
        extracto_id: extractoId,
        fecha: this.formatDate(m.FECHA),
        concepto_original: m.OBSERVACIONES || '',
        importe: m.IMPORTE,
        saldo_resultante: m.SALDO,
        ordenante: m.ORDENANTE || '',
        piso_detectado: m.CONCEPTO, // El concepto editado por el usuario es el identificador del piso
        tipo: m.IMPORTE > 0 ? 'ingreso' : 'gasto',
        editado_manualmente: true,
        categoria: m.categoria || 'Sin Categoría',
        confianza_clasificacion: m.confianza || 0
      }));

      // 3. Inserción masiva en Supabase
      const insertRes = await this.supabase.insertarMovimientos(movimientosParaDB);
      if (insertRes.error) throw insertRes.error;

      alert(`Se han guardado ${movimientosParaDB.length} movimientos correctamente en el sistema.`);
      this.pantallaActual = 3;
    } catch (err: any) {
      console.error('Error al persistir movimientos:', err);
      alert('Ocurrió un error al guardar en la base de datos: ' + (err.message || 'Error desconocido'));
    } finally {
      this.loading = false;
    }
  }

  private formatDate(dateStr: string): string {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const [day, month, year] = dateStr.split('/');
    return `${year}-${month}-${day}`;
  }

  irAFuncionalidad2() {
    this.funcionalidadActiva = 2;
  }

  irAFuncionalidad3() {
    this.funcionalidadActiva = 3;
  }

  importarExcelComunidades(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    this.loading = true;
    const formData = new FormData();
    formData.append('file', file);

    this.http.post<any>('/api/optimizacion/importar-comunidades', formData).subscribe({
      next: (data) => {
        // Añadimos las nuevas comunidades a la lista actual
        if (data.comunidades && data.comunidades.length > 0) {
          // Evitar duplicados por dirección (insensible a mayúsculas)
          const existingAddresses = new Set(this.communities.map(c => c.address.toLowerCase()));
          const filtradas = data.comunidades.filter((c: any) => !existingAddresses.has(c.address.toLowerCase()));

          if (filtradas.length === 0) {
            alert('Todas las comunidades del archivo ya existen en la lista.');
            this.loading = false;
            return;
          }

          // Ajustar IDs para evitar duplicados de ID
          const startingId = this.communities.length > 0 ? Math.max(...this.communities.map(c => c.id)) + 1 : 1;
          const nuevas = filtradas.map((c: any, index: number) => ({ ...c, id: startingId + index }));
          
          this.communities = [...this.communities, ...nuevas];
          this.nextCommunityId = startingId + nuevas.length;

          const omitidas = data.comunidades.length - filtradas.length;
          if (omitidas > 0) {
            alert(`Se han importado ${filtradas.length} comunidades. Se omitieron ${omitidas} por estar repetidas.`);
          } else {
            alert(`Se han importado ${filtradas.length} comunidades correctamente.`);
          }
        } else {
          alert('No se encontraron comunidades en el archivo.');
        }
        this.loading = false;
      },
      error: (err) => {
        const msg = err.error?.detail || err.message;
        this.error = 'Error al importar comunidades: ' + msg;
        alert(this.error);
        this.loading = false;
      }
    });
  }

  removeCommunity(id: number) {
    this.communities = this.communities.filter(c => c.id !== id);
  }

  clearAllCommunities() {
    if (confirm('¿Estás seguro de que quieres borrar todas las comunidades?')) {
      this.communities = [];
    }
  }

  calcularOptimizacion() {
    if (this.communities.length === 0) {
      this.error = 'Debe añadir al menos una comunidad para optimizar.';
      return;
    }
    this.loading = true;
    this.error = '';

    const payload = {
      numEmployees: this.numEmployees,
      communities: this.communities.map(c => ({
        address: c.address,
        cleaningHours: c.cleaningHours,
        cleaningDaysPerWeek: c.cleaningDaysPerWeek,
        latitude: c.latitude,
        longitude: c.longitude
      }))
    };

    this.http.post<any>('/api/optimizacion/calcular', payload).subscribe({
      next: (data) => {
        this.optimizationResult = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Error al calcular la optimización: ' + (err.error?.detail || err.message);
        this.loading = false;
      }
    });
  }

  hasNoAsignadas(): boolean {
    if (!this.optimizationResult || !this.optimizationResult.no_asignadas) return false;
    return Object.values(this.optimizationResult.no_asignadas).some((arr: any) => arr.length > 0);
  }

  descargarExcelOptimizacion() {
    if (!this.optimizationResult) return;
    
    const byteCharacters = atob(this.optimizationResult.excel_archivo);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.optimizationResult.nombre_archivo;
    a.click();
  }

  reiniciarProceso() {
    this.pantallaActual = 1;
    this.movimientos = [];
    this.selectedFileExtracto = null;
    this.selectedFileRegistros = null;
  }

  async logout() {
    await this.supabase.signOut();
  }

  // --- GESTIÓN DE COMUNIDADES (DB) ---
  async cargarComunidades() {
    console.log('[DEBUG] Intentando cargar comunidades desde Supabase...');
    const { data, error } = await this.supabase.getComunidades();
    if (error) {
      console.error('[DEBUG] Error de Supabase:', error);
    } else {
      console.log('[DEBUG] Comunidades recibidas:', data?.length || 0);
      this.comunidadesDB = data || [];
    }
  }

  async guardarComunidad() {
    if (!this.nuevaComunidad.nombre || !this.nuevaComunidad.direccion) {
      alert('Por favor, rellena los campos obligatorios.');
      return;
    }

    this.loading = true;
    try {
      if (this.editandoId) {
        // MODO EDICIÓN
        const { data, error } = await this.supabase.updateComunidad(this.editandoId, this.nuevaComunidad);
        if (error) throw error;
        if (data) {
          const index = this.comunidadesDB.findIndex(c => c.id === this.editandoId);
          this.comunidadesDB[index] = data[0];
          alert('Comunidad actualizada con éxito.');
        }
      } else {
        // MODO CREACIÓN
        const { data, error } = await this.supabase.insertComunidad(this.nuevaComunidad);
        if (error) throw error;
        if (data) {
          this.comunidadesDB = [data[0], ...this.comunidadesDB];
          alert('Comunidad guardada con éxito.');
        }
      }
      this.cancelarEdicion();
    } catch (err: any) {
      alert('Error en la operación: ' + err.message);
    } finally {
      this.loading = false;
    }
  }

  prepararEdicion(com: any) {
    this.editandoId = com.id;
    this.nuevaComunidad = {
      nombre: com.nombre,
      direccion: com.direccion,
      servicios: com.servicios
    };
    // Hacer scroll hacia arriba para que el usuario vea el formulario
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  cancelarEdicion() {
    this.editandoId = null;
    this.nuevaComunidad = { nombre: '', direccion: '', servicios: '' };
  }

  async eliminarComunidad(id: string) {
    if (!confirm('¿Estás seguro de que deseas eliminar esta comunidad? Esta acción no se puede deshacer.')) return;

    this.loading = true;
    const { error } = await this.supabase.deleteComunidad(id);
    if (error) {
      alert('Error al eliminar: ' + error.message);
    } else {
      this.comunidadesDB = this.comunidadesDB.filter(c => c.id !== id);
    }
    this.loading = false;
  }

  // Navegación al Dashboard
  async verDashboard(com: any) {
    this.comunidadSeleccionada = com;
    this.seccionDashboard = 'propietarios';
    this.loading = true;
    try {
      await this.cargarPisos(com.id);
      await this.cargarExtractos(com.id);
    } finally {
      this.loading = false;
    }
  }

  cerrarDashboard() {
    this.comunidadSeleccionada = null;
  }

  // --- GESTIÓN DE MOVIMIENTOS BANCARIOS ---
  selectedMovimientosFile: File | null = null;
  cargandoMovimientos = false;

  onMovimientosFileSelected(event: any) {
    this.selectedMovimientosFile = event.target.files[0];
  }

  async importarMovimientosParaComunidad(communityId: number | string) {
    if (!this.selectedMovimientosFile) {
      alert('Por favor, selecciona un archivo Excel para importar.');
      return;
    }

    if (!confirm('¡Atención! Al subir el registro histórico se eliminarán los datos actuales del sistema para evitar duplicados. ¿Deseas continuar?')) {
      return;
    }

    this.cargandoMovimientos = true;
    try {
      const response = await this.supabase.importarMovimientosBancarios(communityId, this.selectedMovimientosFile);
      if (response.status === 'success') {
        alert(response.message);
        this.importProgress = { processed: response.processed_sheets || [], skipped: response.skipped_sheets || [] };
        this.selectedMovimientosFile = null;
        await this.cargarExtractos(communityId); // Recargar extractos
      } else {
        throw new Error(response.detail || 'Error desconocido al importar movimientos.');
      }
    } catch (error: any) {
      console.error('Error al importar movimientos:', error);
      alert('Error al importar movimientos: ' + error.message);
    } finally {
      this.cargandoMovimientos = false;
    }
  }

  async cargarMovimientosBancarios(communityId: number | string) {
    this.cargandoMovimientos = true;
    try {
      const { data, error } = await this.supabase.getMovimientosBancarios(communityId);
      if (error) {
        throw error;
      }
      this.movimientosBancarios = data || [];
      this.filterMovimientosBancariosByYear(); // Filtrar por el año actual al cargar
    } catch (error: any) {
      console.error('Error al cargar movimientos bancarios:', error);
      alert('Error al cargar movimientos bancarios: ' + error.message);
      this.movimientosBancarios = [];
    } finally {
      this.cargandoMovimientos = false;
    }
  }

  // Extrae el nombre de la hoja (ej: "Enero 2024") del nombre del archivo guardado en el backend
  extractSheetName(filename: string): string {
    const match = filename?.match(/\(([^)]+)\)/);
    if (!match) return '';
    // Retornamos el contenido eliminando el año (4 dígitos al final) para mostrar solo el mes
    return match[1].replace(/\s+\d{4}$/, '').trim();
  }

  async cargarExtractos(communityId: number | string) {
    this.loading = true;
    try {
      const { data, error } = await this.supabase.getExtractosByCommunity(communityId);
      if (error) throw error;
      
      // Obtenemos todos los movimientos de la comunidad para calcular los contadores manualmente
      const { data: movs } = await this.supabase.getMovimientosBancarios(communityId);
      
      this.extractos = (data || []).map(ext => ({
        ...ext,
        movimientos_count: (movs || []).filter((m: any) => m.extracto_id === ext.id).length
      }));

      this.extractoSeleccionado = null;
      this.importProgress = null; // Limpiar el progreso de importación al cargar nuevos extractos
      this.movimientosBancarios = [];
      this.availableYears = new Set(this.extractos.map(e => e.anio_contable));
    } catch (error: any) {
      console.error('Error al cargar extractos:', error);
    } finally {
      this.loading = false;
    }
  }

  async seleccionarExtracto(extracto: any) {
    this.extractoSeleccionado = extracto;
    this.loading = true;
    this.movimientosBancarios = []; // Limpiar movimientos anteriores inmediatamente
    
    try {
      const { data, error } = await this.supabase.getMovimientosByExtracto(extracto.id);
      if (error) {
        throw error;
      }
      this.movimientosBancarios = data || [];
      this.filterMovimientosBancariosByYear(); // Filtrar por el año actual al seleccionar un extracto
    } catch (error: any) {
      console.error('Error al cargar movimientos del extracto:', error);
      this.movimientosBancarios = [];
    } finally {
      this.loading = false;
    }
  }

  irAClasificadorConComunidad() {
    this.funcionalidadActiva = 1;
    this.pantallaActual = 1;
    this.clasificadorCommunityId = this.comunidadSeleccionada.id;
  }

  async eliminarExtracto(ext: any) {
    if (!confirm(`¿Estás seguro de eliminar el registro de ${this.getMesNombre(ext.mes_contable)} ${ext.anio_contable}? Se borrarán todos sus movimientos.`)) return;
    
    this.loading = true;
    try {
      const res = await this.supabase.eliminarExtracto(ext.id);
      if (res.status === 'success') {
        this.extractos = this.extractos.filter(e => e.id !== ext.id);
        if (this.extractoSeleccionado?.id === ext.id) this.extractoSeleccionado = null;
        alert(res.message);
      }
    } catch (e) {
      alert('Error al eliminar el registro');
    } finally {
      this.loading = false;
    }
  }

  getMesNombre(mes: number | null): string {
    if (!mes) return 'Registro';
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return meses[mes - 1] || 'Mes Desconocido';
  }

  // --- Lógica de filtrado por año para el dashboard ---
  filterMovimientosBancariosByYear(): void {
    this.filteredMovimientosBancarios = this.movimientosBancarios.filter(mov => {
      const movYear = new Date(mov.fecha).getFullYear();
      return movYear === this.currentYearDashboard;
    });
  }

  // Getter para obtener los extractos filtrados por el año actual en el dashboard
  get filteredExtractosList() {
    return (this.extractos || [])
      .filter(e => e.anio_contable === this.currentYearDashboard)
      .sort((a, b) => a.mes_contable - b.mes_contable);
  }

  canNavigateExtractos(delta: number): boolean {
    if (this.loading || !this.extractos.length) return false;

    if (!this.extractoSeleccionado) {
      // Navegación por año: buscamos si el año destino tiene algún extracto con movimientos
      const targetYear = this.currentYearDashboard + delta;
      return this.extractos.some(e => e.anio_contable === targetYear && (e.movimientos_count || 0) > 0);
    } else {
      // Navegación entre extractos: verificamos si el siguiente/anterior tiene movimientos
      const sorted = [...this.extractos].sort((a, b) => (a.anio_contable * 12 + a.mes_contable) - (b.anio_contable * 12 + b.mes_contable));
      const currentIndex = sorted.findIndex(e => e.id === this.extractoSeleccionado.id);
      const nextIndex = currentIndex + delta;

      if (nextIndex >= 0 && nextIndex < sorted.length) {
        return (sorted[nextIndex].movimientos_count || 0) > 0;
      }
      return false;
    }
  }

  navegarExtractos(delta: number): void {
    if (!this.extractoSeleccionado) {
      // Si no hay extracto seleccionado, las flechas cambian el año de filtrado
      this.currentYearDashboard += delta;
    } else {
      // Si hay uno seleccionado, buscamos el anterior/siguiente cronológicamente
      const sorted = [...this.extractos].sort((a, b) => (a.anio_contable * 12 + a.mes_contable) - (b.anio_contable * 12 + b.mes_contable));
      const currentIndex = sorted.findIndex(e => e.id === this.extractoSeleccionado.id);
      const nextIndex = currentIndex + delta;
      if (nextIndex >= 0 && nextIndex < sorted.length) {
        this.seleccionarExtracto(sorted[nextIndex]);
      }
    }
  }

  // --- Gestión de Pisos ---
  async cargarPisos(communityId: number) {
    const { data, error } = await this.supabase.getPisos(communityId);
    if (!error && data) {
      console.log('[DEBUG FRONTEND] Datos de pisos recibidos de Supabase (encriptados):', data);
      // Desencriptamos los datos antes de asignarlos al array de la tabla
      this.pisos = data.map((p: any) => ({
        ...p,
        propietario: this.decryptVal(p.propietario),
        email: this.decryptVal(p.email),
        telefono1: this.decryptVal(p.telefono1),
        telefono2: this.decryptVal(p.telefono2),
        observaciones: this.decryptVal(p.observaciones),
        // Añadir logs para depuración de desencriptación
        _propietario_raw: p.propietario,
        _email_raw: p.email,
        _telefono1_raw: p.telefono1,
        _telefono2_raw: p.telefono2,
        _observaciones_raw: p.observaciones
      }));
    }
  }

  async onCensoFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file || !this.comunidadSeleccionada) return;

    this.loading = true;
    try {
      const res = await this.supabase.importarCenso(this.comunidadSeleccionada.id, file);
      if (res.status === 'success') {
        alert(res.message);
        await this.cargarPisos(this.comunidadSeleccionada.id);
      } else {
        alert('Error: ' + res.detail);
      }
    } catch (e) {
      alert('Error de conexión con el servidor');
    } finally {
      this.loading = false;
    }
  }

  async borrarCensoCompleto() {
    if (!this.comunidadSeleccionada) return;
    const confirmacion = confirm('¡Atención! Si continúas, se eliminarán permanentemente todos los propietarios de esta comunidad y el listado quedará completamente vacío. ¿Estás seguro de que deseas proceder?');
    
    if (confirmacion) {
      this.loading = true;
      try {
        const res = await this.supabase.borrarCensoComunidad(this.comunidadSeleccionada.id);
        alert(res.message);
        await this.cargarPisos(this.comunidadSeleccionada.id);
      } catch (e) {
        alert('Error al vaciar el censo');
      } finally {
        this.loading = false;
      }
    }
  }
  // --- GESTIÓN DE PISOS (CRUD) ---
  prepararNuevoPiso(): void {
    this.editandoPisoId = null;
    this.pisoForm = { community_id: this.comunidadSeleccionada.id, codigo: '' };
    this.mostrarModalEdicionPiso = true; // Abre el modal
  }

  prepararEdicionPiso(piso: any): void {
    console.log('[DEBUG] Editando piso:', piso);
    this.editandoPisoId = piso.id || null;
    this.pisoForm = JSON.parse(JSON.stringify(piso)); // Clonación profunda para evitar referencias
    this.mostrarModalEdicionPiso = true; // Abre el modal
  }

  cancelarEdicionPiso(): void {
    this.editandoPisoId = null;
    this.pisoForm = { community_id: this.comunidadSeleccionada.id, codigo: '' };
    this.mostrarModalEdicionPiso = false; // Cierra el modal
  }

  async guardarPiso() {
    if (!this.comunidadSeleccionada) {
      alert('No hay comunidad seleccionada.');
      return;
    }
    if (!this.pisoForm.codigo) {
      alert('El código del piso es obligatorio.');
      return;
    }

    this.loading = true;
    try {
      let res: any;
      this.pisoForm.community_id = this.comunidadSeleccionada.id;

      // Limpiamos campos internos de depuración antes de enviar al backend
      const { _propietario_raw, _email_raw, _telefono1_raw, _telefono2_raw, _observaciones_raw, id, created_at, user_id, ...datosParaGuardar } = this.pisoForm as any;

      if (this.editandoPisoId) {
        // MODO ACTUALIZACIÓN
        res = await this.supabase.updatePiso(this.editandoPisoId, datosParaGuardar);
      } else {
        // MODO CREACIÓN
        res = await this.supabase.createPiso(datosParaGuardar);
      }

      if (res && (res.id || res.status === 'success')) {
        alert(`Piso ${this.editandoPisoId ? 'actualizado' : 'creado'} con éxito.`);
        this.cancelarEdicionPiso();
        this.mostrarModalEdicionPiso = false; // Cierra el modal al guardar
        await this.cargarPisos(this.comunidadSeleccionada.id);
      } else {
        throw new Error(res.detail || 'Error al guardar el piso.');
      }
    } catch (err: any) {
      console.error('Error al guardar piso:', err);
      alert('Error al guardar el piso: ' + (err.message || 'No tienes permisos o el piso ya existe.'));
    } finally {
      this.loading = false;
    }
  }

  async eliminarPiso(pisoId: number) {
    if (!confirm('¿Estás seguro de que deseas eliminar este piso? Esta acción no se puede deshacer.')) return;

    this.loading = true;
    try {
      const res = await this.supabase.deletePiso(pisoId);
      // En delete, si no hay error y el mensaje es de éxito
      if (res && (res.status === 'success' || !res.error)) {
        alert(res.message || 'Piso eliminado correctamente');
        await this.cargarPisos(this.comunidadSeleccionada.id);
      } else {
        throw new Error(res.detail || 'Error al eliminar el piso.');
      }
    } catch (err: any) {
      console.error('Error al eliminar piso:', err);
      alert('Error al eliminar el piso: ' + (err.message || 'No tienes permisos para realizar esta acción.'));
    } finally {
      this.loading = false;
    }
  }

  setSeccion(seccion: 'propietarios' | 'extractos' | 'finanzas' | 'limpieza') {
    this.seccionDashboard = seccion;
  }
}