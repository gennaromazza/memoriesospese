/**
 * Order API Routes - Gestione ordini con email automatiche
 */

import { Router, Request, Response } from 'express';
import { sendGmailEmail, createOrderPaymentReceivedEmailHTML, authenticateFirebase } from './email-routes.js';
import { db, FieldValue } from './firebase-admin.js';

const ADMIN_EMAILS = ["gennaro.mazzacane@gmail.com"];

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
    name: studioInfo?.name || 'Image Studio Fotografico',
    email: studioInfo?.email || 'image.studio.fotografico@gmail.com',
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
            ${prodotti.map((p: any) => {
              // Calcola foto totali: per bundle somma bundleItems, altrimenti usa prodottoNumeroFoto
              let totalPhotos = 0;
              if (p.isBundle && p.bundleItems && p.bundleItems.length > 0) {
                totalPhotos = p.bundleItems.reduce((sum: number, bi: any) => sum + (bi.numeroFoto || 0) * (bi.quantita || 1), 0);
              } else {
                totalPhotos = p.prodottoNumeroFoto || 0;
              }
              
              const bundleIcon = p.isBundle ? ' 📦' : '';
              const photoText = totalPhotos > 0 ? `<br/><span style="color: #999; font-size: 12px;">${totalPhotos} foto</span>` : '';
              
              // Se è un bundle, mostra i prodotti inclusi
              let bundleItemsHtml = '';
              if (p.isBundle && p.bundleItems && p.bundleItems.length > 0) {
                bundleItemsHtml = '<div style="margin-top: 8px; padding: 8px; background: #f8f5f0; border-radius: 4px;">' +
                  '<span style="font-size: 11px; color: #666; font-style: italic;">Prodotti inclusi:</span>' +
                  p.bundleItems.map((item: any) => {
                    const itemQty = item.quantita > 1 ? ` x${item.quantita}` : '';
                    const itemPhotos = item.numeroFoto > 0 ? ` (${item.numeroFoto * item.quantita} foto)` : '';
                    return `<br/><span style="font-size: 12px; color: #555;">└ ${item.prodottoNome}${itemQty}${itemPhotos}</span>`;
                  }).join('') +
                  '</div>';
              }
              
              return `
              <tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 8px 0;">
                  ${p.prodottoNome} (x${p.quantita})${bundleIcon}
                  ${!p.prodottoId ? '<span style="background: #dbeafe; color: #1e40af; padding: 1px 6px; border-radius: 3px; font-size: 10px; margin-left: 5px;">Custom</span>' : ''}
                  ${photoText}
                  ${bundleItemsHtml}
                </td>
                <td style="padding: 8px 0; text-align: right; vertical-align: top;">${formatCurrency(p.prodottoPrezzo * p.quantita)}</td>
              </tr>
            `}).join('')}
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
 * Helper: Espandi prodotti ordine in productRequirements per galleria
 * Replica la stessa logica di espansione bundle usata nella creazione galleria (BookingsManager)
 */
