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
        flowType: 'pkce',
        storageKey: 'optifincas-auth-token',
        lockType: 'memory'
      } as any
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

  async crearExtracto(comunidadId: number, nombreArchivo: string, mes: number | null, anio: number | null) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    // Si ya existe un extracto para el mismo mes y año, lo eliminamos (junto con sus movimientos vía CASCADE)
    if (mes !== null && anio !== null) {
      await this.supabase
        .from('extractos_procesados')
        .delete()
        .eq('comunidad_id', comunidadId)
        .eq('mes_contable', mes)
        .eq('anio_contable', anio);
    }

    return await this.supabase
      .from('extractos_procesados')
      .insert([{
        comunidad_id: comunidadId,
        nombre_archivo: nombreArchivo,
        fecha_subida: new Date().toISOString(),
        mes_contable: mes,
        anio_contable: anio
      }])
      .select();
  }

  async insertarMovimientos(movimientos: any[]) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    // Nota: El user_id se asignará automáticamente por el default 'auth.uid()' 
    // definido en tu esquema SQL al insertar con la sesión activa.
    return await this.supabase
      .from('movimientos')
      .insert(movimientos);
  }

  async upsertMovimientos(movimientos: any[]) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    return await this.supabase.from('movimientos').upsert(movimientos);
  }

  async getPisos(communityId: number | string) {
    const { data, error } = await this.supabase
      .from('pisos')
      .select('*')
      .eq('community_id', communityId)
      .order('codigo', { ascending: true });
    return { data, error };
  }

  async borrarCensoComunidad(communityId: number) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/comunidades/${communityId}/censo`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    return response.json();
  }

  async getPiso(pisoId: number) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/pisos/${pisoId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });
    return response.json();
  }

  async createPiso(piso: any) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/pisos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(piso),
    });
    
    if (!response.ok) {
      let errorMessage = 'Error al crear el piso';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        // Si no es JSON (error fatal 500), obtenemos el texto bruto
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(errorMessage);
    }
    return response.json().catch(() => ({ status: 'success' }));
  }

  async updatePiso(pisoId: number, piso: any) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/pisos/${pisoId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(piso),
    });

    if (!response.ok) {
      let errorMessage = 'Error al actualizar el piso';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(errorMessage);
    }
    return response.json().catch(() => ({ status: 'success' }));
  }

  async deletePiso(pisoId: number) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/pisos/${pisoId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      let errorMessage = 'Error al eliminar el piso';
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch (e) {
        errorMessage = await response.text() || errorMessage;
      }
      throw new Error(errorMessage);
    }
    return response.json().catch(() => ({ status: 'success' }));
  }

  async getMovimientosBancarios(communityId: number | string) {
    const { data, error } = await this.supabase
      .from('movimientos')
      .select('*')
      .eq('community_id', communityId)
      .order('fecha', { ascending: false });
    return { data, error };
  }

  async getExtractosByCommunity(communityId: number | string) {
    const { data, error } = await this.supabase
      .from('extractos_procesados')
      .select('*, movimientos(count)') // Ahora también obtenemos el conteo de movimientos relacionados
      .eq('comunidad_id', communityId)
      .order('anio_contable', { ascending: false })
      .order('mes_contable', { ascending: false });
    return { data, error };
  }

  async getMovimientosByExtracto(extractoId: number) {
    const { data, error } = await this.supabase
      .from('movimientos')
      .select('*')
      .eq('extracto_id', extractoId)
      .order('fecha', { ascending: false });
    return { data, error };
  }

  async eliminarExtracto(extractoId: number) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch(`/api/extractos/${extractoId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      }
    });
    return response.json();
  }

}