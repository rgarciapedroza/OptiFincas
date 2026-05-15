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

    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) actionButtons.classList.add('d-none'); // Ocultar botones mientras carga
}

function ocultarLoading() {
    const loading = document.getElementById('loading');
    if (loading) loading.classList.remove('show');

    const actionButtons = document.getElementById('actionButtons');
    if (actionButtons) actionButtons.classList.remove('d-none'); // Mostrar botones de nuevo
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
    const uploadZoneExtracto = document.getElementById('uploadZoneExtracto');
    const fileInfoExtracto = document.getElementById('fileInfoExtracto');
    if (fileInfoExtracto && uploadZoneExtracto) {
        uploadZoneExtracto.classList.add('has-file');
        fileInfoExtracto.innerHTML = `
            <div class="file-upload-badge">
                <div class="file-icon">📊</div>
                <div class="file-details">
                    <span class="file-name">${file.name}</span>
                    <span class="file-status">Listo para procesar</span>
                </div>
                <button class="remove-file-btn" type="button" onclick="event.stopPropagation(); removeFile('extracto')">×</button>
            </div>
        `;
        fileInfoExtracto.style.display = 'flex';
        uploadZoneExtracto.querySelector('.upload-text').style.display = 'none'; // Ocultar texto "Arrastra y suelta"
    }
    checkFilesReady();
}

function handleFileSelectRegistros(file) {
    selectedFileRegistros = file;
    const uploadZoneRegistros = document.getElementById('uploadZoneRegistros');
    const fileInfoRegistros = document.getElementById('fileInfoRegistros');
    if (fileInfoRegistros && uploadZoneRegistros) {
        uploadZoneRegistros.classList.add('has-file');
        fileInfoRegistros.innerHTML = `
            <div class="file-upload-badge">
                <div class="file-icon">📗</div>
                <div class="file-details">
                    <span class="file-name">${file.name}</span>
                    <span class="file-status">Referencia cargada</span>
                </div>
                <button class="remove-file-btn" onclick="event.stopPropagation(); removeFile('registros')">×</button>
            </div>
        `;
        fileInfoRegistros.style.display = 'flex';
        uploadZoneRegistros.querySelector('.upload-text').style.display = 'none'; // Ocultar texto "Arrastra y suelta"
    }
    checkFilesReady();
}

function checkFilesReady() {
    const processBtn = document.getElementById('processBtn');
    if (processBtn) {
        const isReady = !!(selectedFileExtracto && selectedFileRegistros);
        processBtn.disabled = !isReady;
        if (isReady) {
            processBtn.classList.add('btn-ready');
        } else {
            processBtn.classList.remove('btn-ready');
        }
    }
}

