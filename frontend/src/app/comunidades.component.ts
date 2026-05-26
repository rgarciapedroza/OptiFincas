import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import { Router } from '@angular/router';
import {
  ComunidadDB
} from './models'; // Importamos las interfaces

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

}