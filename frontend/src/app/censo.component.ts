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
  cargosDisponibles = ['Ninguno', 'Presidente', 'Vicepresidente', 'Secretario', 'Tesorero', 'Vocal'];

  pisoForm: Piso = { 
    community_id: 0, 
    codigo: '',
    propietario: '',
    email: '',
    telefono1: '',
    telefono2: '',
    observaciones: '',
    cargo: 'Ninguno'
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

  /**
   * Devuelve los propietarios que tienen un cargo asignado, ordenados por relevancia.
   */
  get juntaGobierno(): Piso[] {
    const orden = { 'Presidente': 1, 'Vicepresidente': 2, 'Secretario': 3, 'Tesorero': 4, 'Vocal': 5 };
    return this.pisos
      .filter(p => p.cargo && p.cargo !== 'Ninguno')
      .sort((a, b) => {
        return (orden[a.cargo as keyof typeof orden] || 9) - (orden[b.cargo as keyof typeof orden] || 9);
      });
  }

  async cargarPisos() {
    if (!this.communityId) return;
    const session = await this.supabase.getSession();
    const headers = { 'Authorization': `Bearer ${session?.access_token}` };
    const data = await lastValueFrom(this.http.get<Piso[]>(`/api/comunidades/${this.communityId}/pisos`, { headers })) || [];
    
    // Ordenación alfanumérica natural (maneja correctamente 1, 2, 10...)
    this.pisos = data.sort((a, b) => 
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' }));
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
      observaciones: '',
      cargo: 'Ninguno'
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

    // Validación: No permitir más de un cargo por persona (email) en la comunidad
    if (this.pisoForm.cargo && this.pisoForm.cargo !== 'Ninguno' && this.pisoForm.email) {
      const emailNorm = this.pisoForm.email.toLowerCase().trim();
      const duplicado = this.pisos.find(p => 
        p.email?.toLowerCase().trim() === emailNorm && 
        p.id !== this.editandoPisoId && 
        p.cargo && p.cargo !== 'Ninguno'
      );
      if (duplicado) {
        this.modalService.showAlert('Cargo Duplicado', `Esta persona ya tiene asignado el cargo de "${duplicado.cargo}" en la propiedad ${duplicado.codigo}. Solo se permite un cargo por persona.`);
        return;
      }

      // Nueva Validación 2: No puede haber dos personas con el mismo tipo de cargo en la misma comunidad
      const cargoDuplicadoTipo = this.pisos.find(p =>
        p.community_id === Number(this.communityId) && // Asegurarse de que es la misma comunidad
        p.id !== this.editandoPisoId && // Excluir el piso actual que se está editando
        p.cargo === this.pisoForm.cargo // Comprobar el mismo cargo exacto
      );
      if (cargoDuplicadoTipo) {
        this.modalService.showAlert('Cargo Duplicado', `Ya existe un "${this.pisoForm.cargo}" en el piso ${cargoDuplicadoTipo.codigo} de esta comunidad. Solo puede haber uno de cada cargo.`);
        return;
      }
    }

    this.loading = true;
    try {
      // Copiamos los datos y eliminamos campos técnicos que el backend no debe recibir o que maneja él
      const datos = { 
        ...this.pisoForm,
        cargo: this.pisoForm.cargo === 'Ninguno' ? null : this.pisoForm.cargo
      };
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

  /**
   * Elimina el cargo de un propietario específico.
   * @param piso El objeto Piso del que se eliminará el cargo.
   */
  async eliminarCargo(piso: Piso) {
    const confirmado = await this.modalService.showConfirm('Eliminar Cargo', `¿Estás seguro de eliminar el cargo de "${piso.cargo}" a ${piso.propietario} (${piso.codigo})?`);
    if (confirmado) {
      this.loading = true;
      try {
        const payload = { ...piso, cargo: 'Ninguno' }; // Establecer el cargo a 'Ninguno'
        await this.supabase.updatePiso(piso.id!, payload);
        this.modalService.showAlert('Éxito', 'El cargo ha sido eliminado correctamente.');
        await this.cargarPisos(); // Recargar para actualizar la lista
      } catch (e: any) {
        this.modalService.showAlert('Error', 'No se pudo eliminar el cargo: ' + (e.message || 'Error desconocido'));
      } finally {
        this.loading = false;
      }
    }
  }
}