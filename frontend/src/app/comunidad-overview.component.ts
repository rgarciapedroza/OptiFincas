import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ComunidadDB } from './models';

@Component({
  selector: 'app-comunidad-overview',
  template: `
    <div class="overview-container">
      <!-- Banner de Bienvenida -->
      <div class="welcome-section">
        <div class="welcome-content">
          <h2 *ngIf="comunidad">Panel de Control: {{ comunidad.nombre }}</h2>
          <p>Bienvenido a la vista general. Aquí tienes un resumen del estado de la comunidad y accesos directos a las herramientas de gestión.</p>
        </div>
        <div class="welcome-decoration">
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
        </div>
      </div>

      <!-- Grid de Información Simétrica -->
      <div class="stats-grid">
        <!-- Tarjeta: Dirección -->
        <div class="info-card">
          <div class="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
          </div>
          <div class="card-details">
            <span class="card-label">Ubicación</span>
            <span class="card-value">{{ comunidad?.direccion }}</span>
          </div>
        </div>

        <!-- Tarjeta: Servicios -->
        <div class="info-card">
          <div class="card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
          </div>
          <div class="card-details">
            <span class="card-label">Servicios Activos</span>
            <span class="card-value">{{ comunidad?.servicios || 'Ninguno especificado' }}</span>
          </div>
        </div>

        <!-- Tarjeta: Estado -->
        <div class="info-card">
          <div class="card-icon" style="color: #10b981;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
          </div>
          <div class="card-details">
            <span class="card-label">Estado de Gestión</span>
            <span class="card-value">Al día</span>
          </div>
        </div>
      </div>

      <!-- Accesos Directos -->
      <div class="quick-access">
        <h3>Acciones Frecuentes</h3>
        <div class="access-buttons">
          <button [routerLink]="['../censo']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>
            Censo de Propietarios
          </button>
          <button [routerLink]="['../extractos']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            Subir Registros Bancarios
          </button>
          <button [routerLink]="['../facturas']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Facturas
          </button>
          <button [routerLink]="['../actas']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>
            Actas de Reunión
          </button>
          <button *ngIf="comunidad?.servicios?.toLowerCase()?.includes('limpieza')" [routerLink]="['../limpieza']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
            Plan de Limpieza
          </button>
          <button [routerLink]="['../finanzas']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
            Ver Informe Mensual
          </button>
          <button [routerLink]="['../anuncios']" class="access-btn">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 11 18-5v12L3 14v-3z"></path>
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path>
            </svg>
            Tablón de Anuncios
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .overview-container {
      display: flex;
      flex-direction: column;
      gap: 30px;
      animation: fadeIn 0.4s ease-out;
    }

    /* Banner de Bienvenida */
    .welcome-section {
      background: linear-gradient(135deg, #6366f1 0%, #4338ca 100%);
      padding: 40px;
      border-radius: 24px;
      color: white;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 10px 30px rgba(99, 102, 241, 0.2);
    }
    .welcome-content h2 { font-size: 2rem; font-weight: 800; margin: 0 0 12px 0; letter-spacing: -0.02em; }
    .welcome-content p { font-size: 1.05rem; opacity: 0.9; margin: 0; max-width: 600px; line-height: 1.6; }
    .welcome-decoration { opacity: 0.15; transform: rotate(-10deg); }

    /* Grid de Información */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }
    .info-card {
      background: white;
      padding: 24px;
      border-radius: 20px;
      border: 1px solid #e2e8f0;
      display: flex;
      align-items: center;
      gap: 20px;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .info-card:hover { transform: translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.05); border-color: #6366f1; }
    .card-icon { width: 52px; height: 52px; background: #f8fafc; border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #6366f1; flex-shrink: 0; }
    .card-details { display: flex; flex-direction: column; gap: 4px; overflow: hidden; }
    .card-label { font-size: 0.7rem; font-weight: 800; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; }
    .card-value { font-size: 1rem; font-weight: 700; color: #1e293b; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }

    /* Accesos Directos */
    .quick-access h3 { font-size: 1.1rem; font-weight: 800; color: #1e293b; margin: 0 0 20px 0; }
    .access-buttons { display: flex; flex-wrap: wrap; gap: 16px; }
    .access-btn {
      display: flex; align-items: center; gap: 12px;
      padding: 14px 28px; background: white; border: 1px solid #e2e8f0;
      border-radius: 16px; color: #475569; font-size: 0.95rem; font-weight: 700;
      cursor: pointer; transition: all 0.2s;
    }
    .access-btn:hover { background: #f8fafc; color: #1e293b; border-color: #cbd5e0; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.03); }

    @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
  `]
})
export class ComunidadOverviewComponent implements OnInit {
  communityId: string | null = null;
  comunidad: ComunidadDB | null = null;

  constructor(
    private route: ActivatedRoute,
    private supabase: SupabaseService
  ) {}

  async ngOnInit() {
    // The communityId comes from the parent route (ComunidadDashboardComponent)
    this.communityId = this.route.parent?.snapshot.paramMap.get('id') || null;
    if (this.communityId) {
      const { data } = await this.supabase.getComunidades();
      this.comunidad = data?.find((c: any) => c.id == this.communityId) || null;
    }
  }
}