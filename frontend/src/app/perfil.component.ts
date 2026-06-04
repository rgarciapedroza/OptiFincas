import { Component, OnInit } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { Profile } from './models';

@Component({
  selector: 'app-perfil',
  template: `
    <div class="card-container" style="max-width: 600px; margin: 0 auto; animation: fadeIn 0.4s ease;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 30px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px;">
        <h2 class="section-title" style="margin: 0;">Mi Perfil</h2>
        <button class="btn" [class.btn-info]="!editMode" [class.btn-secondary]="editMode" (click)="toggleEdit()">
          {{ editMode ? 'Cancelar' : 'Editar Perfil' }}
        </button>
      </div>

      <div style="display: flex; flex-direction: column; align-items: center; gap: 25px;">
        <!-- Avatar Section -->
        <div style="position: relative;">
          <div style="width: 120px; height: 120px; border-radius: 50%; background: #f1f5f9; overflow: hidden; border: 4px solid white; box-shadow: 0 4px 12px rgba(0,0,0,0.1); display: flex; align-items: center; justify-content: center;">
            <img *ngIf="profile?.avatar_url" [src]="profile?.avatar_url" style="width: 100%; height: 100%; object-fit: cover;">
            <svg *ngIf="!profile?.avatar_url" width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
          </div>
          <label *ngIf="editMode" class="btn-action" style="position: absolute; bottom: 0; right: 0; background: #6366f1; color: white; border-radius: 50%; padding: 8px; cursor: pointer; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>
            <input type="file" (change)="onFileSelected($event)" accept="image/*" hidden>
          </label>
        </div>

        <!-- Profile Info -->
        <div style="width: 100%; display: flex; flex-direction: column; gap: 20px;">
          <div class="form-group">
            <label>Correo Electrónico</label>
            <input [value]="profile?.email" class="input-concepto-edit" disabled style="background: #f8fafc; cursor: not-allowed;">
            <small style="color: #94a3b8;">El email no se puede cambiar por motivos de seguridad.</small>
          </div>

          <div class="form-group">
            <label>Nombre Completo</label>
            <input [(ngModel)]="form.full_name" [disabled]="!editMode" class="input-concepto-edit" placeholder="Tu nombre completo">
          </div>

          <div class="form-group">
            <label>Teléfono Móvil 1</label>
            <input [(ngModel)]="form.phone1" [disabled]="!editMode" class="input-concepto-edit" placeholder="Ej: 600 000 000">
          </div>
          
          <div class="form-group">
            <label>Teléfono Móvil 2 (Opcional)</label>
            <input [(ngModel)]="form.phone2" [disabled]="!editMode" class="input-concepto-edit" placeholder="Ej: 600 000 000">
          </div>

          <div class="form-group">
            <label>Rol en el sistema</label>
            <span class="badge" style="width: fit-content; text-transform: uppercase; background: #e0e7ff; color: #4338ca;">{{ profile?.role }}</span>
          </div>
        </div>

        <button *ngIf="editMode" class="btn btn-success" style="width: 100%; margin-top: 10px;" (click)="saveProfile()" [disabled]="loading">
          {{ loading ? 'Guardando...' : 'Guardar Cambios' }}
        </button>
      </div>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
})
export class PerfilComponent implements OnInit {
  profile: Profile | null = null;
  editMode = false;
  loading = false;
  form = {
    full_name: '',
    phone1: '',
    phone2: ''
  };
  selectedFile: File | null = null;

  constructor(private supabase: SupabaseService, private modalService: ModalService) {}

  async ngOnInit() {
    const session = await this.supabase.getSession();
    if (session) {
      await this.loadProfile(session.user.id);
    }
  }

  async loadProfile(userId: string) {
    const { data } = await this.supabase.getProfile(userId);
    if (data) {
      this.profile = data;
      
      // Si el perfil está incompleto, buscamos en el censo para sincronizar inicialmente
      if (!data.full_name || !data.phone1) {
        try {
          const { data: censusData } = await this.supabase.buscarPisoPorEmail(data.email);
          if (censusData && censusData.length > 0) {
            const infoCenso = censusData[0];
            this.form.full_name = data.full_name || infoCenso.propietario || '';
            this.form.phone1 = data.phone1 || infoCenso.telefono1 || '';
            this.form.phone2 = data.phone2 || infoCenso.telefono2 || '';
          } else {
            this.form.full_name = data.full_name || '';
            this.form.phone1 = data.phone1 || '';
            this.form.phone2 = data.phone2 || '';
          }
        } catch (e) {
          console.error("Error recuperando info del censo para el perfil", e);
        }
      } else {
        this.form.full_name = data.full_name || '';
        this.form.phone1 = data.phone1 || '';
        this.form.phone2 = data.phone2 || '';
      }
    }
  }

  toggleEdit() {
    this.editMode = !this.editMode;
    if (!this.editMode && this.profile) {
      this.form.full_name = this.profile.full_name || '';
      this.form.phone1 = this.profile.phone1 || '';
      this.form.phone2 = this.profile.phone2 || '';
      this.selectedFile = null;
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      this.selectedFile = file;
      const reader = new FileReader();
      reader.onload = (e: any) => {
        if (this.profile) this.profile.avatar_url = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async saveProfile() {
    if (!this.profile) return;
    this.loading = true;

    try {
      let avatarUrl = this.profile.avatar_url;

      if (this.selectedFile) {
        avatarUrl = await this.supabase.uploadAvatar(this.profile.id, this.selectedFile);
      }

      const updates = {
        full_name: this.form.full_name,
        phone1: this.form.phone1,
        phone2: this.form.phone2,
        avatar_url: avatarUrl,
        updated_at: new Date()
      };

      const { error } = await this.supabase.updateProfile(this.profile.id, updates);
      if (error) throw error;
      // Sincronizar con los registros de pisos asociados al email del usuario
      await this.supabase.syncPisosFromProfile(this.profile.id, this.form.full_name, this.form.phone1, this.form.phone2);

      this.modalService.showAlert('Éxito', 'Tu perfil ha sido actualizado correctamente.');
      this.editMode = false;
      this.selectedFile = null;
      await this.loadProfile(this.profile.id);
    } catch (e: any) {
      this.modalService.showAlert('Error', 'No se pudieron guardar los cambios: ' + e.message);
    } finally {
      this.loading = false;
    }
  }
}