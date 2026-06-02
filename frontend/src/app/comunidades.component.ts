import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { SupabaseService } from './supabase.service';
import { Router } from '@angular/router';
import { ModalService } from './modal.service';
import { UtilsService } from './utils.service';
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
    nombre: '', direccion: '', servicios: ''
  };
  editandoId: number | null = null;
  mostrarModalEdicionComunidad = false;

  constructor(private http: HttpClient, private supabase: SupabaseService, private router: Router, public utils: UtilsService, public modalService: ModalService) {}

  async ngOnInit() {
    // Pequeña espera para asegurar que la sesión esté propagada en el cliente
    setTimeout(async () => {
      const session = await this.supabase.getSession();
      if (session) {
        await this.cargarComunidades();
      }
    }, 100);
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
      servicios: com.servicios || ''
    };
    this.mostrarModalEdicionComunidad = true;
  }

  cancelarEdicion() {
    this.editandoId = null;
    this.nuevaComunidadForm = {
      nombre: '', direccion: '', servicios: ''
    };
    this.mostrarModalEdicionComunidad = false;
  }

  async guardarComunidad() {
    if (!this.nuevaComunidadForm.nombre || !this.nuevaComunidadForm.direccion) {
      this.modalService.showAlert('Campos Obligatorios', 'Por favor, rellena los campos obligatorios.');
      return;
    }

    this.loading = true;
    try {
      const payload = {
        nombre: this.nuevaComunidadForm.nombre,
        direccion: this.nuevaComunidadForm.direccion,
        servicios: this.nuevaComunidadForm.servicios
      };

      if (this.editandoId) {
        const { data, error } = await this.supabase.updateComunidad(this.editandoId, payload);
        if (error) throw error;
        if (data) {
          const index = this.comunidadesDB.findIndex(c => c.id === this.editandoId);
          this.comunidadesDB[index] = data[0];
          this.modalService.showAlert('Éxito', 'La información de la finca ha sido actualizada.');
        }
      } else {
        const { data, error } = await this.supabase.insertComunidad(payload);
        if (error) throw error;
        if (data) {
          this.comunidadesDB = [data[0], ...this.comunidadesDB];
          this.modalService.showAlert('Éxito', 'Nueva finca registrada correctamente en el sistema.');
        }
      }
      this.cancelarEdicion();
      this.mostrarModalEdicionComunidad = false;
    } catch (err: any) {
      this.modalService.showAlert('Error', 'No se pudo guardar la información: ' + err.message);
    } finally {
      this.loading = false;
    }
  }

  async eliminarComunidad(id: number) {
    const confirmado = await this.modalService.showConfirm('Eliminar Finca', '¿Estás seguro de eliminar esta comunidad? Se borrarán también sus extractos y propietarios.');
    if (!confirmado) return;

    this.loading = true;
    const { error } = await this.supabase.deleteComunidad(id);
    if (error) {
      this.modalService.showAlert('Error', 'Hubo un problema al eliminar el registro.');
    } else {
      this.comunidadesDB = this.comunidadesDB.filter(c => c.id !== id);
    }
    this.loading = false;
  }

  verDashboard(com: ComunidadDB) {
    this.router.navigate(['/comunidades', com.id]);
  }

}