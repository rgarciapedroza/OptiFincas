import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-esperando-aprobacion',
  template: `
    <div class="auth-container">
      <div class="auth-card" style="max-width: 550px; text-align: center; padding: 50px;">
        <div class="modal-icon" 
             [style.background]="status === 'denied' ? '#fee2e2' : '#fff7ed'" 
             [style.color]="status === 'denied' ? '#ef4444' : '#f97316'" 
             style="width: 80px; height: 80px;">
          <svg *ngIf="status === 'pending'" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <svg *ngIf="status === 'denied'" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>
        </div>
        <h2 style="color: #1e293b; font-size: 1.8rem; font-weight: 800; margin-bottom: 20px;">
          {{ status === 'pending' ? 'Solicitud de Acceso Enviada' : 'Acceso Denegado' }}
        </h2>
        <p *ngIf="status === 'pending'" style="color: #64748b; font-size: 1.05rem; line-height: 1.6; margin-bottom: 30px;">
          Tu solicitud para unirte a la organización <strong>"{{ nombreEmpresa }}"</strong> ha sido enviada.
        </p>
        <p *ngIf="status === 'denied'" style="color: #64748b; font-size: 1.05rem; line-height: 1.6; margin-bottom: 30px;">
          Tu solicitud para unirte a la organización <strong>"{{ nombreEmpresa }}"</strong> ha sido denegada.
        </p>
        
        <div *ngIf="status === 'pending'" style="background: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: left; margin-bottom: 30px;">
          <h4 style="color: #475569; margin-top: 0; margin-bottom: 12px; font-weight: 700;">¿Qué hacer ahora?</h4>
          <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 15px;">
            Hemos notificado al administrador principal de tu despacho. En cuanto acepte tu solicitud, podrás acceder a la plataforma.
          </p>
          <ul style="color: #64748b; font-size: 0.95rem; padding-left: 20px; line-height: 1.5;">
            <li style="margin-bottom: 10px;">Puedes contactar directamente con tu administrador para agilizar el proceso.</li>
            <li>Recibirás una notificación por correo electrónico cuando tu solicitud sea aprobada.</li>
          </ul>
        </div>
        <div *ngIf="status === 'denied'" style="background: #f8fafc; padding: 25px; border-radius: 16px; border: 1px solid #e2e8f0; text-align: left; margin-bottom: 30px;">
          <h4 style="color: #475569; margin-top: 0; margin-bottom: 12px; font-weight: 700;">¿Qué ha ocurrido?</h4>
          <p style="color: #64748b; font-size: 0.95rem; margin-bottom: 15px;">
            El administrador principal de la organización ha rechazado tu solicitud de acceso.
          </p>
          <ul style="color: #64748b; font-size: 0.95rem; padding-left: 20px; line-height: 1.5;">
            <li style="margin-bottom: 10px;">Si crees que ha sido un error, contacta directamente con el administrador.</li>
            <li>Puedes intentar registrarte con otro nombre de despacho si no perteneces a esta organización.</li>
          </ul>
        </div>
        
        <button class="btn-auth" routerLink="/" style="background: #1e293b; width: auto; padding: 12px 40px;">Volver al inicio</button>
      </div>
    </div>
  `,
  styles: [`
    .auth-container { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f8fafc; font-family: 'Inter', sans-serif; }
    .auth-card { background: white; border-radius: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.05); width: 90%; border: 1px solid #f1f5f9; }
    .modal-icon { border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 25px; }
    .btn-auth { color: white; border: none; border-radius: 12px; font-weight: 700; cursor: pointer; transition: all 0.2s; }
    .btn-auth:hover { transform: translateY(-2px); box-shadow: 0 10px 15px rgba(0,0,0,0.1); }
  `]
})
export class EsperandoAprobacionComponent implements OnInit {
  nombreEmpresa: string = '';
  status: 'pending' | 'approved' | 'denied' = 'pending'; // Default to pending

  constructor(private route: ActivatedRoute) { }
  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.nombreEmpresa = params['empresa'] || 'seleccionada';
      this.status = params['status'] || 'pending';
    });
  }
}