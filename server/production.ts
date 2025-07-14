/**
 * Simple production server for Firebase-Only SPA
 * Serves static files built by Vite
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Serve static files from dist directory
const staticPath = path.join(__dirname, '..', 'dist');
app.use(express.static(staticPath));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Firebase-Only SPA running on port ${PORT}`);
  console.log(`📁 Serving static files from: ${staticPath}`);
  console.log(`🌐 Architecture: Firebase-Only SPA`);
});