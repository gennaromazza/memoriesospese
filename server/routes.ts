import type { Express } from "express";
import { createServer, type Server } from "http";
// Temporaneamente disabilitiamo le funzioni email per far ripartire il server
// import { addSubscriber, removeSubscriber, getGallerySubscribers, getSubscribersStats, notifyGallerySubscribers } from "./subscribers";
// import { verifyEmailConfig } from "./mailer";

export async function registerRoutes(app: Express): Promise<Server> {
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

  app.post('/api/galleries/:galleryId/notify', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { galleryName, newPhotosCount } = req.body;

      // Per ora loggiamo solo la notifica
      console.log(`Notifica: ${newPhotosCount} nuove foto aggiunte alla galleria "${galleryName}"`);
      const subscribers = subscribersStore[galleryId] || [];
      console.log(`Subscribers da notificare: ${subscribers.length}`);
      
      res.json({
        message: 'Notifica registrata',
        success: subscribers.length,
        failed: 0
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
