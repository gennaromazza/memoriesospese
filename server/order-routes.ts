/**
 * Order API Routes - Gestione ordini con email automatiche
 */

import { Router, Request, Response } from 'express';
import admin from 'firebase-admin';
import { sendGmailEmail } from './email-routes.js';

const router = Router();

/**
 * Helper: Crea HTML email per notifica aggiornamento ordine
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

  const studioNome = studioInfo?.nome || 'Image Studio Fotografico';
  const studioEmail = studioInfo?.email || 'image.studio.fotografico@gmail.com';
  const studioTelefono = studioInfo?.telefono || '327 465 6179';
  const studioIndirizzo = studioInfo?.indirizzo || 'Via Example 123, Città';

  const prodottiHTML = prodotti.map((p: any) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <strong>${p.prodottoNome}</strong>
        ${!p.prodottoId ? '<span style="background: #dbeafe; color: #1e40af; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-left: 8px;">Custom</span>' : ''}
        <br/>
        <span style="color: #6b7280; font-size: 13px;">${p.prodottoNumeroFoto} foto</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
        ${p.quantita}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">
        €${p.prodottoPrezzo.toFixed(2)}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600;">
        €${(p.prodottoPrezzo * p.quantita).toFixed(2)}
      </td>
    </tr>
  `).join('');

  const statoLabel = {
    'bozza': 'Bozza',
    'in_lavorazione': 'In Lavorazione',
    'completato': 'Completato',
    'annullato': 'Annullato'
  }[stato] || stato;

  const statoColor = {
    'bozza': '#f59e0b',
    'in_lavorazione': '#3b82f6',
    'completato': '#10b981',
    'annullato': '#ef4444'
  }[stato] || '#6b7280';

  return `
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Ordine Aggiornato</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #8b5a3c 0%, #6d4428 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">
                📦 Ordine Aggiornato
              </h1>
              <p style="margin: 10px 0 0 0; color: #f9f7f4; font-size: 16px;">
                ${studioNome}
              </p>
            </td>
          </tr>

          <!-- Saluto -->
          <tr>
            <td style="padding: 30px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151;">
                Ciao <strong>${nomeCliente}</strong>,
              </p>
              <p style="margin: 0 0 20px 0; font-size: 16px; color: #374151; line-height: 1.6;">
                Il tuo ordine è stato aggiornato. Ecco il riepilogo delle modifiche:
              </p>
            </td>
          </tr>

          <!-- Stato Ordine -->
          <tr>
            <td style="padding: 0 30px 20px 30px;">
              <div style="background-color: #f9fafb; border-left: 4px solid ${statoColor}; padding: 16px; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: #6b7280;">Stato:</p>
                <p style="margin: 5px 0 0 0; font-size: 18px; font-weight: 600; color: ${statoColor};">
                  ${statoLabel}
                </p>
              </div>
            </td>
          </tr>

          <!-- Prodotti -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background-color: #f9fafb;">
                    <th style="padding: 12px; text-align: left; font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Prodotto</th>
                    <th style="padding: 12px; text-align: center; font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Qtà</th>
                    <th style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Prezzo</th>
                    <th style="padding: 12px; text-align: right; font-size: 13px; font-weight: 600; color: #6b7280; border-bottom: 2px solid #e5e7eb;">Totale</th>
                  </tr>
                </thead>
                <tbody>
                  ${prodottiHTML}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Totali -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; text-align: right; font-size: 16px; color: #6b7280;">
                    Totale:
                  </td>
                  <td style="padding: 8px 0; text-align: right; font-size: 18px; font-weight: 600; width: 120px;">
                    €${totale.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; text-align: right; font-size: 16px; color: #6b7280;">
                    Acconto:
                  </td>
                  <td style="padding: 8px 0; text-align: right; font-size: 16px; font-weight: 600; color: #10b981;">
                    €${acconto.toFixed(2)}
                  </td>
                </tr>
                <tr style="border-top: 2px solid #e5e7eb;">
                  <td style="padding: 12px 0 0 0; text-align: right; font-size: 18px; font-weight: 700; color: #111827;">
                    Saldo:
                  </td>
                  <td style="padding: 12px 0 0 0; text-align: right; font-size: 22px; font-weight: 700; color: ${saldo > 0 ? '#f59e0b' : '#10b981'};">
                    €${saldo.toFixed(2)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${note ? `
          <!-- Note -->
          <tr>
            <td style="padding: 0 30px 30px 30px;">
              <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #92400e;">📝 Note:</p>
                <p style="margin: 0; font-size: 14px; color: #78350f; line-height: 1.5;">
                  ${note}
                </p>
              </div>
            </td>
          </tr>
          ` : ''}

          <!-- Contatti Studio -->
          <tr>
            <td style="padding: 30px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <h3 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #111827;">
                📞 Contattaci
              </h3>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
                <strong>Email:</strong> ${studioEmail}
              </p>
              <p style="margin: 0 0 8px 0; font-size: 14px; color: #6b7280;">
                <strong>Telefono:</strong> ${studioTelefono}
              </p>
              <p style="margin: 0; font-size: 14px; color: #6b7280;">
                <strong>Indirizzo:</strong> ${studioIndirizzo}
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Questa è una email automatica, per favore non rispondere direttamente.
              </p>
              <p style="margin: 8px 0 0 0; font-size: 12px; color: #9ca3af;">
                © ${new Date().getFullYear()} ${studioNome}. Tutti i diritti riservati.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
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

    const db = admin.firestore();

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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    // 4. Update Firestore
    await orderRef.update(finalUpdateData);
    console.log(`✅ Ordine ${id} aggiornato in Firestore`);

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

export default router;
