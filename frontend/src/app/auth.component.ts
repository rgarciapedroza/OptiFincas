import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';

@Component({
  selector: 'app-auth',
  template: `
    <div class="auth-container">
      <div class="auth-card">
        <div class="auth-logo">
          <img src="assets/logo.png" alt="OptiFincas" (click)="router.navigate(['/'])">
          <h1 class="logo-text">OptiFincas</h1>
        </div>

        <div class="auth-header">
          <h2 *ngIf="!forgotPasswordMode">{{ isLogin ? 'Bienvenido de nuevo' : 'Crear cuenta' }}</h2>
          <h2 *ngIf="forgotPasswordMode">Recuperar contraseña</h2>
          <p *ngIf="!forgotPasswordMode">{{ isLogin ? 'Ingresa tus credenciales para continuar' : 'Regístrate para empezar a optimizar' }}</p>
          <p *ngIf="forgotPasswordMode">Introduce tu email para recibir un enlace de recuperación</p>
        </div>

        <!-- Selector de Tipo de Registro (Solo visible en Sign Up) -->
        <div class="type-selector" *ngIf="!isLogin && !forgotPasswordMode">
          <button type="button" [class.active]="regType === 'propietario'" (click)="regType = 'propietario'">Soy Propietario</button>
          <button type="button" [class.active]="regType === 'profesional'" (click)="regType = 'profesional'">Soy Profesional</button>
        </div>

        <form (ngSubmit)="handleAuth()" #authForm="ngForm">
          <!-- Campo Nombre de Empresa (Solo para profesionales) -->
          <div class="form-group" *ngIf="!isLogin && regType === 'profesional' && !forgotPasswordMode">
            <label>Nombre del Despacho / Empresa</label>
            <input type="text" name="orgName" [(ngModel)]="orgName" required placeholder="Ej: Administraciones García Pedroza S.L." class="input-modern">
          </div>

          <div class="form-group">
            <label>Correo Electrónico</label>
            <input type="email" name="email" [(ngModel)]="email" required placeholder="tu@email.com" class="input-modern">
          </div>

          <div class="form-group" *ngIf="!forgotPasswordMode">
            <label>Contraseña</label>
            <input type="password" name="password" [(ngModel)]="password" required placeholder="••••••••" class="input-modern">
            <div class="forgot-link-container" *ngIf="isLogin">
              <a (click)="toggleForgotPassword(true)">¿Has olvidado tu contraseña?</a>
            </div>
          </div>

          <div *ngIf="error" class="error-banner">
            {{ error }}
          </div>

          <button type="submit" [disabled]="loading" class="btn-auth">
            <ng-container *ngIf="!forgotPasswordMode">
              {{ loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Registrarse') }}
            </ng-container>
            <ng-container *ngIf="forgotPasswordMode">
              {{ loading ? 'Enviando...' : 'Enviar enlace de recuperación' }}
            </ng-container>
          </button>
        </form>

        <div class="auth-footer">
          <p *ngIf="!forgotPasswordMode">
            {{ isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?' }}
            <a (click)="toggleMode()">{{ isLogin ? 'Regístrate' : 'Inicia Sesión' }}</a>
          </p>
          <p *ngIf="forgotPasswordMode">
            <a (click)="toggleForgotPassword(false)">Volver al inicio de sesión</a>
          </p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .auth-container {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; 
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      font-family: 'Inter', sans-serif;
      padding: 20px;
    }
    .auth-logo {
      display: flex; flex-direction: column; align-items: center; margin-bottom: 25px; gap: 10px;
    }
    .auth-logo img { width: 60px; height: 60px; cursor: pointer; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1)); }
    .logo-text { 
      margin: 0; font-size: 1.5rem; font-weight: 900; 
      background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent;
      letter-spacing: -0.5px;
    }
    .auth-card {
      background: rgba(255, 255, 255, 0.95); padding: 40px; border-radius: 24px;
      box-shadow: 0 20px 50px rgba(15, 23, 42, 0.1); 
      width: 100%; max-width: 420px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255, 255, 255, 0.8);
      animation: slideUpAuth 0.8s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .auth-header { text-align: center; margin-bottom: 30px; }
    .auth-header h2 { color: #1e293b; margin: 0 0 10px 0; font-weight: 800; font-size: 1.6rem; letter-spacing: -0.02em; }
    .auth-header p { color: #64748b; font-size: 0.9rem; margin: 0; }
    .type-selector { display: flex; gap: 8px; margin-bottom: 25px; background: #f1f5f9; padding: 6px; border-radius: 14px; }
    .type-selector button { 
      flex: 1; padding: 10px; border: none; border-radius: 10px; font-size: 0.85rem; font-weight: 700; 
      cursor: pointer; background: transparent; color: #64748b; transition: all 0.2s;
    }
    .type-selector button.active { background: white; color: #6366f1; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
    .form-group { margin-bottom: 20px; }
    .form-group label { display: block; font-size: 0.75rem; font-weight: 700; color: #475569; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
    .input-modern { width: 100%; padding: 14px 16px; border: 2px solid #f1f5f9; border-radius: 12px; font-size: 1rem; transition: all 0.2s; box-sizing: border-box; background: #f8fafc; color: #1e293b; font-weight: 500; }
    .input-modern:hover { border-color: #e2e8f0; }
    .input-modern:focus { outline: none; border-color: #6366f1; background: white; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); transform: translateY(-1px); }
    .forgot-link-container { text-align: right; margin-top: 10px; }
    .forgot-link-container a { font-size: 0.8rem; color: #6366f1; cursor: pointer; font-weight: 600; text-decoration: none; }
    .forgot-link-container a:hover { text-decoration: underline; }
    .error-banner {
      background: #fff5f5; color: #c53030; padding: 12px; border-radius: 8px;
      font-size: 0.85rem; margin-bottom: 20px; border: 1px solid #feb2b2;
      font-weight: 500;
    }
    .btn-auth {
      width: 100%; padding: 16px; 
      background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
      color: white; border: none;
      border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.3s;
      box-shadow: 0 10px 15px -3px rgba(99, 102, 241, 0.3);
      font-size: 1rem;
    }
    .btn-auth:hover { transform: translateY(-2px); box-shadow: 0 15px 20px -3px rgba(99, 102, 241, 0.4); filter: brightness(1.1); }
    .btn-auth:active { transform: translateY(0); }
    .btn-auth:disabled { background: #94a3b8; cursor: not-allowed; }
    .auth-footer { text-align: center; margin-top: 25px; font-size: 0.9rem; color: #64748b; }
    .auth-footer a { color: #6366f1; font-weight: 700; cursor: pointer; text-decoration: none; margin-left: 5px; }

    @keyframes slideUpAuth {
      from { opacity: 0; transform: translateY(40px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `]
})
export class AuthComponent implements OnInit {
  isLogin = true;
  loading = false;
  email = '';
  password = '';
  forgotPasswordMode = false;
  orgName = ''; // Nuevo campo
  regType: 'propietario' | 'profesional' = 'propietario'; // Tipo de registro
  error = '';

