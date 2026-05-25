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
import { ComunidadLimpiezaComponent } from './comunidad-limpieza.component';

const routes: Routes = [
  { path: 'login', component: AuthComponent, title: 'OptiFincas - Login' },
  { path: 'comunidades', component: ComunidadesComponent },
  { 
    path: 'comunidades/:id', 
    component: ComunidadDashboardComponent,
    children: [
      { path: 'censo', component: CensoComponent },
      { path: 'extractos', component: ComunidadExtractosComponent },
      { path: 'finanzas', component: ComunidadFinanzasComponent },
      { path: 'limpieza', component: ComunidadLimpiezaComponent },
      { path: '', redirectTo: 'censo', pathMatch: 'full' }
    ]
  },
  { path: 'clasificador', component: ClasificadorComponent },
  { path: 'optimizacion', component: OptimizacionComponent },
  { path: 'portal-propietario', redirectTo: 'portal-propietario/mis-propiedades', pathMatch: 'full' },
  { path: 'portal-propietario/mis-propiedades', component: PortalPropietarioComponent },
  { path: 'portal-propietario/mis-recibos', component: PortalPropietarioComponent },
  { path: 'portal-propietario/finanzas', component: PortalPropietarioComponent },
  { path: 'portal-propietario/limpieza', component: PortalPropietarioComponent },
  { path: 'portal-propietario/contactar', component: PortalPropietarioComponent },
  { path: '', redirectTo: '/login', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }