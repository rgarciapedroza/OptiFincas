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
    
    // Determinar opciones por tipo
    const opcionesIngreso = opcionesCategoria.filter(c => 
        c.toLowerCase().includes('ingreso')
    );
    const opcionesGasto = opcionesCategoria.filter(c => 
        c.toLowerCase().includes('gasto')
    );
    
    movimientos.forEach((mov, idx) => {
        const esIngreso = mov.importe > 0;
        const catOptions = esIngreso ? opcionesIngreso : opcionesGasto;
        
        const tr = document.createElement('tr');
        tr.innerHTML = 
            '<td>' + (mov.fecha || '-') + '</td>' +
            '<td>' + (mov.concepto || '').substring(0, 35) + ((mov.concepto || '').length > 35 ? '...' : '') + '</td>' +
            '<td class="' + (esIngreso ? 'tipo-ingreso' : 'tipo-gasto') + '">' +
                mov.importe.toFixed(2) + ' €' +
            '</td>' +
            '<td>' +
                '<select class="select-tipo" data-id="' + idx + '">' +
                    '<option value="ingreso"' + (esIngreso ? ' selected' : '') + '>Ingreso</option>' +
                    '<option value="gasto"' + (!esIngreso ? ' selected' : '') + '>Gasto</option>' +
                '</select>' +
            '</td>' +
            '<td>' +
                '<select class="select-cat" data-id="' + idx + '">' +
                    catOptions.map(c => '<option value="' + c + '"' + (c === mov.categoria ? ' selected' : '') + '>' + c + '</option>').join('') +
                '</select>' +
            '</td>' +
            '<td>' +
                '<input type="text" class="input-piso" value="' + (mov.piso || '') + '" data-id="' + idx + '" placeholder="Piso">' +
            '</td>';
        tbody.appendChild(tr);
    });
}

function getMovimientosActualizados() {
    const tbody = document.getElementById('tablaBody');
    if (!tbody) return movimientosProcesados;
    
    const rows = tbody.querySelectorAll('tr');
    const actualizados = [];
    
    rows.forEach((row, idx) => {
        const mov = {...movimientosProcesados[idx]};
        
        const selectTipo = row.querySelector('.select-tipo');
        const selectCat = row.querySelector('.select-cat');
        const inputPiso = row.querySelector('.input-piso');
        
        if (selectTipo) mov.tipo = selectTipo.value;
        if (selectCat) mov.categoria = selectCat.value;
        if (inputPiso) mov.piso = inputPiso.value;
        
        actualizados.push(mov);
    });
    
    return actualizados;
}

async function confirmarYDescargar() {
    const movimientos = getMovimientosActualizados();
    
    mostrarLoading();
    
    try {
        const response = await fetch('http://127.0.0.1:8000/api/confirmar', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(movimientos)
        });
        
        if (!response.ok) throw new Error('Error al confirmar');
        
        const data = await response.json();
        
        // Decodificar base64
        const csvContent = atob(data.csv_contenido);
        
        // Descargar
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.nombre_archivo;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
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
    if (btnConfirmar) btnConfirmar.addEventListener('click', confirmarYDescargar);
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
