import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { AuthComponent } from './auth.component';
import { ComunidadesComponent } from './comunidades.component';
import { ClasificadorComponent } from './clasificador.component';
import { OptimizacionComponent } from './optimizacion.component';
import { PortalPropietarioComponent } from './portal-propietario.component';
import { ComunidadDashboardComponent } from './comunidad-dashboard.component';
import { CensoComponent } from './censo.component';
import { ComunidadExtractosComponent } from './comunidad-extractos.component';
import { ComunidadActasComponent } from './comunidad-actas.component';
import { ComunidadFinanzasComponent } from './comunidad-finanzas.component';
import { ComunidadLimpiezaComponent } from './comunidad-limpieza.component';
import { LandingComponent } from './landing.component';
import { ComunidadOverviewComponent } from './comunidad-overview.component';
import { GestionEquipoComponent } from './gestion-equipo.component';
import { EsperandoAprobacionComponent } from './esperando-aprobacion.component';
import { ModalService } from './modal.service';
import { LegalComponent } from './legal.component';
import { AppRoutingModule } from './app-routing.module';


@NgModule({
  declarations: [
    AppComponent,
    AuthComponent,
    ComunidadesComponent,
    ClasificadorComponent,
    OptimizacionComponent,
    ComunidadActasComponent,
    PortalPropietarioComponent,
    ComunidadDashboardComponent,
    CensoComponent,
    ComunidadExtractosComponent,
    ComunidadFinanzasComponent,
    ComunidadLimpiezaComponent,
    GestionEquipoComponent,
    ComunidadOverviewComponent,
    EsperandoAprobacionComponent,
    LandingComponent,
    LegalComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    AppRoutingModule
  ],
  providers: [ModalService],
  bootstrap: [AppComponent]
})
export class AppModule { }