  constructor(
    private supabase: SupabaseService,
    private route: ActivatedRoute,
    public router: Router,
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

  toggleForgotPassword(show: boolean) {
    this.forgotPasswordMode = show;
    this.error = '';
  }

  async handleAuth() {
    this.loading = true;
    this.error = '';

    if (this.forgotPasswordMode) {
      try {
        const { error } = await this.supabase.resetPasswordForEmail(this.email);
        if (error) throw error;
        this.modalService.showAlert('Correo enviado', 'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.');
        this.forgotPasswordMode = false;
      } catch (err: any) {
        this.error = err.message || 'Error al solicitar la recuperación.';
      } finally {
        this.loading = false;
      }
      return;
    }

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

          // 1.5 Verificar si la organización ya existe por nombre para evitar crear duplicados
          const { data: orgData } = await this.supabase.verificarOrganizacionExiste(this.orgName);
          
          if (orgData) {
            // El despacho ya existe. Informamos al usuario de que se unirá a un equipo existente.
            this.modalService.showAlert('Despacho Detectado', `El despacho "${this.orgName}" ya está registrado en OptiFincas. Tu cuenta se creará como "Pendiente" y deberás esperar a que el administrador principal apruebe tu acceso.`);
          }

          // 2. Si el perfil NO existe, procedemos con el registro
          const { error } = await this.supabase.signUp(this.email, this.password, {
            // Pasamos el ID encontrado (si existe) para que la lógica de BD vincule en lugar de crear
            data: { is_professional: true, org_name: this.orgName, vincular_org_id: orgData?.id || null }
          });
          if (error) throw error;

          // Después del registro, el usuario es automáticamente logueado por Supabase.
          // Damos 500ms para que se completen procesos asíncronos antes de cerrar la sesión.
          await new Promise(resolve => setTimeout(resolve, 500));
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