/**
 * Simple production server for Firebase-Only SPA
 * Serves static files built by Vite
 */

import express, { Request, Response } from 'express';
import path from 'path';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// Serve static files from dist directory
const staticPath = path.resolve(process.cwd(), 'dist');
app.use(express.static(staticPath));

// Handle SPA routing - serve index.html for all routes
app.get('*', (req: Request, res: Response) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Firebase-Only SPA running on port ${PORT}`);
  console.log(`📁 Serving static files from: ${staticPath}`);
  console.log(`🌐 Architecture: Firebase-Only SPA`);
});