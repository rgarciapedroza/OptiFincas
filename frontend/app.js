/**
 * App principal - Procesador de Extractos Bancarios
 */

// Variables globales
let selectedFileExtracto = null;
let selectedFileRegistros = null;
let movimientosProcesados = [];
let opcionesCategoria = [];

// ==================== Utilidades ====================

function mostrarError(mensaje) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
        errorDiv.textContent = mensaje;
        errorDiv.classList.add('show');
        setTimeout(() => errorDiv.classList.remove('show'), 5000);
    }
}

function mostrarLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.add('show');
}

function ocultarLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');
}

function mostrarPantalla(numero) {
    const pantallas = document.querySelectorAll('.pantalla');
    pantallas.forEach(p => p.style.display = 'none');
    const pantalla = document.getElementById('pantalla' + numero);
    if (pantalla) pantalla.style.display = 'block';
}

// ==================== Configurar Upload ====================

function configurarUpload() {
    // Upload Extracto del mes
    const uploadZoneExtracto = document.getElementById('uploadZoneExtracto');
    const fileInputExtracto = document.getElementById('fileInputExtracto');
    
    if (uploadZoneExtracto && fileInputExtracto) {
        uploadZoneExtracto.addEventListener('click', () => fileInputExtracto.click());
        
        uploadZoneExtracto.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZoneExtracto.classList.add('dragover');
        });
        
        uploadZoneExtracto.addEventListener('dragleave', () => {
            uploadZoneExtracto.classList.remove('dragover');
        });
        
        uploadZoneExtracto.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZoneExtracto.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files.length) {
                handleFileSelectExtracto(e.dataTransfer.files[0]);
            }
        });
        
        fileInputExtracto.addEventListener('change', (e) => {
            if (e.target && e.target.files && e.target.files.length) {
                handleFileSelectExtracto(e.target.files[0]);
            }
        });
    }
    
    // Upload Registros mensuales
    const uploadZoneRegistros = document.getElementById('uploadZoneRegistros');
    const fileInputRegistros = document.getElementById('fileInputRegistros');
    
    if (uploadZoneRegistros && fileInputRegistros) {
        uploadZoneRegistros.addEventListener('click', () => fileInputRegistros.click());
        
        uploadZoneRegistros.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZoneRegistros.classList.add('dragover');
        });
        
        uploadZoneRegistros.addEventListener('dragleave', () => {
            uploadZoneRegistros.classList.remove('dragover');
        });
        
        uploadZoneRegistros.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZoneRegistros.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files.length) {
                handleFileSelectRegistros(e.dataTransfer.files[0]);
            }
        });
        
        fileInputRegistros.addEventListener('change', (e) => {
            if (e.target && e.target.files && e.target.files.length) {
                handleFileSelectRegistros(e.target.files[0]);
            }
        });
    }
}

function handleFileSelectExtracto(file) {
    selectedFileExtracto = file;
    const fileInfo = document.getElementById('fileInfoExtracto');
    if (fileInfo) {
        fileInfo.textContent = '🏦 ' + file.name;
        fileInfo.style.display = 'block';
    }
    checkFilesReady();
}

function handleFileSelectRegistros(file) {
    selectedFileRegistros = file;
    const fileInfo = document.getElementById('fileInfoRegistros');
    if (fileInfo) {
        fileInfo.textContent = '📋 ' + file.name;
        fileInfo.style.display = 'block';
    }
    checkFilesReady();
}

function checkFilesReady() {
    const processBtn = document.getElementById('processBtn');
    if (processBtn && selectedFileExtracto && selectedFileRegistros) {
        processBtn.disabled = false;
    }
}

// ==================== Procesar ====================

async function procesarExtracto() {
    if (!selectedFileExtracto || !selectedFileRegistros) {
        mostrarError('Sube ambos archivos primero');
        return;
    }
    
    mostrarError('');
    mostrarLoading();
    mostrarPantalla(2);
    
    const formData = new FormData();
    formData.append('extracto', selectedFileExtracto);
    formData.append('registros', selectedFileRegistros);
    
    try {
        const response = await fetch('http://127.0.0.1:8000/api/procesar-dos-archivos', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Error al procesar');
        }
        
        const data = await response.json();
        movimientosProcesados = data.movimientos_clasificados;
        
        // Guardar opciones para selects
        opcionesCategoria = Object.keys(data.resumen_categorias || {});
        
        // Mostrar resumen
        document.getElementById('totalIngresos').textContent = 
            data.resumen_general.total_ingresos.toFixed(2) + ' €';
        document.getElementById('totalGastos').textContent = 
            data.resumen_general.total_gastos.toFixed(2) + ' €';
        document.getElementById('saldoNeto').textContent = 
            data.resumen_general.saldo_neto.toFixed(2) + ' €';
        
        // Renderizar tabla
        renderizarTabla(data.movimientos_clasificados);
        
        ocultarLoading();
    } catch (error) {
        mostrarError('Error: ' + error.message);
        ocultarLoading();
        mostrarPantalla(1);
    }
}

