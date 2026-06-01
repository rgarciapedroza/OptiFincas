import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { FinanzasData, MovimientoBancario } from './models';
import { UtilsService } from './utils.service';

@Component({
  selector: 'app-portal-propietario',
  templateUrl: './portal-propietario.component.html',
  styleUrls: ['./portal-propietario.component.css']
})
export class PortalPropietarioComponent implements OnInit {
  userPisos: any[] = [];
  selectedPiso: any | null = null;
  userName: string = '';
  loading = true;
  allRecibosGrouped: any[] = [];
  seccionActiva: 'finanzas' | 'limpieza' | 'recibos' = 'finanzas'; // This is not used anymore as main sections are handled by router
  seccionPrincipalActiva: 'mis-propiedades' | 'mis-recibos' | 'finanzas' | 'limpieza' | 'contactar' = 'mis-propiedades'; // Top-level sections

  // Propiedades para Finanzas
  finanzasData: FinanzasData = {
    ingresosPorPiso: [],
    gastos: [],
    resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 }
  };
  viewDateFinanzas: Date = new Date();
  currentMonthLabelFinanzas: string = '';
  extractoActualFinanzas: any = null;

  // Propiedades para Limpieza
  cleaningSchedule: { date: string, tasks: any[] }[] = [];
  viewDateLimpieza: Date = new Date();
  currentMonthLabelLimpieza: string = '';

  // Propiedades para Recibos
  viewDateRecibos: Date = new Date();
  currentMonthLabelRecibos: string = '';
  mostrarPendientes: boolean = false;

  // Formulario de contacto
  contactForm = { reason: '', message: '', photo: null as File | null };
  contactReasons = [
    'Avería en zonas comunes', 'Incidencia en mi propiedad', 'Consulta sobre recibos/pagos', 
    'Cambio de datos de contacto', 'Solicitud de documentos', 'Sugerencias', 'Otros'
  ];
  sendingContact = false;

  constructor(
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    public utils: UtilsService,
    public modalService: ModalService // Inyectamos el ModalService
  ) {}

  async ngOnInit() {
    // Detectar sección inicial basándose en la URL actual
    this.detectarSeccionDesdeUrl();

    const session = await this.supabase.getSession();
    if (session?.user?.email) {
      const { data } = await this.supabase.buscarPisoPorEmail(session.user.email);
      if (data) {
        // Los datos ya vienen desencriptados desde el backend
        this.userPisos = data;
        
        if (this.userPisos.length > 0) {
          // Ahora mostramos el nombre del propietario en lugar del código de la finca
          this.userName = this.userPisos[0].propietario || 'Propietario';
          
          // Pre-seleccionar la primera propiedad si estamos en una vista de detalle y no hay ninguna seleccionada
          if (this.seccionPrincipalActiva !== 'mis-propiedades' && !this.selectedPiso) {
            this.selectedPiso = this.userPisos[0];
            this.updateMonthLabels();
            await Promise.all([
              this.loadFinanzas(),
              this.loadCleaningSchedule(),
              this.loadRecibos()
            ]);
          }
        }
      }
    }
    this.loading = false;
  }

  private detectarSeccionDesdeUrl() {
    const url = this.router.url;
    if (url.endsWith('portal-propietario') || url.includes('mis-propiedades')) this.seccionPrincipalActiva = 'mis-propiedades';
    else if (url.includes('mis-recibos')) this.seccionPrincipalActiva = 'mis-recibos';
    else if (url.includes('finanzas')) this.seccionPrincipalActiva = 'finanzas';
    else if (url.includes('limpieza')) this.seccionPrincipalActiva = 'limpieza';
    else if (url.includes('contactar')) this.seccionPrincipalActiva = 'contactar';
  }

  async loadPisoData(piso: any) {
    this.loading = true;
    this.selectedPiso = piso;
    this.updateMonthLabels();
    await Promise.all([
      this.loadFinanzas(),
      this.loadCleaningSchedule(),
      this.loadRecibos()
    ]);
    this.loading = false;
  }

  async seleccionarPisoParaDetalle(piso: any) {
    await this.loadPisoData(piso);
    // Si el usuario selecciona una finca desde el listado, le llevamos a la "página" de Finanzas por defecto
    if (this.seccionPrincipalActiva === 'mis-propiedades') {
      this.router.navigate(['/portal-propietario/finanzas']);
    }
  }

  setSeccion(seccion: 'finanzas' | 'limpieza' | 'recibos') {
    this.seccionActiva = seccion;
  }

  async setSeccionPrincipal(seccion: 'mis-propiedades' | 'mis-recibos' | 'finanzas' | 'limpieza' | 'contactar') {
    // Navegación mediante router para cumplir con el requisito de "páginas distintas"
    this.router.navigate(['/portal-propietario', seccion]);
  }

  // --- Lógica de Finanzas ---
  async loadFinanzas() {
    if (!this.selectedPiso?.comunidades?.id) return;
    this.loading = true;
    try {
      const mes = this.viewDateFinanzas.getMonth() + 1;
      const anio = this.viewDateFinanzas.getFullYear();

      const { data: extData } = await this.supabase.getExtractosByCommunity(this.selectedPiso.comunidades.id);
      this.extractoActualFinanzas = extData?.find((e: any) => e.mes_contable === mes && e.anio_contable === anio) || null;

      if (this.extractoActualFinanzas) {
        const session = await this.supabase.getSession(); // Obtenemos la sesión para el token
        const headers = { 'Authorization': `Bearer ${session?.access_token}` }; // Añadimos el token a las cabeceras
        // LLAMADA AL BACKEND: Obtenemos datos ya desencriptados por el servidor
        const movs = await lastValueFrom(this.http.get<any[]>(`/api/comunidades/${this.selectedPiso.comunidades.id}/movimientos`, { headers }));
        const allPisos = await lastValueFrom(this.http.get<any[]>(`/api/comunidades/${this.selectedPiso.comunidades.id}/pisos`, { headers }));
        
        if (movs && allPisos) {
          const ingresos = movs.filter(m => this.utils.asNumber(m.importe) > 0);
          const gastos = movs.filter(m => this.utils.asNumber(m.importe) < 0);
          
          // Identificar los pisos del propietario para resaltarlos
          const misPisosNorm = new Set(this.userPisos.map(p => this.utils.unformatPiso(p.codigo)));

          this.finanzasData.ingresosPorPiso = allPisos.map(p => {
            const pNorm = this.utils.unformatPiso(p.codigo);
            const movsDelPiso = ingresos.filter(m => this.utils.unformatPiso(m.piso_detectado) === pNorm);
            const total = movsDelPiso.reduce((acc, m) => acc + this.utils.asNumber(m.importe), 0);
            
            return {
              codigo: p.codigo,
              importe: total,
              pagado: movsDelPiso.length > 0,
              fecha: movsDelPiso.length > 0 ? movsDelPiso[0].fecha : null,
              esMio: misPisosNorm.has(pNorm)
            };
          });

          this.finanzasData.gastos = gastos.map(g => ({
            concepto: g.categoria !== 'Sin Categoría' ? g.categoria : g.concepto_original,
            importe: Math.abs(this.utils.asNumber(g.importe))
          })).sort((a, b) => b.importe - a.importe);

          const totalIngresosCom = ingresos.reduce((acc, m) => acc + this.utils.asNumber(m.importe), 0);
          const totalGastosCom = gastos.reduce((acc, m) => acc + Math.abs(this.utils.asNumber(m.importe)), 0);
          const saldoF = movs.length > 0 ? this.utils.asNumber(movs[0].saldo_resultante) : 0;

          this.finanzasData.resumenCuentas = {
            saldoAnterior: saldoF - totalIngresosCom + totalGastosCom,
            ingresosMes: totalIngresosCom,
            gastosMes: totalGastosCom,
            saldoTotal: saldoF
          };
        }
      } else {
        this.finanzasData = {
          ingresosPorPiso: [], gastos: [],
          resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 }
        };
      }
    } finally {
      this.loading = false;
    }
  }

  changeMonthFinanzas(delta: number) {
    this.viewDateFinanzas = new Date(this.viewDateFinanzas.getFullYear(), this.viewDateFinanzas.getMonth() + delta, 1);
    this.updateMonthLabels();
    this.loadFinanzas();
  }

  async generarReportePDF() {
    if (!this.extractoActualFinanzas || !this.selectedPiso) return;
    this.loading = true;
    
    const comName = this.selectedPiso.comunidades?.nombre || 'Comunidad';
    const mes = this.extractoActualFinanzas.mes_contable;
    const anio = this.extractoActualFinanzas.anio_contable;

    const session = await this.supabase.getSession();
    const headers = { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token}`
    };

    try {
      const url = `/api/confirmar?modo=finanzas&community_name=${encodeURIComponent(comName)}&mes=${mes}&anio=${anio}`;
      
      // Cambiado fetch por HttpClient para consistencia arquitectónica
      const resData: any = await lastValueFrom(this.http.post(url, this.finanzasData, { headers }));
      
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

  // --- Lógica de Limpieza ---
  async loadCleaningSchedule() {
    if (this.userPisos.length === 0) return;
    const mes = this.viewDateLimpieza.getMonth() + 1;
    const anio = this.viewDateLimpieza.getFullYear();
    const { data } = await this.supabase.getPlanificacion(mes, anio);

    this.cleaningSchedule = [];
    if (data?.datos?.horarios) {
      const grouped: { [date: string]: any[] } = {};
      const myCommunityNames = this.userPisos.map(p => p.comunidades?.nombre?.toLowerCase()).filter(n => !!n);

      for (const [emp, dates] of Object.entries(data.datos.horarios)) {
        for (const [date, tasks] of Object.entries(dates as any)) {
          const myTasks = (tasks as any[]).filter(t => myCommunityNames.includes(t.comunidad.toLowerCase()));
          if (myTasks.length > 0) {
            if (!grouped[date]) grouped[date] = [];
            myTasks.forEach(t => grouped[date].push({ ...t, emp }));
          }
        }
      }
      this.cleaningSchedule = Object.keys(grouped).sort().map(date => ({ date, tasks: grouped[date] }));
    }
  }

  changeMonthLimpieza(delta: number) {
    this.viewDateLimpieza = new Date(this.viewDateLimpieza.getFullYear(), this.viewDateLimpieza.getMonth() + delta, 1);
    this.updateMonthLabels();
    this.loadCleaningSchedule();
  }

  // --- Lógica de Recibos ---
  async loadRecibos() {
    if (this.userPisos.length === 0) return;
    
    this.loading = true;
    const targetAnio = this.viewDateRecibos.getFullYear();
    const hoy = new Date();
    this.allRecibosGrouped = [];
    
    const currentMonth = hoy.getMonth() + 1; // 1-indexed month
    const currentAnio = hoy.getFullYear();

    // 1. Validación de año futuro
    if (targetAnio > currentAnio) {
      console.log("Ignorando año futuro:", targetAnio);
      this.loading = false;
      return;
    }

    // 2. Determinar hasta qué mes mostrar
    const maxMonth = (targetAnio === currentAnio) ? currentMonth : 12;

    // Agrupar comunidades únicas para evitar peticiones repetidas
    const communityIds = [...new Set(this.userPisos.map(p => p.comunidades?.id))].filter(id => !!id);
    const movementsCache = new Map();

    try {
      for (const cid of communityIds) {
        // Fallback: Si el propietario no puede leer toda la tabla de movimientos, 
        // probamos a leer vía extractos (método usado en Finanzas que sabemos que funciona)
        const { data: extractos } = await this.supabase.getExtractosByCommunity(cid);
        const extractosDelAnio = extractos?.filter((e: any) => e.anio_contable === targetAnio) || [];
        
        let movimientosAcumulados: any[] = [];
        for (const ext of extractosDelAnio) {
          // Intentamos cargar los movimientos. Si devuelve 0, es probable que falten permisos RLS para el propietario.
          const { data: movs, error: movError } = await this.supabase.getMovimientosByExtracto(ext.id);
          
          if (movError) {
            console.error(`[ERROR RLS/DB] No se pudieron cargar movimientos del extracto ${ext.id}:`, movError);
          }
          
          if (movs && movs.length > 0) {
            console.log(`[OK] Extracto ${ext.id} (${this.getMesNombre(ext.mes_contable)}): ${movs.length} movimientos encontrados.`);
            movimientosAcumulados = [...movimientosAcumulados, ...movs];
          } else {
            console.warn(`[AVISO] El extracto ${ext.id} no devolvió movimientos. Revisa las políticas RLS de la tabla 'movimientos' en Supabase.`);
          }
        }
        
        movementsCache.set(cid, movimientosAcumulados);
      }

      // Iterar de mes actual hacia atrás para que aparezca lo más reciente primero
      for (let m = maxMonth; m >= 1; m--) {
        const detallesPisosDelMes = [];
        
        for (const p of this.userPisos) {
          const movimientosComunidad = movementsCache.get(p.comunidades?.id) || [];
            const pisoNorm = this.utils.unformatPiso(p.codigo);

          const pagosEncontrados = movimientosComunidad.filter((mov: any) => {
            const d = new Date(mov.fecha);
            const movAnio = d.getFullYear();
            const movMes = d.getMonth() + 1;
              const importe = this.utils.asNumber(mov.importe);

            // Solo ingresos del mes y año correcto
            if (movAnio !== targetAnio || movMes !== m) return false;
            if (importe <= 0) return false; // Solo ingresos

            // 2. Comprobación por piso_detectado (ML/Clasificador)
              const pisoDetectadoNorm = this.utils.unformatPiso(mov.piso_detectado);
            if (pisoDetectadoNorm && pisoDetectadoNorm === pisoNorm) {
              console.log(`  [MATCH!] Mes ${m} - Piso ${pisoNorm}: Encontrado vía piso_detectado`);
              return true;
            }

            // 3. Comprobación por Concepto Original (Desencriptado)
            const descPlana = mov.concepto_original;
              const descNorm = this.utils.unformatPiso(descPlana);
            if (descNorm.includes(pisoNorm)) {
              console.log(`  [MATCH!] Mes ${m} - Piso ${pisoNorm}: Encontrado en descripción: "${descPlana}"`);
              return true;
            }

            // 4. Comprobación por Ordenante (Desencriptado)
            const ordPlano = mov.ordenante;
              const ordNorm = this.utils.unformatPiso(ordPlano);
            if (ordNorm.includes(pisoNorm)) {
              console.log(`  [MATCH!] Mes ${m} - Piso ${pisoNorm}: Encontrado en ordenante: "${ordPlano}"`);
              return true;
            }

            return false;
          });

          const pagado = pagosEncontrados.length > 0;
          const importeTotal = pagosEncontrados.reduce((acc: number, mov: MovimientoBancario) => acc + this.utils.asNumber(mov.importe), 0);
          const fechaUltimoPago = pagado ? [...pagosEncontrados].sort((a: MovimientoBancario, b: MovimientoBancario) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0].fecha : null;
          const esVencido = !pagado && (targetAnio < currentAnio || (targetAnio === currentAnio && m < currentMonth));

          detallesPisosDelMes.push({
            piso: p.codigo,
            comunidad: p.comunidades?.nombre,
            fecha: fechaUltimoPago,
            importe: importeTotal,
            pagado: pagado,
            vencido: esVencido
          });
        }

        this.allRecibosGrouped.push({
          mes: m,
          mesNombre: this.getMesNombre(m),
          detalles: detallesPisosDelMes
        });
      }
    } finally {
      this.loading = false;
    }
  }

  changeMonthRecibos(delta: number) {
    // Navegación anual para recibos
    this.viewDateRecibos = new Date(this.viewDateRecibos.getFullYear(), this.viewDateRecibos.getMonth() + delta, 1);
    console.log(`[DEBUG RECIBOS] Cambiando año de recibos a: ${this.viewDateRecibos.getFullYear()}`);
    this.updateMonthLabels();
    this.loadRecibos();
  }

  // --- Lógica de Contacto ---
  onContactPhotoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.contactForm.photo = file;
    }
  }

  async sendContactMessage() {
    if (!this.contactForm.reason || !this.contactForm.message) {
      this.modalService.showAlert('Campos Pendientes', 'Por favor, rellene el motivo y el mensaje de su comunicación.');
      return;
    }

    this.sendingContact = true;

    const session = await this.supabase.getSession();
    const userEmail = session?.user?.email || 'anonimo@optifincas.com';
    const communityId = this.selectedPiso?.comunidades?.id || null;

    const formData = new FormData();
    formData.append('userName', this.userName);
    formData.append('userEmail', userEmail);
    if (communityId) {
      formData.append('communityId', communityId.toString());
    }
    formData.append('reason', this.contactForm.reason);
    formData.append('message', this.contactForm.message);
    if (this.contactForm.photo) {
      formData.append('photo', this.contactForm.photo);
    }

    try {
      // Llamada al backend para enviar el correo (ajusta la ruta según tu API)
      await lastValueFrom(this.http.post('/api/contacto/enviar', formData));
      this.modalService.showAlert('Éxito', 'Su incidencia ha sido reportada correctamente. El administrador la revisará pronto.');
      this.contactForm = { reason: '', message: '', photo: null };
    } catch (e: any) {
      console.error('[ERROR DE CONTACTO]', e);
      const errorMsg = e.error?.detail || e.message || 'Servidor no disponible';
      this.modalService.showAlert('Error de Envío', `No se pudo entregar el mensaje: ${errorMsg}`);
    } finally {
      this.sendingContact = false;
    }
  }

  get pendingReceiptsList() {
    const list: any[] = [];
    if (!this.allRecibosGrouped) return list;
    this.allRecibosGrouped.forEach(group => {
      if (!group.detalles) return;
      group.detalles.forEach((det: any) => {
        if (!det.pagado && det.vencido) {
          list.push({ ...det, mesNombre: group.mesNombre, anio: this.viewDateRecibos.getFullYear() });
        }
      });
    });
    return list;
  }

  togglePendientes() {
    this.mostrarPendientes = !this.mostrarPendientes;
    console.log('[DEBUG] Mostrar solo pendientes:', this.mostrarPendientes);
  }

  getMesNombre(mes: number | null): string {
    if (!mes) return 'Registro';
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return meses[mes - 1] || 'Mes Desconocido';
  }

  updateMonthLabels() {
    this.currentMonthLabelFinanzas = this.viewDateFinanzas.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    this.currentMonthLabelFinanzas = this.currentMonthLabelFinanzas.charAt(0).toUpperCase() + this.currentMonthLabelFinanzas.slice(1);

    this.currentMonthLabelLimpieza = this.viewDateLimpieza.toLocaleString('es-ES', { month: 'long', year: 'numeric' });
    this.currentMonthLabelLimpieza = this.currentMonthLabelLimpieza.charAt(0).toUpperCase() + this.currentMonthLabelLimpieza.slice(1);

    this.currentMonthLabelRecibos = this.viewDateRecibos.toLocaleString('es-ES', { year: 'numeric' });
    this.currentMonthLabelRecibos = this.currentMonthLabelRecibos.charAt(0).toUpperCase() + this.currentMonthLabelRecibos.slice(1);
  }
}