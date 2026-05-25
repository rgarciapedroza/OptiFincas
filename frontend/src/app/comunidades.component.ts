import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import { Router } from '@angular/router';
import * as CryptoJS from 'crypto-js';
import {
  Piso,
  ComunidadDB,
  ExtractoProcesado,
  MovimientoBancario,
  FinanzasData,
  ImportProgress,
  DetalleHistorico
} from './models'; // Importamos las interfaces

// Mismas claves que en el backend
const ENCRYPT_KEY = CryptoJS.enc.Utf8.parse('OptiFincasSecretKey2024_Security');
const ENCRYPT_IV = CryptoJS.enc.Utf8.parse('OptiFincas_IV_16');

@Component({
  selector: 'app-comunidades',
  templateUrl: './comunidades.component.html',
  styleUrls: ['./comunidades.component.css']
})
export class ComunidadesComponent implements OnInit {
  loading = false;
  loadingMessage = 'Cargando...';
  error = '';

  // Gestión de Comunidades (DB)
  comunidadesDB: ComunidadDB[] = [];
  nuevaComunidadForm = {
    nombre: '', direccion: '', servicios: '',
    cleaningHours: 1.0, cleaningDaysPerWeek: 1,
    latitude: 0, longitude: 0
  };
  editandoId: string | null = null;
  mostrarModalEdicionComunidad = false;

  // Dashboard State (Stubs to fix compilation errors)
  comunidadSeleccionada: ComunidadDB | null = null;
  seccionDashboard: string = 'propietarios';
  pisos: Piso[] = [];
  pisoForm: any = {};
  editandoPisoId: number | null = null;
  mostrarModalEdicionPiso = false;
  extractoSeleccionado: ExtractoProcesado | null = null;
  selectedMovimientosFile: File | null = null;
  cargandoMovimientos = false;
  importProgress: ImportProgress | null = null;
  currentYearDashboard: number = new Date().getFullYear();
  filteredExtractosList: ExtractoProcesado[] = [];
  filteredMovimientosBancarios: MovimientoBancario[] = [];
  movimientosBancarios: MovimientoBancario[] = [];
  cambiosRealizados = false;
  finanzasData: FinanzasData = { 
    ingresosPorPiso: [], 
    gastos: [], 
    resumenCuentas: { saldoAnterior: 0, ingresosMes: 0, gastosMes: 0, saldoTotal: 0 } 
  };
  extractos: ExtractoProcesado[] = [];

  constructor(private http: HttpClient, private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    // Pequeña espera para asegurar que la sesión esté propagada en el cliente
    setTimeout(async () => {
      const session = await this.supabase.getSession();
      if (session) {
        await this.cargarComunidades();
      }
    }, 100);
  }

