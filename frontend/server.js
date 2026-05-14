const express = require('express');
const multer = require('multer');
const cors = require('cors');
const xlsx = require('xlsx');
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Servir archivos estáticos de Angular
app.use(express.static(path.join(__dirname, 'dist/optifincas-app')));

// Configuración de PostgreSQL
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'optifincas',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Función auxiliar para buscar columnas sin importar mayúsculas/minúsculas
const getVal = (obj, key) => {
    const target = key.toLowerCase();
    const foundKey = Object.keys(obj).find(k => k.toLowerCase() === target || k.toLowerCase().includes(target));
    return foundKey ? obj[foundKey] : null;
};

app.post('/api/procesar-dos-archivos', upload.fields([ 
    { name: 'extracto', maxCount: 1 },
    { name: 'registros', maxCount: 1 }
]), async (req, res) => {
    try {
        if (!req.files.extracto || !req.files.registros) {
            return res.status(400).json({ detail: "Faltan archivos" });
        }

        // Leer archivos
        const workbookExt = xlsx.read(req.files.extracto[0].buffer, { type: 'buffer' });
        const workbookReg = xlsx.read(req.files.registros[0].buffer, { type: 'buffer' });

        const extractoData = xlsx.utils.sheet_to_json(workbookExt.Sheets[workbookExt.SheetNames[0]]);
        const registrosData = xlsx.utils.sheet_to_json(workbookReg.Sheets[workbookReg.SheetNames[0]]);

        // En un escenario real, aquí podrías insertar registrosData en PostgreSQL
        // para alimentar el sistema híbrido (Regex + DB).

        let totalIngresos = 0;
        let totalGastos = 0;

        const movimientosClasificados = extractoData.map(mov => {
            const importe = parseFloat(getVal(mov, 'importe')) || 0;
            if (importe > 0) totalIngresos += importe; else totalGastos += Math.abs(importe);

            const obsActual = String(getVal(mov, 'observaciones') || '').toLowerCase();
            const ordenanteActual = String(getVal(mov, 'ordenante') || '').toLowerCase();

            // Lógica de emparejamiento con histórico (simplificada)
            const coincidencia = registrosData.find(reg => {
                const obsHist = String(getVal(reg, 'observaciones') || '').toLowerCase();
                return obsHist && obsActual.includes(obsHist);
            });

            let item = { ...mov };
            if (coincidencia) {
                item.es_historico = true;
                item.concepto = getVal(coincidencia, 'concepto');
                item.detalle_historico = {
                    motivo: "Coincidencia encontrada por observaciones",
                    piso_encontrado: getVal(coincidencia, 'concepto'),
                    observacion_historica: getVal(coincidencia, 'observaciones')
                };
            }

            return item;
        });

        res.json({
            movimientos_clasificados: movimientosClasificados,
            resumen_general: {
                total_ingresos: totalIngresos,
                total_gastos: totalGastos,
                saldo_neto: totalIngresos - totalGastos
            },
            resumen_categorias: {} // Opcional: implementar lógica de categorías aquí
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ detail: "Error procesando archivos: " + error.message });
    }
});

app.post('/api/confirmar', async (req, res) => {
    try {
        const movimientos = req.body;
        const modo = req.query.modo || 'mensual';

        // Persistencia en PostgreSQL si es el histórico actualizado
        if (modo === 'historico') {
            for (const mov of movimientos) {
                await pool.query(
                    'INSERT INTO movimientos_historicos (fecha, observaciones, importe, concepto) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
                    [mov.FECHA, mov.OBSERVACIONES, mov.IMPORTE, mov.CONCEPTO]
                );
            }
        }

        // Generación de Excel
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(movimientos);
        xlsx.utils.book_append_sheet(wb, ws, "Resultados");

        // Generar buffer
        const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
        
        res.json({
            excel_contenido: buf.toString('base64'),
            nombre_archivo: `extracto_${modo}_${new Date().getTime()}.xlsx`
        });
    } catch (error) {
        res.status(500).json({ detail: error.message });
    }
});

// Ruta para Angular (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/optifincas-app/index.html'));
});

app.listen(port, () => {
    console.log(`Servidor Node.js corriendo en http://localhost:${port}`);
});