function removeFile(type) {
    if (type === 'extracto') {
        selectedFileExtracto = null;
        const zone = document.getElementById('uploadZoneExtracto');
        const info = document.getElementById('fileInfoExtracto');
        if (zone) {
            zone.classList.remove('has-file');
            zone.querySelector('.upload-text').style.display = 'block'; // Mostrar texto "Arrastra y suelta"
        }
        if (info) info.innerHTML = ''; // Limpiar el contenido en lugar de ocultar
    } else {
        selectedFileRegistros = null;
        const zone = document.getElementById('uploadZoneRegistros');
        const info = document.getElementById('fileInfoRegistros');
        if (zone) {
            zone.classList.remove('has-file');
            zone.querySelector('.upload-text').style.display = 'block'; // Mostrar texto "Arrastra y suelta"
        }
        if (info) info.innerHTML = ''; // Limpiar el contenido en lugar de ocultar
    }
    checkFilesReady();
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

    // Mostrar/ocultar columna ORDENANTE según el tipo de extracto subido (Excel vs CSV)
    const esCsv = !!(selectedFileExtracto && selectedFileExtracto.name && selectedFileExtracto.name.toLowerCase().endsWith('.csv'));
    // Asegurar que seleccionamos el encabezado de la tabla correcta
    const headerOrdenante = tbody.closest('table').querySelector('thead th:nth-child(2)');
    if (headerOrdenante) headerOrdenante.style.display = esCsv ? 'none' : '';

    tbody.innerHTML = '';

    movimientos.forEach((mov, idx) => {
        // Función auxiliar para obtener valores sin importar si la clave es mayúscula o minúscula
        const getVal = (o, k) => {
            const keys = Object.keys(o);
            // 1. Coincidencia exacta (ignorando caja)
            let foundKey = keys.find(key => key.toLowerCase() === k.toLowerCase());
            if (foundKey) return o[foundKey];
            // 2. Coincidencia parcial (el nombre de la columna contiene la palabra clave)
            foundKey = keys.find(key => key.toLowerCase().includes(k.toLowerCase()));
            if (foundKey) return o[foundKey];
            return undefined;
        };

        const importeVal = parseFloat(getVal(mov, 'importe')) || 0;
        const saldoVal = parseFloat(getVal(mov, 'saldo')) || 0;
        const fechaVal = getVal(mov, 'fecha') || '-';
        const esIngreso = importeVal > 0;
        
        const tr = document.createElement('tr');
        
        // Punto indicador de histórico
        let indicadorHistorico = ''; // No hay emoticono
        if (mov.es_historico) {
            indicadorHistorico = `<span class="badge-historico" 
                style="color: #2196f3; cursor: help; margin-right: 5px; font-weight: bold;" 
                onclick="mostrarDetalleHistorico(${idx})">●</span>`;
        }

        let valorOrdenante = getVal(mov, 'ordenante') || getVal(mov, 'beneficiario') || '';
        // Limpieza robusta de valores "NaN" (comunes en datos provenientes de Python/Pandas)
        if (String(valorOrdenante).toLowerCase() === 'nan') {
            valorOrdenante = '';
        }

        let valorObs = getVal(mov, 'observaciones') || getVal(mov, 'observación') || '';
        if (String(valorObs).toLowerCase() === 'nan') {
            valorObs = '';
        }
        const conceptoVal = getVal(mov, 'concepto') || '';

        // Construcción condicional del HTML de la fila
        let filaHtml = '<td>' + fechaVal + '</td>';
        
        if (!esCsv) {
            filaHtml += '<td>' + valorOrdenante + '</td>';
        }
        
        filaHtml += '<td>' + (valorObs || '-') + '</td>' +
                    '<td class="' + (esIngreso ? 'tipo-ingreso' : 'tipo-gasto') + '">' +
                        importeVal.toFixed(2) + ' €' +
                    '</td>' +
                    '<td>' + saldoVal.toFixed(2) + ' €' + '</td>' +
                    '<td>' + 
                        indicadorHistorico + 
                        '<input type="text" class="input-concepto-edit" value="' + conceptoVal + '" data-id="' + idx + '" style="width: 120px;">' +
                    '</td>';

        tr.innerHTML = filaHtml;
        tbody.appendChild(tr);
    });
}

function mostrarDetalleHistorico(idx) {
    const mov = movimientosProcesados[idx];
    if (!mov || !mov.detalle_historico) return;

    const modal = document.getElementById('modalInfo');
    const body = document.getElementById('modalBody');
    
    const h = mov.detalle_historico;
    let htmlInfo = ''; // Inicializar htmlInfo
    
    if (h.ordenante_actual && h.ordenante_identificado) {
        htmlInfo += `
            <p><strong>Ordenante actual:</strong> ${h.ordenante_actual}</p>
            <p><strong>Identificado como:</strong> ${h.ordenante_identificado}</p>
            <p><strong>Piso asignado:</strong> <span style="color: #2196f3; font-weight: bold;">${h.piso_asignado}</span></p>
        `;
    } else {
        htmlInfo += `
            <p><strong>Concepto original:</strong> ${h.concepto_original || 'N/A'}</p>
            <p><strong>Observación histórica coincidente:</strong> ${h.observacion_historica || 'N/A'}</p>
            <p><strong>Piso encontrado:</strong> <span style="color: #2196f3; font-weight: bold;">${h.piso_encontrado}</span></p>
        `;
    }

    body.innerHTML = `
        ${htmlInfo}
        <p style="background: #f0f7ff; padding: 10px; border-radius: 5px; border-left: 3px solid #2196f3; font-size: 0.9em; margin-top: 15px;">
            ${h.motivo}
        </p>
    `;
    
    modal.style.display = 'block';
}

