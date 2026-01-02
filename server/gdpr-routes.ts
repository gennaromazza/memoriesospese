/**
 * GDPR Routes
 * Endpoints per gestione diritti privacy utenti (GDPR)
 * - Richiesta cancellazione dati (diritto all'oblio)
 * - Richiesta esportazione dati
 */

import express, { Request, Response } from 'express';
import { db, FieldValue } from './firebase-admin.js';
import { sendGmailEmail } from './email-routes.js';

const router = express.Router();

interface GdprRequest {
  type: 'deletion' | 'export';
  email: string;
  nome?: string;
  cognome?: string;
  telefono?: string;
  motivo?: string;
  requestDate: any;
  status: 'pending' | 'processing' | 'completed' | 'rejected';
  processedDate?: any;
  notes?: string;
}

/**
 * POST /api/gdpr/deletion-request
 * Richiesta cancellazione dati (diritto all'oblio) - Art. 17 GDPR
 */
router.post('/deletion-request', async (req: Request, res: Response) => {
  try {
    const { email, nome, cognome, telefono, motivo } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email obbligatoria' });
    }

    const emailLower = email.toLowerCase().trim();

    const requestData: GdprRequest = {
      type: 'deletion',
      email: emailLower,
      nome: nome || '',
      cognome: cognome || '',
      telefono: telefono || '',
      motivo: motivo || '',
      requestDate: FieldValue.serverTimestamp(),
      status: 'pending',
    };

    const docRef = await db.collection('gdpr_requests').add(requestData);
    console.log('📋 Nuova richiesta GDPR cancellazione:', docRef.id, emailLower);

    const adminEmail = 'image.studio.fotografico@gmail.com';
    const adminHtmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2d3748;">Nuova Richiesta GDPR - Cancellazione Dati</h2>
        
        <div style="background: #f7fafc; border-radius: 8px; padding: 20px; margin: 20px 0;">
          <h3 style="color: #4a5568; margin-top: 0;">Dettagli Richiesta</h3>
          <p><strong>ID Richiesta:</strong> ${docRef.id}</p>
          <p><strong>Tipo:</strong> Cancellazione dati (Diritto all'oblio - Art. 17 GDPR)</p>
          <p><strong>Email:</strong> ${emailLower}</p>
          ${nome ? `<p><strong>Nome:</strong> ${nome}</p>` : ''}
          ${cognome ? `<p><strong>Cognome:</strong> ${cognome}</p>` : ''}
          ${telefono ? `<p><strong>Telefono:</strong> ${telefono}</p>` : ''}
          ${motivo ? `<p><strong>Motivo:</strong> ${motivo}</p>` : ''}
        </div>
        
        <div style="background: #fffaf0; border-left: 4px solid #ed8936; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #744210;">
            <strong>Azione Richiesta:</strong> Hai 30 giorni per elaborare questa richiesta secondo il GDPR.
            Verifica l'identità del richiedente prima di procedere.
          </p>
        </div>
        
        <p style="color: #718096; font-size: 12px;">
          Questa email è stata generata automaticamente dal sistema Image Studio.
        </p>
      </div>
    `;

    try {
      await sendGmailEmail(
        adminEmail,
        '🔒 Nuova Richiesta GDPR - Cancellazione Dati',
        adminHtmlContent
      );
      console.log('📧 Email notifica GDPR inviata all\'admin');
    } catch (emailError) {
      console.error('⚠️ Errore invio email admin GDPR:', emailError);
    }

    const userHtmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #2d3748;">Richiesta Ricevuta</h2>
        
        <p>Ciao${nome ? ` ${nome}` : ''},</p>
        
        <p>Abbiamo ricevuto la tua richiesta di cancellazione dei dati personali ai sensi dell'Art. 17 del GDPR (Regolamento UE 2016/679).</p>
        
        <div style="background: #f0fff4; border-left: 4px solid #48bb78; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #276749;">
            <strong>Cosa succede ora?</strong><br>
            Elaboreremo la tua richiesta entro 30 giorni come previsto dalla normativa. 
            Potremmo contattarti per verificare la tua identità prima di procedere.
          </p>
        </div>
        
        <div style="background: #f7fafc; border-radius: 8px; padding: 15px; margin: 20px 0;">
          <p style="margin: 0;"><strong>ID Richiesta:</strong> ${docRef.id}</p>
          <p style="margin: 10px 0 0 0; font-size: 12px; color: #718096;">
            Conserva questo codice per riferimento futuro.
          </p>
        </div>
        
        <p>Per qualsiasi domanda, contattaci a: <a href="mailto:image.studio.fotografico@gmail.com">image.studio.fotografico@gmail.com</a></p>
        
        <p style="color: #718096; font-size: 12px; margin-top: 30px;">
          Image Studio Fotografico<br>
          Questa email è stata generata automaticamente.
        </p>
      </div>
    `;

    try {
      await sendGmailEmail(
        emailLower,
        'Richiesta Cancellazione Dati Ricevuta - Image Studio',
        userHtmlContent
      );
    } catch (emailError) {
      console.error('⚠️ Errore invio conferma GDPR a utente:', emailError);
    }

    res.json({
      success: true,
      message: 'Richiesta di cancellazione ricevuta. Riceverai una conferma via email.',
      requestId: docRef.id,
    });

  } catch (error: any) {
    console.error('❌ Errore richiesta GDPR cancellazione:', error);
    res.status(500).json({
      error: 'Errore durante l\'elaborazione della richiesta',
      details: error.message,
    });
  }
});

/**
 * POST /api/gdpr/export-request
 * Richiesta esportazione dati - Art. 20 GDPR
 */
router.post('/export-request', async (req: Request, res: Response) => {
  try {
    const { email, nome, cognome, telefono } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email obbligatoria' });
    }

    const emailLower = email.toLowerCase().trim();

    const requestData: GdprRequest = {
      type: 'export',
      email: emailLower,
      nome: nome || '',
      cognome: cognome || '',
      telefono: telefono || '',
      requestDate: FieldValue.serverTimestamp(),
      status: 'pending',
    };

    const docRef = await db.collection('gdpr_requests').add(requestData);
    console.log('📋 Nuova richiesta GDPR esportazione:', docRef.id, emailLower);

    const adminEmail = 'image.studio.fotografico@gmail.com';
    await sendGmailEmail(
      adminEmail,
      '📦 Nuova Richiesta GDPR - Esportazione Dati',
      `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>Nuova Richiesta GDPR - Esportazione Dati</h2>
          <p><strong>ID:</strong> ${docRef.id}</p>
          <p><strong>Email:</strong> ${emailLower}</p>
          ${nome ? `<p><strong>Nome:</strong> ${nome}</p>` : ''}
          ${cognome ? `<p><strong>Cognome:</strong> ${cognome}</p>` : ''}
          <p>Hai 30 giorni per fornire i dati richiesti.</p>
        </div>
      `
    );

    res.json({
      success: true,
      message: 'Richiesta di esportazione dati ricevuta.',
      requestId: docRef.id,
    });

  } catch (error: any) {
    console.error('❌ Errore richiesta GDPR esportazione:', error);
    res.status(500).json({
      error: 'Errore durante l\'elaborazione della richiesta',
      details: error.message,
    });
  }
});

export default router;