function renderizarTabla(movimientos) {
    const tbody = document.getElementById('tablaBody');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    movimientos.forEach((mov, idx) => {
        const esIngreso = mov.importe > 0;
        
        const tr = document.createElement('tr');
        
        // Punto indicador de histórico
        let indicadorHistorico = '';
        if (mov.es_historico) {
            indicadorHistorico = `<span class="badge-historico" 
                style="color: #2196f3; cursor: help; margin-right: 5px; font-weight: bold;" 
                onclick="mostrarDetalleHistorico(${idx})">●</span>`;
        }

        tr.innerHTML = 
            '<td>' + (mov.FECHA || '-') + '</td>' +
            '<td>' + (mov.OBSERVACIONES || '-') + '</td>' +
            '<td class="' + (esIngreso ? 'tipo-ingreso' : 'tipo-gasto') + '">' +
                mov.importe.toFixed(2) + ' €' +
            '</td>' +
            '<td>' + (typeof mov.SALDO === 'number' ? mov.SALDO.toFixed(2) + ' €' : '-') + '</td>' +
            '<td>' + 
                indicadorHistorico + 
                '<input type="text" class="input-concepto-edit" value="' + (mov.CONCEPTO || '') + '" data-id="' + idx + '" style="width: 120px;">' +
            '</td>';

        tbody.appendChild(tr);
    });
}

function mostrarDetalleHistorico(idx) {
    const mov = movimientosProcesados[idx];
    if (!mov || !mov.detalle_historico) return;

    const modal = document.getElementById('modalInfo');
    const body = document.getElementById('modalBody');
    
    // Usamos las nuevas claves del detalle_historico para mostrar la información
    body.innerHTML = `
        <p><strong>Piso asignado:</strong> ${mov.detalle_historico.piso_asignado}</p>
        <p><strong>Observación del movimiento actual:</strong> ${mov.detalle_historico.observacion_movimiento_actual}</p>
        <p><strong>Concepto original del movimiento actual:</strong> ${mov.detalle_historico.concepto_original_movimiento_actual}</p>
        <p style="background: #f0f7ff; padding: 10px; border-radius: 5px; border-left: 3px solid #2196f3;">
            ${mov.detalle_historico.motivo}
        </p>
    `;
    
    modal.style.display = 'block';
}

function getMovimientosActualizados() {
    const tbody = document.getElementById('tablaBody');
    if (!tbody) return movimientosProcesados;
    
    const inputs = tbody.querySelectorAll('.input-concepto-edit');
    const actualizados = [...movimientosProcesados];
    
    inputs.forEach(input => {
        const idx = parseInt(input.getAttribute('data-id'));
        actualizados[idx].CONCEPTO = input.value;
    });
    
    return actualizados;
}

async function confirmarYDescargar(modo) {
    const movimientos = getMovimientosActualizados();
    
    mostrarLoading();
    
    try {
        // Para evitar el error 422, enviamos la lista de movimientos directamente.
        // Pasamos el 'modo' como un parámetro de consulta (URL) para que no rompa la validación del cuerpo.
        const url = new URL('http://127.0.0.1:8000/api/confirmar');
        url.searchParams.append('modo', modo);

        const response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(movimientos)
        });
        
        if (!response.ok) throw new Error('Error al confirmar');
        
        const data = await response.json();
        
        // Procesar descarga de Excel (Binario desde base64)
        const byteCharacters = atob(data.excel_contenido);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = data.nombre_archivo;
        document.body.appendChild(a);
        a.click();
        
        // Retardo para evitar que el navegador cancele la descarga al revocar la URL demasiado pronto
        setTimeout(() => {
            window.URL.revokeObjectURL(downloadUrl);
            if (document.body.contains(a)) document.body.removeChild(a);
        }, 150);
        
        ocultarLoading();
        mostrarPantalla(3);
    } catch (error) {
        mostrarError('Error: ' + error.message);
        ocultarLoading();
    }
}

function ocultarErrorDiv() {
    const errorDiv = document.getElementById('error');
    if (errorDiv) errorDiv.classList.remove('show');
}

// ==================== Botones ====================

function configurarBotones() {
    const processBtn = document.getElementById('processBtn');
    const btnAtras = document.getElementById('btnAtras');
    const btnConfirmar = document.getElementById('btnConfirmar');
    const btnReiniciar = document.getElementById('btnReiniciar');
    
    if (processBtn) processBtn.addEventListener('click', procesarExtracto);
    if (btnAtras) btnAtras.addEventListener('click', () => mostrarPantalla(1));
    
    document.getElementById('btnDescargarMensual')?.addEventListener('click', () => confirmarYDescargar('mensual'));
    document.getElementById('btnDescargarHistorico')?.addEventListener('click', () => confirmarYDescargar('historico'));

    if (btnReiniciar) {
        btnReiniciar.addEventListener('click', () => {
            selectedFileExtracto = null;
            selectedFileRegistros = null;
            movimientosProcesados = [];
            location.reload();
        });
    }
}

// ==================== Inicializar ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🏦 Iniciando procesador...');
    configurarUpload();
    configurarBotones();
    mostrarPantalla(1);
    console.log('✅ Listo');
});
