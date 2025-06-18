import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendWelcomeEmail, sendNewPhotosNotification } from "./emailService";
import { insertVoiceMemoSchema } from "../shared/schema";
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { db } from './firebase';

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

  // Voice Memos API Routes
  
  // Caricamento di un nuovo voice memo
  app.post('/api/galleries/:galleryId/voice-memos', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const voiceMemoData = req.body;

      // Preprocessa i dati per gestire valori null
      const processedData = {
        ...voiceMemoData,
        galleryId,
        unlockDate: voiceMemoData.unlockDate || undefined,
        message: voiceMemoData.message || undefined,
        duration: voiceMemoData.duration || undefined
      };

      // Validazione dei dati
      const validatedData = insertVoiceMemoSchema.parse(processedData);

      // Determina se il memo deve essere sbloccato immediatamente
      const isUnlocked = !validatedData.unlockDate || new Date(validatedData.unlockDate) <= new Date();

      // Crea il documento nel database Firebase
      const docRef = await addDoc(collection(db, 'voiceMemos'), {
        ...validatedData,
        isUnlocked,
        createdAt: serverTimestamp()
      });

      // Recupera il documento appena creato
      const docSnap = await getDoc(docRef);
      const voiceMemo = { id: docSnap.id, ...docSnap.data() };

      res.status(201).json(voiceMemo);
    } catch (error) {
      console.error('Errore nel caricamento voice memo:', error);
      res.status(500).json({ 
        error: 'Errore nel caricamento del voice memo' 
      });
    }
  });

  // Recupero di tutti i voice memos di una galleria
  app.get('/api/galleries/:galleryId/voice-memos', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { includeAll } = req.query; // Per admin, include anche i locked

      const q = query(
        collection(db, 'voiceMemos'),
        where('galleryId', '==', galleryId)
      );

      const querySnapshot = await getDocs(q);
      let voiceMemos = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];

      // Ordina i memo per data di creazione (più recenti prima)
      voiceMemos.sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(a.createdAt);
        const bTime = b.createdAt?.toDate?.() || new Date(b.createdAt);
        return bTime.getTime() - aTime.getTime();
      });

      // Verifica e aggiorna lo stato di unlock per i memo con data di sblocco
      const now = new Date();
      const updates = [];

      for (const memo of voiceMemos) {
        if (!memo.isUnlocked && memo.unlockDate && new Date(memo.unlockDate) <= now) {
          const updatePromise = updateDoc(doc(db, 'voiceMemos', memo.id), {
            isUnlocked: true
          });
          updates.push(updatePromise);
          memo.isUnlocked = true;
        }
      }

      // Esegui tutti gli aggiornamenti
      if (updates.length > 0) {
        await Promise.all(updates);
      }

      // Filtra i memo in base ai permessi
      if (includeAll !== 'true') {
        voiceMemos = voiceMemos.filter((memo: any) => memo.isUnlocked);
      }

      res.json(voiceMemos);
    } catch (error) {
      console.error('Errore nel recupero voice memos:', error);
      res.status(500).json({ 
        error: 'Errore nel recupero dei voice memos' 
      });
    }
  });

  // Sblocco manuale di un voice memo
  app.put('/api/galleries/:galleryId/voice-memos/:memoId/unlock', async (req, res) => {
    try {
      const { galleryId, memoId } = req.params;

      // Verifica che il memo esista e appartenga alla galleria
      const memoDoc = await getDoc(doc(db, 'voiceMemos', memoId));
      
      if (!memoDoc.exists()) {
        return res.status(404).json({ error: 'Voice memo non trovato' });
      }

      const memoData = memoDoc.data();
      if (memoData.galleryId !== galleryId) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }

      // Aggiorna lo stato di unlock
      await updateDoc(doc(db, 'voiceMemos', memoId), {
        isUnlocked: true
      });

      res.json({ success: true, message: 'Voice memo sbloccato con successo' });
    } catch (error) {
      console.error('Errore nello sblocco voice memo:', error);
      res.status(500).json({ 
        error: 'Errore nello sblocco del voice memo' 
      });
    }
  });

  // Eliminazione di un voice memo
  app.delete('/api/galleries/:galleryId/voice-memos/:memoId', async (req, res) => {
    try {
      const { galleryId, memoId } = req.params;

      // Verifica che il memo esista e appartenga alla galleria
      const memoDoc = await getDoc(doc(db, 'voiceMemos', memoId));
      
      if (!memoDoc.exists()) {
        return res.status(404).json({ error: 'Voice memo non trovato' });
      }

      const memoData = memoDoc.data();
      if (memoData.galleryId !== galleryId) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }

      // Elimina il file audio da Firebase Storage
      try {
        const storage = getStorage();
        const audioRef = ref(storage, memoData.audioUrl);
        await deleteObject(audioRef);
      } catch (storageError) {
        console.error('Errore eliminazione file audio:', storageError);
      }

      // Elimina il documento dal database
      await deleteDoc(doc(db, 'voiceMemos', memoId));

      res.json({ success: true, message: 'Voice memo eliminato con successo' });
    } catch (error) {
      console.error('Errore nell\'eliminazione voice memo:', error);
      res.status(500).json({ 
        error: 'Errore nell\'eliminazione del voice memo' 
      });
    }
  });

  // Keep only basic server endpoints if needed
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  const httpServer = createServer(app);

  return httpServer;
}
