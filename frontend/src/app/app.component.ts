import { Component, OnInit, NgZone } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ModalService } from './modal.service';
import { Piso, Profile } from './models';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styles: [`
    .custom-modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(8px); display: flex; align-items: center; justify-content: center; z-index: 10000; animation: fadeIn 0.2s ease; }
    .custom-modal { background: white; padding: 30px; border-radius: 20px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); max-width: 400px; width: 90%; text-align: center; animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1); }
    .modal-icon { width: 60px; height: 60px; background: #f1f5f9; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; color: #6366f1; }
    .modal-title { font-size: 1.25rem; font-weight: 800; color: #1e293b; margin-bottom: 10px; }
    .modal-message { color: #64748b; font-size: 0.95rem; line-height: 1.5; margin-bottom: 25px; }
    .modal-actions { display: flex; gap: 12px; justify-content: center; }
    .btn-modal { padding: 12px 24px; border-radius: 12px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s; flex: 1; }
    .btn-modal-primary { background: #6366f1; color: white; }
    .btn-modal-secondary { background: #f1f5f9; color: #64748b; }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

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
  userProfile: Profile | null = null;
  loadingSession = true;
  error = '';
  userRole: 'admin' | 'propietario' | null = null;
  specificRole: string | null = null;
  notificacionesEquipo = 0;
  loading = false;
  loadingMessage = 'Cargando sesión...';
  private isValidating = false;

  private emailProcesado: string | null = null;

  constructor(
    private http: HttpClient, 
    private supabase: SupabaseService, 
    public router: Router,
    private ngZone: NgZone,
    public modalService: ModalService
  ) {}

  async ngOnInit() {
    this.loadingSession = true;
    this.loading = false;

    this.supabase.solicitudesRefresh$.subscribe(async () => {
      if (this.session && this.specificRole === 'owner') {
        const { data: profile } = await this.supabase.getProfile(this.session.user.id);
        if (profile?.organizacion_id) {
          await this.verificarSolicitudesPendientes(profile.organizacion_id);
        }
      }
    });

    this.supabase.authChanges(async (event, session) => {
      console.log(`[AUTH] Evento: ${event} | Sesión: ${session ? 'Activa' : 'Nula'}`);
      
      this.ngZone.run(async () => {
        try {
          if (session) {
            this.session = session;
            const email = session.user.email?.toLowerCase().trim() || '';

            if (this.emailProcesado !== email || event === 'SIGNED_IN') {
              this.emailProcesado = email;
              await this.procesarAccesoUsuario(email);
            }
          } else {
            this.limpiarEstadoSesion();
            if (
              this.router.url.includes('comunidades') || 
              this.router.url.includes('optimizacion') || 
              this.router.url.includes('portal-propietario')
            ) {
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

    // Timeout de seguridad para liberar la UI
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

  async verificarSolicitudesPendientes(orgId: string) {
    if (!orgId) return;
    const { data } = await this.supabase.getPendingRequests(orgId);
    this.notificacionesEquipo = data?.length || 0;
  }

  private limpiarEstadoSesion() {
    this.session = null;
    this.userProfile = null;
    this.userRole = null;
    this.notificacionesEquipo = 0;
    this.specificRole = null;
    this.emailProcesado = null;
  }

  async procesarAccesoUsuario(email: string) {
    console.log(`[AUTH] procesarAccesoUsuario iniciado para: ${email}`);
    if (this.isValidating) {
      console.log('[AUTH] Validación en curso, ignorando llamada duplicada.');
      return;
    }
    
    if (!this.session?.access_token || this.session.access_token.split('.').length !== 3) {
      console.warn('[AUTH] Token de sesión no válido aún. Esperando...');
      return;
    }

    const isProfessionalMetadata = this.session?.user?.user_metadata?.is_professional === true;
    console.log(`[AUTH] Procesando acceso para: ${email}. Perfil profesional esperado: ${isProfessionalMetadata}`);

    this.isValidating = true;
    this.loading = true;
    this.loadingMessage = 'Verificando permisos...';

    if (this.router.url.includes('restablecer-password')) {
      this.loading = false;
      this.isValidating = false;
      return;
    }

    try {
      // REINTENTO DINÁMICO: Esperamos a que la base de datos se sincronice
      let { data: profile, error: profileError } = await this.supabase.getProfile(this.session.user.id);
      
      if (!profile && (isProfessionalMetadata || !profileError)) {
        console.log('[AUTH] Perfil profesional no detectado en primer intento, esperando...');
        await new Promise(resolve => setTimeout(resolve, 1000)); // Esperamos 1 segundo completo
        const retry = await this.supabase.getProfile(this.session.user.id);
        profile = retry.data;
        profileError = retry.error;
      }

      this.userProfile = profile;

      if (profileError) {
        console.error('[AUTH] Error recuperando perfil:', profileError);
        
        if (profileError.message?.includes('recursion') || (profileError as any).status === 500) {
          this.error = 'Error de base de datos (RLS Recursion). Por favor, ejecute el script SQL de limpieza.';
          this.loading = false;
          return;
        }
        // Si después del reintento sigue habiendo error, buscamos en el censo
        await this.determinarPropietario(email);
        return;
      }

      if (!profile) {
        console.warn('[AUTH] Perfil no encontrado para el usuario logueado.');
        console.log('[AUTH] Llamando a determinarPropietario desde !profile');
        await this.determinarPropietario(email);
        return;
      }

      if (profile && (profile.role === 'admin' || profile.role === 'owner' || profile.role === 'superadmin')) {
        
        const isAtLoginOrLanding = this.router.url === '/' || this.router.url.includes('login');

        if (profile.role === 'superadmin') {
          this.userRole = null; 
          this.specificRole = 'superadmin';
          profile.status = 'approved';

          const rutasRestringidas = ['comunidades', 'optimizacion', 'clasificador', 'equipo'];
          const urlActual = this.router.url;
          if (isAtLoginOrLanding || rutasRestringidas.some(r => urlActual.includes(r))) {
            await this.router.navigate(['/admin-global']);
          }
          this.loading = false;
          this.isValidating = false;
          return;
        }

        if (profile.status !== 'approved') {
          console.warn(`[AUTH] Acceso restringido. Estado actual: ${profile.status}`);
          this.router.navigate(['/esperando-aprobacion'], { 
            queryParams: { 
              empresa: profile.role === 'owner' ? 'tu nuevo despacho' : 'la organización', 
              status: profile.status 
            } 
          });
          this.loading = false;
          this.isValidating = false;
          return;
        }

        this.userRole = 'admin'; 
        this.specificRole = profile.role;
        this.error = '';
        if (profile.role === 'owner') await this.verificarSolicitudesPendientes(profile.organizacion_id);
        
        if (this.router.url.includes('esperando-aprobacion') && profile.status === 'approved') {
          await this.router.navigate(['/comunidades']);
        }
        
        if (isAtLoginOrLanding) {
          await this.router.navigate(['/comunidades']);
        }
      } else {
        if (isProfessionalMetadata) {
          console.warn('[AUTH] El usuario está registrado como profesional pero no tiene rol de gestión o está pendiente.');
          this.userRole = null;
          this.loading = false;
          this.isValidating = false;
          return;
        }
        console.log('[AUTH] Llamando a determinarPropietario desde else (no admin/owner/superadmin)');
        await this.determinarPropietario(email.toLowerCase().trim());
      }
    } catch (err) {
      console.error('[AUTH] Error en procesarAccesoUsuario:', err);
      this.error = 'Error de validación de identidad.';
    } finally {
      this.loading = false;
      this.isValidating = false;
    }
  }

  async determinarPropietario(email: string) {
    console.log(`[AUTH] determinarPropietario iniciado para: ${email}`);
    if (this.userRole === 'admin') return;

    const token = this.session?.access_token;
    if (!token || token.split('.').length !== 3) return;

    this.loading = true;
    this.loadingMessage = 'Buscando vinculación en censo...';

    try {
      console.log('[AUTH] Llamando a supabase.buscarPisoPorEmail');
      const { data, error } = await this.supabase.buscarPisoPorEmail(email);
      
      if (error) {
        console.warn('[AUTH] El usuario no es admin ni propietario registrado.');
        this.error = '';
        this.loading = false;
        return;
      }

      if (data && data.length > 0) {
        console.log('[AUTH] Piso encontrado para propietario. Navegando a /portal-propietario');
        this.userRole = 'propietario';
        this.loading = false;
        await this.router.navigate(['/portal-propietario']);
      } else {
        console.warn('[AUTH] Acceso denegado: Usuario no encontrado.');
        this.userRole = null;
        console.log('[AUTH] No se encontró piso para propietario. userRole = null.');
        this.loading = false;
      }
    } catch (err) {
      console.error('[AUTH] Error en determinarPropietario:', err);
      this.loading = false;
    }
  }

  async logout() {
    const confirmacion = await this.modalService.showConfirm('Cerrar Sesión', '¿Estás seguro de que deseas salir del sistema?');
    if (!confirmacion) {
      return;
    }

    this.loading = true;
    try {
      console.log('[AUTH] Cerrando sesión...');
      await this.supabase.signOut();
      this.limpiarEstadoSesion();
      await this.router.navigate(['/']); // Redirección inmediata a landing
    } catch (err) {
      console.error('[AUTH] Error al cerrar sesión:', err);
      this.loading = false;
    }
  }
}