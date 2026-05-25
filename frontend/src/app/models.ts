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
  id: string;
  community_id: string;
  extracto_id?: any;
  fecha: string;
  concepto_original: string;
  importe: number;
  saldo_resultante?: number;
  ordenante?: string;
  piso?: string;
  piso_detectado?: string;
  tipo?: string;
  categoria?: string;
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
  id: string;
  nombre: string;
  direccion: string;
  servicios?: string;
  cleaning_hours?: number;
  cleaning_days_per_week?: number;
  latitude?: number;
  longitude?: number;
  created_at?: string;
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