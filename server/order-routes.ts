/**
 * Order API Routes - Gestione ordini con email automatiche
 */

import { Router, Request, Response } from 'express';
import { sendGmailEmail, createOrderPaymentReceivedEmailHTML } from './email-routes.js';
import { db, FieldValue } from './firebase-admin.js';

const router = Router();

/**
 * Helper: Crea HTML email per notifica aggiornamento ordine
 * Template allineato con gli altri email del sistema
 */
function createOrderUpdatedEmailHTML(orderData: any, studioInfo: any): string {
  const { 
    nomeCliente, 
    prodotti = [], 
    totale = 0, 
    acconto = 0, 
    saldo = 0,
    stato = 'bozza',
    note 
  } = orderData;

  const studio = {
    name: studioInfo?.name || 'Memorie Sospese',
    email: studioInfo?.email || 'memoriesospese@gennaromazzacane.it',
    phone: studioInfo?.phone || '+39 334 7103142',
    address: studioInfo?.address || ''
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const statoLabels: Record<string, string> = {
    'bozza': 'Bozza',
    'in_lavorazione': 'In Lavorazione',
    'completato': 'Completato',
    'annullato': 'Annullato'
  };
  const statoLabel = statoLabels[stato] || stato;

  const statoColors: Record<string, string> = {
    'bozza': '#f59e0b',
    'in_lavorazione': '#0056b3',
    'completato': '#28a745',
    'annullato': '#dc3545'
  };
  const statoColor = statoColors[stato] || '#6c757d';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #8b5a3c; text-align: center;">📦 Ordine Aggiornato</h2>
      <div style="background: #f9f7f4; padding: 20px; border-radius: 10px; margin: 20px 0;">
        <p style="font-size: 16px; margin-bottom: 15px;">
          Ciao <strong>${nomeCliente}</strong>,
        </p>
        <p style="font-size: 16px; margin-bottom: 20px;">
          Il tuo ordine è stato aggiornato. Ecco il riepilogo delle modifiche:
        </p>

        <!-- Stato -->
        <div style="background: ${statoColor}15; border-left: 4px solid ${statoColor}; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #666;">Stato Ordine:</p>
          <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: bold; color: ${statoColor};">
            ${statoLabel}
          </p>
        </div>
        
        <!-- Prodotti -->
        <div style="background: white; padding: 15px; border-radius: 5px; margin: 20px 0;">
          <h3 style="color: #8b5a3c; margin-top: 0; margin-bottom: 15px;">Dettagli Ordine</h3>
          <table style="width: 100%; font-size: 14px; color: #333; border-collapse: collapse;">
            ${prodotti.map((p: any) => `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;">
                  ${p.prodottoNome} (x${p.quantita})
                  ${!p.prodottoId ? '<span style="background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px;">Custom</span>' : ''}
                  ${p.prodottoNumeroFoto > 0 ? `<br/><span style="color: #999; font-size: 12px;">${p.prodottoNumeroFoto} foto</span>` : ''}
                </td>
                <td style="padding: 8px 0; text-align: right;">${formatCurrency(p.prodottoPrezzo * p.quantita)}</td>
              </tr>
            `).join('')}
            <tr style="border-top: 2px solid #8b5a3c; font-weight: bold;">
              <td style="padding: 12px 0;">Totale:</td>
              <td style="padding: 12px 0; text-align: right; color: #8b5a3c; font-size: 18px;">${formatCurrency(totale)}</td>
            </tr>
          </table>
        </div>

        <!-- Pagamenti -->
        ${acconto > 0 || saldo > 0 ? `
        <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0;">
          <h4 style="color: #0056b3; margin-top: 0; margin-bottom: 10px;">Situazione Pagamenti</h4>
          <table style="width: 100%; font-size: 14px; color: #333;">
            ${acconto > 0 ? `
            <tr>
              <td>Acconto ricevuto:</td>
              <td style="text-align: right; font-weight: bold; color: #28a745;">${formatCurrency(acconto)}</td>
            </tr>
            ` : ''}
            ${saldo > 0 ? `
            <tr>
              <td>Saldo rimanente:</td>
              <td style="text-align: right; font-weight: bold; color: #f59e0b;">${formatCurrency(saldo)}</td>
            </tr>
            ` : saldo === 0 && acconto > 0 ? `
            <tr>
              <td>Saldo:</td>
              <td style="text-align: right; font-weight: bold; color: #28a745;">${formatCurrency(0)} ✓ Saldato</td>
            </tr>
            ` : ''}
          </table>
        </div>
        ` : ''}

        <!-- Note -->
        ${note ? `
        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <h4 style="color: #856404; margin-top: 0; margin-bottom: 10px;">📝 Note</h4>
          <p style="margin: 0; font-size: 14px; color: #856404; line-height: 1.5;">
            ${note}
          </p>
        </div>
        ` : ''}

        <p style="font-size: 14px; color: #666; text-align: center; margin-top: 25px;">
          Per qualsiasi domanda, contattaci via email o telefono!
        </p>
      </div>
      
      <div style="text-align: center; color: #666; font-size: 12px; margin-top: 30px; border-top: 1px solid #e0e0e0; padding-top: 20px;">
        <p style="margin: 5px 0; font-weight: 600;">${studio.name}</p>
        ${studio.address ? `<p style="margin: 5px 0;">${studio.address}</p>` : ''}
        <p style="margin: 5px 0;">Email: ${studio.email}</p>
        <p style="margin: 5px 0;">Tel: ${studio.phone}</p>
      </div>
    </div>
  `;
}

/**
 * PATCH /api/orders/:id - Aggiorna ordine esistente con email automatica
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    console.log(`📝 Update ordine ${id}:`, updateData);

    // 1. Fetch ordine corrente
    const orderRef = db.collection('orders').doc(id);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }

    const currentOrder = orderDoc.data()!;

    // 2. Ricalcola totali se prodotti cambiano
    let totale = currentOrder.totale;
    let saldo = currentOrder.saldo;

    if (updateData.prodotti && Array.isArray(updateData.prodotti)) {
      totale = updateData.prodotti.reduce((sum: number, item: any) => {
        return sum + (item.prodottoPrezzo * item.quantita);
      }, 0);

      const acconto = updateData.acconto !== undefined ? updateData.acconto : currentOrder.acconto || 0;
      saldo = totale - acconto;
    } else if (updateData.acconto !== undefined) {
      const acconto = updateData.acconto;
      saldo = totale - acconto;
    }

    // 3. Prepara dati aggiornamento
    const finalUpdateData: any = {
      ...updateData,
      totale,
      saldo,
      updatedAt: FieldValue.serverTimestamp(),
    };

    // 4. Update Firestore
    await orderRef.update(finalUpdateData);
    console.log(`✅ Ordine ${id} aggiornato in Firestore`);

    // 4.1 Se lo status dell'ordine cambia, aggiorna anche la galleria associata
    if (updateData.status && currentOrder.galleryId) {
      try {
        const galleryRef = db.collection('galleries').doc(currentOrder.galleryId);
        await galleryRef.update({
          orderStatus: updateData.status,
          updatedAt: FieldValue.serverTimestamp()
        });
        console.log(`✅ Galleria ${currentOrder.galleryId} aggiornata con orderStatus: ${updateData.status}`);
      } catch (galleryError: any) {
        console.error(`⚠️ Errore aggiornamento galleria ${currentOrder.galleryId}:`, galleryError.message);
        // Non blocca l'operazione, è solo un sync
      }
    }

    // 5. Fetch ordine aggiornato per email
    const updatedOrderDoc = await orderRef.get();
    const updatedOrder = { id: updatedOrderDoc.id, ...updatedOrderDoc.data() };

    // 6. Invia email automatica se c'è email cliente
    const emailCliente = updateData.emailCliente || currentOrder.emailCliente;

    if (emailCliente && emailCliente.trim()) {
      try {
        // Fetch studio info da Firestore
        const studioDoc = await db.collection('settings').doc('studio').get();
        const studioInfo = studioDoc.exists ? studioDoc.data() : {};

        // Crea HTML email
        const htmlContent = createOrderUpdatedEmailHTML(updatedOrder, studioInfo);

        // Invia email
        await sendGmailEmail(
          emailCliente,
          'Ordine Aggiornato - Image Studio Fotografico',
          htmlContent
        );

        console.log(`📧 Email aggiornamento ordine inviata a ${emailCliente}`);
      } catch (emailError: any) {
        console.error('❌ Errore invio email:', emailError.message);
        // Non blocca la response, l'ordine è stato aggiornato
      }
    } else {
      console.log('ℹ️ Nessuna email cliente, skip invio email');
    }

    res.json({
      success: true,
      message: 'Ordine aggiornato con successo',
      order: updatedOrder,
    });

  } catch (error: any) {
    console.error('❌ Errore update ordine:', error);
    res.status(500).json({
      error: 'Errore aggiornamento ordine',
      details: error.message,
    });
  }
});

/**
 * POST /api/orders/payment-received-notification
 * Invia email al cliente quando admin registra un pagamento (acconto o saldo)
 * Body: { orderId, paymentType: 'acconto'|'saldo', paymentAmount, paymentMethod, paymentDate, notes? }
 */
router.post('/payment-received-notification', async (req: Request, res: Response) => {
  try {
    const {
      orderId,
      paymentType,
      paymentAmount,
      paymentMethod,
      paymentDate,
      notes
    } = req.body;

    // 1. Validation
    if (!orderId || !paymentType || !paymentAmount || !paymentMethod || !paymentDate) {
      return res.status(400).json({
        error: 'Parametri mancanti',
        required: ['orderId', 'paymentType', 'paymentAmount', 'paymentMethod', 'paymentDate']
      });
    }

    // 2. Fetch order da Firestore
    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();
    
    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }

    const orderData: any = orderDoc.data();

    // 3. Get client email (fallback a multiple sources)
    const clientEmail = orderData.emailCliente || orderData.email || null;
    
    if (!clientEmail || !clientEmail.trim()) {
      return res.status(400).json({ 
        error: 'Email cliente non disponibile per questo ordine' 
      });
    }

    // 4. Saldo rimanente DOPO questo pagamento
    // IMPORTANTE: orderData contiene già i valori POST-update (l'endpoint è chiamato DOPO updateDoc)
    // Quindi orderData.saldo è già il saldo corretto dopo questo pagamento
    const totale = orderData.totale || 0;
    const accontoTotale = orderData.acconto || 0;
    const saldoRimanente = orderData.saldo || 0;
    
    const remainingBalance = paymentType === 'acconto' 
      ? saldoRimanente               // Saldo già aggiornato in Firestore
      : 0;                            // Saldo finale = tutto pagato

    // 5. Fetch studio info
    const studioDoc = await db.collection('settings').doc('studio').get();
    const studioData = studioDoc.exists ? studioDoc.data() : {};
    const studioInfo = studioData as { name: string; email: string; phone: string; address: string } | undefined;

    // 6. Get nome evento (fallback a nomeCliente)
    const nomeEvento = orderData.nomeEvento || orderData.nomeCliente || 'il tuo ordine';

    // 7. Format date per display
    const formattedDate = typeof paymentDate === 'string' 
      ? paymentDate 
      : new Date(paymentDate).toLocaleDateString('it-IT', {
          day: '2-digit',
          month: 'long',
          year: 'numeric'
        });

    // 8. Crea HTML email
    const htmlContent = createOrderPaymentReceivedEmailHTML(
      orderData.nomeCliente || 'Cliente',
      nomeEvento,
      paymentType,
      paymentAmount,
      paymentMethod,
      formattedDate,
      remainingBalance,
      undefined, // nextPaymentDate (opzionale)
      notes,
      studioInfo
    );

    // 9. Invia email
    await sendGmailEmail(
      clientEmail,
      'Pagamento Ricevuto - Image Studio Fotografico',
      htmlContent
    );

    console.log(`📧 Email pagamento ricevuto inviata a ${clientEmail} per ordine ${orderId}`);

    res.json({
      success: true,
      message: `Email pagamento inviata a ${clientEmail}`,
      sentTo: clientEmail
    });

  } catch (error: any) {
    console.error('❌ Errore invio email pagamento ricevuto:', error);
    res.status(500).json({
      error: 'Errore invio email',
      details: error.message
    });
  }
});

export default router;
