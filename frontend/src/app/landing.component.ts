import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { HttpClient } from '@angular/common/http';
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
    private http: HttpClient
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
        alert('Registro solicitado. Por favor, verifica tu correo electrónico.');
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
      
      alert(`Gracias ${this.contactData.nombre}, tu mensaje ha sido enviado correctamente por correo electrónico.`);
      // Limpiamos el formulario
      this.contactData = { nombre: '', email: '', mensaje: '' };
    } catch (err) {
      console.error('Error al enviar contacto:', err);
      alert('No se pudo enviar el mensaje. Por favor, inténtalo más tarde.');
    } finally {
      this.loading = false;
    }
  }
}