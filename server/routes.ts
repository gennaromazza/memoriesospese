import type { Express } from "express";
import { createServer, type Server } from "http";
import { sendWelcomeEmail, sendNewPhotosNotification } from "./emailService";
import { insertVoiceMemoSchema, insertEmailTemplateSchema } from "../shared/schema";
import { z } from 'zod';
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

      // Prepara i dati base obbligatori
      const firebaseData: any = {
        galleryId,
        guestName: voiceMemoData.guestName,
        audioUrl: voiceMemoData.audioUrl,
        fileName: voiceMemoData.fileName,
        fileSize: voiceMemoData.fileSize,
        isUnlocked: !voiceMemoData.unlockDate || new Date(voiceMemoData.unlockDate) <= new Date(),
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

  // Add/remove like
  app.post('/api/galleries/:galleryId/likes/:itemType/:itemId', async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;
      const { userEmail, userName } = req.body;

      if (!userEmail || !userName) {
        return res.status(400).json({ error: 'Email e nome utente sono obbligatori' });
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
        res.json({ action: 'removed', message: 'Like rimosso' });
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
        res.json({ action: 'added', message: 'Like aggiunto' });
      }
    } catch (error) {
      console.error('Errore nella gestione like:', error);
      res.status(500).json({ error: 'Errore nella gestione del like' });
    }
  });

  // ==================== COMMENTS API ====================
  
  // Get comments for an item
  app.get('/api/galleries/:galleryId/comments/:itemType/:itemId', async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;

      const commentsRef = collection(db, 'comments');
      // Simplified query to avoid index requirement
      const q = query(
        commentsRef,
        where('galleryId', '==', galleryId),
        where('itemType', '==', itemType),
        where('itemId', '==', itemId)
      );
      
      const querySnapshot = await getDocs(q);
      let comments = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      // Sort by createdAt in memory
      comments.sort((a: any, b: any) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime; // desc order
      });
      
      res.json(comments);
    } catch (error) {
      console.error('Errore nel recupero commenti:', error);
      res.status(500).json({ error: 'Errore nel recupero dei commenti' });
    }
  });

  // Add comment
  app.post('/api/galleries/:galleryId/comments/:itemType/:itemId', async (req, res) => {
    try {
      const { galleryId, itemType, itemId } = req.params;
      const { userEmail, userName, content } = req.body;

      if (!userEmail || !userName || !content) {
        return res.status(400).json({ error: 'Email, nome utente e contenuto sono obbligatori' });
      }

      if (content.length > 500) {
        return res.status(400).json({ error: 'Il commento non può superare i 500 caratteri' });
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
      
      res.status(201).json({ 
        id: docRef.id, 
        ...commentData,
        message: 'Commento aggiunto con successo' 
      });
    } catch (error) {
      console.error('Errore nell\'aggiunta commento:', error);
      res.status(500).json({ error: 'Errore nell\'aggiunta del commento' });
    }
  });

  // Delete comment (admin only)
  app.delete('/api/galleries/:galleryId/comments/:commentId', async (req, res) => {
    try {
      const { galleryId, commentId } = req.params;

      // Verify comment exists and belongs to gallery
      const commentDoc = await getDoc(doc(db, 'comments', commentId));
      
      if (!commentDoc.exists()) {
        return res.status(404).json({ error: 'Commento non trovato' });
      }

      const commentData = commentDoc.data();
      if (commentData.galleryId !== galleryId) {
        return res.status(403).json({ error: 'Non autorizzato' });
      }

      await deleteDoc(doc(db, 'comments', commentId));
      
      res.json({ success: true, message: 'Commento eliminato con successo' });
    } catch (error) {
      console.error('Errore nell\'eliminazione commento:', error);
      res.status(500).json({ error: 'Errore nell\'eliminazione del commento' });
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
      
      res.json({
        likesCount: likes.length,
        commentsCount: commentsSnapshot.size,
        hasUserLiked
      });
    } catch (error) {
      console.error('Errore nel recupero statistiche:', error);
      res.status(500).json({ error: 'Errore nel recupero delle statistiche' });
    }
  });

  // Get gallery interaction stats (admin)
  app.get('/api/galleries/:galleryId/admin/interaction-stats', async (req, res) => {
    try {
      const { galleryId } = req.params;

      // Get all likes for gallery using simplified query
      const likesRef = collection(db, 'likes');
      const likesQuery = query(likesRef, where('galleryId', '==', galleryId));
      const likesSnapshot = await getDocs(likesQuery);
      
      // Get all comments for gallery using simplified query
      const commentsRef = collection(db, 'comments');
      const commentsQuery = query(commentsRef, where('galleryId', '==', galleryId));
      const commentsSnapshot = await getDocs(commentsQuery);
      
      // Group by item type
      const likesData = likesSnapshot.docs.map(doc => doc.data() as any);
      const commentsData = commentsSnapshot.docs.map(doc => doc.data() as any);
      
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

  // ==================== EMAIL TEMPLATES API ====================
  
  // Get email templates for a gallery
  app.get('/api/galleries/:galleryId/email-templates', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const { templateType } = req.query;

      const templatesRef = collection(db, 'email_templates');
      let q = query(templatesRef, where('galleryId', '==', galleryId));
      
      if (templateType) {
        q = query(q, where('templateType', '==', templateType));
      }
      
      const querySnapshot = await getDocs(q);
      const templates = querySnapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data() 
      }));
      
      res.json(templates);
    } catch (error) {
      console.error('Error fetching email templates:', error);
      res.status(500).json({ error: 'Error fetching email templates' });
    }
  });

  // Get single email template
  app.get('/api/galleries/:galleryId/email-templates/:templateId', async (req, res) => {
    try {
      const { templateId } = req.params;
      
      const templateRef = doc(db, 'email_templates', templateId);
      const templateDoc = await getDoc(templateRef);
      
      if (!templateDoc.exists()) {
        return res.status(404).json({ error: 'Template not found' });
      }
      
      res.json({ id: templateDoc.id, ...templateDoc.data() });
    } catch (error) {
      console.error('Error fetching email template:', error);
      res.status(500).json({ error: 'Error fetching email template' });
    }
  });

  // Create email template
  app.post('/api/galleries/:galleryId/email-templates', async (req, res) => {
    try {
      const { galleryId } = req.params;
      const templateData = { ...req.body, galleryId };
      
      // Validate the template data
      const validatedData = insertEmailTemplateSchema.parse(templateData);
      
      const templatesRef = collection(db, 'email_templates');
      const docRef = await addDoc(templatesRef, {
        ...validatedData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      const newTemplate = await getDoc(docRef);
      res.status(201).json({ id: newTemplate.id, ...newTemplate.data() });
    } catch (error) {
      console.error('Error creating email template:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid template data', details: error.errors });
      }
      res.status(500).json({ error: 'Error creating email template' });
    }
  });

  // Update email template
  app.put('/api/galleries/:galleryId/email-templates/:templateId', async (req, res) => {
    try {
      const { templateId } = req.params;
      const updateData = req.body;
      
      // Remove fields that shouldn't be updated
      const { id, galleryId, createdAt, ...validData } = updateData;
      
      const templateRef = doc(db, 'email_templates', templateId);
      await updateDoc(templateRef, {
        ...validData,
        updatedAt: serverTimestamp()
      });
      
      const updatedTemplate = await getDoc(templateRef);
      res.json({ id: updatedTemplate.id, ...updatedTemplate.data() });
    } catch (error) {
      console.error('Error updating email template:', error);
      res.status(500).json({ error: 'Error updating email template' });
    }
  });

  // Delete email template
  app.delete('/api/galleries/:galleryId/email-templates/:templateId', async (req, res) => {
    try {
      const { templateId } = req.params;
      
      const templateRef = doc(db, 'email_templates', templateId);
      await deleteDoc(templateRef);
      
      res.json({ message: 'Template deleted successfully' });
    } catch (error) {
      console.error('Error deleting email template:', error);
      res.status(500).json({ error: 'Error deleting email template' });
    }
  });

  // Get default template for type
  app.get('/api/email-templates/defaults/:templateType', async (req, res) => {
    try {
      const { templateType } = req.params;
      
      const defaultTemplates = {
        welcome: {
          subject: 'Benvenuto nella galleria di {{galleryName}}!',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #6b7280;">Benvenuto nella galleria di {{galleryName}}!</h1>
              <p>Ciao {{userName}},</p>
              <p>Grazie per esserti registrato nella galleria di {{galleryName}}. Ora puoi:</p>
              <ul>
                <li>Mettere like alle foto</li>
                <li>Lasciare commenti</li>
                <li>Registrare vocali segreti</li>
                <li>Ricevere notifiche per nuove foto</li>
              </ul>
              <p>Visita la galleria: <a href="{{galleryUrl}}">{{galleryUrl}}</a></p>
              <p>Buona navigazione!</p>
            </div>
          `,
          textContent: `Benvenuto nella galleria di {{galleryName}}!\n\nCiao {{userName}},\n\nGrazie per esserti registrato nella galleria di {{galleryName}}. Ora puoi mettere like alle foto, lasciare commenti, registrare vocali segreti e ricevere notifiche per nuove foto.\n\nVisita la galleria: {{galleryUrl}}\n\nBuona navigazione!`,
          variables: ['galleryName', 'userName', 'userEmail', 'galleryUrl']
        },
        invitation: {
          subject: 'Sei invitato nella galleria di {{galleryName}}',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #6b7280;">Sei invitato nella galleria di {{galleryName}}!</h1>
              <p>Ciao,</p>
              <p>Sei stato invitato a partecipare alla galleria fotografica di {{galleryName}}.</p>
              <p>Data evento: {{eventDate}}</p>
              <p>Luogo: {{eventLocation}}</p>
              <p>Registrati gratuitamente per:</p>
              <ul>
                <li>Visualizzare tutte le foto</li>
                <li>Mettere like e commentare</li>
                <li>Caricare le tue foto</li>
                <li>Registrare vocali segreti</li>
              </ul>
              <p style="text-align: center;">
                <a href="{{galleryUrl}}" style="background-color: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Partecipa alla Galleria</a>
              </p>
            </div>
          `,
          textContent: `Sei invitato nella galleria di {{galleryName}}!\n\nCiao,\n\nSei stato invitato a partecipare alla galleria fotografica di {{galleryName}}.\n\nData evento: {{eventDate}}\nLuogo: {{eventLocation}}\n\nRegistrati gratuitamente per visualizzare tutte le foto, mettere like e commentare, caricare le tue foto e registrare vocali segreti.\n\nVisita: {{galleryUrl}}`,
          variables: ['galleryName', 'eventDate', 'eventLocation', 'galleryUrl']
        },
        password_request: {
          subject: 'Richiesta password per {{galleryName}}',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #6b7280;">Richiesta password per {{galleryName}}</h1>
              <p>Ciao {{firstName}} {{lastName}},</p>
              <p>Hai richiesto l'accesso alla galleria protetta di {{galleryName}}.</p>
              <p>La password per accedere è: <strong>{{password}}</strong></p>
              <p>Accedi alla galleria: <a href="{{galleryUrl}}">{{galleryUrl}}</a></p>
              <p>Grazie!</p>
            </div>
          `,
          textContent: `Richiesta password per {{galleryName}}\n\nCiao {{firstName}} {{lastName}},\n\nHai richiesto l'accesso alla galleria protetta di {{galleryName}}.\n\nLa password per accedere è: {{password}}\n\nAccedi alla galleria: {{galleryUrl}}\n\nGrazie!`,
          variables: ['galleryName', 'firstName', 'lastName', 'password', 'galleryUrl']
        },
        new_photos: {
          subject: 'Nuove foto in {{galleryName}}!',
          htmlContent: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #6b7280;">Nuove foto in {{galleryName}}!</h1>
              <p>Ciao,</p>
              <p>Sono state caricate {{newPhotosCount}} nuove foto nella galleria di {{galleryName}}{{uploaderName ? ' da ' + uploaderName : ''}}.</p>
              <p>Non perdere l'occasione di vederle e interagire con like e commenti!</p>
              <p style="text-align: center;">
                <a href="{{galleryUrl}}" style="background-color: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">Vedi le Nuove Foto</a>
              </p>
            </div>
          `,
          textContent: `Nuove foto in {{galleryName}}!\n\nCiao,\n\nSono state caricate {{newPhotosCount}} nuove foto nella galleria di {{galleryName}}{{uploaderName ? ' da ' + uploaderName : ''}}.\n\nNon perdere l'occasione di vederle e interagire con like e commenti!\n\nVisita: {{galleryUrl}}`,
          variables: ['galleryName', 'newPhotosCount', 'uploaderName', 'galleryUrl']
        }
      };
      
      const template = defaultTemplates[templateType as keyof typeof defaultTemplates];
      if (!template) {
        return res.status(404).json({ error: 'Default template not found' });
      }
      
      res.json(template);
    } catch (error) {
      console.error('Error fetching default template:', error);
      res.status(500).json({ error: 'Error fetching default template' });
    }
  });

  // Keep only basic server endpoints if needed
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "Server is running" });
  });

  const httpServer = createServer(app);

  return httpServer;
}
