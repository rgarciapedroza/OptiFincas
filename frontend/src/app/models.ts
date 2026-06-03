// Modelos de Usuario y Organización
export interface Organization {
  id: string;
  nombre: string;
  created_at?: string;
}

export interface Profile {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'propietario';
  organizacion_id?: string;
  status?: 'pending' | 'approved' | 'denied';
}

// Definición de interfaz para Detalle Histórico
export interface DetalleHistorico {
  campo_coincidencia_historico?: string;
  mes_historico?: number;
  anio_historico?: number;
  valor_coincidencia_historico?: string; // New: The actual content that matched
  concepto_historico_original?: string; // New: Original concept from historical record
  ordenante_historico?: string; // New: Ordenante from historical record
  ordenante_actual?: string;
  ordenante_identificado?: string;
  piso_asignado?: string;
  concepto_original?: string;
  observacion_historica?: string;
  piso_encontrado?: string;
  motivo?: string;
}

// Definición de interfaz para Movimientos Bancarios
export interface MovimientoBancario {
  id: number;
  community_id: number;
  extracto_id?: any;
  fecha: string;
  concepto_original: string;
  importe: number;
  saldo_resultante?: number | null;
  ordenante?: string | null;
  piso?: string | null;
  piso_detectado?: string | null;
  tipo?: string | null;
  categoria?: string | null;
  // Propiedades adicionales para la lógica de histórico
  es_historico?: boolean;
  detalle_historico?: DetalleHistorico;
  CONCEPTO?: string; // Added for type safety based on previous errors
  metodo_piso?: string;
  confianza_clasificacion?: number;
  created_at: string;
}

export interface Piso {
  id?: number;
  community_id: number;
  codigo: string;
  propietario?: string;
  telefono1?: string;
  telefono2?: string;
  email?: string;
  observaciones?: string;
  cargo?: string;
}

export interface Community {
  id: number;
  address: string;
  cleaningHours: number;
  cleaningDaysPerWeek: number;
  latitude: number;
  longitude: number;
}

export interface ComunidadDB {
  id: number;
  nombre: string;
  direccion: string;
  servicios?: string;
  cleaning_hours?: number;
  cleaning_days_per_week?: number;
  latitude?: number;
  longitude?: number;
  created_at?: string;
}

export interface Anuncio {
  id?: number;
  community_id: number;
  titulo: string;
  contenido: string;
  es_importante: boolean;
  fecha_publicacion?: string;
  user_id?: string;
  anuncios_leidos?: any;
  is_read_by_me?: boolean;
}

export interface ExtractoProcesado {
  id: number;
  comunidad_id: number;
  nombre_archivo: string;
  fecha_subida: string;
  mes_contable: number;
  anio_contable: number;
  movimientos_count?: number;
}

export interface FinanzasData {
  ingresosPorPiso: any[];
  gastos: any[];
  ingresosSinIdentificar?: any[];
  resumenCuentas: {
    saldoAnterior: number;
    ingresosMes: number;
    gastosMes: number;
    saldoTotal: number;
  };
}

export interface ImportProgress {
  processed: { name: string, count: number }[];
  skipped: { name: string, reason: string }[];
}

export interface Acta {
  id?: number;
  community_id: number;
  anio: number;
  mes: number;
  nombre_archivo: string;
  url_archivo: string;
  ruta_archivo: string;
  created_at?: string;
}

export interface Factura {
  id?: number;
  community_id: number;
  movimiento_id?: number;
  nombre_archivo: string;
  url_archivo: string;
  ruta_archivo: string;
  created_at?: string;
}