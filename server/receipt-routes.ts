
/**
 * Receipt Routes - Generazione e invio ricevute fiscali
 * Per movimenti cassa in entrata
 */

import { Router } from 'express';
import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';

const router = Router();

/**
 * Genera numero progressivo ricevuta
 */
async function getNextReceiptNumber(): Promise<number> {
  const counterRef = db.collection('counters').doc('receipts');
  
  try {
    await db.runTransaction(async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      
      let nextNumber = 1;
      if (counterDoc.exists) {
        nextNumber = (counterDoc.data()?.lastNumber || 0) + 1;
      }
      
      transaction.set(counterRef, { lastNumber: nextNumber, updatedAt: Timestamp.now() }, { merge: true });
    });
    
    const updatedDoc = await counterRef.get();
    return updatedDoc.data()?.lastNumber || 1;
  } catch (error) {
    console.error('Errore generazione numero ricevuta:', error);
    // Fallback: usa timestamp
    return Date.now() % 1000000;
  }
}

/**
 * Recupera dati studio da Firestore
 */
async function getStudioInfo() {
  try {
    const studioDoc = await db.collection('settings').doc('studio').get();
    if (studioDoc.exists) {
      const data = studioDoc.data();
      return {
        name: data?.name || 'Memorie Sospese',
        address: data?.address || '',
        phone: data?.phone || '+39 334 7103142',
        email: data?.email || 'memoriesospese@gennaromazzacane.it',
        partitaIVA: data?.partitaIVA || '',
        codiceFiscale: data?.codiceFiscale || '',
      };
    }
  } catch (error) {
    console.error('Errore recupero dati studio:', error);
  }
  
  return {
    name: 'Memorie Sospese',
    address: '',
    phone: '+39 334 7103142',
    email: 'memoriesospese@gennaromazzacane.it',
    partitaIVA: '',
    codiceFiscale: '',
  };
}

/**
 * Template HTML ricevuta fiscale
 */
function createReceiptHTML(receiptData: any): string {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };
  
  const formatDate = (date: Date | Timestamp) => {
    const d = date instanceof Timestamp ? date.toDate() : date;
    return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  };
  
  return `
    <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; border: 2px solid #8b5a3c;">
      <!-- Header -->
      <div style="text-align: center; margin-bottom: 30px; border-bottom: 3px solid #8b5a3c; padding-bottom: 20px;">
        <h1 style="color: #8b5a3c; margin: 0; font-size: 32px;">RICEVUTA FISCALE</h1>
        <p style="margin: 10px 0 0 0; font-size: 18px; color: #666;">N° ${receiptData.numero}</p>
      </div>

      <!-- Dati Studio -->
      <div style="margin-bottom: 30px; background: #f9f7f4; padding: 20px; border-radius: 8px;">
        <h3 style="color: #8b5a3c; margin: 0 0 15px 0;">Emesso da:</h3>
        <p style="margin: 5px 0; font-size: 16px;"><strong>${receiptData.studioName}</strong></p>
        ${receiptData.studioAddress ? `<p style="margin: 5px 0; font-size: 14px;">${receiptData.studioAddress}</p>` : ''}
        <p style="margin: 5px 0; font-size: 14px;">Tel: ${receiptData.studioPhone}</p>
        <p style="margin: 5px 0; font-size: 14px;">Email: ${receiptData.studioEmail}</p>
        ${receiptData.studioPartitaIVA ? `<p style="margin: 5px 0; font-size: 14px;">P.IVA: ${receiptData.studioPartitaIVA}</p>` : ''}
        ${receiptData.studioCodiceFiscale ? `<p style="margin: 5px 0; font-size: 14px;">C.F.: ${receiptData.studioCodiceFiscale}</p>` : ''}
      </div>

      <!-- Dati Cliente (se presenti) -->
      ${receiptData.clienteNome || receiptData.clienteCognome ? `
      <div style="margin-bottom: 30px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h3 style="color: #8b5a3c; margin: 0 0 15px 0;">Intestato a:</h3>
        <p style="margin: 5px 0; font-size: 16px;">
          <strong>${receiptData.clienteNome || ''} ${receiptData.clienteCognome || ''}</strong>
        </p>
        ${receiptData.clienteEmail ? `<p style="margin: 5px 0; font-size: 14px;">Email: ${receiptData.clienteEmail}</p>` : ''}
        ${receiptData.clienteCellulare ? `<p style="margin: 5px 0; font-size: 14px;">Tel: ${receiptData.clienteCellulare}</p>` : ''}
      </div>
      ` : ''}

      <!-- Dettagli Ricevuta -->
      <div style="margin-bottom: 30px;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #8b5a3c; color: white;">
              <th style="padding: 12px; text-align: left; border: 1px solid #6b4530;">Data</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b4530;">Categoria</th>
              <th style="padding: 12px; text-align: left; border: 1px solid #6b4530;">Descrizione</th>
              <th style="padding: 12px; text-align: right; border: 1px solid #6b4530;">Importo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="padding: 12px; border: 1px solid #e0e0e0;">${formatDate(receiptData.data)}</td>
              <td style="padding: 12px; border: 1px solid #e0e0e0;">${receiptData.categoria}</td>
              <td style="padding: 12px; border: 1px solid #e0e0e0;">${receiptData.descrizione}</td>
              <td style="padding: 12px; text-align: right; border: 1px solid #e0e0e0; font-weight: bold; font-size: 18px;">
                ${formatCurrency(receiptData.importo)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Totale -->
      <div style="text-align: right; margin-bottom: 30px; padding: 20px; background: #f9f7f4; border-radius: 8px;">
        <p style="margin: 0; font-size: 14px; color: #666;">Metodo di Pagamento: <strong>${receiptData.metodoPagamento.toUpperCase()}</strong></p>
        <p style="margin: 10px 0 0 0; font-size: 28px; color: #8b5a3c; font-weight: bold;">
          TOTALE: ${formatCurrency(receiptData.importo)}
        </p>
      </div>

      ${receiptData.note ? `
      <div style="margin-bottom: 20px; padding: 15px; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
        <p style="margin: 0; font-size: 13px; color: #856404;"><strong>Note:</strong> ${receiptData.note}</p>
      </div>
      ` : ''}

      <!-- Footer -->
      <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
        <p style="margin: 5px 0; font-size: 12px; color: #999;">Documento emesso elettronicamente</p>
        <p style="margin: 5px 0; font-size: 12px; color: #999;">Ricevuta non valida ai fini fiscali - Documento informativo</p>
      </div>
    </div>
  `;
}

