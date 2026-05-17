import { Component } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Component({
  selector: 'app-auth',
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h2>{{ isLogin ? 'Bienvenido de nuevo' : 'Crear cuenta' }}</h2>
          <p>{{ isLogin ? 'Ingresa tus credenciales para continuar' : 'Regístrate para empezar a optimizar' }}</p>
        </div>

        <form (ngSubmit)="handleAuth()" #authForm="ngForm">
          <div class="form-group">
            <label>Correo Electrónico</label>
            <input type="email" name="email" [(ngModel)]="email" required placeholder="ejemplo@correo.com">
          </div>

          <div class="form-group">
            <label>Contraseña</label>
            <input type="password" name="password" [(ngModel)]="password" required placeholder="••••••••">
          </div>

          <div *ngIf="error" class="error-banner">
            {{ error }}
          </div>

          <button type="submit" [disabled]="loading" class="btn-auth">
            {{ loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse') }}
          </button>
        </form>

        <div class="auth-footer">
          <p>
            {{ isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?' }}
            <a (click)="toggleMode()">{{ isLogin ? 'Regístrate' : 'Inicia Sesión' }}</a>
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f0f2f5; font-family: 'Inter', sans-serif;
    }
    .auth-card {
      background: white; padding: 40px; border-radius: 16px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.05); width: 100%; max-width: 400px;
    }
    .auth-header { text-align: center; margin-bottom: 30px; }
    .auth-header h2 { color: #2c3e50; margin: 0 0 10px 0; }
    .auth-header p { color: #64748b; font-size: 0.9rem; margin: 0; }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; font-size: 0.85rem; font-weight: 600; color: #475569; margin-bottom: 8px; }
    .form-group input {
      width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px;
      font-size: 1rem; transition: border-color 0.2s; box-sizing: border-box;
    }
    .form-group input:focus { outline: none; border-color: #3498db; }
    .error-banner {
      background: #fff5f5; color: #c53030; padding: 12px; border-radius: 8px;
      font-size: 0.85rem; margin-bottom: 20px; border: 1px solid #feb2b2;
    }
    .btn-auth {
      width: 100%; padding: 14px; background: #3498db; color: white; border: none;
      border-radius: 8px; font-weight: 600; cursor: pointer; transition: background 0.2s;
    }
    .btn-auth:hover { background: #2980b9; }
    .btn-auth:disabled { background: #94a3b8; cursor: not-allowed; }
    .auth-footer { text-align: center; margin-top: 25px; font-size: 0.9rem; color: #64748b; }
    .auth-footer a { color: #3498db; font-weight: 600; cursor: pointer; text-decoration: none; margin-left: 5px; }
  `]
})
export class AuthComponent {
  isLogin = true;
  loading = false;
  email = '';
  password = '';
  error = '';

  constructor(private supabase: SupabaseService) {}

  toggleMode() {
    this.isLogin = !this.isLogin;
    this.error = '';
  }

  async handleAuth() {
    this.loading = true;
    this.error = '';

    try {
      if (this.isLogin) {
        const { error } = await this.supabase.signInWithPassword(this.email, this.password);
        if (error) throw error;
      } else {
        const { error } = await this.supabase.signUp(this.email, this.password);
        if (error) throw error;
        alert('¡Registro exitoso! Por favor, revisa tu correo electrónico para confirmar tu cuenta.');
      }
    } catch (err: any) {
      this.error = err.message || 'Ocurrió un error inesperado';
    } finally {
      this.loading = false;
    }
  }
}