import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { ComunidadDB } from './models';

@Component({
  selector: 'app-comunidad-dashboard',
  template: `
    <div class="dashboard-container" *ngIf="comunidad">
      <div style="margin-bottom: 25px;">
        <button class="btn btn-secondary" routerLink="/comunidades" style="padding: 6px 12px; font-size: 0.85rem; margin-bottom: 10px;">
          ← Volver al listado
        </button>
        <h2 style="margin: 0; color: #111827;">{{ comunidad.nombre }}</h2>
        <p style="margin: 5px 0 0 0; color: #64748b; font-size: 0.95rem;">{{ comunidad.direccion }}</p>
      </div>

      <div class="summary-cards" style="grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 20px; gap: 10px;">
        <div class="card" routerLinkActive="active-tab" [routerLink]="['censo']" style="cursor: pointer; padding: 15px;">
          <svg class="dashboard-tab-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Propietarios
        </div>
        <div class="card" routerLinkActive="active-tab" [routerLink]="['extractos']" style="cursor: pointer; padding: 15px;">
          <svg class="dashboard-tab-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          Extractos
        </div>
        <div class="card" routerLinkActive="active-tab" [routerLink]="['finanzas']" style="cursor: pointer; padding: 15px;">
          <svg class="dashboard-tab-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="22"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          Finanzas
        </div>
        <div class="card" *ngIf="comunidad.servicios?.toLowerCase()?.includes('limpieza')" routerLinkActive="active-tab" [routerLink]="['limpieza']" style="cursor: pointer; padding: 15px;">
          <svg class="dashboard-tab-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path><path d="m5 3 1 1"></path><path d="m19 3-1 1"></path><path d="m5 21 1-1"></path><path d="m19 21-1-1"></path></svg>
          Limpieza
        </div>
      </div>

      <router-outlet></router-outlet>
    </div>
  `,
  styleUrls: ['./comunidades.component.css']
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