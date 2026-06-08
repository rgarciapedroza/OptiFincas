import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { filter } from 'rxjs/operators';
import { lastValueFrom } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { FinanzasData, MovimientoBancario, Piso, Factura, Anuncio, IngresoPorPisoReport, GastoReport, IngresoSinIdentificarReport, ResumenCuentasReport } from './models';
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
  juntaGobierno: Piso[] = [];
  loading = true;
  private movementsCache = new Map<number, any[]>();
  loadingMessage: string = 'Cargando...';
  totalCredito: number = 0;
  allRecibosGrouped: any[] = [];
  seccionActiva: 'finanzas' | 'limpieza' | 'recibos' = 'finanzas'; // This is not used anymore as main sections are handled by router
  seccionPrincipalActiva: 'mis-propiedades' | 'mis-recibos' | 'finanzas' | 'limpieza' | 'contactar' | 'actas' | 'facturas' | 'anuncios' = 'mis-propiedades'; // Top-level sections

  // Propiedades para Finanzas
  finanzasData: FinanzasData = {
    ingresosPorPiso: [],
    gastos: [],
    ingresosSinIdentificar: [],
    resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 }
  };
  viewDateFinanzas: Date = new Date();
  currentMonthLabelFinanzas: string = '';
  extractoActualFinanzas: any = null;
  availableExtractosFinanzas: any[] = [];
  currentYearFinanzas: number = new Date().getFullYear();
  facturasMes: Factura[] = [];
  currentYearActas: number = new Date().getFullYear();

  // Propiedades para Limpieza
  cleaningSchedule: { date: string, tasks: any[] }[] = [];
  viewDateLimpieza: Date = new Date();
  currentMonthLabelLimpieza: string = '';

  // Propiedades para Recibos
  viewDateRecibos: Date = new Date();
  currentMonthLabelRecibos: string = '';
  extractoActualRecibos: any = null;
  mostrarPendientes: boolean = false;

  // Anuncios
  anuncios: Anuncio[] = [];
  nuevosAnunciosCount: number = 0;

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
  ) {
    // Escuchar cambios de ruta para actualizar la sección activa dinámicamente
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.detectarSeccionDesdeUrl();
    });
  }

  async ngOnInit() {
    // Detectar sección inicial basándose en la URL actual
    this.detectarSeccionDesdeUrl();

    try {
      const session = await this.supabase.getSession();
      if (session?.user?.email) {
        const { data } = await this.supabase.buscarPisoPorEmail(session.user.email);
        if (data) {
          // Los datos ya vienen desencriptados desde el backend
          this.userPisos = data;
          
          if (this.userPisos.length > 0) {
            // Ahora mostramos el nombre del propietario en lugar del código de la finca
            this.userName = this.userPisos[0].propietario || 'Propietario';
            
            // Cargar primero los extractos (indispensable para la lógica de meses emitidos)
            this.selectedPiso = this.userPisos[0];
            this.updateMonthLabels();
            await this.loadFinanzas();
            await Promise.all([
              this.loadCleaningSchedule(),
              this.loadRecibos(),
              this.loadJuntaGobierno(),
              this.loadAnuncios()
            ]);
          }
        }
      }
    } catch (error) {
      console.error('[PORTAL] Error de inicialización:', error);
    } finally {
      this.loading = false;
      // Refuerzo agresivo para quitar cualquier bloqueo visual
      setTimeout(() => { this.loading = false; }, 1000);
    }
  }

  async refreshData() {
    this.loading = true;
    this.loadingMessage = 'Sincronizando datos con la administración...';
    try {
      await this.ngOnInit(); // Re-ejecuta toda la lógica de carga
      this.modalService.showAlert('Actualizado', 'La información se ha refrescado correctamente.');
    } catch (e) {
      this.modalService.showAlert('Error', 'No se ha podido sincronizar la información.');
    } finally {
      this.loading = false;
    }
  }

  private detectarSeccionDesdeUrl() {
    const url = this.router.url;
    if (url.includes('/portal-propietario/mis-propiedades')) {
      this.seccionPrincipalActiva = 'mis-propiedades';
    } else if (url.includes('/portal-propietario/mis-recibos')) {
      this.seccionPrincipalActiva = 'mis-recibos';
    } else if (url.includes('/portal-propietario/finanzas')) {
      this.seccionPrincipalActiva = 'finanzas';
    } else if (url.includes('/portal-propietario/limpieza')) {
      this.seccionPrincipalActiva = 'limpieza';
    } else if (url.includes('/portal-propietario/anuncios')) {
      this.seccionPrincipalActiva = 'anuncios';
    } else if (url.includes('/portal-propietario/contactar')) {
      this.seccionPrincipalActiva = 'contactar';
    } else {
      this.seccionPrincipalActiva = 'mis-propiedades'; // Default fallback
    }
  }

  // Aseguramos que la junta de gobierno se carga al inicializar o cambiar de piso
  async loadJuntaGobierno() {
    if (!this.selectedPiso?.comunidades?.id) return;
    const session = await this.supabase.getSession();
    const headers = { 'Authorization': `Bearer ${session?.access_token}` };
    const data = await lastValueFrom(this.http.get<Piso[]>(`/api/comunidades/${this.selectedPiso.comunidades.id}/pisos`, { headers }));
    if (data) {
      this.juntaGobierno = data.filter(p => p.cargo && p.cargo !== 'Ninguno');
    }
  }

  async loadPisoData(piso: any) {
    this.loading = true;
    try {
      this.selectedPiso = piso;
      this.updateMonthLabels();
      this.extractoActualRecibos = null;
      this.extractoActualFinanzas = null;
      await Promise.all([
        this.loadFinanzas(),
        this.loadCleaningSchedule(),
        this.loadRecibos(),
        this.loadJuntaGobierno(),
        this.loadAnuncios()
      ]);
    } finally {
      this.loading = false;
    }
  }

  async loadAnuncios() {
    const communityId = this.selectedPiso?.comunidades?.id || this.selectedPiso?.community_id;
    if (!communityId) return;

    const session = await this.supabase.getSession();
    if (!session) return;
    
    const { data } = await this.supabase.getAnunciosWithReadStatus(communityId, session.user.id);
    this.anuncios = data || [];

    // Contamos anuncios no leídos según el estado de la base de datos
    this.nuevosAnunciosCount = this.anuncios.filter(a => !a.is_read_by_me).length;

    // Si el usuario ya está en la sección de anuncios, los marcamos como leídos automáticamente
    if (this.seccionPrincipalActiva === 'anuncios') {
      this.marcarTodosAnunciosComoLeidos();
    }
  }

  async marcarAnuncioIndividualComoLeido(anuncio: Anuncio) {
    const session = await this.supabase.getSession();
    if (!session || !anuncio.id) return;
    
    await this.supabase.markAnuncioAsRead(anuncio.id, session.user.id);
    anuncio.is_read_by_me = true;
    this.nuevosAnunciosCount = this.anuncios.filter(a => !a.is_read_by_me).length;
  }

  async marcarTodosAnunciosComoLeidos() {
    const session = await this.supabase.getSession();
    if (!session) return;

    const unread = this.anuncios.filter(a => !a.is_read_by_me);
    for (const a of unread) {
      if (a.id) {
        await this.supabase.markAnuncioAsRead(a.id, session.user.id);
        a.is_read_by_me = true;
      }
    }
    this.nuevosAnunciosCount = 0;
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

  async setSeccionPrincipal(seccion: 'mis-propiedades' | 'mis-recibos' | 'finanzas' | 'limpieza' | 'contactar' | 'actas' | 'facturas' | 'anuncios') {
    // Si el usuario entra en la sección de anuncios, limpiamos las notificaciones
    if (seccion === 'anuncios') {
      await this.marcarTodosAnunciosComoLeidos();
    }

    // Navegación mediante router para cumplir con el requisito de "páginas distintas"
    if (seccion === 'actas' && this.selectedPiso?.comunidades?.id) {
      this.router.navigate(['/portal-propietario/actas', this.selectedPiso.comunidades.id]);
      return;
    }
    if (seccion === 'facturas' && this.selectedPiso?.comunidades?.id) {
      this.router.navigate(['/portal-propietario/facturas', this.selectedPiso.comunidades.id]);
      return;
    }
    this.router.navigate(['/portal-propietario', seccion]);
  }

  // --- Lógica de Finanzas ---
  async loadFinanzas() {
    if (!this.selectedPiso?.comunidades?.id) return;
    const { data: extData } = await this.supabase.getExtractosByCommunity(this.selectedPiso.comunidades.id);
    this.availableExtractosFinanzas = extData || [];
    
    if (this.extractoActualFinanzas) {
      await this.cargarDetalleFinanzas();
    }
  }

  isMonthPaid(group: any): boolean {
    if (!group || !group.detalles) return false;
    // El mes está "al día" si todos los recibos de las propiedades del usuario están pagados
    return group.detalles.every((d: any) => d.pagado);
  }

  async cargarDetalleFinanzas() {
    if (!this.extractoActualFinanzas) return;
    this.loading = true;
    try {
        const mes = this.extractoActualFinanzas.mes_contable;
        const anio = this.extractoActualFinanzas.anio_contable;
        const session = await this.supabase.getSession();
        const headers = { 'Authorization': `Bearer ${session?.access_token}` };

        // LLAMADA AL BACKEND: Usamos el endpoint de finanzas que ya filtra por mes y año
        const data = await lastValueFrom(this.http.get<FinanzasData>(
          `/api/comunidades/${this.selectedPiso.comunidades.id}/finanzas?mes=${mes}&anio=${anio}`, 
          { headers }
        ));
        
        if (data) {
          // Identificamos los pisos del usuario para resaltarlos en la lista
          const misPisosNorm = new Set(this.userPisos.map(p => this.utils.unformatPiso(p.codigo)));
          
          data.ingresosPorPiso = data.ingresosPorPiso.map((p: any) => ({
            ...p,
            esMio: misPisosNorm.has(this.utils.unformatPiso(p.codigo))
          })).sort((a: any, b: any) => 
            a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' })
          );

          // Ordenar ingresos sin identificar por fecha descendente
          if (data.ingresosSinIdentificar) {
            data.ingresosSinIdentificar.sort((a: any, b: any) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
          }

          this.finanzasData = data;
          await this.cargarFacturas();
        }
    } finally {
      this.loading = false;
    }
  }

  async cargarFacturas() {
    if (!this.selectedPiso?.comunidades?.id) return;
    const { data } = await this.supabase.getFacturas(this.selectedPiso.comunidades.id);
    this.facturasMes = data || [];
  }

  getFacturaGasto(movimientoId: number): Factura | undefined {
    // Coerción de tipos para garantizar que el propietario vea los documentos
    return this.facturasMes.find(f => Number(f.movimiento_id) === Number(movimientoId));
  }

  verFactura(factura: Factura | undefined) {
    if (factura) {
      window.open(factura.url_archivo, '_blank');
    }
  }

  get extractosFinanzasFiltrados() {
    const hoy = new Date();
    const currentM = hoy.getMonth() + 1;
    const currentY = hoy.getFullYear();
    return this.availableExtractosFinanzas.filter(e => 
      e.anio_contable === this.currentYearFinanzas && 
      (e.anio_contable < currentY || (e.anio_contable === currentY && e.mes_contable <= currentM))
    );
  }

  cambiarAnioFinanzas(delta: number) {
    this.currentYearFinanzas += delta;
  }

  cambiarAnioActas(delta: number) {
    this.currentYearActas += delta;
  }

  async seleccionarExtractoFinanzas(ext: any) {
    this.extractoActualFinanzas = ext;
    this.updateMonthLabels();
    await this.cargarDetalleFinanzas();
  }

  async changeMonthFinanzas(delta: number) {
    if (!this.extractoActualFinanzas) return;
    
    // Buscamos el índice del extracto actual en la lista filtrada por año
    const lista = this.extractosFinanzasFiltrados;
    const currentIndex = lista.findIndex(e => e.id === this.extractoActualFinanzas?.id);

    if (currentIndex !== -1) {
      // delta 1 (Siguiente) -> índice menor en lista desc / delta -1 (Anterior) -> índice mayor
      const nextIndex = currentIndex - delta;
      if (nextIndex >= 0 && nextIndex < lista.length) {
        await this.seleccionarExtractoFinanzas(lista[nextIndex]);
      } else {
        this.modalService.showAlert('Navegación', 'No hay más meses cerrados en esta dirección para el año seleccionado.');
      }
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
      // Convertir el objeto finanzasData a snake_case para el backend
      const backendPayload = {
        ingresosPorPiso: (this.finanzasData.ingresosPorPiso || []).map((item: IngresoPorPisoReport) => ({
          codigo: item.codigo,
          fecha: item.fecha || '',
          importe: item.importe,
        })),
        gastos: (this.finanzasData.gastos || []).map((item: GastoReport) => ({
          categoria: item.categoria, // Incluir categoría
          concepto: item.concepto,
          importe: item.importe,
        })),
        ingresosSinIdentificar: (this.finanzasData.ingresosSinIdentificar || []).map((item: IngresoSinIdentificarReport) => ({
          observaciones: item.observaciones,
          fecha: item.fecha || '',
          importe: item.importe
        })),
        resumenCuentas: {
          saldoAnterior: this.finanzasData.resumenCuentas.saldoAnterior,
          ingresosMes: this.finanzasData.resumenCuentas.ingresosMes,
          gastosMes: this.finanzasData.resumenCuentas.gastosMes,
          saldoTotal: this.finanzasData.resumenCuentas.saldoTotal // Incluir saldoTotal
        },
      };
      
      // Aplicar la conversión a snake_case para el backend
      const payload = this.convertToSnakeCase(backendPayload);

      // Debug: imprimir payload real que se envía
      // (Esto ayuda a comprobar si llega camelCase o snake_case al backend)
      console.log('[PORTAL] backendPayload (finanzas)=', JSON.stringify(backendPayload));
      console.log('[PORTAL] payload enviado (finanzas)=', JSON.stringify(payload));

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
    this.totalCredito = 0;
    this.allRecibosGrouped = [];
    
    const currentMonth = hoy.getMonth() + 1; // 1-indexed month
    const currentAnio = hoy.getFullYear();

    // 1. Validación de año futuro
    if (targetAnio > currentAnio) {
      console.log("Ignorando año futuro:", targetAnio);
      this.loading = false;
      return;
    }

    this.movementsCache.clear();

    try {
      const session = await this.supabase.getSession();
      const headers = { 'Authorization': `Bearer ${session?.access_token}` };

      // Cargamos el historial completo de movimientos para cada propiedad del usuario.
      // Esto es CRÍTICO: permite que pagos de años anteriores que generaron crédito 
      // para el año actual sean visibles en este panel, eliminando los huecos "fantasma".
      const floorRequests = this.userPisos.map(p => {
        const pisoNorm = this.utils.unformatPiso(p.codigo);
        const cid = p.comunidades?.id || p.community_id;
        return lastValueFrom(this.http.get<any[]>(`/api/comunidades/${cid}/movimientos?piso_codigo=${encodeURIComponent(pisoNorm)}`, { headers }))
          .then(movs => ({ id: p.id, movs }))
          .catch(() => ({ id: p.id, movs: [] }));
      });

      const results = await Promise.all(floorRequests);
      results.forEach(res => this.movementsCache.set(res.id, res.movs));

      // Calcular crédito acumulado global del usuario (sobrante no consumido)
      let globalCredit = 0;
      this.movementsCache.forEach((movs) => {
        let pisoCredit = 0;
        movs.forEach((mov: any) => {
          const asigs = mov.detalle_asignacion_cuotas;
          if (Array.isArray(asigs)) {
            asigs.forEach((a: any) => {
              if (a.mes_destino === 'CREDITO_ACUMULADO') pisoCredit += this.utils.asNumber(a.importe_aplicado);
              if (a.pago_id === 'CREDITO_PREVIO') pisoCredit -= this.utils.asNumber(a.importe_aplicado);
            });
          }
        });
        globalCredit += pisoCredit;
      });
      this.totalCredito = Math.max(0, globalCredit);

      // Iterar de mes actual hacia atrás para que aparezca lo más reciente primero
      for (let m = 12; m >= 1; m--) {
        // Solo incluir el mes si hay un registro contable (extracto) en la base de datos
        const hasExtract = this.availableExtractosFinanzas.some(e => e.anio_contable === targetAnio && e.mes_contable === m);
        if (!hasExtract) continue;

        const detallesPisosDelMes = [];
        let totalMes = 0;
        let mesIsFromCredit = false;

        for (const p of this.userPisos) {
          const historialMovimientos = this.movementsCache.get(p.id) || [];
            const pisoNorm = this.utils.unformatPiso(p.codigo);
            const targetMonthStr = `${targetAnio}-${String(m).padStart(2, '0')}`;
          
          let totalAbonado = 0;
          const desgloseDePagos: any[] = [];

          historialMovimientos.forEach((mov: any) => {
            const importe = this.utils.asNumber(mov.importe);

            const asigs = mov.detalle_asignacion_cuotas;
            const hasMotorData = Array.isArray(asigs) && asigs.length > 0;
            if (hasMotorData) {
              const asig = asigs.find((a: any) => a.mes_destino === targetMonthStr);
              if (asig) {
                const monto = this.utils.asNumber(asig.importe_aplicado);
                totalAbonado += monto;

                const dateParts = mov.fecha.split('-');
                const movY = parseInt(dateParts[0], 10);
                const movM = parseInt(dateParts[1], 10);
                
                const isFromCredit = (asig.pago_id === 'CREDITO_PREVIO' || 
                                     movY !== targetAnio || 
                                     movM !== m);
                
                if (isFromCredit) mesIsFromCredit = true;

                desgloseDePagos.push({ 
                  fecha: mov.fecha, 
                  importe: monto, 
                  concepto: mov.concepto_original,
                  isFromCredit 
                });
              }
            } else {
              const dateParts = mov.fecha.split('-');
              if (dateParts.length >= 2 && parseInt(dateParts[0], 10) === targetAnio && parseInt(dateParts[1], 10) === m) {
                totalAbonado += importe;
                desgloseDePagos.push({ fecha: mov.fecha, importe: importe, concepto: mov.concepto_original, isFromCredit: false });
              }
            }
          });

          const cuotaEsperada = p.cuota_base || p.comunidades?.cuota_base || 0;
          const isPaid = totalAbonado >= cuotaEsperada && cuotaEsperada > 0;
          const esVencido = !isPaid && (targetAnio < currentAnio || (targetAnio === currentAnio && m < currentMonth));
          
          totalMes += totalAbonado;

          detallesPisosDelMes.push({
            piso: p.codigo,
            comunidad: p.comunidades?.nombre,
            totalAbonado: totalAbonado,
            cuota: cuotaEsperada,
            pagado: isPaid,
            vencido: esVencido,
            status: totalAbonado >= cuotaEsperada ? 'PAGADO' : (totalAbonado > 0 ? 'PARCIAL' : 'PENDIENTE'),
            movs: desgloseDePagos.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
          });
        }

        this.allRecibosGrouped.push({
          mes: m,
          mesNombre: this.getMesNombre(m),
          total: totalMes,
          isFromCredit: mesIsFromCredit,
          detalles: detallesPisosDelMes
        });
      }
    } finally {
      this.loading = false;
    }
  }

  async changeMonthRecibos(delta: number) {
    if (this.extractoActualRecibos) {
      // Si hay un mes seleccionado, navegamos por el array de meses
      const currentIndex = this.allRecibosGrouped.findIndex(g => g.mes === this.extractoActualRecibos.mes);
      if (currentIndex !== -1) {
        const nextIndex = currentIndex - delta; // delta 1 (Siguiente) -> índice menor (más reciente)
        if (nextIndex >= 0 && nextIndex < this.allRecibosGrouped.length) {
          this.seleccionarMesRecibo(this.allRecibosGrouped[nextIndex]);
          return;
        } else {
          // Si nos salimos del año, cambiamos de año y cargamos los nuevos meses
          const yearDelta = delta > 0 ? 1 : -1;
          this.viewDateRecibos = new Date(this.viewDateRecibos.getFullYear() + yearDelta, 0, 1);
          this.updateMonthLabels();
          this.extractoActualRecibos = null;
          await this.loadRecibos();
          if (this.allRecibosGrouped.length > 0) {
            this.seleccionarMesRecibo(this.allRecibosGrouped[delta > 0 ? this.allRecibosGrouped.length - 1 : 0]);
          }
          return;
        }
      }
    }
    const yearDelta = (Math.abs(delta) === 12) ? delta / 12 : (delta > 0 ? 1 : -1);
    this.viewDateRecibos = new Date(this.viewDateRecibos.getFullYear() + yearDelta, 0, 1);
    this.updateMonthLabels();
    this.extractoActualRecibos = null;
    await this.loadRecibos();
  }

  seleccionarMesRecibo(group: any) {
    this.extractoActualRecibos = group;
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
    if (this.userPisos.length === 0 || this.availableExtractosFinanzas.length === 0) return list;

    // Para que coincida con el admin, revisamos todos los extractos históricos de la comunidad
    this.availableExtractosFinanzas.forEach(ext => {
      const y = ext.anio_contable;
      const m = ext.mes_contable;
      const targetMonthStr = `${y}-${String(m).padStart(2, '0')}`;

      this.userPisos.forEach(p => {
        const movs = this.movementsCache.get(p.id) || [];
        let totalAbonado = 0;
        const cuotaEsperada = p.cuota_base || p.comunidades?.cuota_base || 0;

        movs.forEach((mov: any) => {
          const asigs = mov.detalle_asignacion_cuotas;
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
            piso: p.codigo,
            comunidad: p.comunidades?.nombre,
            totalAbonado: totalAbonado,
            cuota: cuotaEsperada,
            pagado: false,
            anio: y,
            mes: m,
            mesNombre: this.getMesNombre(m),
            status: totalAbonado > 0 ? 'PARCIAL' : 'PENDIENTE'
          });
        }
      });
    });

    // Ordenar de más reciente a más antiguo (cascada histórica completa)
    return list.sort((a, b) => (b.anio * 100 + b.mes) - (a.anio * 100 + a.mes));
  }

  togglePendientes() {
    this.mostrarPendientes = !this.mostrarPendientes;
    this.extractoActualRecibos = null;
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