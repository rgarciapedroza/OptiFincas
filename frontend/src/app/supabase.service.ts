import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, AuthSession, AuthChangeEvent } from '@supabase/supabase-js';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    });
  }

  async getSession() {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }

  authChanges(callback: (event: AuthChangeEvent, session: AuthSession | null) => void) {
    return this.supabase.auth.onAuthStateChange(callback);
  }

  async signUp(email: string, pass: string) {
    return await this.supabase.auth.signUp({ email, password: pass });
  }

  async signInWithPassword(email: string, pass: string) {
    return await this.supabase.auth.signInWithPassword({ email, password: pass });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  // --- Métodos de Base de Datos ---
  async getComunidades() {
    const { data, error } = await this.supabase
      .from('comunidades')
      .select('*')
      .order('created_at', { ascending: false });
    return { data, error };
  }

  async insertComunidad(comunidad: any) {
    return await this.supabase.from('comunidades').insert([comunidad]).select();
  }

  async updateComunidad(id: string, updates: any) {
    return await this.supabase
      .from('comunidades')
      .update(updates)
      .eq('id', id)
      .select();
  }

  async deleteComunidad(id: string) {
    return await this.supabase.from('comunidades').delete().eq('id', id);
  }

  // --- Métodos de Movimientos Bancarios ---
  async importarMovimientosBancarios(communityId: number | string, file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/comunidades/${communityId}/importar-movimientos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData
    });
    return response.json(); // Devuelve la respuesta JSON del backend
  }

  async importarCenso(communityId: number | string, file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/comunidades/${communityId}/importar-censo`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: formData
    });
    return response.json();
  }

  async getPisos(communityId: number | string) {
    const { data, error } = await this.supabase
      .from('pisos')
      .select('*')
      .eq('community_id', communityId)
      .order('codigo', { ascending: true });
    return { data, error };
  }

  async getMovimientosBancarios(communityId: number | string) {
    const { data, error } = await this.supabase
      .from('movimientos')
      .select('*')
      .eq('community_id', communityId)
      .order('fecha', { ascending: false });
    return { data, error };
  }
}