const express = require('express');
const path = require('path');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();
const fs = require('fs'); // Import fs module

const PORT = process.env.PORT || 4200;

// Proxy config: Forward /api requests to the backend container
app.use('/api', createProxyMiddleware({
    target: 'http://backend:8000',
    changeOrigin: true
}));

app.use(express.static(path.join(__dirname, 'dist')));

// Determine the actual path to the Angular app within 'dist'
const angularDistPath = path.join(__dirname, 'dist');
let actualAngularAppPath = angularDistPath;

// Angular 16+ often puts the build in 'dist/<project-name>/browser'
// or 'dist/<project-name>'
const distContents = fs.readdirSync(angularDistPath);
for (const item of distContents) {
    const potentialPath = path.join(angularDistPath, item);
    if (fs.statSync(potentialPath).isDirectory()) {
        if (fs.existsSync(path.join(potentialPath, 'index.html'))) {
            actualAngularAppPath = potentialPath;
            break;
        }
        const browserPath = path.join(potentialPath, 'browser');
        if (fs.existsSync(path.join(browserPath, 'index.html'))) {
            actualAngularAppPath = browserPath;
            break;
        }
    }
}

console.log(`Serving Angular app from: ${actualAngularAppPath}`);
app.use(express.static(actualAngularAppPath));

// For all other requests, serve the index.html file
app.get('*', (req, res) => {
  res.sendFile(path.join(actualAngularAppPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});