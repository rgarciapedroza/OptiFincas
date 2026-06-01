import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Piso } from './models';
import { ModalService } from './modal.service';
import { HttpClient } from '@angular/common/http';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-censo',
  templateUrl: './censo.component.html', // Crea este archivo pegando el HTML de propietarios
  styleUrls: ['./comunidades.component.css']
})
export class CensoComponent implements OnInit {
  pisos: Piso[] = [];
  communityId: string | null = null;
  loading = false;
  pisoForm: Piso = { 
    community_id: 0, 
    codigo: '',
    propietario: '',
    email: '',
    telefono1: '',
    telefono2: '',
    observaciones: ''
  };
  editandoPisoId: number | null = null;
  mostrarModalEdicionPiso = false;

  constructor(private route: ActivatedRoute, private supabase: SupabaseService, private http: HttpClient, public modalService: ModalService) {}

  async ngOnInit() {
    // Detección robusta: buscamos en la ruta actual, luego en la del padre, 
    // y finalmente en la del "abuelo" (por si hay más niveles de nesting)
    const idFromSnapshot = (r: ActivatedRoute | null): string | null => {
      if (!r) return null;
      return r.snapshot.paramMap.get('id') || idFromSnapshot(r.parent);
    };

    this.communityId = idFromSnapshot(this.route);

    // Fallback adicional por si el nesting cambia (ej. modal/otros render)
    if (!this.communityId) {
      this.communityId = this.route.snapshot.paramMap.get('id');
    }

    console.log(`[CENSO] ID de comunidad detectado: ${this.communityId}`);


    if (this.communityId) {
      await this.cargarPisos();
    }
  }

  async cargarPisos() {
    if (!this.communityId) return;
    const session = await this.supabase.getSession();
    const headers = { 'Authorization': `Bearer ${session?.access_token}` };
    this.pisos = await lastValueFrom(this.http.get<Piso[]>(`/api/comunidades/${this.communityId}/pisos`, { headers })) || [];
  }

  prepararNuevoPiso() {
    if (!this.communityId) {
      this.modalService.showAlert('Error', 'No se ha podido detectar la comunidad actual. Por favor, recarga la página.');
      return;
    }
    this.editandoPisoId = null;
    this.pisoForm = { 
      community_id: Number(this.communityId), 
      codigo: '',
      propietario: '',
      email: '',
      telefono1: '',
      telefono2: '',
      observaciones: ''
    };
    this.mostrarModalEdicionPiso = true;
  }

  prepararEdicionPiso(p: Piso) {
    this.pisoForm = { ...p };
    // Aseguramos que el ID de comunidad esté presente incluso en edición
    if (!this.pisoForm.community_id && this.communityId) {
      this.pisoForm.community_id = parseInt(this.communityId);
    }
    this.editandoPisoId = p.id || null;
    this.mostrarModalEdicionPiso = true;
  }

  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file && this.communityId) {
      this.loading = true;
      try {
        await this.supabase.importarCenso(this.communityId, file);
        await this.cargarPisos();
      } catch (e: any) {
        this.modalService.showAlert('Error de Importación', 'Hubo un problema al procesar el archivo: ' + e.message);
      } finally {
        this.loading = false;
      }
    }
  }

  async guardarPiso() {
    // Reglas de negocio de Rosmary
    if (!this.pisoForm.codigo) {
      this.modalService.showAlert('Campo Requerido', 'El código de la propiedad (ej: 1ºA) es obligatorio.');
      return;
    }

    if (!this.pisoForm.propietario) {
      this.modalService.showAlert('Campo Requerido', 'Debe indicar el nombre del titular.');
      return;
    }

    if (!this.pisoForm.email && !this.pisoForm.telefono1 && !this.pisoForm.telefono2) {
      this.modalService.showAlert('Información de Contacto', 'Es necesario al menos un Email o un Teléfono.');
      return;
    }

    // Aseguramos que siempre enviamos el ID de la comunidad
    if (!this.communityId) {
      this.modalService.showAlert('Error', 'No se ha podido detectar la comunidad actual. Por favor, recarga la página.');
      return;
    }

    this.loading = true;
    try {
      // Copiamos los datos y eliminamos campos técnicos que el backend no debe recibir o que maneja él
      const datos = { ...this.pisoForm };
      delete (datos as any).id;
      delete (datos as any).created_at;

      // Forzamos el ID de comunidad justo antes de enviar para evitar pérdidas
      const communityIdNumber = Number(this.communityId);
      if (!communityIdNumber || Number.isNaN(communityIdNumber)) {
        throw new Error('ID de comunidad inválido');
      }
      datos.community_id = communityIdNumber;

      if (this.editandoPisoId) await this.supabase.updatePiso(this.editandoPisoId, datos);
      else await this.supabase.createPiso(datos);

      this.modalService.showAlert('Éxito', 'Los datos del propietario se han guardado correctamente.');
      this.mostrarModalEdicionPiso = false;
      await this.cargarPisos();
    } catch (e: any) { 
      this.modalService.showAlert('Error', e.message); 
    } finally {
      this.loading = false;
    }
  }

  async eliminarPiso(id: number) {
    const confirmado = await this.modalService.showConfirm('Borrar Propietario', '¿Estás seguro de eliminar este registro del censo?');
    if (confirmado) {
      await this.supabase.deletePiso(id);
      await this.cargarPisos();
    }
  }
}