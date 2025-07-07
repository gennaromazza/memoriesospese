// Firebase Functions - sendPasswordEmail
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// Configura il trasporto di Nodemailer (dovrai aggiungere le credenziali del tuo provider email)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tuo-account@gmail.com', // Sostituisci con la tua email
    pass: 'password-app', // Sostituisci con la tua password o app password
  },
});

/**
 * Cloud Function che invia la password della galleria via email
 * 
 * Attivazione: Chiamata HTTP dal frontend
 * Parametri attesi:
 * - galleryId: ID della galleria
 * - galleryCode: codice della galleria
 * - firstName: nome del richiedente
 * - lastName: cognome del richiedente
 * - email: email del richiedente
 */
exports.sendPasswordEmail = functions.https.onCall(async (data, context) => {
  try {
    // Verifica che tutti i dati necessari siano presenti
    if (!data.galleryId || !data.galleryCode || !data.firstName || !data.lastName || !data.email) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'La richiesta non contiene tutti i dati necessari'
      );
    }

    // Ottieni i dettagli della galleria dal database
    const galleryRef = admin.firestore().collection('galleries').doc(data.galleryId);
    const galleryDoc = await galleryRef.get();
    
    if (!galleryDoc.exists) {
      throw new functions.https.HttpsError(
        'not-found',
        'La galleria richiesta non esiste'
      );
    }
    
    const galleryData = galleryDoc.data();
    
    // Salva la richiesta nel database
    await admin.firestore().collection('passwordRequests').add({
      galleryId: data.galleryId,
      galleryCode: data.galleryCode,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      status: 'completed', // La richiesta è completata automaticamente
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
    // Prepara l'email
    const mailOptions = {
      from: '"Memorie Sospese" <tuo-account@gmail.com>', // Cambia con la tua email
      to: data.email,
      subject: `Accesso alla galleria: ${galleryData.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #4a5568;">
          <h2 style="color: #536b7a; font-family: 'Playfair Display', serif;">Memorie Sospese</h2>
          <p>Gentile ${data.firstName} ${data.lastName},</p>
          <p>grazie per la tua richiesta di accesso alla galleria fotografica "${galleryData.name}".</p>
          <p>Ecco i dati per accedere:</p>
          <div style="background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0;">
            <p><strong>Galleria:</strong> ${galleryData.name}</p>
            <p><strong>Password:</strong> ${galleryData.password}</p>
          </div>
          <p>Puoi accedere alla galleria utilizzando questo link: <a href="https://tuo-dominio.com/gallery/${data.galleryCode}" style="color: #536b7a;">Apri Galleria</a></p>
          <p>La password ti consentirà di visualizzare tutte le foto della galleria.</p>
          <p>Cordiali saluti,<br>Team Memorie Sospese</p>
        </div>
      `,
    };
    
    // Invia l'email
    await transporter.sendMail(mailOptions);
    
    return { success: true };
  } catch (error) {
    console.error("Errore nell'invio dell'email:", error);
    throw new functions.https.HttpsError(
      'internal',
      'Si è verificato un errore durante l\'invio dell\'email'
    );
  }
});