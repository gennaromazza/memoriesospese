import type { Express } from "express";
import { createServer, type Server } from "http";
import { addSubscriber, removeSubscriber, getGallerySubscribers, getSubscribersStats, notifyGallerySubscribers } from "./subscribers";
import { verifyEmailConfig } from "./mailer";

export async function registerRoutes(app: Express): Promise<Server> {
  // Verifica configurazione email al startup
  await verifyEmailConfig();

  // API per gestione subscribers
  app.post('/api/galleries/:galleryId/subscribe', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { email } = req.body;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Email non valida' });
      }

      const success = await addSubscriber(galleryId, email);
      if (success) {
        res.json({ message: 'Iscrizione completata con successo' });
      } else {
        res.status(400).json({ error: 'Email già iscritta o galleria non trovata' });
      }
    } catch (error) {
      console.error('Errore nell\'iscrizione:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  app.delete('/api/galleries/:galleryId/subscribe', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email richiesta' });
      }

      const success = await removeSubscriber(galleryId, email);
      if (success) {
        res.json({ message: 'Disiscrizione completata con successo' });
      } else {
        res.status(404).json({ error: 'Email non trovata tra gli iscritti' });
      }
    } catch (error) {
      console.error('Errore nella disiscrizione:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  app.get('/api/galleries/:galleryId/subscribers', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const subscribers = await getGallerySubscribers(galleryId);
      res.json({ subscribers });
    } catch (error) {
      console.error('Errore nel recupero subscribers:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  app.get('/api/galleries/:galleryId/subscribers/stats', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const stats = await getSubscribersStats(galleryId);
      res.json(stats);
    } catch (error) {
      console.error('Errore nel recupero statistiche:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // API per notificare subscribers di nuove foto
  app.post('/api/galleries/:galleryId/notify', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { galleryName, newPhotosCount, uploaderName, uploaderRole } = req.body;

      if (!galleryName || !newPhotosCount) {
        return res.status(400).json({ error: 'Parametri mancanti' });
      }

      const result = await notifyGallerySubscribers(galleryId, galleryName, newPhotosCount);
      
      res.json({
        message: 'Notifiche inviate',
        ...result
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
