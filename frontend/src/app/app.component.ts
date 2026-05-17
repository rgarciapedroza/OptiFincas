import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';

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
    .sidebar { width: 260px; background: linear-gradient(180deg, #2c3e50 0%, #1a252f 100%); color: white; padding: 0; display: flex; flex-direction: column; box-shadow: 4px 0 10px rgba(0,0,0,0.1); }
    .sidebar-header { padding: 25px; background: #1a252f; text-align: center; }
    .sidebar-header h2 { margin: 0; font-size: 1.5rem; color: #3498db; }
    .sidebar nav { flex: 1; padding: 20px 0; }
    .sidebar-btn { width: 100%; padding: 15px 25px; background: none; border: none; color: #bdc3c7; text-align: left; cursor: pointer; transition: all 0.3s; font-size: 1rem; border-left: 4px solid transparent; }
    .sidebar-btn:hover { background: #34495e; color: white; }
    .sidebar-btn.active { background: #34495e; color: white; border-left-color: #3498db; }
    .main-content { flex: 1; overflow-y: auto; padding: 40px; }
    
    .container { width: 100%; max-width: 1200px; margin: 0 auto; }
    
    /* Tarjetas y Contenedores */
    .card-container { background: white; border-radius: 16px; padding: 30px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); border: 1px solid #e1e8ed; max-width: 900px; margin: 0 auto; }
    .section-title { color: #2c3e50; margin-bottom: 25px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
    
    .success-card { background: white; padding: 40px; border-radius: 16px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.05); }
    .success-icon { 
      width: 60px; height: 60px; border-radius: 50%; background: #f0fff4; 
      color: #2ecc71; font-size: 32px; line-height: 60px; margin: 0 auto 20px;
      border: 2px solid #2ecc71; display: flex; align-items: center; justify-content: center;
    }
    .reference-box { background: #e8f4fd; padding: 15px; border-radius: 4px; margin: 20px 0; border: 1px dashed #3498db; }

    /* Estilos de Botones y Tablas */
    .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600; transition: all 0.2s; }
    .btn-success { background: #2ecc71; color: white; }
    .btn-info { background: #3498db; color: white; }
    .btn-secondary { background: #95a5a6; color: white; }
    
    .movimientos-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    .movimientos-table th { background: #f8f9fa; padding: 12px; text-align: left; border-bottom: 2px solid #dee2e6; }
    .movimientos-table td { padding: 12px; border-bottom: 1px solid #dee2e6; }
    
    .input-concepto-edit { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .summary-cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
    .summary-cards .card { background: white; padding: 20px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); font-weight: bold; text-align: center; }

    .error { 
      background: #fff5f5; color: #c53030; padding: 15px; border-radius: 8px; 
      margin-bottom: 20px; border: 1px solid #feb2b2; display: none;
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
  `]
})
export class AppComponent implements OnInit {
  session: any = null;
  loadingSession = true;
  funcionalidadActiva = 1;
  pantallaActual = 1;
  loading = false;
  selectedFileExtracto: File | null = null;
  selectedFileRegistros: File | null = null;
  movimientos: any[] = [];
  resumen = { total_ingresos: 0, total_gastos: 0, saldo_neto: 0 };
  error = '';
  archivoReferencia: { nombre: string, blob: Blob } | null = null;

  // Funcionalidad 3: Optimización de Rutas
  numEmployees: number = 2;
  communities: Community[] = [];
  nextCommunityId: number = 1;
  optimizationResult: any = null;
  diasSemana = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes"];

  constructor(private http: HttpClient, private supabase: SupabaseService) {}

  async ngOnInit() {
    this.session = await this.supabase.getSession();
    const session = await this.supabase.getSession();
    this.session = session;
    this.loadingSession = false;

    this.supabase.authChanges((_, session) => {
      this.session = session;
      this.loadingSession = false;
    });
  }

  // isCsv se mantiene igual, ya que depende del nombre del archivo seleccionado
  get isCsv(): boolean {
    return this.selectedFileExtracto?.name.toLowerCase().endsWith('.csv') || false;
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

  onFileSelected(event: any, type: 'extracto' | 'registros') {
    const file = event.target.files[0];
    if (type === 'extracto') this.selectedFileExtracto = file;
    else this.selectedFileRegistros = file;
  }

  async procesar() {
    if (!this.selectedFileExtracto || !this.selectedFileRegistros) return;
    
    this.loading = true;
    const formData = new FormData();
    formData.append('extracto', this.selectedFileExtracto);
    formData.append('registros', this.selectedFileRegistros);

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
}