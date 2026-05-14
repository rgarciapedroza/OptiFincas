import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  pantallaActual = 1;
  loading = false;
  selectedFileExtracto: File | null = null;
  selectedFileRegistros: File | null = null;
  movimientos: any[] = [];
  resumen = { total_ingresos: 0, total_gastos: 0, saldo_neto: 0 };
  error = '';

  constructor(private http: HttpClient) {}

  onFileSelected(event: any, type: 'extracto' | 'registros') {
    const file = event.target.files[0];
    if (type === 'extracto') this.selectedFileExtracto = file;
    else this.selectedFileRegistros = file;
  }

  async procesar() {
    if (!this.selectedFileExtracto || !this.selectedFileRegistros) return;
    
    this.loading = true;
    const formData = new FormData();
    formData.append('extracto', this.selectedFileExtracto);
    formData.append('registros', this.selectedFileRegistros);

    this.http.post<any>('/api/procesar-dos-archivos', formData).subscribe({
      next: (data) => {
        this.movimientos = data.movimientos_clasificados;
        this.resumen = data.resumen_general;
        this.pantallaActual = 2;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Error al procesar archivos';
        this.loading = false;
      }
    });
  }

  descargar(modo: string) {
    this.loading = true;
    // Mapeamos los movimientos editados antes de enviar
    const datosAEnviar = this.movimientos.map(m => ({
      FECHA: m.fecha || m.FECHA,
      OBSERVACIONES: m.observaciones || m.OBSERVACIONES,
      IMPORTE: m.importe || m.IMPORTE,
      CONCEPTO: m.concepto || m.CONCEPTO
    }));

    this.http.post<any>(`/api/confirmar?modo=${modo}`, datosAEnviar).subscribe({
      next: (data) => {
        const byteCharacters = atob(data.excel_contenido);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.nombre_archivo;
        a.click();
        this.loading = false;
        if(modo === 'mensual') location.reload();
      },
      error: () => {
        this.error = 'Error en la descarga';
        this.loading = false;
      }
    });
  }
}