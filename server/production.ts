/**
 * Production Server for Wedding Gallery SPA
 * Serves static files from dist/{basepath} (dynamically configured)
 */

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createSeoMiddleware } from './seo-prerender';
import { generateDynamicSitemap } from './sitemap-generator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);

const basePath = process.env.VITE_BASE_PATH || '/';
const buildSubfolder = basePath !== '/' 
  ? basePath.replace(/^\/|\/$/g, '')
  : 'dist';

const buildPath = path.join(__dirname, '../dist', buildSubfolder);

app.use(createSeoMiddleware());

app.get('/sitemap.xml', async (req, res) => {
  try {
    const sitemap = await generateDynamicSitemap();
    res.header('Content-Type', 'application/xml; charset=utf-8');
    res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(sitemap);
  } catch (error) {
    console.error('Errore generazione sitemap:', error);
    res.status(500).send('Errore generazione sitemap');
  }
});

app.use(express.static(buildPath));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Wedding Gallery Production Server Started');
  console.log(`📱 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📁 Serving files from: ${buildPath}`);
  console.log('🔍 SEO prerender middleware attivo per crawler e AI');
  console.log('✅ Ready to handle requests');
});

export default app;
