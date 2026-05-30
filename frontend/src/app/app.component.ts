import { Component, OnInit, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { Piso } from './models'; // Importamos solo lo necesario para determinarPropietario

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styles: [`
    .app-layout { display: flex; height: 100vh; font-family: 'Inter', sans-serif; background: #f0f2f5; }
    .sidebar { width: 80px; background: #0f172a; color: white; padding: 0; display: flex; flex-direction: column; box-shadow: 4px 0 15px rgba(0,0,0,0.08); transition: width 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; }
    .sidebar:hover { width: 220px; }
    .sidebar-header { padding: 18px; background: #1e293b; display: flex; align-items: center; justify-content: center; overflow: hidden; white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,0.05); gap: 12px; transition: all 0.3s; }
    .sidebar:hover .sidebar-header { justify-content: flex-start; padding-left: 18px; }
    .sidebar-logo { width: 44px; height: 44px; object-fit: cover; border-radius: 50%; flex-shrink: 0; border: 2px solid rgba(255,255,255,0.15); box-shadow: 0 4px 8px rgba(0,0,0,0.3); }
    .sidebar-title { margin: 0; font-size: 1.2rem; color: #f9fafb; display: none; }
    .sidebar:hover .sidebar-title { display: block; }
    .sidebar nav { flex: 1; padding: 20px 0; }
    .sidebar-btn { width: 100%; padding: 15px 0; background: none; border: none; color: #94a3b8; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s ease; border-left: 4px solid transparent; gap: 15px; }
    .sidebar-btn:hover { background: #1e293b; color: white; }
    .sidebar-btn.active { background: #1e293b; color: white; border-left-color: #818cf8; background: linear-gradient(90deg, rgba(99,102,241,0.1) 0%, rgba(30,41,59,0) 100%); }
    .sidebar-label { display: none; font-size: 0.9rem; font-weight: 500; }
    .sidebar:hover .sidebar-label { display: block; } 
    .sidebar:hover .sidebar-btn { justify-content: flex-start; padding-left: 25px; }
    .main-content { flex: 1; overflow-y: auto; padding: 40px; background: #f8fafc; }
    .main-content.full-width { padding: 0; }
    .logout-section { padding: 20px; border-top: 1px solid rgba(255,255,255,0.05); margin-top: auto; }
    .loading-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(4px); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 9999; }
    .spinner { width: 50px; height: 50px; border: 5px solid #e2e8f0; border-top: 5px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  `]
})
export class AppComponent implements OnInit {
  session: any = null;
  loadingSession = true;
  error = ''; // Para errores de autenticación globales
  userRole: 'admin' | 'propietario' | null = null;
  loading = false;
  loadingMessage = 'Cargando sesión...';
  private isValidating = false;
  private emailProcesado: string | null = null;

  constructor(
    private http: HttpClient, 
    private supabase: SupabaseService, 
    public router: Router,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    this.loadingSession = true;
    this.loading = false;

    // Suscribirse a cambios de autenticación (esto emite el estado inicial automáticamente)
    this.supabase.authChanges(async (event, session) => {
      console.log(`[AUTH] Evento: ${event} | Sesión: ${session ? 'Activa' : 'Nula'}`);
      
      this.ngZone.run(async () => {
        try {
          if (session) {
            this.session = session;
            const email = session.user.email?.toLowerCase().trim() || '';

            // Solo procesamos si el email es nuevo o si venimos de un evento de login explícito
            if (this.emailProcesado !== email || event === 'SIGNED_IN') {
              this.emailProcesado = email;
              await this.procesarAccesoUsuario(email);
            }
          } else {
            this.limpiarEstadoSesion();
            // Ya no redirigimos a /login automáticamente. 
            // Si no hay sesión, el router mostrará por defecto la LandingComponent ('')
            if (this.router.url.includes('comunidades') || this.router.url.includes('optimizacion')) {
              await this.router.navigate(['/']);
            }
          }
        } catch (err) {
          console.error('[AUTH] Error crítico en el flujo de sesión:', err);
          this.error = 'Ocurrió un error inesperado al iniciar sesión.';
        } finally {
          this.loadingSession = false;
          this.loading = false;
        }
      });
    });

    // Seguro de desbloqueo: si nada ocurre en 4 segundos, liberamos la UI
    setTimeout(() => {
      if (this.loading || this.loadingSession) {
        console.warn('[AUTH] Tiempo de espera de validación agotado (Timeout).');
        this.ngZone.run(() => {
          this.loadingSession = false;
          this.loading = false;
        });
      }
    }, 4000);
  }

  private limpiarEstadoSesion() {
    this.session = null;
    this.userRole = null;
    this.emailProcesado = null;
  }

  async procesarAccesoUsuario(email: string) {
    this.loading = true;
    this.loadingMessage = 'Verificando permisos...';
    
    const admins = ['admin@optifincas.com', 'rosmarygp11@gmail.com'];

    try {
      if (email && admins.includes(email)) {
        this.userRole = 'admin';
        // Solo redirigimos automáticamente si el usuario intenta entrar al login
        // o si el evento fue de entrada explícita.
        // Si simplemente refresca la Landing, le permitimos quedarse allí.
        if (this.router.url.includes('login') || this.isValidating) {
          await this.router.navigate(['/comunidades']);
        }
      } else if (email) {
        await this.determinarPropietario(email);
      }
    } catch (err) {
      console.error('[AUTH] Error en procesarAccesoUsuario:', err);
    } finally {
      this.loading = false;
    }
  }

  async determinarPropietario(email: string) {
    try {
      const { data, error } = await this.supabase.buscarPisoPorEmail(email);
      
      if (error) {
        console.error('[AUTH] Error buscando piso para propietario:', error);
        this.error = 'Error de conexión con la base de datos.';
        await this.supabase.signOut();
        return;
      }

      if (data && data.length > 0) {
        this.userRole = 'propietario';
        await this.router.navigate(['/portal-propietario']);
      } else {
        console.warn('[AUTH] Email no encontrado en el censo. Cerrando sesión.');
        this.error = 'Su correo no está registrado como propietario autorizado.';
        await this.supabase.signOut();
      }
    } catch (err) {
      console.error('[AUTH] Error en determinarPropietario:', err);
      this.loading = false;
    }
  }

  async logout() {
    this.loading = true;
    try {
      console.log('[AUTH] Cerrando sesión...');
      await this.supabase.signOut();
    } catch (err) {
      console.error('[AUTH] Error al cerrar sesión:', err);
      this.loading = false;
    }
  }
}