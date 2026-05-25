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
    private router: Router,
    private ngZone: NgZone
  ) {}

  async ngOnInit() {
    this.loadingSession = true;
    this.loading = false;

    // Suscribirse a cambios de autenticación (esto emite el estado inicial automáticamente)
    this.supabase.authChanges(async (event, session) => {
      console.log(`[AUTH] Evento: ${event} | Sesión: ${session ? 'Activa' : 'Nula'}`);
      
      // Ejecutamos dentro de ngZone para asegurar que la UI se actualice
      await this.ngZone.run(async () => {
        if (session) {
          this.session = session;
          const email = session.user.email?.toLowerCase().trim() || '';

          // Evitamos procesar el acceso si el email no ha cambiado (ej. en eventos TOKEN_REFRESHED)
          // Esto previene bucles de navegación y llamadas redundantes a la DB.
          if (this.emailProcesado !== email) {
            this.emailProcesado = email;
            await this.procesarAccesoUsuario(email);
          }
        } else {
          this.session = null;
          this.userRole = null;
          this.emailProcesado = null;
          if (!this.router.url.includes('login')) {
            await this.router.navigate(['/login']);
          }
        }
        this.loadingSession = false;
        this.loading = false;
      });
    });

    // Seguro de desbloqueo: si nada ocurre en 6 segundos, forzamos la entrada
    setTimeout(() => {
      this.ngZone.run(() => {
        this.loadingSession = false;
        this.loading = false;
      });
    }, 6000);
  }

  async procesarAccesoUsuario(email: string) {
    this.loading = true;
    this.loadingMessage = 'Verificando permisos...';
    
    const admins = ['admin@optifincas.com', 'rosmarygp11@gmail.com'];

    if (email && admins.includes(email)) {
      this.userRole = 'admin';
      // Solo navegamos si estamos en la raíz o login
      if (this.router.url === '/' || this.router.url.includes('login')) {
        this.router.navigate(['/comunidades']);
      }
    } else if (email) {
      await this.determinarPropietario(email);
    }
  }

  async determinarPropietario(email: string) {
    // Aquí solo necesitamos saber si es propietario, no cargar todos sus datos en AppComponent
    const { data, error } = await this.supabase.buscarPisoPorEmail(email);
    if (error) {
      console.error('[AUTH] Error buscando piso para propietario:', error);
      this.error = 'Error al verificar su rol de propietario.';
      await this.supabase.signOut(); // Forzar cierre de sesión si hay error
      return;
    }

    if (data && data.length > 0) {
      this.userRole = 'propietario';
      // Redirigir a su portal específico
      // this.router.navigate(['/portal-propietario']);
      // Si es propietario y no hay ruta específica, lo dejamos en el login o una página por defecto.
      // Deberías tener una ruta para '/portal-propietario' y navegar aquí.
      this.router.navigate(['/portal-propietario']); // Asumiendo que crearás esta ruta
    } else {
      console.warn('[AUTH] Email no encontrado como propietario. Cerrando sesión.');
      this.error = 'Su correo no está registrado como propietario autorizado.';
      await this.supabase.signOut();
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