async function expandOrderProductsToRequirements(prodotti: any[]): Promise<any[]> {
  const expandedProducts: any[] = [];

  // Pre-fetch catalogo prodotti per fallback bundle (come BookingsManager)
  let catalogProducts: Map<string, any> = new Map();
  const productIds = prodotti.filter(p => p.prodottoId && !p.prodottoId.startsWith('custom_')).map(p => p.prodottoId);
  if (productIds.length > 0) {
    try {
      const chunks = [];
      for (let i = 0; i < productIds.length; i += 10) {
        chunks.push(productIds.slice(i, i + 10));
      }
      for (const chunk of chunks) {
        const snapshot = await db.collection('products').where('__name__', 'in', chunk).get();
        snapshot.docs.forEach(doc => catalogProducts.set(doc.id, { id: doc.id, ...doc.data() }));
      }
    } catch (err: any) {
      console.warn('⚠️ Impossibile caricare catalogo prodotti per fallback bundle:', err.message);
    }
  }

  for (const orderItem of prodotti) {
    const orderItemQuantity = orderItem.quantita || 1;

    // PRIORITY: orderItem.bundleItems → fallback a catalogo (come BookingsManager)
    const hasOrderItemBundle = orderItem.isBundle && orderItem.bundleItems && orderItem.bundleItems.length > 0;
    const catalogProduct = catalogProducts.get(orderItem.prodottoId);
    const hasCatalogBundle = catalogProduct?.isBundle && catalogProduct.bundleItems && catalogProduct.bundleItems.length > 0;
    
    const bundleItems = hasOrderItemBundle 
      ? orderItem.bundleItems 
      : hasCatalogBundle 
        ? catalogProduct!.bundleItems 
        : null;
    const catalogBundleItems = hasCatalogBundle ? catalogProduct!.bundleItems : null;
    const bundleParentName = orderItem.prodottoNome || catalogProduct?.nome || 'Bundle';

    if (bundleItems && bundleItems.length > 0) {
      let bundleExpandedCount = 0;
      for (let orderQty = 0; orderQty < orderItemQuantity; orderQty++) {
        for (const bundleItem of bundleItems) {
          if (!bundleItem.quantita || bundleItem.quantita <= 0) continue;
          if (bundleItem.numeroFoto === undefined || bundleItem.numeroFoto < 0) continue;

          let finalNumeroFoto = bundleItem.numeroFoto;
          if (bundleItem.prodottoId && catalogBundleItems) {
            const catalogBundleItem = catalogBundleItems.find((cbi: any) => cbi.prodottoId === bundleItem.prodottoId);
            if (catalogBundleItem && catalogBundleItem.numeroFoto !== undefined) {
              finalNumeroFoto = catalogBundleItem.numeroFoto;
            }
          }

          for (let i = 0; i < bundleItem.quantita; i++) {
            const bundlePrefix = orderItemQuantity > 1
              ? `[${orderQty + 1}/${orderItemQuantity}] `
              : '';
            const req: any = {
              prodottoNome: bundleItem.quantita > 1
                ? `${bundlePrefix}${bundleItem.prodottoNome} (${i + 1}/${bundleItem.quantita}) - ${bundleParentName}`
                : `${bundlePrefix}${bundleItem.prodottoNome} - ${bundleParentName}`,
              prodottoNumeroFoto: finalNumeroFoto,
            };
            if (bundleItem.prodottoId) {
              req.prodottoId = bundleItem.prodottoId;
            }
            expandedProducts.push(req);
            bundleExpandedCount++;
          }
        }
      }
      console.log(`📦 Bundle "${bundleParentName}" x${orderItemQuantity} espanso in ${bundleExpandedCount} requirements`);
    } else {
      for (let i = 0; i < orderItemQuantity; i++) {
        const req: any = {
          prodottoNome: orderItemQuantity > 1
            ? `${orderItem.prodottoNome} (${i + 1}/${orderItemQuantity})`
            : orderItem.prodottoNome,
          prodottoNumeroFoto: orderItem.prodottoNumeroFoto ?? 0,
        };
        if (orderItem.prodottoId && !orderItem.prodottoId.startsWith('custom_')) {
          req.prodottoId = orderItem.prodottoId;
        }
        expandedProducts.push(req);
      }
    }
  }

  return expandedProducts;
}

/**
 * Helper: Confronta due array di productRequirements per determinare se sono cambiati
 * Confronto semantico: ignora ordine, confronta nome + numeroFoto + id
 */
