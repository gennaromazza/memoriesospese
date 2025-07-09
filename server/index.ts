import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Verifica SMTP Netsons all'avvio (non bloccante)
  try {
    if (process.env.NODE_ENV === 'production') {
      console.log('📧 Sistema email centralizzato su Netsons SMTP configurato');
      // Verifica SMTP in background senza bloccare l'avvio
      const { verifyEmailConfig } = await import("./mailer");
      verifyEmailConfig()
        .then(() => console.log('✅ SMTP Netsons verificato in produzione'))
        .catch(error => console.warn('⚠️ SMTP Netsons non raggiungibile, continuando senza email:', error));
    } else {
      console.log('📧 Sistema email centralizzato su Netsons SMTP configurato');
      console.log('⚠️ Verifica SMTP sarà richiesta in produzione');
    }
  } catch (error) {
    console.warn('⚠️ Errore inizializzazione email service, continuando senza email:', error);
  }

  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.PORT || 5000;
  const host = "0.0.0.0";

  server.listen(port, host, () => {
    console.log(`✅ Server avviato con successo!`);
    console.log(`🌐 Porta: ${port} (forwarded to 80/443)`);
    console.log(`🏠 Host: ${host} (external access enabled)`);
    console.log(`🚀 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📍 Server pronto per deployment su Replit`);
    log(`serving on port ${port}`);
  }).on('error', (err) => {
    console.error('❌ Errore binding server:', err);
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Porta ${port} già in uso`);
    } else if (err.code === 'EACCES') {
      console.error(`❌ Permessi insufficienti per porta ${port}`);
    }
  });
})();