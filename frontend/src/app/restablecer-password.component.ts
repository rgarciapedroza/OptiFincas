import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';

@Component({
  selector: 'app-restablecer-password',
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="assets/logo.png" alt="OptiFincas">
          <h1 class="logo-text">OptiFincas</h1>
        </div>

        <div class="auth-header">
          <h2>Nueva Contraseña</h2>
          <p>Introduce tu nueva contraseña de acceso</p>
        </div>

        <form (ngSubmit)="handleReset()">
          <div class="form-group">
            <label>Nueva Contraseña</label>
            <input type="password" [(ngModel)]="newPassword" name="pass1" required placeholder="••••••••" class="input-modern">
          </div>

          <div class="form-group">
            <label>Confirmar Contraseña</label>
            <input type="password" [(ngModel)]="confirmPassword" name="pass2" required placeholder="••••••••" class="input-modern">
          </div>

          <div *ngIf="error" class="error-banner">{{ error }}</div>

          <button type="submit" [disabled]="loading" class="btn-auth">
            {{ loading ? 'Actualizando...' : 'Restablecer Contraseña' }}
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      font-family: 'Inter', sans-serif; padding: 20px;
    }
    .auth-logo { display: flex; flex-direction: column; align-items: center; margin-bottom: 25px; gap: 10px; }
    .auth-logo img { width: 60px; height: 60px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
    .logo-text { 
      margin: 0; font-size: 1.5rem; font-weight: 900; 
      background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    }
    .auth-card {
      background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 24px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.1); width: 100%; max-width: 420px;
      backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.8);
      animation: slideUpAuth 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .auth-header { text-align: center; margin-bottom: 30px; }
    .auth-header h2 { color: #1e293b; margin: 0 0 10px 0; font-weight: 800; font-size: 1.6rem; letter-spacing: -0.02em; }
    .auth-header p { color: #64748b; font-size: 0.9rem; margin: 0; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .input-modern {
      width: 100%; padding: 14px 16px; border: 2px solid #f1f5f9; border-radius: 12px;
      font-size: 1rem; transition: all 0.2s; box-sizing: border-box;
      background: #f8fafc; color: #1e293b; font-weight: 500;
    }
    .input-modern:focus { outline: none; border-color: #6366f1; background: white; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); transform: translateY(-1px); }
    .error-banner { background: #fff5f5; color: #c53030; padding: 12px; border-radius: 8px; font-size: 0.85rem; margin-bottom: 20px; border: 1px solid #feb2b2; }
    .btn-auth {
      width: 100%; padding: 16px; background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
      color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s;
      box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3); font-size: 1rem;
    }
    .btn-auth:hover { transform: translateY(-2px); box-shadow: 0 15px 20px -3px rgba(99, 102, 241, 0.4); filter: brightness(1.1); }
    .btn-auth:active { transform: translateY(0); }
    .btn-auth:disabled { background: #94a3b8; cursor: not-allowed; }

    @keyframes slideUpAuth {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class RestablecerPasswordComponent {
  newPassword = '';
  confirmPassword = '';
  loading = false;
  error = '';

  constructor(
    private supabase: SupabaseService,
    private router: Router,
    private modalService: ModalService
  ) {}

  async handleReset() {
    if (this.newPassword.length < 6) {
      this.error = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      const { error } = await this.supabase.updateUserPassword(this.newPassword);
      if (error) throw error;

      this.modalService.showAlert('Éxito', 'Tu contraseña ha sido actualizada. Ya puedes iniciar sesión con tus nuevas credenciales.');
      
      // Cerramos sesión por seguridad y mandamos al login
      await this.supabase.signOut();
      this.router.navigate(['/login']);

    } catch (err: any) {
      this.error = err.message || 'No se pudo actualizar la contraseña. El enlace puede haber caducado.';
    } finally {
      this.loading = false;
    }
  }
}