  // --- Métodos de Utilidad ---
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
      return res || ciphertext;
    } catch (e) {
      console.warn('Error desencriptando valor:', ciphertext);
      return ''; // Return empty string on error
    }
  }

  // Función para encriptar datos antes de enviarlos a la base de datos
  encryptVal(plaintext: string): string {
    if (!plaintext) return '';
    try {
      const encrypted = CryptoJS.AES.encrypt(plaintext, ENCRYPT_KEY, {
        iv: ENCRYPT_IV,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      });
      return encrypted.toString();
    } catch (e) {
      console.error('Error encriptando valor:', plaintext, e);
      return plaintext;
    }
  }

  // Función para convertir el formato de piso visual (ej. "2º J") a su formato raw (ej. "2J")
  unformatPiso(formattedPiso: string): string {
    if (!formattedPiso || formattedPiso.toLowerCase().includes('desconocido') || formattedPiso.toLowerCase().includes('identificar') || formattedPiso.toLowerCase().includes('asignar')) return '';
    const match = formattedPiso.match(/^(\d+)º\s*([A-Z])$/i);
    if (match) {
      return `${match[1]}${match[2]}`.toUpperCase();
    }
    return formattedPiso.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  // Formatear piso para la vista de dashboard
  formatearPiso(piso: string | undefined): string {
    if (!piso || piso.trim() === '' || piso.toLowerCase() === 'nan' || piso.toLowerCase() === 'none' || (piso.toLowerCase().includes('desconocido') && !piso.toLowerCase().includes('ingresos')) || piso.toLowerCase().includes('identificar')) return 'piso sin identificar';
    const trimmed = piso.trim();
    const upper = trimmed.toUpperCase();
    const match = upper.match(/^(\d+)([A-Z])$/);
    if (match) {
      return `${match[1]}º ${match[2]}`;
    }
    return upper;
  }

  asNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (val === undefined || val === null || String(val).trim() === '') return 0;
    const str = String(val).trim().replace(/\./g, '').replace(',', '.');
    const num = parseFloat(str) || 0;
    return Number(num.toFixed(2));
  }

  getMesNombre(mes: number | null): string {
    if (!mes) return 'Registro';
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return meses[mes - 1] || 'Mes Desconocido';
  }

  private formatDateToUI(dateStr: string): string {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  }

  // --- GESTIÓN DE COMUNIDADES (DB) ---
  async cargarComunidades() {
    this.loading = true;
    this.error = '';
    try {
      const { data, error } = await this.supabase.getComunidades();
      if (error) {
        console.error('[DEBUG] Error detallado de Supabase al cargar comunidades:', error);
        this.error = 'Error al cargar comunidades.';
      } else {
        this.comunidadesDB = data || [];
      }
    } finally {
      this.loading = false;
    }
  }

  prepararNuevaFinca() {
    this.cancelarEdicion();
    this.mostrarModalEdicionComunidad = true;
  }

  prepararEdicion(com: ComunidadDB) {
    this.editandoId = com.id;
    this.nuevaComunidadForm = {
      nombre: com.nombre,
      direccion: com.direccion,
      servicios: com.servicios || '',
      cleaningHours: com.cleaning_hours || 1.0,
      cleaningDaysPerWeek: com.cleaning_days_per_week || 1,
      latitude: com.latitude || 0,
      longitude: com.longitude || 0
    };
    this.mostrarModalEdicionComunidad = true;
  }

  cancelarEdicion() {
    this.editandoId = null;
    this.nuevaComunidadForm = {
      nombre: '', direccion: '', servicios: '',
      cleaningHours: 1.0, cleaningDaysPerWeek: 1,
      latitude: 0, longitude: 0
    };
    this.mostrarModalEdicionComunidad = false;
  }

  async guardarComunidad() {
    if (!this.nuevaComunidadForm.nombre || !this.nuevaComunidadForm.direccion) {
      alert('Por favor, rellena los campos obligatorios.');
      return;
    }

    this.loading = true;
    try {
      const payload = {
        nombre: this.nuevaComunidadForm.nombre,
        direccion: this.nuevaComunidadForm.direccion,
        servicios: this.nuevaComunidadForm.servicios,
        cleaning_hours: this.nuevaComunidadForm.cleaningHours,
        cleaning_days_per_week: this.nuevaComunidadForm.cleaningDaysPerWeek,
        latitude: this.nuevaComunidadForm.latitude,
        longitude: this.nuevaComunidadForm.longitude
      };

      if (this.editandoId) {
        const { data, error } = await this.supabase.updateComunidad(this.editandoId, payload);
        if (error) throw error;
        if (data) {
          const index = this.comunidadesDB.findIndex(c => c.id === this.editandoId);
          this.comunidadesDB[index] = data[0];
          alert('Comunidad actualizada con éxito.');
        }
      } else {
        const { data, error } = await this.supabase.insertComunidad(payload);
        if (error) throw error;
        if (data) {
          this.comunidadesDB = [data[0], ...this.comunidadesDB];
          alert('Comunidad guardada con éxito.');
        }
      }
      this.cancelarEdicion();
      this.mostrarModalEdicionComunidad = false;
    } catch (err: any) {
      alert('Error en la operación: ' + err.message);
    } finally {
      this.loading = false;
    }
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

  async buscarCoordenadas() {
    if (!this.nuevaComunidadForm.direccion) {
      alert('Por favor, introduce una dirección primero.');
      return;
    }

    this.loading = true;
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(this.nuevaComunidadForm.direccion)}`;

    this.http.get<any[]>(url).subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.nuevaComunidadForm.latitude = parseFloat(data[0].lat);
          this.nuevaComunidadForm.longitude = parseFloat(data[0].lon);
          console.log(`[GEO] Ubicación encontrada (Nominatim): ${data[0].display_name}`);
        } else {
          alert('No se han encontrado coordenadas para esa dirección. Intenta ser más específico (ej: añadir ciudad).');
        }
        this.loading = false;
      },
      error: (err) => {
        alert('Error al conectar con el servicio de mapas (Nominatim).');
        this.loading = false;
      }
    });
  }

  verDashboard(com: ComunidadDB) {
    this.router.navigate(['/comunidades', com.id]);
  }

  // Dashboard Methods (Stubs to fix compilation errors)
  setSeccion(seccion: string) { this.seccionDashboard = seccion; }
  onCensoFileSelected(event: any) {}
  onMovimientosFileSelected(event: any) {}
  prepararNuevoPiso() { this.mostrarModalEdicionPiso = true; }
  borrarCensoCompleto() {}
  prepararEdicionPiso(p: Piso) {
    this.pisoForm = { ...p };
    this.editandoPisoId = p.id || null;
    this.mostrarModalEdicionPiso = true;
  }
  eliminarPiso(id: number) {}
  cancelarEdicionPiso() { this.mostrarModalEdicionPiso = false; }
  guardarPiso() {}
  importarMovimientosParaComunidad(id: string) {}
  navegarExtractos(dir: number) {}
  canNavigateExtractos(dir: number): boolean { return true; }
  seleccionarExtracto(ext: any) { this.extractoSeleccionado = ext; }
  eliminarExtracto(ext: any) {}
  generarReportePDF(tipo: string) {}
  actualizarMovimientosDashboard() {}
  cerrarDashboard() {
    this.comunidadSeleccionada = null;
    this.extractoSeleccionado = null;
    this.router.navigate(['/comunidades']);
  }
}