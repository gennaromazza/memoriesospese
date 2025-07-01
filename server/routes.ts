import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendWelcomeEmail, sendNewPhotosNotification } from "./emailService";
import { insertVoiceMemoSchema } from "../shared/schema";
import { logger, createContextLogger } from "../shared/logger";
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
  serverTimestamp,
  limit
} from 'firebase/firestore';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { db } from './firebase';
import { 
  requireAuth, 
  validateGallery, 
  requireGalleryAccess,
  requireAdmin, 
  rateLimit, 
  sanitizeInput, 
  validateParams,
  getSecurityQuestionText,
  AuthenticatedRequest 
} from './middleware/auth';
import { sendError, sendSuccess, validateUserData, validateCommentData, validateVoiceMemoData, ValidationUtils } from './utils/validation';

export async function registerRoutes(app: Express): Promise<Server> {
  // Applica solo sanitizzazione globale (rate limiting solo su endpoint sensibili)
  app.use(sanitizeInput);

  // ==================== GALLERY ACCESS API ====================
  
  // Get gallery access requirements
  app.get('/api/galleries/:galleryId/access-info', validateGallery, async (req: AuthenticatedRequest, res) => {
    try {
      const gallery = req.gallery!;
      
      const accessInfo = {
        requiresPassword: !!gallery.password,
        requiresSecurityQuestion: !!gallery.requiresSecurityQuestion,
        securityQuestion: gallery.requiresSecurityQuestion && gallery.securityQuestionType 
          ? getSecurityQuestionText(gallery.securityQuestionType, gallery.securityQuestionCustom)
          : null
      };
      
      res.json(accessInfo);
    } catch (error) {
      logger.error('Errore nel recupero info accesso', {
        error: error as Error,
        contextName: 'GalleryAccessAPI',
        galleryId: req.params.galleryId
      });
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // Verify gallery access
  app.post('/api/galleries/:galleryId/verify-access', validateParams, validateGallery, requireGalleryAccess, async (req: AuthenticatedRequest, res) => {
    try {
      res.json({ 
        success: true, 
        message: 'Accesso alla galleria autorizzato',
        galleryId: req.gallery!.id
      });
    } catch (error) {
      logger.error('Errore nella verifica accesso', { error: error as Error, contextName: 'GalleryVerificationAPI', galleryId: req.params.galleryId });
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // Update gallery security question (admin only)
  app.put('/api/galleries/:galleryId/security-question', validateParams, validateGallery, requireAuth, requireAdmin, async (req: AuthenticatedRequest, res) => {
    try {
      const { galleryId } = req.params;
      const { 
        requiresSecurityQuestion, 
        securityQuestionType, 
        securityQuestionCustom, 
        securityAnswer 
      } = req.body;

      const updateData: any = {
        requiresSecurityQuestion: !!requiresSecurityQuestion,
        updatedAt: serverTimestamp()
      };

      if (requiresSecurityQuestion) {
        if (!securityQuestionType) {
          return res.status(400).json({ error: 'Tipo di domanda di sicurezza richiesto' });
        }
        
        if (!securityAnswer || securityAnswer.trim().length === 0) {
          return res.status(400).json({ error: 'Risposta alla domanda di sicurezza richiesta' });
        }

        updateData.securityQuestionType = securityQuestionType;
        updateData.securityAnswer = securityAnswer.trim();

        if (securityQuestionType === 'custom') {
          if (!securityQuestionCustom || securityQuestionCustom.trim().length === 0) {
            return res.status(400).json({ error: 'Domanda personalizzata richiesta per tipo custom' });
          }
          updateData.securityQuestionCustom = securityQuestionCustom.trim();
        } else {
          updateData.securityQuestionCustom = null;
        }
      } else {
        // Se disabilitata, rimuovi tutti i campi
        updateData.securityQuestionType = null;
        updateData.securityQuestionCustom = null;
        updateData.securityAnswer = null;
      }

      const galleryRef = doc(db, 'galleries', galleryId);
      await updateDoc(galleryRef, updateData);

      res.json({ 
        success: true, 
        message: 'Impostazioni domanda di sicurezza aggiornate',
        settings: {
          requiresSecurityQuestion: updateData.requiresSecurityQuestion,
          securityQuestionType: updateData.securityQuestionType,
          securityQuestion: updateData.securityQuestionType 
            ? getSecurityQuestionText(updateData.securityQuestionType, updateData.securityQuestionCustom)
            : null
        }
      });
    } catch (error) {
      console.error('Errore aggiornamento domanda di sicurezza:', error);
      res.status(500).json({ error: 'Errore interno del server' });
    }
  });

  // Endpoint di test per verificare configurazione email (solo admin)
  app.get('/api/test-email', requireAuth, requireAdmin, async (req, res) => {
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

  // Endpoint per inviare email di benvenuto (richiede autenticazione)
  app.post('/api/send-welcome-email', requireAuth, async (req, res) => {
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

  // Endpoint per notificare nuove foto (richiede autenticazione)
  app.post('/api/galleries/:galleryId/notify', validateGallery, requireAuth, async (req, res) => {
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
  
  // Caricamento di un nuovo voice memo (richiede autenticazione)
  app.post('/api/galleries/:galleryId/voice-memos', validateParams, rateLimit, validateGallery, requireAuth, async (req, res) => {
    try {
      const { galleryId } = req.params;
      const voiceMemoData = req.body;

      // Verifica che l'utente sia autenticato
      const authReq = req as AuthenticatedRequest;
      if (!authReq.user) {
        return sendError(res, 401, 'Autenticazione richiesta per registrare voice memos');
      }

      // Validazione dati voice memo
      const validationErrors = validateVoiceMemoData(voiceMemoData);
      if (validationErrors.length > 0) {
        return sendError(res, 400, 'Dati non validi', validationErrors.join(', '));
      }

      // Prepara i dati base obbligatori
      const now = new Date();
      let isUnlocked = true;
      
      // Se c'è una data di sblocco, controlla se è nel futuro
      if (voiceMemoData.unlockDate && voiceMemoData.unlockDate !== null) {
        const unlockDateTime = new Date(voiceMemoData.unlockDate);
        isUnlocked = unlockDateTime <= now;
      }

      const firebaseData: any = {
        galleryId,
        guestName: voiceMemoData.guestName,
        audioUrl: voiceMemoData.audioUrl,
        fileName: voiceMemoData.fileName,
        fileSize: voiceMemoData.fileSize,
        isUnlocked,
        userEmail: authReq.user?.email, // Usa dati autenticati
        userName: authReq.user?.name,   // Usa dati autenticati
        createdAt: serverTimestamp()
      };

      // Aggiungi campi opzionali solo se presenti e non null
      if (voiceMemoData.message && voiceMemoData.message.trim()) {
        firebaseData.message = voiceMemoData.message;
      }
      if (voiceMemoData.unlockDate && voiceMemoData.unlockDate !== null) {
        firebaseData.unlockDate = voiceMemoData.unlockDate;
      }
      if (voiceMemoData.duration && voiceMemoData.duration > 0) {
        firebaseData.duration = voiceMemoData.duration;
      }

      // Crea il documento nel database Firebase
      const docRef = await addDoc(collection(db, 'voiceMemos'), firebaseData);

      // Recupera il documento appena creato
      const docSnap = await getDoc(docRef);
      const voiceMemo = { id: docSnap.id, ...docSnap.data() };

      return sendSuccess(res, voiceMemo, 'Voice memo caricato con successo', 201);
    } catch (error) {
      console.error('Errore nel caricamento voice memo:', error);
      return sendError(res, 500, 'Errore nel caricamento del voice memo');
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
      let unlockedCount = 0;

      for (const memo of voiceMemos) {
        if (!memo.isUnlocked && memo.unlockDate) {
          // Confronta con data e ora precise
          const unlockDateTime = new Date(memo.unlockDate);
          if (unlockDateTime <= now) {
            const updatePromise = updateDoc(doc(db, 'voiceMemos', memo.id), {
              isUnlocked: true,
              unlockedAt: serverTimestamp()
            });
            updates.push(updatePromise);
            memo.isUnlocked = true;
            unlockedCount++;
          }
        }
      }

      // Esegui tutti gli aggiornamenti
      if (updates.length > 0) {
        await Promise.all(updates);
        console.log(`✓ Sbloccati automaticamente ${unlockedCount} voice memos per galleria ${galleryId}`);
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

  // Controllo manuale degli sblocchi per una galleria (solo admin autenticati)
  app.post('/api/galleries/:galleryId/voice-memos/check-unlocks', validateParams, validateGallery, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { galleryId } = req.params;

      // Recupera tutti i voice memos della galleria che sono ancora bloccati ma dovrebbero essere sbloccati
      const q = query(
        collection(db, 'voiceMemos'),
        where('galleryId', '==', galleryId),
        where('isUnlocked', '==', false)
      );

      const querySnapshot = await getDocs(q);
      const now = new Date();
      const updates = [];
      let unlockedCount = 0;

      for (const docSnap of querySnapshot.docs) {
        const memoData = docSnap.data();
        if (memoData.unlockDate) {
          const unlockDateTime = new Date(memoData.unlockDate);
          if (unlockDateTime <= now) {
            const updatePromise = updateDoc(doc(db, 'voiceMemos', docSnap.id), {
              isUnlocked: true,
              unlockedAt: serverTimestamp()
            });
            updates.push(updatePromise);
            unlockedCount++;
          }
        }
      }

      // Esegui tutti gli aggiornamenti
      if (updates.length > 0) {
        await Promise.all(updates);
      }

      res.json({ 
        success: true, 
        message: `Controllo completato. ${unlockedCount} voice memos sono stati sbloccati automaticamente.`,
        unlockedCount 
      });
    } catch (error) {
      console.error('Errore nel controllo sblocchi:', error);
      res.status(500).json({ 
        error: 'Errore nel controllo degli sblocchi automatici' 
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

  // ==================== LIKES API ====================
  
  // Get likes for an item
  app.get('/api/galleries/:galleryId/likes/:itemType/:itemId', async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;
      const { userEmail } = req.query;

      // Get all likes for this item
      const likesRef = collection(db, 'likes');
      const q = query(
        likesRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', itemType),
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      const likes = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Check if current user has liked
      const hasUserLiked = userEmail ? likes.some((like: any) => like.userEmail === userEmail) : false;
      
      res.json({
        likesCount: likes.length,
        hasUserLiked,
        likes
      });
    } catch (error) {
      console.error('Errore nel recupero like:', error);
      res.status(500).json({ error: 'Errore nel recupero dei like' });
    }
  });

  // Add/remove like (richiede autenticazione)
  app.post('/api/galleries/:galleryId/likes/:itemType/:itemId', validateParams, rateLimit, validateGallery, requireAuth, async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;
      const { userEmail, userName } = req.body;

      // Validazione dati utente
      const userValidationErrors = validateUserData(userEmail, userName);
      if (userValidationErrors.length > 0) {
        return sendError(res, 400, 'Dati utente non validi', userValidationErrors.join(', '));
      }

      // Validazione itemType
      if (!ValidationUtils.isValidItemType(itemType)) {
        return sendError(res, 400, 'Tipo elemento non valido');
      }

      // Check if user already liked this item
      const likesRef = collection(db, 'likes');
      const existingLikeQuery = query(
        likesRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', itemType),
        where('itemId', '==', itemId),
        where('userEmail', '==', userEmail)
      );
      
      const existingLikes = await getDocs(existingLikeQuery);
      
      if (!existingLikes.empty) {
        // Remove like
        await deleteDoc(existingLikes.docs[0].ref);
        return sendSuccess(res, { action: 'removed' }, 'Like rimosso');
      } else {
        // Add like
        const likeData = {
          itemId,
          itemType,
          galleryId,
          userEmail,
          userName,
          createdAt: serverTimestamp()
        };
        
        await addDoc(likesRef, likeData);
        return sendSuccess(res, { action: 'added' }, 'Like aggiunto');
      }
    } catch (error) {
      console.error('Errore nella gestione like:', error);
      return sendError(res, 500, 'Errore nella gestione del like');
    }
  });

  // ==================== COMMENTS API ====================
  
  // Get comments for an item
  app.get('/api/galleries/:galleryId/comments/:itemType/:itemId', async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;

      const commentsRef = collection(db, 'comments');
      // Simplified query to avoid index requirements - filter in memory instead
      const q = query(
        commentsRef,
        where('galleryId', '==', galleryId),
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      const comments = querySnapshot.docs
        .map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }))
        .filter((comment: any) => comment.itemType === itemType)
        .sort((a: any, b: any) => {
          // Sort by createdAt descending
          if (!a.createdAt || !b.createdAt) return 0;
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        });
      
      res.json(comments);
    } catch (error) {
      console.error('Errore nel recupero commenti:', error);
      res.status(500).json({ error: 'Errore nel recupero dei commenti' });
    }
  });

  // Add comment endpoint semplificato (per compatibilità frontend)
  app.post('/api/comments', rateLimit, async (req, res) => {
    try {
      const { itemId, itemType, galleryId, userEmail, userName, content } = req.body;

      // Validazione base dei dati
      if (!itemId || !itemType || !galleryId || !userEmail || !userName || !content) {
        return sendError(res, 400, 'Tutti i campi sono obbligatori');
      }

      // Validazione dati utente
      const userValidationErrors = validateUserData(userEmail, userName);
      if (userValidationErrors.length > 0) {
        return sendError(res, 400, 'Dati utente non validi', userValidationErrors.join(', '));
      }

      // Validazione contenuto commento
      const commentValidationErrors = validateCommentData(content);
      if (commentValidationErrors.length > 0) {
        return sendError(res, 400, 'Contenuto commento non valido', commentValidationErrors.join(', '));
      }

      // Validazione itemType
      if (!ValidationUtils.isValidItemType(itemType)) {
        return sendError(res, 400, 'Tipo elemento non valido');
      }

      const commentData = {
        itemId,
        itemType,
        galleryId,
        userEmail,
        userName,
        content: content.trim(),
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'comments'), commentData);
      
      return sendSuccess(res, { 
        id: docRef.id, 
        ...commentData,
        createdAt: new Date() // Per il frontend
      }, 'Commento aggiunto con successo', 201);
    } catch (error) {
      console.error('Errore nell\'aggiunta commento:', error);
      return sendError(res, 500, 'Errore nell\'aggiunta del commento', error instanceof Error ? error.message : 'Errore sconosciuto');
    }
  });

  // Add comment (richiede autenticazione)
  app.post('/api/galleries/:galleryId/comments/:itemType/:itemId', validateParams, rateLimit, validateGallery, requireAuth, async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;
      const { userEmail, userName, content } = req.body;

      // Validazione dati utente
      const userValidationErrors = validateUserData(userEmail, userName);
      if (userValidationErrors.length > 0) {
        return sendError(res, 400, 'Dati utente non validi', userValidationErrors.join(', '));
      }

      // Validazione contenuto commento
      const commentValidationErrors = validateCommentData(content);
      if (commentValidationErrors.length > 0) {
        return sendError(res, 400, 'Contenuto commento non valido', commentValidationErrors.join(', '));
      }

      // Validazione itemType
      if (!ValidationUtils.isValidItemType(itemType)) {
        return sendError(res, 400, 'Tipo elemento non valido');
      }

      const commentData = {
        itemId,
        itemType,
        galleryId,
        userEmail,
        userName,
        content: content.trim(),
        createdAt: serverTimestamp()
      };
      
      const docRef = await addDoc(collection(db, 'comments'), commentData);
      
      return sendSuccess(res, { 
        id: docRef.id, 
        ...commentData
      }, 'Commento aggiunto con successo', 201);
    } catch (error) {
      console.error('Errore nell\'aggiunta commento:', error);
      return sendError(res, 500, 'Errore nell\'aggiunta del commento');
    }
  });

  // Delete comment (admin only)
  app.delete('/api/galleries/:galleryId/comments/:commentId', validateGallery, requireAuth, requireAdmin, async (req, res) => {
    try {
      const { galleryId, commentId } = req.params;

      // Verify comment exists and belongs to gallery
      const commentDoc = await getDoc(doc(db, 'comments', commentId));
      
      if (!commentDoc.exists()) {
        return sendError(res, 404, 'Commento non trovato');
      }

      const commentData = commentDoc.data();
      if (commentData.galleryId !== galleryId) {
        return sendError(res, 403, 'Non autorizzato');
      }

      await deleteDoc(doc(db, 'comments', commentId));
      
      return sendSuccess(res, { success: true }, 'Commento eliminato con successo');
    } catch (error) {
      console.error('Errore nell\'eliminazione commento:', error);
      return sendError(res, 500, 'Errore nell\'eliminazione del commento');
    }
  });

  // ==================== INTERACTION STATS API ====================
  
  // Get interaction stats for an item
  app.get('/api/galleries/:galleryId/stats/:itemType/:itemId', async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;
      const { userEmail } = req.query;

      // Get likes count
      const likesRef = collection(db, 'likes');
      const likesQuery = query(
        likesRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', itemType),
        where('itemId', '==', itemId)
      );
      const likesSnapshot = await getDocs(likesQuery);
      const likes = likesSnapshot.docs.map(doc => doc.data());
      
      // Get comments count
      const commentsRef = collection(db, 'comments');
      const commentsQuery = query(
        commentsRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', itemType),
        where('itemId', '==', itemId)
      );
      const commentsSnapshot = await getDocs(commentsQuery);
      
      // Check if current user has liked
      const hasUserLiked = userEmail ? likes.some(like => like.userEmail === userEmail) : false;
      
      // Validate itemType
      if (!ValidationUtils.isValidItemType(itemType)) {
        return sendError(res, 400, 'Tipo elemento non valido');
      }

      return sendSuccess(res, {
        likesCount: likes.length,
        commentsCount: commentsSnapshot.size,
        hasUserLiked
      });
    } catch (error) {
      console.error('Errore nel recupero statistiche:', error);
      return sendError(res, 500, 'Errore nel recupero delle statistiche');
    }
  });

  // Get gallery interaction stats (admin)
  app.get('/api/galleries/:galleryId/admin/interaction-stats', async (req, res) => {
    try {
      const { galleryId } = req.params;

      // Get all likes for gallery
      const likesRef = collection(db, 'likes');
      const likesQuery = query(likesRef, where('galleryId', '==', galleryId));
      const likesSnapshot = await getDocs(likesQuery);
      
      // Get all comments for gallery
      const commentsRef = collection(db, 'comments');
      const commentsQuery = query(commentsRef, where('galleryId', '==', galleryId));
      const commentsSnapshot = await getDocs(commentsQuery);
      
      // Group by item type
      const likesData = likesSnapshot.docs.map(doc => doc.data());
      const commentsData = commentsSnapshot.docs.map(doc => doc.data());
      
      const photoLikes = likesData.filter(like => like.itemType === 'photo').length;
      const voiceMemoLikes = likesData.filter(like => like.itemType === 'voice_memo').length;
      const photoComments = commentsData.filter(comment => comment.itemType === 'photo').length;
      const voiceMemoComments = commentsData.filter(comment => comment.itemType === 'voice_memo').length;
      
      // Get unique users
      const uniqueLikeUsers = new Set(likesData.map(like => like.userEmail)).size;
      const uniqueCommentUsers = new Set(commentsData.map(comment => comment.userEmail)).size;
      
      res.json({
        totalLikes: likesData.length,
        totalComments: commentsData.length,
        photoLikes,
        voiceMemoLikes,
        photoComments,
        voiceMemoComments,
        uniqueLikeUsers,
        uniqueCommentUsers,
        engagement: {
          photos: photoLikes + photoComments,
          voiceMemos: voiceMemoLikes + voiceMemoComments
        }
      });
    } catch (error) {
      console.error('Errore nel recupero statistiche admin:', error);
      res.status(500).json({ error: 'Errore nel recupero delle statistiche admin' });
    }
  });

  // ==================== SOCIAL ACTIVITY API ====================
  
  // Get recent comments across the gallery
  app.get('/api/galleries/:galleryId/comments/recent', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      const commentsRef = collection(db, 'comments');
      const q = query(
        commentsRef,
        where('galleryId', '==', galleryId)
      );
      
      const querySnapshot = await getDocs(q);
      const allComments = querySnapshot.docs
        .map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }))
        .sort((a: any, b: any) => {
          // Sort by createdAt descending
          if (!a.createdAt || !b.createdAt) return 0;
          
          const aTime = a.createdAt.seconds || new Date(a.createdAt).getTime() / 1000;
          const bTime = b.createdAt.seconds || new Date(b.createdAt).getTime() / 1000;
          
          return bTime - aTime;
        })
        .slice(0, limit); // Apply limit after sorting

      // Get photo details for comments on photos
      const comments = await Promise.all(allComments.map(async (comment: any) => {
        if (comment.itemType === 'photo') {
          try {
            // Get photo details
            const photoDoc = await getDoc(doc(db, 'photos', comment.itemId));
            if (photoDoc.exists()) {
              const photoData = photoDoc.data();
              return {
                ...comment,
                photoName: photoData.name || 'Foto senza nome',
                photoUrl: photoData.url
              };
            }
          } catch (error) {
            console.error('Error fetching photo details for comment:', error);
          }
        }
        return comment;
      }));
      
      res.json(comments);
    } catch (error) {
      console.error('Errore nel recupero commenti recenti:', error);
      res.status(500).json({ error: 'Errore nel recupero dei commenti recenti' });
    }
  });

  // Get top liked photos
  app.get('/api/galleries/:galleryId/photos/top-liked', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;

      // Get all photos from gallery
      const galleryDoc = await getDoc(doc(db, 'galleries', galleryId));
      if (!galleryDoc.exists()) {
        return res.status(404).json({ error: 'Galleria non trovata' });
      }

      const photosRef = collection(db, 'galleries', galleryId, 'photos');
      const photosSnapshot = await getDocs(photosRef);
      
      // Get likes for all photos
      const likesRef = collection(db, 'likes');
      const likesQuery = query(
        likesRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', 'photo')
      );
      const likesSnapshot = await getDocs(likesQuery);
      
      // Get comments for all photos
      const commentsRef = collection(db, 'comments');
      const commentsQuery = query(
        commentsRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', 'photo')
      );
      const commentsSnapshot = await getDocs(commentsQuery);

      // Count likes and comments per photo
      const likesPerPhoto: { [key: string]: number } = {};
      const commentsPerPhoto: { [key: string]: number } = {};

      likesSnapshot.docs.forEach(doc => {
        const like = doc.data();
        likesPerPhoto[like.itemId] = (likesPerPhoto[like.itemId] || 0) + 1;
      });

      commentsSnapshot.docs.forEach(doc => {
        const comment = doc.data();
        commentsPerPhoto[comment.itemId] = (commentsPerPhoto[comment.itemId] || 0) + 1;
      });

      // Build photo stats array
      const photoStats = photosSnapshot.docs.map(doc => {
        const photoData = doc.data();
        return {
          id: doc.id,
          name: photoData.name || 'Foto senza nome',
          url: photoData.url,
          likesCount: likesPerPhoto[doc.id] || 0,
          commentsCount: commentsPerPhoto[doc.id] || 0
        };
      });

      // Sort by likes count (descending) and take top photos
      const topPhotos = photoStats
        .sort((a, b) => b.likesCount - a.likesCount)
        .slice(0, limit);
      
      res.json(topPhotos);
    } catch (error) {
      console.error('Errore nel recupero foto top:', error);
      res.status(500).json({ error: 'Errore nel recupero delle foto top' });
    }
  });

  // Get recent voice memos
  app.get('/api/galleries/:galleryId/voice-memos/recent', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const limit = parseInt(req.query.limit as string) || 5;

      const voiceMemosRef = collection(db, 'voiceMemos');
      const q = query(
        voiceMemosRef,
        where('galleryId', '==', galleryId)
      );
      const querySnapshot = await getDocs(q);
      
      const voiceMemos = querySnapshot.docs
        .map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }))
        .filter((memo: any) => memo.isUnlocked) // Solo note audio sbloccate
        .sort((a: any, b: any) => {
          // Sort by createdAt descending
          if (!a.createdAt || !b.createdAt) return 0;
          
          const aTime = a.createdAt.seconds || new Date(a.createdAt).getTime() / 1000;
          const bTime = b.createdAt.seconds || new Date(b.createdAt).getTime() / 1000;
          
          return bTime - aTime;
        })
        .slice(0, limit);
      
      res.json(voiceMemos);
    } catch (error) {
      console.error('Errore nel recupero note audio recenti:', error);
      res.status(500).json({ error: 'Errore nel recupero delle note audio recenti' });
    }
  });

  // ==================== USER AUTHENTICATION API ====================
  
  // Get user profile by Firebase UID
  app.get('/api/users/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (!userDoc.exists()) {
        return res.status(404).json({ error: 'Utente non trovato' });
      }
      
      res.json({ id: userDoc.id, ...userDoc.data() });
    } catch (error) {
      console.error('Errore nel recupero profilo utente:', error);
      res.status(500).json({ error: 'Errore nel recupero del profilo utente' });
    }
  });

  // Update user profile
  app.put('/api/users/:uid', async (req, res) => {
    try {
      const { uid } = req.params;
      const updateData = req.body;
      
      // Remove sensitive fields that shouldn't be updated via API
      delete updateData.uid;
      delete updateData.createdAt;
      
      await updateDoc(doc(db, 'users', uid), {
        ...updateData,
        updatedAt: serverTimestamp()
      });
      
      res.json({ success: true, message: 'Profilo aggiornato' });
    } catch (error) {
      console.error('Errore nell\'aggiornamento profilo:', error);
      res.status(500).json({ error: 'Errore nell\'aggiornamento del profilo' });
    }
  });

  // Grant gallery access to user
  app.post('/api/users/:uid/gallery-access/:galleryId', async (req, res) => {
    try {
      const { uid, galleryId } = req.params;
      
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (!userDoc.exists()) {
        return res.status(404).json({ error: 'Utente non trovato' });
      }
      
      const userData = userDoc.data();
      const galleryAccess = userData.galleryAccess || [];
      
      if (!galleryAccess.includes(galleryId)) {
        galleryAccess.push(galleryId);
        
        await updateDoc(doc(db, 'users', uid), {
          galleryAccess: galleryAccess,
          updatedAt: serverTimestamp()
        });
      }
      
      res.json({ success: true, message: 'Accesso alla galleria concesso' });
    } catch (error) {
      console.error('Errore nella concessione accesso galleria:', error);
      res.status(500).json({ error: 'Errore nella concessione dell\'accesso alla galleria' });
    }
  });

  // Check user gallery access
  app.get('/api/users/:uid/gallery-access/:galleryId', async (req, res) => {
    try {
      const { uid, galleryId } = req.params;
      
      const userDoc = await getDoc(doc(db, 'users', uid));
      
      if (!userDoc.exists()) {
        return res.status(404).json({ error: 'Utente non trovato' });
      }
      
      const userData = userDoc.data();
      const galleryAccess = userData.galleryAccess || [];
      const hasAccess = galleryAccess.includes(galleryId);
      
      res.json({ hasAccess });
    } catch (error) {
      console.error('Errore nella verifica accesso galleria:', error);
      res.status(500).json({ error: 'Errore nella verifica dell\'accesso alla galleria' });
    }
  });

  // Keep only basic server endpoints if needed
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  const httpServer = createServer(app);

  return httpServer;
}
