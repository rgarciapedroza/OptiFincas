import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class UtilsService {

  constructor() { }

  /**
   * Limpia el formato visual de un piso para guardarlo en la DB (ej: "2º J" -> "2J")
   */
  unformatPiso(formattedPiso: string | null | undefined): string {
    if (!formattedPiso) return '';
    const lowerPiso = formattedPiso.toLowerCase();
    if (lowerPiso.includes('identificar') || lowerPiso.includes('desconocido') || lowerPiso.includes('sin asignar')) return '';

    let cleanedPiso = lowerPiso.replace(/^(piso|vivienda|cuota|recibo|abono|finca)\s*/, '');
    const match = cleanedPiso.match(/^(\d+)º\s*([a-z])$/i);
    if (match) return `${match[1]}${match[2]}`.toUpperCase();
    
    return cleanedPiso.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /**
   * Formatea un código de piso para mostrarlo en la interfaz (ej: "2J" -> "2º J")
   */
  formatearPiso(piso: string | null | undefined): string {
    if (!piso || piso.trim() === '' || piso.toLowerCase() === 'nan' || piso.toLowerCase() === 'none' || piso.toLowerCase().includes('identificar')) return 'piso sin identificar';
    const rawPisoCode = this.unformatPiso(piso);
    if (!rawPisoCode) return 'piso sin identificar';

    const match = rawPisoCode.match(/^(\d+)([A-Z])$/);
    return match ? `${match[1]}º ${match[2]}` : rawPisoCode;
  }

  /**
   * Convierte valores de cualquier tipo a número con 2 decimales de forma segura.
   */
  asNumber(val: any): number {
    if (typeof val === 'number') return val;
    if (val === undefined || val === null || String(val).trim() === '') return 0;
    const str = String(val).trim().replace(/\./g, '').replace(',', '.');
    const num = parseFloat(str);
    return isNaN(num) ? 0 : Number(num.toFixed(2));
  }

  /**
   * Devuelve el nombre del mes.
   */
  getMesNombre(mes: number | null): string {
    if (!mes) return 'Registro';
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", 
                   "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    return meses[mes - 1] || 'Mes Desconocido';
  }

  /**
   * Convierte una fecha DD/MM/YYYY a formato ISO YYYY-MM-DD para la base de datos.
   */
  formatToISODate(dateStr: string): string {
    if (!dateStr || !dateStr.includes('/')) return dateStr;
    const [day, month, year] = dateStr.split('/');
    // Asegurar que el año tenga 4 dígitos
    const fullYear = year.length === 2 ? `20${year}` : year;
    const paddedMonth = month.padStart(2, '0');
    const paddedDay = day.padStart(2, '0');
    return `${fullYear}-${paddedMonth}-${paddedDay}`;
  }
}