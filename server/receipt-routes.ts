
/**
 * Receipt Routes - Generazione e invio ricevute fiscali
 * Per movimenti cassa in entrata
 */

import { Router } from 'express';
import { db } from './firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { formatPhoneForWhatsApp } from '../shared/phone-utils.js';

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
 * Template HTML ricevuta
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
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Ricevuta N° ${receiptData.numero}</title>
      <style>
        body { 
          margin: 0; 
          padding: 0; 
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #f9f7f4;
          color: #333;
        }
        .print-button {
          position: fixed;
          top: 20px;
          right: 20px;
          background: #8b5a3c;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          cursor: pointer;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 2px 8px rgba(139, 90, 60, 0.3);
          transition: all 0.3s ease;
        }
        .print-button:hover {
          background: #6b4530;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(139, 90, 60, 0.4);
        }
        .container { 
          max-width: 800px; 
          margin: 40px auto; 
          padding: 40px;
          background: white;
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
        }
        .header { 
          text-align: center; 
          margin-bottom: 30px; 
          padding-bottom: 20px;
          border-bottom: 2px solid #8b5a3c;
        }
        .header h1 { 
          color: #8b5a3c; 
          margin: 0 0 10px 0; 
          font-size: 32px;
          font-weight: 700;
          letter-spacing: 1px;
        }
        .header p { 
          margin: 0; 
          font-size: 18px; 
          color: #666;
          font-weight: 500;
        }
        .section { 
          margin-bottom: 25px; 
          background: #f9f7f4; 
          padding: 20px; 
          border-radius: 8px;
          border-left: 4px solid #8b5a3c;
        }
        .section h3 { 
          color: #8b5a3c; 
          margin: 0 0 15px 0; 
          font-size: 18px;
          font-weight: 600;
        }
        .section p { 
          margin: 8px 0; 
          font-size: 14px;
          line-height: 1.6;
        }
        .client-section { 
          margin-bottom: 25px; 
          padding: 20px; 
          background: #fff;
          border: 2px solid #e8d5c4; 
          border-radius: 8px;
        }
        table { 
          width: 100%; 
          border-collapse: collapse; 
          margin-bottom: 25px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
        }
        th { 
          padding: 12px; 
          text-align: left; 
          background: #8b5a3c; 
          color: white; 
          font-size: 14px;
          font-weight: 600;
        }
        td { 
          padding: 12px; 
          border-bottom: 1px solid #e0e0e0; 
          font-size: 14px;
        }
        tr:last-child td {
          border-bottom: none;
        }
        .total-section { 
          text-align: right; 
          margin-bottom: 25px; 
          padding: 20px; 
          background: #f9f7f4; 
          border-radius: 8px;
          border: 2px solid #e8d5c4;
        }
        .total-section p { 
          margin: 8px 0; 
          font-size: 15px;
        }
        .total-amount { 
          font-size: 28px; 
          color: #8b5a3c; 
          font-weight: 700; 
          margin-top: 15px;
        }
        .note { 
          margin-bottom: 20px; 
          padding: 15px; 
          background: #fff3e0; 
          border-left: 4px solid #ff9800; 
          border-radius: 4px;
        }
        .note p { 
          margin: 0; 
          font-size: 13px; 
          color: #e65100;
          line-height: 1.6;
        }
        .footer { 
          text-align: center; 
          margin-top: 40px; 
          padding-top: 20px; 
          border-top: 2px solid #e0e0e0;
        }
        .footer p { 
          margin: 5px 0; 
          font-size: 12px; 
          color: #999;
        }

        /* Print Styles */
        @media print {
          body { background: white; }
          .print-button { display: none; }
          .container { 
            margin: 0; 
            padding: 20px;
            box-shadow: none;
            border-radius: 0;
          }
        }

        /* Mobile Responsive */
        @media only screen and (max-width: 600px) {
          .print-button {
            position: static;
            width: 100%;
            margin-bottom: 20px;
          }
          .container { 
            margin: 20px;
            padding: 20px; 
          }
          .header h1 { font-size: 24px; }
          .header p { font-size: 16px; }
          .section { padding: 15px; margin-bottom: 15px; }
          .section h3 { font-size: 16px; }
          .section p, td, th { font-size: 12px; }
          th, td { padding: 8px; }
          .total-amount { font-size: 22px; }
        }
      </style>
    </head>
    <body>
      <button class="print-button" onclick="window.print()">Stampa Ricevuta</button>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <h1>RICEVUTA</h1>
          <p>N° ${receiptData.numero}</p>
        </div>

      <!-- Dati Studio -->
        <div class="section">
          <h3>Emesso da:</h3>
        <p style="margin: 5px 0; font-size: 16px;"><strong>${receiptData.studioName}</strong></p>
        ${receiptData.studioAddress ? `<p style="margin: 5px 0; font-size: 14px;">${receiptData.studioAddress}</p>` : ''}
        <p style="margin: 5px 0; font-size: 14px;">Tel: ${receiptData.studioPhone}</p>
        <p style="margin: 5px 0; font-size: 14px;">Email: ${receiptData.studioEmail}</p>
        ${receiptData.studioPartitaIVA ? `<p style="margin: 5px 0; font-size: 14px;">P.IVA: ${receiptData.studioPartitaIVA}</p>` : ''}
        ${receiptData.studioCodiceFiscale ? `<p>C.F.: ${receiptData.studioCodiceFiscale}</p>` : ''}
        </div>

      <!-- Dati Cliente (se presenti) -->
        ${receiptData.clienteNome || receiptData.clienteCognome ? `
        <div class="client-section">
          <h3>Intestato a:</h3>
        <p style="margin: 5px 0; font-size: 16px;">
          <strong>${receiptData.clienteNome || ''} ${receiptData.clienteCognome || ''}</strong>
        </p>
        ${receiptData.clienteEmail ? `<p style="margin: 5px 0; font-size: 14px;">Email: ${receiptData.clienteEmail}</p>` : ''}
        ${receiptData.clienteCellulare ? `<p>Tel: ${receiptData.clienteCellulare}</p>` : ''}
        </div>
        ` : ''}

      <!-- Dettagli Ricevuta -->
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Categoria</th>
              <th>Descrizione</th>
              <th style="text-align: right;">Importo</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${formatDate(receiptData.data)}</td>
              <td>${receiptData.categoria}</td>
              <td>${receiptData.descrizione}</td>
              <td style="text-align: right; font-weight: bold;">${formatCurrency(receiptData.importo)}</td>
            </tr>
          </tbody>
        </table>

      <!-- Totale -->
        <div class="total-section">
          <p>Metodo di Pagamento: <strong>${receiptData.metodoPagamento.toUpperCase()}</strong></p>
          <p class="total-amount">TOTALE: ${formatCurrency(receiptData.importo)}</p>
        </div>

        ${receiptData.note ? `
        <div class="note">
          <p><strong>Note:</strong> ${receiptData.note}</p>
        </div>
        ` : ''}

      <!-- Footer -->
        <div class="footer">
          <p>Documento emesso elettronicamente</p>
          <p>Grazie per la fiducia</p>
        </div>
      </div>
    </body>
    </html>
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
      
      const subject = `Ricevuta N ${numeroRicevuta} - ${studioInfo.name}`;
      await sendGmailEmail(recipient, subject, htmlContent);
      
      console.log(`✅ Ricevuta N° ${numeroRicevuta} inviata via email a ${recipient}`);
    } else {
      // WhatsApp: genera link wa.me con messaggio precompilato
      const whatsappMessage = `Ciao${clienteNome ? ' ' + clienteNome : ''}!\n\nEcco la tua *Ricevuta N° ${numeroRicevuta}*\n\nData: ${new Date(receiptData.data.toDate ? receiptData.data.toDate() : receiptData.data).toLocaleDateString('it-IT')}\nImporto: €${receiptData.importo.toFixed(2)}\nDescrizione: ${receiptData.descrizione}\nPagamento: ${receiptData.metodoPagamento.toUpperCase()}\n\n${receiptData.studioName}\n${receiptData.studioPhone}`;
      
      const whatsappNumber = formatPhoneForWhatsApp(recipient);
      const whatsappLink = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(whatsappMessage)}`;
      
      console.log(`📱 Link WhatsApp generato per ricevuta N° ${numeroRicevuta}: ${whatsappLink}`);
      
      // Ritorna il link che il frontend aprirà automaticamente
      return res.status(200).json({
        success: true,
        message: 'Link WhatsApp generato',
        whatsappLink,
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