function getMovimientosActualizados() {
    const tbody = document.getElementById('tablaBody');
    if (!tbody) return movimientosProcesados;
    
    const esCsv = !!(selectedFileExtracto && selectedFileExtracto.name && selectedFileExtracto.name.toLowerCase().endsWith('.csv'));

    return movimientosProcesados.map((mov, idx) => {
        const input = tbody.querySelector(`.input-concepto-edit[data-id="${idx}"]`);
        const conceptoActualizado = input ? input.value : (mov.CONCEPTO || '');
        
        const getVal = (o, k) => {
            const keys = Object.keys(o);
            let foundKey = keys.find(key => key.toLowerCase() === k.toLowerCase());
            if (foundKey) return o[foundKey];
            foundKey = keys.find(key => key.toLowerCase().includes(k.toLowerCase()));
            if (foundKey) return o[foundKey];
            return undefined;
        };

        const resto = { ...mov };
        ['fecha', 'ordenante', 'beneficiario', 'observaciones', 'observación', 'importe', 'saldo', 'concepto'].forEach(k => {
            // Eliminar cualquier variante de la clave para que no choque con las nuevas claves en mayúsculas
            const keyToDelete = Object.keys(resto).find(rk => rk.toLowerCase().includes(k.toLowerCase()));
            if (keyToDelete) delete resto[keyToDelete];
        });

        const objFinal = {
            FECHA: getVal(mov, 'fecha') || '-',
            OBSERVACIONES: getVal(mov, 'observaciones') || '',
            IMPORTE: parseFloat(getVal(mov, 'importe')) || 0,
            SALDO: parseFloat(getVal(mov, 'saldo')) || 0,
            CONCEPTO: conceptoActualizado,
            ...resto
        };

        if (!esCsv) {
            objFinal.ORDENANTE = getVal(mov, 'ordenante') || getVal(mov, 'beneficiario') || '';
        }

        return objFinal;
    });
}

async function confirmarYDescargar(modo) {
    const movimientos = getMovimientosActualizados();
    
    // Mostrar “procesando” y ocultar el bloque de acciones inmediatamente
    mostrarLoading();
    mostrarPantalla(2);
    
    try {
        // Para evitar el error 422, enviamos la lista de movimientos directamente.
        // Pasamos el 'modo' como un parámetro de consulta (URL) para que no rompa la validación del cuerpo.
        const url = new URL('http://127.0.0.1:8000/api/confirmar');
        url.searchParams.append('modo', modo);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
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
        location.reload(); // Reiniciar la página después de la descarga
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

function mostrarOpcionesDescarga() {
    document.getElementById('modalDescarga').style.display = 'block';
}

function cerrarModalDescarga() {
    document.getElementById('modalDescarga').style.display = 'none';
}

function configurarBotones() {
    const processBtn = document.getElementById('processBtn');
    const btnAtras = document.getElementById('btnAtras');
    const btnReiniciar = document.getElementById('btnReiniciar');
    const btnDescargarMensual = document.getElementById('btnDescargarMensual');
    const btnDescargarHistorico = document.getElementById('btnDescargarHistorico');
    
    if (processBtn) processBtn.addEventListener('click', procesarExtracto);
    if (btnAtras) btnAtras.addEventListener('click', () => mostrarPantalla(1));
    
    if (btnDescargarMensual) {
        btnDescargarMensual.addEventListener('click', () => confirmarYDescargar('mensual'));
    }
    if (btnDescargarHistorico) {
        btnDescargarHistorico.addEventListener('click', () => confirmarYDescargar('historico'));
    }

    if (btnReiniciar) {
        btnReiniciar.addEventListener('click', () => {
            location.reload();
        });
    }
}

// ==================== Inicializar ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Iniciando procesador...');
    
    // Exponer removeFile al ámbito global para el onclick
    window.removeFile = removeFile;

    configurarUpload();
    configurarBotones();
    mostrarPantalla(1);
});