function areProductRequirementsEqual(a: any[], b: any[]): boolean {
  if (a.length !== b.length) return false;

  const serialize = (req: any) => 
    `${req.prodottoNome || ''}|${req.prodottoNumeroFoto ?? 0}|${req.prodottoId || ''}`;
  
  const setA = a.map(serialize).sort();
  const setB = b.map(serialize).sort();
  
  return setA.every((val, idx) => val === setB[idx]);
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

    // 4.05 SYNC PRODOTTI → GALLERIE: Se i prodotti cambiano, aggiorna productRequirements nelle gallerie
    let gallerySyncResult = { updated: 0, selectionsReset: 0 };
    const bookingId = currentOrder.bookingId;
    if (updateData.prodotti && Array.isArray(updateData.prodotti) && bookingId) {
      try {
        const galleriesSnapshot = await db.collection('galleries')
          .where('bookingId', '==', bookingId)
          .get();

        if (!galleriesSnapshot.empty) {
          // Espandi bundle nei loro componenti (stessa logica di creazione galleria)
          const newProductRequirements = await expandOrderProductsToRequirements(updateData.prodotti);
          
          // Per ogni galleria: confronta con requirements esistenti, aggiorna solo se cambiati
          const updatePromises = galleriesSnapshot.docs.map(async (galleryDoc) => {
            const galleryData = galleryDoc.data();
            const existingReqs = galleryData.productRequirements || [];
            
            const requirementsChanged = !areProductRequirementsEqual(existingReqs, newProductRequirements);
            
            if (!requirementsChanged) {
              console.log(`⏭️ Galleria ${galleryDoc.id}: productRequirements invariati, skip`);
              return;
            }
            
            const hasSelections = 
              (galleryData.photoAssignments && Object.keys(galleryData.photoAssignments).length > 0) ||
              (galleryData.selectedPhotoIds && galleryData.selectedPhotoIds.length > 0);
            
            const galleryUpdate: any = {
              productRequirements: newProductRequirements,
              selectionStatus: 'pending',
              updatedAt: FieldValue.serverTimestamp(),
            };
            
            // Reset selezioni se c'erano (prodotti cambiati → selezioni invalidate)
            if (hasSelections) {
              galleryUpdate.photoAssignments = {};
              galleryUpdate.selectedPhotoIds = [];
              gallerySyncResult.selectionsReset++;
              console.log(`⚠️ Galleria ${galleryDoc.id}: selezioni resettate per cambio prodotti`);
            }
            
            // Single vs multi product mode
            if (newProductRequirements.length === 1) {
              galleryUpdate.requiredPhotoCount = newProductRequirements[0].prodottoNumeroFoto || 0;
            }
            
            await galleryDoc.ref.update(galleryUpdate);
            gallerySyncResult.updated++;
          });
          
          await Promise.all(updatePromises);
          console.log(`✅ ${gallerySyncResult.updated} galleria/e aggiornata/e con productRequirements espansi`);
        }
      } catch (gallerySyncError: any) {
        console.error(`⚠️ Errore sync gallerie per prodotti:`, gallerySyncError.message);
      }
    }

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
    
    // 4.2 SYNC ORDINE → BOOKING: Se lo status dell'ordine cambia, sincronizza il booking associato
    if (updateData.status && currentOrder.bookingId) {
      try {
        const bookingRef = db.collection('bookings').doc(currentOrder.bookingId);
        const bookingDoc = await bookingRef.get();
        
        if (bookingDoc.exists) {
          const bookingData = bookingDoc.data()!;
          const currentBookingStato = bookingData.stato;
          let newBookingStato: string | null = null;
          
          // Mapping: Order status → Booking stato
          if (updateData.status === 'completato') {
            // Ordine completato → Booking deve essere "completata"
            // Guard: NON sovrascrivere se già completata o annullata
            if (currentBookingStato !== 'completata' && currentBookingStato !== 'annullata') {
              newBookingStato = 'completata';
            }
          } else if (updateData.status === 'annullato') {
            // Ordine annullato → Booking deve essere "annullata"
            // Guard: NON sovrascrivere se già completata o annullata
            // Un booking già completato non deve essere annullato retroattivamente
            if (currentBookingStato !== 'annullata' && currentBookingStato !== 'completata') {
              newBookingStato = 'annullata';
            }
          }
          
          if (newBookingStato) {
            await bookingRef.update({
              stato: newBookingStato,
              updatedAt: FieldValue.serverTimestamp()
            });
            console.log(`✅ Booking ${currentOrder.bookingId} sincronizzato: ${currentBookingStato} → ${newBookingStato}`);
          }
        }
      } catch (bookingError: any) {
        console.error(`⚠️ Errore sincronizzazione booking ${currentOrder.bookingId}:`, bookingError.message);
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
      gallerySync: gallerySyncResult,
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

/**
 * POST /api/orders/create-walkin
 * Crea un nuovo ordine walk-in con movimento cassa opzionale
 * RICHIEDE AUTENTICAZIONE: Solo admin può creare ordini walk-in
 */
router.post('/create-walkin', authenticateFirebase, async (req: any, res: Response) => {
  try {
    // Verifica admin
    const isAdmin = ADMIN_EMAILS.includes(req.user?.email || "");
    if (!isAdmin) {
      console.log(`❌ Utente ${req.user?.email} non autorizzato per ordini walk-in`);
      return res.status(403).json({
        error: 'Solo gli admin possono creare ordini walk-in'
      });
    }

    const {
      nomeCliente,
      emailCliente,
      telefonoCliente,
      prodotti,
      totale,
      acconto = 0,
      metodoPagamento = 'contante',
      note,
      sendEmail = false,
      clienteId = null,
      createNewCliente = false,
      clienteNome = '',
      clienteCognome = '',
    } = req.body;

    console.log('🛍️ Creazione ordine walk-in da:', req.user?.email, { nomeCliente, totale, acconto, clienteId, createNewCliente });

    // Validazione
    if (!nomeCliente || !prodotti || prodotti.length === 0 || totale <= 0) {
      return res.status(400).json({
        error: 'Campi obbligatori mancanti: nomeCliente, prodotti, totale'
      });
    }

    // Stato ordine basato su pagamento
    const isPaidInFull = acconto >= totale;
    const stato = isPaidInFull ? 'completato' : (acconto > 0 ? 'in_lavorazione' : 'in_attesa');
    const saldo = totale - acconto;

    // Descrizione prodotti
    const prodottiDescrizione = prodotti
      .map((p: any) => `${p.prodottoNome} x${p.quantita}`)
      .join(', ');
    
    // Gestione cliente: crea nuovo o usa esistente
    let finalClienteId = clienteId;
    
    if (createNewCliente && !clienteId) {
      // Crea nuovo cliente nel database
      const newClienteData = {
        nome: clienteNome || nomeCliente.split(' ')[0] || 'N/D',
        cognome: clienteCognome || nomeCliente.split(' ').slice(1).join(' ') || 'N/D',
        email: emailCliente ? emailCliente.toLowerCase().trim() : null,
        whatsapp: telefonoCliente || null,
        cellulare1: telefonoCliente || null,
        tags: ['walk-in'],
        sourceRefs: {
          bookingIds: [],
          orderIds: [],
          galleryIds: [],
        },
        lifecycle: {
          firstContactAt: FieldValue.serverTimestamp(),
          lastInteractionAt: FieldValue.serverTimestamp(),
          status: 'cliente',
        },
        financials: {
          totalRevenue: totale,
          outstandingBalance: saldo,
          totalOrders: 1,
        },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
      
      const newClienteRef = await db.collection('clienti').add(newClienteData);
      finalClienteId = newClienteRef.id;
      console.log('✅ Nuovo cliente creato:', finalClienteId, clienteNome, clienteCognome);
    }

    // Crea ordine
    const orderData: any = {
      nomeCliente,
      emailCliente: emailCliente || null,
      telefonoCliente: telefonoCliente || null,
      nomeEvento: `Ordine Walk-in - ${prodottiDescrizione.substring(0, 50)}`,
      dataEvento: null,
      prodotti,
      totale,
      acconto,
      saldo,
      stato,
      source: 'walk_in',
      note: note || null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    // Aggiungi riferimento al cliente se disponibile
    if (finalClienteId) {
      orderData.clienteId = finalClienteId;
    }

    const orderRef = await db.collection('orders').add(orderData);
    const orderId = orderRef.id;
    
    // Aggiorna cliente esistente con riferimento all'ordine e dati finanziari
    if (finalClienteId) {
      try {
        const updateData: any = {
          'sourceRefs.orderIds': FieldValue.arrayUnion(orderId),
          'lifecycle.lastInteractionAt': FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        
        // Se è un cliente esistente (non appena creato), aggiorna anche i dati finanziari
        if (clienteId && !createNewCliente) {
          updateData['financials.totalRevenue'] = FieldValue.increment(totale);
          updateData['financials.outstandingBalance'] = FieldValue.increment(saldo);
          updateData['financials.totalOrders'] = FieldValue.increment(1);
        }
        
        await db.collection('clienti').doc(finalClienteId).update(updateData);
        console.log('✅ Cliente aggiornato con riferimento ordine e finanziari:', finalClienteId);
      } catch (updateError) {
        console.log('⚠️ Errore aggiornamento cliente (non bloccante):', updateError);
      }
    }
    console.log('✅ Ordine walk-in creato:', orderId);

    // Se c'è acconto, crea movimento cassa con schema allineato
    if (acconto > 0) {
      const now = new Date();
      const cashData = {
        tipo: 'entrata',
        categoria: 'Vendita diretta',
        importo: acconto,
        descrizione: `Ordine Walk-in: ${nomeCliente} - ${prodottiDescrizione.substring(0, 50)}`,
        data: now, // Usa Date per allinearsi con schema client
        metodoPagamento,
        note: `Ordine ID: ${orderId}`,
        origine: 'walk-in', // Track cash origin
        origineRef: orderId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };

      await db.collection('cashMovements').add(cashData);
      console.log('✅ Movimento cassa registrato per ordine:', orderId);
    }

    // Invia email se richiesto
    if (sendEmail && emailCliente) {
      try {
        // Genera HTML prodotti
        const prodottiHtml = prodotti.map((p: any) => `
          <tr>
            <td style="padding: 10px; border-bottom: 1px solid #e8e4de;">
              ${p.prodottoNome} ${p.isCustom ? '<span style="color: #f59e0b; font-size: 11px;">(Custom)</span>' : ''}
            </td>
            <td style="padding: 10px; border-bottom: 1px solid #e8e4de; text-align: center;">${p.quantita}</td>
            <td style="padding: 10px; border-bottom: 1px solid #e8e4de; text-align: right;">€${(p.prodottoPrezzo * p.quantita).toFixed(2)}</td>
          </tr>
        `).join('');

        // Stato badge
        const statoBadge = stato === 'completato' 
          ? '<span style="background: #22c55e; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">✓ Completato</span>'
          : stato === 'in_lavorazione'
            ? '<span style="background: #3b82f6; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">In Lavorazione</span>'
            : '<span style="background: #f59e0b; color: white; padding: 4px 12px; border-radius: 20px; font-size: 12px;">In Attesa</span>';

        const pagamentoHtml = acconto > 0 ? `
          <div style="background: #f5f0e8; padding: 15px; border-radius: 8px; margin: 20px 0;">
            <div style="margin-bottom: 8px;">
              <span style="color: #666;">Acconto versato:</span>
              <span style="color: #22c55e; font-weight: 600; float: right;">€${acconto.toFixed(2)}</span>
            </div>
            ${saldo > 0 ? `
              <div>
                <span style="color: #666;">Saldo da pagare:</span>
                <span style="color: #f59e0b; font-weight: 600; float: right;">€${saldo.toFixed(2)}</span>
              </div>
            ` : '<p style="color: #22c55e; margin: 0; font-weight: 600;">✓ Pagamento completato</p>'}
            <div style="clear: both;"></div>
          </div>
        ` : '';

        const htmlContent = `
          <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #faf8f5;">
            <div style="background: linear-gradient(135deg, #8b9a7d 0%, #6b7d5a 100%); color: white; padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600;">Conferma Ordine</h1>
              <p style="margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">Image Studio Fotografico</p>
            </div>
            
            <div style="background: white; padding: 30px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.08);">
              <p style="font-size: 16px; color: #333; margin-bottom: 20px;">
                Gentile <strong>${nomeCliente}</strong>,
              </p>
              
              <p style="font-size: 15px; color: #555; margin-bottom: 20px; line-height: 1.6;">
                Grazie per il tuo ordine! Ecco il riepilogo:
              </p>

              <div style="margin: 20px 0;">
                ${statoBadge}
              </div>

              <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                <thead>
                  <tr style="background: #f5f0e8;">
                    <th style="padding: 10px; text-align: left; font-size: 13px; color: #666;">Prodotto</th>
                    <th style="padding: 10px; text-align: center; font-size: 13px; color: #666;">Qtà</th>
                    <th style="padding: 10px; text-align: right; font-size: 13px; color: #666;">Prezzo</th>
                  </tr>
                </thead>
                <tbody>
                  ${prodottiHtml}
                </tbody>
                <tfoot>
                  <tr style="background: #8b9a7d;">
                    <td colspan="2" style="padding: 12px; color: white; font-weight: 600;">Totale</td>
                    <td style="padding: 12px; text-align: right; color: white; font-weight: 600; font-size: 18px;">€${totale.toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

              ${pagamentoHtml}

              <div style="background: #e7f3ff; border-left: 4px solid #0056b3; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0; font-size: 14px; color: #0056b3; line-height: 1.6;">
                  📍 Ti contatteremo quando l'ordine sarà pronto per il ritiro.
                </p>
              </div>
            </div>

            <div style="text-align: center; color: #6b7d8a; font-size: 12px; margin-top: 25px; padding-top: 20px;">
              <p style="margin: 5px 0; font-weight: 600; color: #8b9a7d;">Image Studio Fotografico</p>
              <p style="margin: 5px 0;">Email: image.studio.fotografico@gmail.com</p>
              <p style="margin: 5px 0;">Tel: +39 334 7103142</p>
            </div>
          </div>
        `;

        await sendGmailEmail(emailCliente, 'Conferma Ordine - Image Studio Fotografico', htmlContent);
        console.log('📧 Email conferma walk-in inviata a:', emailCliente);
      } catch (emailError) {
        console.error('⚠️ Errore invio email walk-in:', emailError);
        // Non bloccare la creazione ordine se l'email fallisce
      }
    }

    res.json({
      success: true,
      orderId,
      stato,
      message: `Ordine creato con successo`,
    });

  } catch (error: any) {
    console.error('❌ Errore creazione ordine walk-in:', error);
    res.status(500).json({
      error: 'Errore creazione ordine',
      details: error.message
    });
  }
});

/**
 * POST /api/orders/:id/register-payment
 * Registra un pagamento (acconto o saldo) con creazione atomica del movimento cassa
 * RICHIEDE AUTENTICAZIONE: Solo admin può registrare pagamenti
 */
router.post('/:id/register-payment', authenticateFirebase, async (req: any, res: Response) => {
  try {
    if (!req.user || !ADMIN_EMAILS.includes(req.user.email)) {
      return res.status(403).json({ error: 'Solo gli admin possono registrare pagamenti' });
    }

    const { id: orderId } = req.params;
    const { 
      tipo, 
      importo, 
      metodoPagamento = 'contante', 
      note,
      data 
    } = req.body;

    if (!tipo || !['acconto', 'saldo'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo pagamento deve essere "acconto" o "saldo"' });
    }

    const orderRef = db.collection('orders').doc(orderId);
    const orderDoc = await orderRef.get();

    if (!orderDoc.exists) {
      return res.status(404).json({ error: 'Ordine non trovato' });
    }

    const orderData = orderDoc.data()!;
    const totale = orderData.totale || 0;
    const accontoAttuale = orderData.acconto || 0;
    const saldoAttuale = orderData.saldo || totale - accontoAttuale;
    const transactions = orderData.transactions || [];
    const paymentDate = data ? new Date(data) : new Date();

    let paymentAmount: number;
    let nuovoAcconto: number;
    let nuovoSaldo: number;

    if (tipo === 'acconto') {
      if (!importo || importo <= 0) {
        return res.status(400).json({ error: 'Importo acconto deve essere maggiore di zero' });
      }
      paymentAmount = importo;
      nuovoAcconto = accontoAttuale + importo;
      nuovoSaldo = totale - nuovoAcconto;

      if (nuovoAcconto > totale) {
        return res.status(400).json({ 
          error: `Acconto totale (€${nuovoAcconto.toFixed(2)}) supera il totale ordine (€${totale.toFixed(2)})` 
        });
      }
    } else {
      if (saldoAttuale <= 0) {
        return res.status(400).json({ error: 'Non c\'è saldo da pagare per questo ordine' });
      }
      paymentAmount = saldoAttuale;
      nuovoAcconto = accontoAttuale + saldoAttuale;
      nuovoSaldo = 0;
    }

    const newTransaction = {
      tipo,
      importo: paymentAmount,
      metodo: metodoPagamento,
      data: paymentDate,
      emailInviata: false,
      ...(note?.trim() && { note: note.trim() }),
    };

    const updatedTransactions = [...transactions, newTransaction];

    const batch = db.batch();

    batch.update(orderRef, {
      transactions: updatedTransactions,
      acconto: nuovoAcconto,
      saldo: nuovoSaldo,
      [`metodoPagamento${tipo === 'acconto' ? 'Acconto' : 'Saldo'}`]: metodoPagamento,
      [`data${tipo === 'acconto' ? 'Acconto' : 'Saldo'}`]: paymentDate,
      updatedAt: FieldValue.serverTimestamp(),
    });

    const prodottiDescrizione = orderData.prodotti
      ?.map((p: any) => p.prodottoNome)
      .join(', ')
      .substring(0, 50) || 'Prodotti';
    const nomeCliente = orderData.nomeCliente || 'Cliente';

    // Determina origine in base al tipo di ordine
    const hasBooking = !!orderData.bookingId;
    const cashOrigine = hasBooking ? 'booking' : 'walk-in';
    
    // Recupera il nome della campagna dal booking se disponibile
    let origineTema: string | undefined;
    if (hasBooking) {
      try {
        const bookingDoc = await db.collection('bookings').doc(orderData.bookingId).get();
        if (bookingDoc.exists) {
          const bookingData = bookingDoc.data();
          if (bookingData?.campaignId) {
            const campaignDoc = await db.collection('booking_campaigns').doc(bookingData.campaignId).get();
            if (campaignDoc.exists) {
              origineTema = campaignDoc.data()?.nome;
            }
          }
        }
      } catch (err) {
        console.warn('⚠️ Impossibile recuperare campagna per origineTema:', err);
      }
    }
    
    const cashMovementRef = db.collection('cashMovements').doc();
    batch.set(cashMovementRef, {
      tipo: 'entrata',
      categoria: hasBooking ? 'Servizio fotografico' : 'Vendita diretta',
      importo: paymentAmount,
      descrizione: hasBooking 
        ? `Ordine da Prenotazione: ${nomeCliente} - ${prodottiDescrizione}`
        : `Ordine Walk-in: ${nomeCliente} - ${prodottiDescrizione}`,
      data: paymentDate,
      metodoPagamento,
      note: `Ordine ID: ${orderId} - ${tipo === 'acconto' ? 'Acconto' : 'Saldo'}`,
      origine: cashOrigine, // Track cash origin (booking or walk-in)
      origineRef: hasBooking ? orderData.bookingId : orderId,
      ...(origineTema && { origineTema }), // Nome della campagna per filtro
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log(`✅ Pagamento ${tipo} registrato per ordine ${orderId}: €${paymentAmount} (${metodoPagamento})`);
    console.log(`✅ Movimento cassa creato: ${cashMovementRef.id}`);

    res.json({
      success: true,
      orderId,
      transactionIndex: updatedTransactions.length - 1,
      cashMovementId: cashMovementRef.id,
      paymentAmount,
      nuovoSaldo,
      message: `Pagamento ${tipo} di €${paymentAmount.toFixed(2)} registrato con successo`,
    });

  } catch (error: any) {
    console.error('❌ Errore registrazione pagamento:', error);
    res.status(500).json({
      error: 'Errore registrazione pagamento',
      details: error.message
    });
  }
});

/**
 * POST /api/orders/sync-bundle-data
 * Sincronizza i dati bundle negli ordini esistenti con i prodotti attuali del catalogo
 * RICHIEDE AUTENTICAZIONE: Solo admin
 */
router.post('/sync-bundle-data', authenticateFirebase, async (req: any, res: Response) => {
  try {
    const userEmail = req.user?.email;
    if (!userEmail || !ADMIN_EMAILS.includes(userEmail)) {
      return res.status(403).json({
        error: 'Solo gli admin possono sincronizzare i dati bundle'
      });
    }

    console.log('🔄 Inizio sincronizzazione dati bundle negli ordini...');

    // 1. Recupera tutti i prodotti bundle dal catalogo
    const productsSnapshot = await db.collection('products').where('isBundle', '==', true).get();
    const bundleProducts = new Map<string, any>();
    
    productsSnapshot.docs.forEach(doc => {
      const data = doc.data();
      bundleProducts.set(doc.id, {
        id: doc.id,
        nome: data.nome,
        isBundle: true,
        bundleItems: data.bundleItems || []
      });
    });

    console.log(`📦 Trovati ${bundleProducts.size} prodotti bundle nel catalogo`);

    if (bundleProducts.size === 0) {
      return res.json({
        success: true,
        message: 'Nessun prodotto bundle trovato nel catalogo',
        ordersUpdated: 0,
        productsUpdated: 0
      });
    }

    // 2. Recupera tutti gli ordini e aggiorna in batch
    const ordersSnapshot = await db.collection('orders').get();
    let ordersUpdated = 0;
    let productsUpdated = 0;
    
    // Processa in batch di 400 per evitare timeout
    const BATCH_SIZE = 400;
    let batch = db.batch();
    let batchCount = 0;

    for (const orderDoc of ordersSnapshot.docs) {
      const orderData = orderDoc.data();
      const prodotti = orderData.prodotti || [];
      let orderNeedsUpdate = false;
      const updatedProdotti = [...prodotti];

      for (let i = 0; i < updatedProdotti.length; i++) {
        const prodotto = updatedProdotti[i];
        const prodottoId = prodotto.prodottoId;

        if (prodottoId && bundleProducts.has(prodottoId)) {
          const bundleData = bundleProducts.get(prodottoId);
          const newBundleItems = bundleData.bundleItems.map((item: any) => ({
            prodottoId: item.prodottoId,
            prodottoNome: item.prodottoNome,
            quantita: item.quantita || 1,
            numeroFoto: item.numeroFoto || 0
          }));
          
          // Aggiorna sempre con i dati attuali del catalogo (sincronizza anche dati stale)
          const currentBundleItems = JSON.stringify(prodotto.bundleItems || []);
          const catalogBundleItems = JSON.stringify(newBundleItems);
          
          if (!prodotto.isBundle || currentBundleItems !== catalogBundleItems) {
            updatedProdotti[i] = {
              ...prodotto,
              isBundle: true,
              bundleItems: newBundleItems
            };
            orderNeedsUpdate = true;
            productsUpdated++;
            console.log(`  ✓ Ordine ${orderDoc.id}: sincronizzato prodotto "${prodotto.prodottoNome}" con dati bundle attuali`);
          }
        }
      }

      if (orderNeedsUpdate) {
        batch.update(db.collection('orders').doc(orderDoc.id), {
          prodotti: updatedProdotti,
          updatedAt: FieldValue.serverTimestamp()
        });
        batchCount++;
        ordersUpdated++;
        
        // Commit batch quando raggiunge il limite
        if (batchCount >= BATCH_SIZE) {
          await batch.commit();
          batch = db.batch();
          batchCount = 0;
          console.log(`  📦 Committato batch di ${BATCH_SIZE} ordini`);
        }
      }
    }
    
    // Commit ultimo batch se ci sono operazioni pendenti
    if (batchCount > 0) {
      await batch.commit();
      console.log(`  📦 Committato batch finale di ${batchCount} ordini`);
    }

    console.log(`✅ Sincronizzazione completata: ${ordersUpdated} ordini aggiornati, ${productsUpdated} prodotti sincronizzati`);

    res.json({
      success: true,
      message: `Sincronizzazione completata`,
      ordersUpdated,
      productsUpdated,
      bundleProductsInCatalog: bundleProducts.size
    });

  } catch (error: any) {
    console.error('❌ Errore sincronizzazione dati bundle:', error);
    res.status(500).json({
      error: 'Errore sincronizzazione dati bundle',
      details: error.message
    });
  }
});

/**
 * POST /api/orders/repair-bundle-galleries
 * One-shot repair: scansiona tutti gli ordini con bundle e riallinea i productRequirements delle gallerie associate
 */
router.post('/repair-bundle-galleries', async (req: Request, res: Response) => {
  try {
    console.log('🔧 === AVVIO REPAIR BUNDLE GALLERIES ===');

    const ordersSnapshot = await db.collection('orders').get();
    console.log(`📋 Trovati ${ordersSnapshot.size} ordini totali`);

    let scanned = 0;
    let repaired = 0;
    let selectionsReset = 0;
    let skipped = 0;
    let noGallery = 0;
    const details: any[] = [];

    for (const orderDoc of ordersSnapshot.docs) {
      const order = orderDoc.data();
      scanned++;

      if (!order.prodotti || order.prodotti.length === 0) {
        continue;
      }

      const hasBundleProduct = order.prodotti.some((p: any) => p.isBundle);
      if (!hasBundleProduct) {
        continue;
      }

      const bookingId = order.bookingId;
      if (!bookingId) {
        continue;
      }

      const galleriesSnapshot = await db.collection('galleries')
        .where('bookingId', '==', bookingId)
        .get();

      if (galleriesSnapshot.empty) {
        noGallery++;
        continue;
      }

      const newProductRequirements = await expandOrderProductsToRequirements(order.prodotti);

      for (const galleryDoc of galleriesSnapshot.docs) {
        const galleryData = galleryDoc.data();
        const currentRequirements = galleryData.productRequirements || [];

        if (areProductRequirementsEqual(currentRequirements, newProductRequirements)) {
          skipped++;
          continue;
        }

        const structureChanged = currentRequirements.length !== newProductRequirements.length ||
          currentRequirements.some((req: any, idx: number) => {
            const newReq = newProductRequirements[idx];
            return (req.prodottoNome || '') !== (newReq?.prodottoNome || '') ||
                   (req.prodottoId || '') !== (newReq?.prodottoId || '');
          });

        const hasSelections = 
          (galleryData.photoAssignments && Object.keys(galleryData.photoAssignments).length > 0) ||
          (galleryData.selectedPhotoIds && galleryData.selectedPhotoIds.length > 0);

        const galleryUpdate: any = {
          productRequirements: newProductRequirements,
          updatedAt: FieldValue.serverTimestamp(),
        };

        if (structureChanged && hasSelections) {
          galleryUpdate.photoAssignments = {};
          galleryUpdate.selectedPhotoIds = [];
          galleryUpdate.selectionStatus = 'pending';
          selectionsReset++;
        }

        if (newProductRequirements.length === 1) {
          galleryUpdate.requiredPhotoCount = newProductRequirements[0].prodottoNumeroFoto || 0;
        }

        await galleryDoc.ref.update(galleryUpdate);
        repaired++;

        details.push({
          orderId: orderDoc.id,
          galleryId: galleryDoc.id,
          galleryName: galleryData.name || galleryData.galleryName || '?',
          oldRequirementsCount: currentRequirements.length,
          newRequirementsCount: newProductRequirements.length,
          selectionsReset: structureChanged && hasSelections,
          onlyPhotoCountChanged: !structureChanged,
        });

        console.log(`✅ Galleria ${galleryDoc.id} (${galleryData.name || '?'}): ${currentRequirements.length} → ${newProductRequirements.length} requirements${structureChanged && hasSelections ? ' [SELEZIONI RESET]' : !structureChanged ? ' [SOLO FOTO AGGIORNATE - SELEZIONI PRESERVATE]' : ''}`);
      }
    }

    console.log(`🔧 === REPAIR COMPLETATO ===`);
    console.log(`📊 Scansionati: ${scanned}, Riparati: ${repaired}, Saltati (già ok): ${skipped}, Senza galleria: ${noGallery}, Selezioni resettate: ${selectionsReset}`);

    res.json({
      success: true,
      summary: {
        ordersScanned: scanned,
        galleriesRepaired: repaired,
        galleriesSkipped: skipped,
        ordersWithoutGallery: noGallery,
        selectionsReset,
      },
      details,
    });

  } catch (error: any) {
    console.error('❌ Errore repair bundle galleries:', error);
    res.status(500).json({
      error: 'Errore durante il repair',
      details: error.message,
    });
  }
});

export default router;
