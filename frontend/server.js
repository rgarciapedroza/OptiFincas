const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || 8000;

// Servir archivos estáticos de Angular
app.use(express.static(path.join(__dirname, 'dist/optifincas-app')));

// Ruta para Angular (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist/optifincas-app/index.html'));
});

app.listen(port, () => {
    console.log(`Servidor Node.js corriendo en http://localhost:${port}`);
});