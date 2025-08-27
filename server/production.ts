/**
 * Production Server for Wedding Gallery SPA
 * Serves static files from dist/{basepath} (dynamically configured)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

// Determina dinamicamente il path di build basato su VITE_BASE_PATH
const basePath = process.env.VITE_BASE_PATH || '/';
const buildSubfolder = basePath !== '/' 
  ? basePath.replace(/^\/|\/$/g, '') // Rimuove slash iniziali/finali
  : 'dist'; // Fallback per root

// Serve static files from the build directory (dinamico)
const buildPath = path.join(__dirname, '../dist', buildSubfolder);
app.use(express.static(buildPath));

// Handle SPA routing - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Wedding Gallery Production Server Started');
  console.log(`📱 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Serving files from: ${buildPath}`);
  console.log('✅ Ready to handle requests');
});

export default app;