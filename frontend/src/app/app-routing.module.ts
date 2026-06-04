import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthComponent } from './auth.component';
import { ComunidadesComponent } from './comunidades.component';
import { ClasificadorComponent } from './clasificador.component';
import { OptimizacionComponent } from './optimizacion.component';
import { PortalPropietarioComponent } from './portal-propietario.component';
import { ComunidadDashboardComponent } from './comunidad-dashboard.component';
import { CensoComponent } from './censo.component';
import { ComunidadExtractosComponent } from './comunidad-extractos.component';
import { ComunidadFinanzasComponent } from './comunidad-finanzas.component';
import { ComunidadActasComponent } from './comunidad-actas.component';
import { ComunidadFacturasComponent } from './comunidad-facturas.component';
import { ComunidadLimpiezaComponent } from './comunidad-limpieza.component';
import { ComunidadPisoMovimientosComponent } from './comunidad-piso-movimientos.component';
import { ComunidadAnunciosComponent } from './comunidad-anuncios.component';
import { PerfilComponent } from './perfil.component';
import { LandingComponent } from './landing.component';
import { ComunidadOverviewComponent } from './comunidad-overview.component';
import { LegalComponent } from './legal.component';
import { GestionEquipoComponent } from './gestion-equipo.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard.component';
import { EsperandoAprobacionComponent } from './esperando-aprobacion.component';
import { SuperAdminGuard } from './super-admin.guard';

const routes: Routes = [
  { path: '', component: LandingComponent, title: 'OptiFincas - Bienvenidos' },
  { path: 'login', component: AuthComponent, title: 'OptiFincas - Login' },
  { path: 'comunidades', component: ComunidadesComponent },
  { path: 'perfil', component: PerfilComponent },
  { 
    path: 'comunidades/:id', 
    component: ComunidadDashboardComponent,
    children: [
      { path: 'censo', component: CensoComponent },
      { path: 'censo/:pisoId/movimientos', component: ComunidadPisoMovimientosComponent }, // New route for owner movements
      { path: 'overview', component: ComunidadOverviewComponent },
      { path: 'extractos', component: ComunidadExtractosComponent },
      { path: 'actas', component: ComunidadActasComponent },
      { path: 'facturas', component: ComunidadFacturasComponent },
      { path: 'finanzas', component: ComunidadFinanzasComponent },
      { path: 'limpieza', component: ComunidadLimpiezaComponent },
      { path: 'anuncios', component: ComunidadAnunciosComponent },
      { path: '', redirectTo: 'overview', pathMatch: 'full' }
    ]
  },
  { path: 'clasificador', component: ClasificadorComponent },
  { path: 'optimizacion', component: OptimizacionComponent },
  { path: 'equipo', component: GestionEquipoComponent },
  { path: 'admin-global', component: SuperAdminDashboardComponent, canActivate: [SuperAdminGuard] },
  { path: 'esperando-aprobacion', component: EsperandoAprobacionComponent },
  { path: 'portal-propietario', redirectTo: 'portal-propietario/mis-propiedades', pathMatch: 'full' },
  { path: 'portal-propietario/mis-propiedades', component: PortalPropietarioComponent },
  { path: 'portal-propietario/mis-recibos', component: PortalPropietarioComponent },
  { path: 'portal-propietario/finanzas', component: PortalPropietarioComponent },
  { path: 'portal-propietario/actas/:id', component: ComunidadActasComponent },
  { path: 'portal-propietario/facturas/:id', component: ComunidadFacturasComponent },
  { path: 'portal-propietario/limpieza', component: PortalPropietarioComponent },
  { path: 'portal-propietario/contactar', component: PortalPropietarioComponent },
  { path: 'portal-propietario/anuncios', component: PortalPropietarioComponent },
  { path: 'privacidad', component: LegalComponent, data: { type: 'privacidad' } },
  { path: 'terminos', component: LegalComponent, data: { type: 'terminos' } },
  { path: '**', redirectTo: '' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }