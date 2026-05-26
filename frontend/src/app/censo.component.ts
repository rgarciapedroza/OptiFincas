import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Piso } from './models';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-censo',
  templateUrl: './censo.component.html', // Crea este archivo pegando el HTML de propietarios
  styleUrls: ['./comunidades.component.css']
})
export class CensoComponent implements OnInit {
  pisos: Piso[] = [];
  communityId: string | null = null;
  loading = false;
  pisoForm: Piso = { community_id: 0, codigo: '' };
  editandoPisoId: number | null = null;
  mostrarModalEdicionPiso = false;

  constructor(private route: ActivatedRoute, private supabase: SupabaseService, private http: HttpClient) {}

  async ngOnInit() {
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      await this.cargarPisos();
    }
  }

  async cargarPisos() {
    if (!this.communityId) return;
    this.pisos = await this.http.get<Piso[]>(`/api/comunidades/${this.communityId}/pisos`).toPromise() || [];
  }

  prepararNuevoPiso() {
    this.editandoPisoId = null;
    this.pisoForm = { community_id: parseInt(this.communityId!), codigo: '' };
    this.mostrarModalEdicionPiso = true;
  }

  prepararEdicionPiso(p: Piso) {
    this.pisoForm = { ...p };
    this.editandoPisoId = p.id || null;
    this.mostrarModalEdicionPiso = true;
  }

  async guardarPiso() {
    this.loading = true;
    try {
      const { id, created_at, ...datos } = this.pisoForm as any;
      if (this.editandoPisoId) {
        await this.supabase.updatePiso(this.editandoPisoId, datos);
      } else {
        await this.supabase.createPiso(datos);
      }
      this.mostrarModalEdicionPiso = false;
      await this.cargarPisos();
    } catch (e: any) { alert(e.message); }
    finally { this.loading = false; }
  }

  async eliminarPiso(id: number) {
    if (confirm('¿Borrar propietario?')) {
      await this.supabase.deletePiso(id);
      await this.cargarPisos();
    }
  }
}