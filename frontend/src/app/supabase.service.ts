import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, AuthSession, AuthChangeEvent } from '@supabase/supabase-js';
import { environment } from '../environments/environment';
import { BehaviorSubject } from 'rxjs'; // Importa BehaviorSubject
import { Acta, Factura, Anuncio, Profile, RegexRule } from './models'; // Importa RegexRule

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  // Centralizamos el nombre del bucket. Al ser genérico, 
  // nos servirá para actas, facturas, contratos, etc.
  private readonly BUCKET_NAME = 'comunidades-documentos';
  // Canal para notificar cambios en las solicitudes de equipo
  public solicitudesRefresh$ = new BehaviorSubject<void>(undefined);

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storageKey: 'optifincas-auth-token',
        // Forzamos el uso de localStorage para evitar pérdidas de sesión en navegadores
        // con políticas de cookies estrictas o LockManager bloqueado.
        storage: window.localStorage,
        // Implementación No-op del Lock para evitar el error "immediately failed" en localhost.
        // Esto evita que Supabase intente usar navigator.locks que falla en algunos navegadores/entornos.
        lock: async (name: any, acquireTimeout: any, fn: any) => await fn(),
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

  async signUp(email: string, pass: string, options?: { data?: object }) {
    return await this.supabase.auth.signUp({ email, password: pass, options });
  }

  async signInWithPassword(email: string, pass: string) {
    return await this.supabase.auth.signInWithPassword({ email, password: pass });
  }

  async signOut() {
    return await this.supabase.auth.signOut();
  }

  async resetPasswordForEmail(email: string) {
    return await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer-password`,
    });
  }

  async updateUserPassword(newPassword: string) {
    return await this.supabase.auth.updateUser({ password: newPassword });
  }

  // --- Métodos de Base de Datos ---
  async getComunidades() {
    const { data, error } = await this.supabase
      .from('comunidades')
      .select('*')
      .order('created_at', { ascending: false });
    return { data, error };
  }

  async getComunidadById(id: number | string) {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    const { data, error } = await this.supabase
      .from('comunidades')
      .select('*')
      .eq('id', numericId)
      .single();

    console.log(`[DEBUG] getComunidadById(${numericId}):`, { data, error });

    if (data) {
      // 1. Obtener reglas globales del sistema
      const { data: globalRules } = await this.supabase
        .from('patrones_piso_config')
        .select('*')
        .is('community_id', null)
        .eq('active', true);

      const systemPatterns = (globalRules || []).map(r => ({
        description: r.description || 'Regla del Sistema',
        pattern: r.pattern,
        assigned_value: r.assigned_value,
        is_system: true
      }));

      // 2. Procesar reglas personalizadas de la comunidad (JSON)
      let customPatterns: any[] = [];
      if (data.patrones_piso) {
        let parsedValue: any = data.patrones_piso;
        let parseAttempts = 0;
        while (typeof parsedValue === 'string' && parseAttempts < 5) {
          try { parsedValue = JSON.parse(parsedValue); } catch { break; }
          parseAttempts++;
        }

        if (Array.isArray(parsedValue)) {
          customPatterns = parsedValue.map((rule: any) => {
            if (!rule.pattern) return null;
            return {
              description: rule.description || 'Regla personalizada',
              pattern: rule.pattern,
              assigned_value: rule.assigned_value,
              is_system: false
            };
          }).filter(r => r !== null);
        }
      }

      // 3. Unificar ambas listas
      data.patrones_piso = [...systemPatterns, ...customPatterns];
    }

    return { data, error };
  }

  async insertComunidad(comunidad: any) {
    return await this.supabase.from('comunidades').insert([comunidad]).select();
  }

  async updateComunidad(id: number | string, updates: any) {
    const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
    
    const { data, error, status } = await this.supabase
      .from('comunidades')
      .update(updates)
      .eq('id', numericId)
      .select();

    console.log(`[DEBUG] updateComunidad(${numericId}):`, { updates, data, error, status });

    if (!error && (!data || data.length === 0)) {
      console.warn(`SupabaseService: No se actualizó ninguna fila para ID ${numericId}. Verifique RLS.`);
    }

    if (error) {
      console.error('SupabaseService: Error updating comunidad', id, updates, error);
    }
    return { data, error };
  }

  async deleteComunidad(id: number | string) {
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
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    try {
      // Usamos el endpoint del backend que ya desencripta los datos
      const response = await fetch(`/api/comunidades/${communityId}/pisos`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.detail || 'Error al obtener pisos');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (err: any) {
      console.error('Error en getPisos:', err);
      return { data: null, error: err };
    }
  }

  async verificarEmailAutorizado(email: string) {
    // Llamamos a una función segura en la base de datos
    return await this.supabase.rpc('verificar_email_autorizado', { email_a_buscar: email });
  }

  async buscarPisoPorEmail(email: string) {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      // REFUERZO DE SEGURIDAD: Nunca enviar "undefined" o tokens incompletos al backend
      const token = session?.access_token;
      if (!token || typeof token !== 'string' || token === 'undefined' || token.split('.').length !== 3) {
        console.warn('[SUPABASE] Intento de llamada al API sin token válido. Abortando.');
        return { data: null, error: 'No hay sesión activa para consultar el censo' };
      }
      const response = await fetch(`/api/portal/mi-piso?email=${encodeURIComponent(email.trim())}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token.trim()}`,
        },
      });
      
      if (!response.ok) throw new Error('Error al obtener datos del propietario');
      const data = await response.json();
      return { data: Array.isArray(data) ? data : [data], error: null };
    } catch (err) {
      console.error('Error en búsqueda de piso:', err);
      return { data: null, error: err };
    }
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

  // Unificamos el método getMovimientosByExtracto
  async getMovimientosByExtracto(communityId: number | string, extractoId: number, type?: 'ingreso' | 'gasto') {
    let query = this.supabase
      .from('movimientos')
      .select('*')
      .eq('community_id', communityId) // Aseguramos que los movimientos pertenecen a la comunidad
      .eq('extracto_id', extractoId)
      .order('fecha', { ascending: false });

    if (type) {
      query = query.eq('tipo', type);
    }

    const { data, error } = await query;
    return { data, error };
  }

  async getMovimientosByPiso(communityId: number | string, pisoId: number) {
    const pisoDetails = await this.getPiso(pisoId); // getPiso returns the data directly, not {data, error}
    if (!pisoDetails || !pisoDetails.codigo) throw new Error("Piso no encontrado o sin código.");

    // IMPORTANTE: Normalizar el código para la búsqueda (ej: "1º A" -> "1A")
    const pisoCodigo = pisoDetails.codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');

    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    try {
      const response = await fetch(`/api/comunidades/${communityId}/movimientos?piso_codigo=${encodeURIComponent(pisoCodigo)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });
      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.detail || 'Error al obtener movimientos del piso');
      }
      const data = await response.json();
      return { data, error: null };
    } catch (err: any) {
      console.error('Error en getMovimientosByPiso:', err);
      return { data: null, error: err };
    }
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

  async guardarPlanificacion(mes: number, anio: number, datos: any) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    return await this.supabase
      .from('planificaciones')
      .upsert({
        mes,
        anio,
        datos,
        user_id: session.user.id
      }, { onConflict: 'mes,anio,user_id' });
  }

  async getPlanificacion(mes: number, anio: number) {
    return await this.supabase
      .from('planificaciones')
      .select('datos')
      .eq('mes', mes)
      .eq('anio', anio)
      .maybeSingle();
  }

  /**
   * Envía los resultados de la IA al backend para su persistencia segura.
   * SOLID: Centraliza la lógica de comunicación con la API.
   */
  async persistirExtracto(payload: any) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const response = await fetch('/api/persistir-extracto', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    return response.json();
  }

  async updateProfile(id: string, updates: any) {
    return await this.supabase.from('profiles').update(updates).eq('id', id);
  }
  
  async getProfilesByOrgId(orgId: string) {
    return await this.supabase.from('profiles').select('*, organizations:organizacion_id(nombre)').eq('organizacion_id', orgId);
  }

  async getProfile(userId: string) {
    return await this.supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
  }

  async syncPisosFromProfile(userId: string, fullName: string, phone1: string | null, phone2: string | null) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    return await fetch(`/api/profiles/${userId}/sync-pisos`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ full_name: fullName, phone1: phone1, phone2: phone2 }),
    });
  }


  /**
   * Comprueba si una organización ya existe por nombre.
   */
  async verificarOrganizacionExiste(nombre: string) {
    return await this.supabase
      .from('organizations')
      .select('id')
      .ilike('nombre', nombre.trim())
      .maybeSingle();
  }

  /**
   * Obtiene todos los perfiles registrados en el sistema (Solo para SuperAdmin)
   */
  async getAllProfiles() {
    // Usamos el nombre de la columna organizacion_id para forzar el join correcto
    return await this.supabase
      .from('profiles')
      .select('*, organizations:organizacion_id(nombre)')
      .order('email', { ascending: true }); // Ordenamos por email por seguridad
  }

  /**
   * Obtiene estadísticas globales para el SuperAdmin
   */
  async getGlobalStats() {
    // Optimizamos pidiendo solo 'id' en lugar de '*' para evitar conflictos de RLS con columnas específicas
    const { count: orgs } = await this.supabase.from('organizations').select('id', { count: 'exact', head: true });
    const { count: communities } = await this.supabase.from('comunidades').select('id', { count: 'exact', head: true });
    const { count: owners } = await this.supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'owner').eq('status', 'approved');
    return { 
      orgs: orgs ?? 0, 
      communities: communities ?? 0, 
      owners: owners ?? 0 
    };
  }

  async registerProfessional(email: string, pass: string, orgName: string) {
    // El trigger handle_new_user_signup se encargará de crear la organización y el perfil
    // Pasamos los metadatos necesarios para que el trigger sepa qué hacer
    return await this.supabase.auth.signUp({
      email,
      password: pass,
      options: {
        data: { is_professional: true, org_name: orgName }
      }
    });
  }

  /**
   * Obtiene todos los miembros (admins/empleados) de la organización del usuario actual.
   */
  async getOrganizationMembers(orgId: string) {
    return await this.supabase
      .from('profiles')
      .select('*')
      .eq('organizacion_id', orgId)
      .neq('role', 'propietario'); // Solo personal del despacho
  }

  /**
   * Obtiene un perfil por su dirección de correo electrónico.
   */
  async getProfileByEmail(email: string) {
    return await this.supabase
      .from('profiles')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .maybeSingle();
  }

  /**
   * Obtiene solicitudes pendientes de acceso para la organización.
   */
  async getPendingRequests(orgId: string) {
    return await this.supabase
      .from('profiles')
      .select('*')
      .eq('organizacion_id', orgId)
      .eq('status', 'pending');
  }

  /**
   * Obtiene todas las solicitudes de registro de nuevos profesionales (dueños de empresas)
   * que están pendientes de aprobación por el administrador global.
   */
  async getGlobalPendingRequests() {
    return await this.supabase
      .from('profiles')
      .select('*, organizations:organizacion_id(nombre)')
      .eq('role', 'owner')
      .eq('status', 'pending');
  }

  async responderSolicitudRegistroEmpresa(profileId: string, status: 'approved' | 'denied') {
    return await this.supabase
      .from('profiles')
      .update({ status: status })
      .eq('id', profileId);
  }

  /**
   * Lógica atómica para eliminar una empresa y bloquear al dueño.
   * SOLID: Encapsula la lógica de negocio fuera del componente.
   */
  async eliminarEmpresaCompleta(usuario: Profile) {
    // 1. Si hay organización, se borra. Gracias al CASCADE de SQL, 
    // se borrarán comunidades, censo, actas, etc.
    if (usuario.organizacion_id) {
      const { error: orgErr } = await this.deleteOrganization(usuario.organizacion_id);
      if (orgErr) return { error: orgErr };
    }

    // 2. Desactivamos al usuario principal
    return await this.updateProfile(usuario.id, { 
      status: 'denied', 
      organizacion_id: null 
    });
  }

  async deleteOrganization(orgId: string) {
    return await this.supabase
      .from('organizations')
      .delete()
      .eq('id', orgId);
  }

  /**
   * Permite al Owner añadir un nuevo administrador a su equipo.
   * El usuario debe haber creado su cuenta previamente.
   */
  async addTeamMember(email: string, orgId: string, role: 'admin' | 'owner' = 'admin') {
    return await this.supabase
      .from('profiles')
      .update({ 
        role: role, 
        organizacion_id: orgId,
        status: 'approved'
      })
      .eq('email', email.toLowerCase().trim())
      .select();
  }

  // --- Métodos para Actas ---
  async getActas(communityId: number | string) {
    return await this.supabase
      .from('actas')
      .select('*')
      .eq('community_id', communityId)
      .order('anio', { ascending: false })
      .order('mes', { ascending: false });
  }

  async uploadActa(communityId: number | string, anio: number, mes: number, file: File) {
    // 1. Subir el archivo al Storage de Supabase (Bucket: comunidades-documentos)
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `actas/${communityId}/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 2. Obtener la URL pública del archivo
    const { data: urlData } = this.supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(filePath);

    // 3. Guardar el registro en la tabla 'actas'
    const { error: dbError } = await this.supabase
      .from('actas')
      .insert([{
        community_id: communityId,
        anio: anio,
        mes: mes,
        nombre_archivo: file.name,
        url_archivo: urlData.publicUrl,
        ruta_archivo: filePath
      }]);

    if (dbError) throw dbError;
  }

  async deleteActa(acta: Acta) {
    // 1. Borrar el archivo físico del Storage
    if (acta.ruta_archivo) {
      await this.supabase.storage
        .from(this.BUCKET_NAME)
        .remove([acta.ruta_archivo]);
    }

    // 2. Borrar el registro de la base de datos
    return await this.supabase
      .from('actas')
      .delete()
      .eq('id', acta.id);
  }

  async updateActaName(actaId: number, nuevoNombre: string) {
    return await this.supabase
      .from('actas')
      .update({ nombre_archivo: nuevoNombre })
      .eq('id', actaId);
  }

  // --- Métodos para Facturas ---
  async getFacturas(communityId: number, movimientoId?: number) {
    let query = this.supabase
      .from('facturas')
      .select('*')
      .eq('community_id', communityId)
      .order('created_at', { ascending: false });

    if (movimientoId) {
      query = query.eq('movimiento_id', movimientoId);
    }
    return await query;
  }

  async uploadFactura(communityId: number, file: File, movimientoId?: number) {
    // 1. Subir el archivo al Storage de Supabase (Bucket: comunidades-documentos)
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `facturas/${communityId}/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    // 2. Obtener la URL pública del archivo
    const { data: urlData } = this.supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(filePath);

    // 3. Guardar el registro en la tabla 'facturas'
    const { error: dbError } = await this.supabase
      .from('facturas')
      .insert([{
        community_id: communityId,
        movimiento_id: movimientoId,
        nombre_archivo: file.name,
        url_archivo: urlData.publicUrl,
        ruta_archivo: filePath
      }]);

    if (dbError) throw dbError;
  }

  async deleteFactura(factura: Factura) {
    // 1. Borrar el archivo físico del Storage
    if (factura.ruta_archivo) {
      await this.supabase.storage
        .from(this.BUCKET_NAME)
        .remove([factura.ruta_archivo]);
    }

    // 2. Borrar el registro de la base de datos
    return await this.supabase
      .from('facturas')
      .delete()
      .eq('id', factura.id);
  }

  async updateFacturaName(facturaId: number, nuevoNombre: string) {
    return await this.supabase
      .from('facturas')
      .update({ nombre_archivo: nuevoNombre })
      .eq('id', facturaId);
  }

  async uploadAvatar(userId: string, file: File) {
    const fileExt = file.name.split('.').pop();
    // Generamos un nombre único para evitar problemas de caché
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.BUCKET_NAME)
      .upload(filePath, file, { upsert: true });

    if (uploadError) throw uploadError;

    // Obtenemos la URL pública para guardarla en el perfil
    const { data: urlData } = this.supabase.storage
      .from(this.BUCKET_NAME)
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  }

  // --- Métodos para Anuncios ---
  async getAnuncios(communityId: number | string) {
    return await this.supabase
      .from('anuncios')
      .select('*, anuncios_leidos(count)')
      .eq('community_id', communityId)
      .order('fecha_publicacion', { ascending: false });
  }

  async getLectoresAnuncio(anuncioId: number) {
    return await this.supabase
      .from('anuncios_leidos')
      .select('fecha_lectura, profiles(email)')
      .eq('anuncio_id', anuncioId);
  }

  async getAnunciosWithReadStatus(communityId: number | string, userId: string) {
    const { data, error } = await this.supabase
      .from('anuncios')
      .select('*, anuncios_leidos(user_id)')
      .eq('community_id', communityId)
      .order('fecha_publicacion', { ascending: false });

    if (error) {
      console.error('Error fetching anuncios with read status:', error);
      return { data: null, error };
    }

    const anunciosWithReadStatus = (data || []).map(anuncio => ({
      ...anuncio,
      is_read_by_me: (anuncio.anuncios_leidos || []).some((readEntry: any) => readEntry.user_id === userId)
    }));

    return { data: anunciosWithReadStatus, error: null };
  }

  async markAnuncioAsRead(anuncioId: number, userId: string) {
    return await this.supabase
      .from('anuncios_leidos')
      .upsert({ anuncio_id: anuncioId, user_id: userId }, { onConflict: 'anuncio_id,user_id' });
  }

  async createAnuncio(anuncio: Anuncio) {
    const { data: { session } } = await this.supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");
    
    return await this.supabase
      .from('anuncios')
      .insert([{ ...anuncio, user_id: session.user.id }]);
  }

  async deleteAnuncio(id: number) {
    return await this.supabase
      .from('anuncios')
      .delete()
      .eq('id', id);
  }
}