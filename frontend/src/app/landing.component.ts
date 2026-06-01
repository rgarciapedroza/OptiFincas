import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { HttpClient } from '@angular/common/http';
import { ModalService } from './modal.service';
import { lastValueFrom } from 'rxjs';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css']
})
export class LandingComponent {
  isLogin = true; // Controla si mostramos el form de Login o Registro
  email = '';
  password = '';
  loading = false;
  errorMessage = '';

  // Formulario de contacto (restaurado)
  contactData = {
    nombre: '',
    email: '',
    mensaje: ''
  };

  constructor(
    private supabase: SupabaseService, 
    public router: Router,
    private http: HttpClient,
    public modalService: ModalService
  ) {}

  async handleSubmit() {
    if (!this.email || !this.password) {
      this.errorMessage = 'Por favor, rellena todos los campos.';
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    try {
      if (this.isLogin) {
        const { error } = await this.supabase.signInWithPassword(this.email, this.password);
        if (error) throw error;
        // Redirigir al listado de comunidades tras login exitoso
        this.router.navigate(['/comunidades']);
      } else {
        const { error } = await this.supabase.signUp(this.email, this.password);
        if (error) throw error;
        this.modalService.showAlert('Registro Iniciado', 'Por favor, revisa tu correo electrónico para verificar tu cuenta.');
        this.isLogin = true; // Volvemos a login tras registro
      }
    } catch (err: any) {
      this.errorMessage = err.message || 'Error en la autenticación';
    } finally {
      this.loading = false;
    }
  }

  toggleMode() {
    this.isLogin = !this.isLogin;
    this.errorMessage = '';
  }

  scrollTo(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }

  async enviarMensajeContacto() {
    this.loading = true;
    try {
      // Realizamos la petición POST al backend
      await lastValueFrom(this.http.post('/api/contacto', this.contactData));
      
      this.modalService.showAlert('Mensaje Recibido', `Gracias ${this.contactData.nombre}, hemos recibido tu mensaje y te contactaremos pronto.`);
      // Limpiamos el formulario
      this.contactData = { nombre: '', email: '', mensaje: '' };
    } catch (err) {
      console.error('Error al enviar contacto:', err);
      this.modalService.showAlert('Error de Envío', 'No se pudo enviar el mensaje. Por favor, inténtalo de nuevo más tarde.');
    } finally {
      this.loading = false;
    }
  }
}