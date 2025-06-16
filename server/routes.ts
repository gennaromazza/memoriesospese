import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendWelcomeEmail, sendNewPhotosNotification } from "./emailService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Endpoint di test per verificare configurazione SMTP
  app.get('/api/test-smtp', async (req, res) => {
    try {
      const { createTransport } = await import('nodemailer');
      
      const testTransporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT || '587'),
        secure: parseInt(process.env.EMAIL_PORT || '587') === 465,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
        tls: {
          rejectUnauthorized: false
        }
      });

      await testTransporter.verify();
      res.json({ 
        success: true, 
        message: 'Connessione SMTP verificata con successo',
        config: {
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          user: process.env.EMAIL_USER,
          from: process.env.EMAIL_FROM
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        error: error.message,
        config: {
          host: process.env.EMAIL_HOST,
          port: process.env.EMAIL_PORT,
          user: process.env.EMAIL_USER
        }
      });
    }
  });

  // Endpoint temporanei per le funzionalità email (implementazione semplificata)
  
  // Store temporaneo in memoria per i subscribers
  const subscribersStore: { [galleryId: string]: string[] } = {};

  app.post('/api/galleries/:galleryId/subscribe', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { email } = req.body;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Email non valida' });
      }

      if (!subscribersStore[galleryId]) {
        subscribersStore[galleryId] = [];
      }
      
      if (subscribersStore[galleryId].includes(email)) {
        return res.status(400).json({ error: 'Email già iscritta' });
      }
      
      subscribersStore[galleryId].push(email);
      res.json({ message: 'Iscrizione completata con successo' });
    } catch (error) {
      console.error('Errore nell\'iscrizione:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // Endpoint per inviare email di benvenuto
  app.post('/api/send-welcome-email', async (req, res) => {
    try {
      const { email, galleryName } = req.body;

      if (!email || !galleryName) {
        return res.status(400).json({ error: 'Email e nome galleria sono richiesti' });
      }

      const success = await sendWelcomeEmail(email, galleryName);
      
      if (success) {
        res.json({ message: 'Email di benvenuto inviata con successo' });
      } else {
        res.status(500).json({ error: 'Errore nell\'invio dell\'email di benvenuto' });
      }
    } catch (error) {
      console.error('Errore nell\'invio email di benvenuto:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // Endpoint per notificare nuove foto
  app.post('/api/galleries/:galleryId/notify', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { galleryName, newPhotosCount, uploaderName, galleryUrl, subscribers } = req.body;

      if (!subscribers || !Array.isArray(subscribers)) {
        return res.status(400).json({ error: 'Lista subscribers richiesta' });
      }

      let successCount = 0;
      let failedCount = 0;

      // Invia email a tutti i subscribers
      for (const email of subscribers) {
        try {
          const success = await sendNewPhotosNotification(
            email,
            galleryName,
            newPhotosCount,
            uploaderName,
            galleryUrl
          );
          
          if (success) {
            successCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          console.error(`Errore invio email a ${email}:`, error);
          failedCount++;
        }
      }

      res.json({
        message: `Notifiche inviate: ${successCount} successi, ${failedCount} errori`,
        success: successCount,
        failed: failedCount
      });
    } catch (error) {
      console.error('Errore nell\'invio notifiche:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // Since we're using Firebase directly from the frontend,
  // we don't need any API routes for galleries or password requests
  
  // Keep only basic server endpoints if needed
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  const httpServer = createServer(app);

  return httpServer;
}
