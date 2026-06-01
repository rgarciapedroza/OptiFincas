import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';

@Component({
  selector: 'app-auth',
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-header">
          <h2>{{ isLogin ? 'Bienvenido de nuevo' : 'Crear cuenta' }}</h2>
          <p>{{ isLogin ? 'Ingresa tus credenciales para continuar' : 'Regístrate para empezar a optimizar' }}</p>
        </div>

        <!-- Selector de Tipo de Registro (Solo visible en Sign Up) -->
        <div class="type-selector" *ngIf="!isLogin">
          <button type="button" [class.active]="regType === 'propietario'" (click)="regType = 'propietario'">Soy Propietario</button>
          <button type="button" [class.active]="regType === 'profesional'" (click)="regType = 'profesional'">Soy Profesional</button>
        </div>

        <form (ngSubmit)="handleAuth()" #authForm="ngForm">
          <!-- Campo Nombre de Empresa (Solo para profesionales) -->
          <div class="form-group" *ngIf="!isLogin && regType === 'profesional'">
            <label>Nombre del Despacho / Empresa</label>
            <input type="text" name="orgName" [(ngModel)]="orgName" required placeholder="Ej: Administraciones García Pedroza S.L.">
          </div>

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
    .type-selector { display: flex; gap: 10px; margin-bottom: 25px; background: #f1f5f9; padding: 5px; border-radius: 10px; }
    .type-selector button { 
      flex: 1; padding: 10px; border: none; border-radius: 8px; font-size: 0.85rem; font-weight: 600; 
      cursor: pointer; background: transparent; color: #64748b; transition: all 0.2s;
    }
    .type-selector button.active { background: white; color: #3498db; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
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
export class AuthComponent implements OnInit {
  isLogin = true;
  loading = false;
  email = '';
  password = '';
  orgName = ''; // Nuevo campo
  regType: 'propietario' | 'profesional' = 'propietario'; // Tipo de registro
  error = '';

  constructor(
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    private router: Router,
    public modalService: ModalService // Inyectamos el ModalService
  ) {}

  ngOnInit() {
    // Detectamos si venimos desde la landing con parámetros de registro
    this.route.queryParams.subscribe(params => {
      if (params['mode'] === 'signup') this.isLogin = false;
      if (params['type'] === 'profesional' || params['type'] === 'propietario') 
        this.regType = params['type'];
    });
  }

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
        if (this.regType === 'propietario') {
          // VALIDACIÓN PARA PROPIETARIOS
          const emailNorm = this.email.toLowerCase().trim();
          const resAuth = await this.supabase.verificarEmailAutorizado(emailNorm);
          
          if (resAuth.error || resAuth.data !== true) {
            this.modalService.showAlert('Acceso Denegado', 'Su correo no está registrado como propietario. Contacte con su administrador.');
            this.loading = false;
            return;
          }

          const { error } = await this.supabase.signUp(this.email, this.password, {
            data: { is_professional: false, is_propietario: true } // Metadatos para el trigger
          });
          if (error) throw error;
        } else {
          // REGISTRO PARA PROFESIONALES (Empresas)
          if (!this.orgName) {
            this.error = 'Por favor, introduce el nombre de tu despacho.';
            this.loading = false;
            return;
          }
          
          // 1. Verificar si ya existe un perfil con este email
          const { data: existingProfile } = await this.supabase.getProfileByEmail(this.email);

          if (existingProfile) {
            // Si el perfil ya existe, no permitimos un nuevo registro con el mismo email
            // y redirigimos a la página de espera si ya está vinculado a una organización
            // o informamos que ya tiene una cuenta.
            if (existingProfile.organizacion_id && existingProfile.organizacion_id !== null) {
              // Ya está vinculado a una organización
              const { data: orgData } = await this.supabase.verificarOrganizacionExiste(this.orgName);
              if (orgData && orgData.id === existingProfile.organizacion_id) {
                // Es la misma organización, redirigir según el status
                if (existingProfile.status === 'approved') {
                  this.modalService.showAlert('Acceso Aprobado', 'Ya tienes acceso a esta organización. Por favor, inicia sesión.');
                } else {
                  this.router.navigate(['/esperando-aprobacion'], { queryParams: { empresa: this.orgName, status: existingProfile.status } });
                }
              } else {
                // Vinculado a otra organización
                this.modalService.showAlert('Acceso Denegado', 'Este correo ya está vinculado a otra organización. Contacta con soporte.');
              }
            } else {
              // Perfil existe pero no está vinculado a una organización (ej. propietario que intenta ser profesional)
              this.modalService.showAlert('Cuenta Existente', 'Ya tienes una cuenta registrada con este correo. Inicia sesión y contacta con el administrador si deseas cambiar tu rol.');
            }
            this.loading = false;
            return;
          }

          // 2. Si el perfil NO existe, procedemos con el registro normal
          const { error } = await this.supabase.signUp(this.email, this.password, {
            data: { is_professional: true, org_name: this.orgName }
          });
          if (error) throw error;

          // Después del registro, el usuario es automáticamente logueado por Supabase.
          // Para forzar que confirmen email antes de entrar, cerramos la sesión inmediatamente.
          await this.supabase.signOut();

          // Redirigimos a la página de espera para que el usuario sepa qué hacer.
          this.router.navigate(['/esperando-aprobacion'], { queryParams: { empresa: this.orgName, status: 'pending' } });
        }
        this.modalService.showAlert('Registro Exitoso', '¡Registro casi listo! Revisa tu email para confirmar tu cuenta antes de iniciar sesión.');
      }
    } catch (err: any) {
      console.error('[AUTH ERROR]', err);
      
      const msg = err.message || '';
      if (msg.includes('already registered')) { // Este error es de Supabase Auth, no de nuestro trigger
        this.error = 'Este correo ya está registrado en el sistema de autenticación, pero el perfil está incompleto. Por favor, contacta con soporte o usa otro correo.';
      } else if (msg.includes('Invalid login credentials')) {
        this.error = 'Correo o contraseña incorrectos. Por favor, verifica tus datos.';
      } else {
        this.error = err.error_description || err.message || 'Error de validación: Verifique los datos.';
      }

    } finally {
      this.loading = false;
    }
  }
}