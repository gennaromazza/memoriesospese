import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendWelcomeEmail, sendNewPhotosNotification } from "./emailService";

export async function registerRoutes(app: Express): Promise<Server> {
  // Endpoint di test per verificare configurazione email
  app.get('/api/test-email', async (req, res) => {
    const results = {
      smtp: { available: false, error: null as string | null },
      sendgrid: { available: false, error: null as string | null },
      config: {
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT,
        user: process.env.EMAIL_USER,
        from: process.env.EMAIL_FROM,
        hasSendGridKey: false
      }
    };

    // Test SMTP
    try {
      const { createTransport } = await import('nodemailer');
      const testTransporter = createTransport({
        host: process.env.EMAIL_HOST,
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
        requireTLS: true,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000
      });

      await testTransporter.verify();
      results.smtp.available = true;
    } catch (error) {
      results.smtp.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // SendGrid rimosso - utilizziamo solo SMTP
    results.sendgrid.available = false;
    results.sendgrid.error = 'SendGrid rimosso';

    const workingProvider = results.smtp.available ? 'SMTP' : null;
    
    res.json({
      success: !!workingProvider,
      workingProvider,
      results,
      message: workingProvider ? 
        `Provider email funzionante: ${workingProvider}` : 
        'Nessun provider email funzionante'
    });
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
  
  // Funzioni helper per i template email
  const generatePasswordResetHTML = (resetLink: string, userName: string): string => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Recupera la tua password</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #ec4899, #f97316); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">🔐 Recupera Password</h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #1f2937; margin-top: 0;">Ciao ${userName}!</h2>
          
          <p style="margin-bottom: 20px;">
            Hai richiesto di reimpostare la password per il tuo account nella galleria foto.
          </p>
          
          <p style="margin-bottom: 30px;">
            Clicca sul pulsante qui sotto per creare una nuova password:
          </p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="background: linear-gradient(135deg, #ec4899, #f97316); 
                      color: white; 
                      padding: 15px 30px; 
                      text-decoration: none; 
                      border-radius: 8px; 
                      font-weight: bold; 
                      display: inline-block;
                      font-size: 16px;">
              Reimposta Password
            </a>
          </div>
          
          <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>⚠️ Importante:</strong> Questo link è valido per 1 ora. Se non hai richiesto il reset, ignora questa email.
            </p>
          </div>
          
          <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
            Se il pulsante non funziona, copia e incolla questo link nel tuo browser:<br>
            <span style="word-break: break-all; color: #3b82f6;">${resetLink}</span>
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
          
          <p style="font-size: 12px; color: #9ca3af; text-align: center; margin: 0;">
            Questa email è stata inviata automaticamente dal sistema di gallerie foto.
          </p>
        </div>
      </body>
      </html>
    `;
  };

  const generatePasswordResetText = (resetLink: string, userName: string): string => {
    return `
Ciao ${userName}!

Hai richiesto di reimpostare la password per il tuo account nella galleria foto.

Per creare una nuova password, visita il seguente link:
${resetLink}

IMPORTANTE: Questo link è valido per 1 ora. Se non hai richiesto il reset della password, ignora questa email.

Se hai problemi con il link, copia e incolla l'URL completo nel tuo browser.

---
Questa email è stata inviata automaticamente dal sistema di gallerie foto.
    `;
  };
  
  // Endpoint per il reset password
  app.post('/api/reset-password', async (req, res) => {
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).send('Email richiesta');
      }

      // Verifica se l'email esiste in Firebase Auth
      const { getAuth } = await import('firebase-admin/auth');
      const auth = getAuth();
      
      try {
        const userRecord = await auth.getUserByEmail(email);
        
        // Genera un link di reset password personalizzato
        const resetLink = await auth.generatePasswordResetLink(email);
        
        // Invia email di reset usando il nostro sistema email
        const { sendEmail } = await import('./emailService');
        
        const emailSent = await sendEmail({
          to: email,
          subject: 'Recupera la tua password - Galleria Foto',
          html: generatePasswordResetHTML(resetLink, userRecord.displayName || 'Utente'),
          text: generatePasswordResetText(resetLink, userRecord.displayName || 'Utente')
        });

        if (emailSent) {
          res.status(200).send('Email di reset inviata con successo');
        } else {
          res.status(500).send('Errore nell\'invio dell\'email di reset');
        }
      } catch (userError: any) {
        if (userError.code === 'auth/user-not-found') {
          // Per sicurezza, non rivelare se l'email esiste o meno
          res.status(200).send('Se l\'email esiste, riceverai le istruzioni per il reset');
        } else {
          throw userError;
        }
      }
    } catch (error) {
      console.error('Errore reset password:', error);
      res.status(500).send('Errore interno del server');
    }
  });

  // Keep only basic server endpoints if needed
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  const httpServer = createServer(app);

  return httpServer;
}