/**
 * POST /api/receipts/send
 * Genera e invia ricevuta fiscale via email o WhatsApp
 */
router.post('/send', async (req, res) => {
  try {
    const { movementId, method, recipient, clienteNome, clienteCognome } = req.body;

    // Validazioni
    if (!movementId || !method || !recipient) {
      return res.status(400).json({ error: 'Parametri mancanti' });
    }

    if (method !== 'email' && method !== 'whatsapp') {
      return res.status(400).json({ error: 'Metodo non valido (email o whatsapp)' });
    }

    // Recupera movimento cassa
    const movementDoc = await db.collection('cashMovements').doc(movementId).get();
    if (!movementDoc.exists) {
      return res.status(404).json({ error: 'Movimento non trovato' });
    }

    const movement = movementDoc.data();
    
    // Verifica che sia un'entrata
    if (movement?.tipo !== 'entrata') {
      return res.status(400).json({ error: 'La ricevuta può essere emessa solo per movimenti in entrata' });
    }

    // Genera numero ricevuta
    const numeroRicevuta = await getNextReceiptNumber();

    // Recupera dati studio
    const studioInfo = await getStudioInfo();

    // Prepara dati ricevuta
    const receiptData = {
      movementId,
      numero: numeroRicevuta,
      data: movement.data,
      categoria: movement.categoria,
      descrizione: movement.descrizione,
      importo: movement.importo,
      metodoPagamento: movement.metodoPagamento,
      note: movement.note,
      clienteNome,
      clienteCognome,
      clienteEmail: method === 'email' ? recipient : undefined,
      clienteCellulare: method === 'whatsapp' ? recipient : undefined,
      studioName: studioInfo.name,
      studioAddress: studioInfo.address,
      studioPhone: studioInfo.phone,
      studioEmail: studioInfo.email,
      studioPartitaIVA: studioInfo.partitaIVA,
      studioCodiceFiscale: studioInfo.codiceFiscale,
    };

    // Genera HTML ricevuta
    const htmlContent = createReceiptHTML(receiptData);

    // Salva ricevuta in Firestore (storico)
    await db.collection('receipts').add({
      movementId,
      numero: numeroRicevuta,
      method,
      recipient,
      clienteNome,
      clienteCognome,
      importo: movement.importo,
      sentAt: Timestamp.now(),
      createdAt: Timestamp.now(),
    });

    // Invia ricevuta
    if (method === 'email') {
      // Import dinamico per evitare circular dependency
      const { sendGmailEmail } = await import('./email-routes');
      
      const subject = `Ricevuta Fiscale N° ${numeroRicevuta} - ${studioInfo.name}`;
      await sendGmailEmail(recipient, subject, htmlContent);
      
      console.log(`✅ Ricevuta N° ${numeroRicevuta} inviata via email a ${recipient}`);
    } else {
      // WhatsApp: genera link wa.me con testo
      const whatsappMessage = `Ciao${clienteNome ? ' ' + clienteNome : ''}! Ti invio la ricevuta fiscale N° ${numeroRicevuta} per il pagamento di ${receiptData.importo.toFixed(2)}€. Puoi visualizzarla qui: [link generato]`;
      
      // Nota: l'invio vero e proprio via WhatsApp richiede un servizio terzo (es. Twilio, WhatsApp Business API)
      // Per ora ritorniamo il link wa.me che l'utente può usare manualmente
      const whatsappNumber = recipient.replace(/[^0-9]/g, '');
      const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
      
      console.log(`📱 Link WhatsApp generato per ricevuta N° ${numeroRicevuta}: ${whatsappLink}`);
      
      return res.status(200).json({
        success: true,
        message: 'Ricevuta generata',
        whatsappLink, // Frontend può aprire questo link o mostrarlo all'utente
        receiptNumber: numeroRicevuta,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Ricevuta inviata con successo',
      receiptNumber: numeroRicevuta,
    });
  } catch (error) {
    console.error('❌ Errore invio ricevuta:', error);
    res.status(500).json({ error: 'Errore invio ricevuta' });
  }
});

export default router;
