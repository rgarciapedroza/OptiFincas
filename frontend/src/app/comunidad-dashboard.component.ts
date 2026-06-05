import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ComunidadDB } from './models';

@Component({
  selector: 'app-comunidad-dashboard',
  template: `
    <div class="admin-layout" *ngIf="comunidad">
      <!-- Barra Superior Profesional -->
      <header class="top-nav">
        <div class="top-nav-left">
          <button class="back-pill" routerLink="/comunidades">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
            <span>Volver</span>
          </button>
          <div class="v-divider"></div>
          <div class="community-identity">
            <h1>{{ comunidad.nombre }}</h1>
            <p>{{ comunidad.direccion }}</p>
          </div>
        </div>
        <div class="top-nav-right">
          <div class="status-indicator">
            <span class="dot"></span>
            <span>Panel de Gestión</span>
          </div>
        </div>
      </header>

      <div class="main-body">
        <!-- Sidebar de Navegación -->
        <nav class="side-menu">
          <div class="menu-group">
            <p class="group-title">Principal</p>
            <a [routerLink]="['overview']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg></div>
              <span>Visión General</span>
            </a>
            <a [routerLink]="['censo']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg></div>
              <span>Censo Propietarios</span>
            </a>
            <a [routerLink]="['actas']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>
              <span>Actas de Reunión</span>
            </a>
            <a [routerLink]="['facturas']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>
              <span>Facturas</span>
            </a>
            <a [routerLink]="['finanzas']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg></div>
              <span>Informes Mensuales</span>
            </a>
          </div>

          <div class="menu-group">
            <p class="group-title">Economía</p>
            <a [routerLink]="['extractos']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line></svg></div>
              <span>Registros Bancarios</span>
            </a>
          </div>

          <div class="menu-group" *ngIf="comunidad.servicios?.toLowerCase()?.includes('limpieza')">
            <p class="group-title">Mantenimiento</p>
            <a [routerLink]="['limpieza']" routerLinkActive="active" class="menu-item">
              <div class="icon-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></div>
              <span>Plan de Limpieza</span>
            </a>
          </div>

          <div class="menu-group">
            <p class="group-title">Comunicación</p>
            <a [routerLink]="['anuncios']" routerLinkActive="active" class="menu-item">
              <div class="icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m3 11 18-5v12L3 14v-3z"></path>
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>
                </svg>
              </div>
              <span>Tablón de Anuncios</span>
            </a>
          </div>

          <div class="menu-group">
            <p class="group-title">Administración</p>
            <a [routerLink]="['configuracion']" routerLinkActive="active" class="menu-item">
              <div class="icon-box">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="3"></circle>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                </svg>
              </div>
              <span>Configuración IA</span>
            </a>
          </div>
        </nav>

        <!-- Área de Contenido -->
        <main class="content-area">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styles: [`
    .admin-layout {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #f1f5f9;
      font-family: 'Inter', sans-serif;
    }

    /* Barra Superior */
    .top-nav {
      height: 70px;
      background: white;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 30px;
      z-index: 50;
    }
    .top-nav-left { display: flex; align-items: center; gap: 20px; }
    .back-pill {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 16px; border-radius: 20px;
      background: #f8fafc; border: 1px solid #e2e8f0;
      color: #64748b; font-size: 0.85rem; font-weight: 600;
      cursor: pointer; transition: all 0.2s;
    }
    .back-pill:hover { background: #f1f5f9; color: #1e293b; }
    .v-divider { width: 1px; height: 30px; background: #e2e8f0; }
    .community-identity h1 { font-size: 1.1rem; font-weight: 800; color: #1e293b; margin: 0; }
    .community-identity p { font-size: 0.75rem; color: #64748b; margin: 0; }
    .status-indicator {
      display: flex; align-items: center; gap: 8px;
      background: #ecfdf5; color: #059669;
      padding: 6px 14px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;
    }
    .status-indicator .dot { width: 8px; height: 8px; background: #10b981; border-radius: 50%; }

    /* Cuerpo Principal */
    .main-body { display: flex; flex: 1; overflow: hidden; }

    /* Sidebar */
    .side-menu {
      width: 260px;
      background: white;
      border-right: 1px solid #e2e8f0;
      padding: 25px 15px;
      display: flex;
      flex-direction: column;
      gap: 30px;
      overflow-y: auto;
    }
    .menu-group { display: flex; flex-direction: column; gap: 4px; }
    .group-title {
      font-size: 0.65rem; font-weight: 800; text-transform: uppercase;
      color: #94a3b8; letter-spacing: 0.05em; padding-left: 12px; margin-bottom: 8px;
    }
    .menu-item {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px; border-radius: 10px;
      text-decoration: none; color: #64748b;
      font-size: 0.9rem; font-weight: 600;
      transition: all 0.2s;
    }
    .menu-item .icon-box {
      width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
      background: #f8fafc; border-radius: 8px; color: #94a3b8; transition: all 0.2s;
    }
    .menu-item:hover { background: #f8fafc; color: #4338ca; }
    .menu-item:hover .icon-box { background: white; color: #4338ca; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
    .menu-item.active { background: #eff6ff; color: #2563eb; }
    .menu-item.active .icon-box { background: white; color: #2563eb; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.1); }
    .menu-item.disabled { opacity: 0.5; cursor: not-allowed; }

    /* Área de Contenido */
    .content-area {
      flex: 1;
      padding: 30px;
      overflow-y: auto;
    }

    @media (max-width: 1024px) {
      .side-menu { width: 80px; padding: 25px 10px; }
      .side-menu span, .group-title { display: none; }
      .menu-item { justify-content: center; }
    }
  `]
})
export class ComunidadDashboardComponent implements OnInit {
  comunidad: ComunidadDB | null = null;

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      const { data } = await this.supabase.getComunidades();
      this.comunidad = data?.find((c: any) => c.id == id) || null;
    }
  }
}