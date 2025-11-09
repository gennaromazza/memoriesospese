/**
 * QUOTES LIBRARY - CRUD Operations
 * Gestione preventivi digitali con firma
 */

import { db, storage } from './firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import type {
  Quote,
  InsertQuote,
  QuoteTemplate,
  InsertQuoteTemplate,
  AcceptQuoteData,
  QuoteStatus,
  PaymentScheduleConfig
} from '@shared/quotes-types';
import { nanoid } from 'nanoid';
import { addTimelineEvent, updateJobStatus } from './jobs';
import { calculateQuoteTotals, validateDiscount } from '@shared/quote-utils';
import type { QuoteProduct } from '@shared/quotes-types';
import type { Product } from '@shared/booking-types';

const QUOTES_COLLECTION = 'quotes';
const TEMPLATES_COLLECTION = 'quoteTemplates';

/**
 * Genera token sicuro per URL pubblico
 */
function generatePublicToken(): string {
  return nanoid(32); // Token sicuro 32 caratteri
}

/**
 * Crea nuovo preventivo
 */
export async function createQuote(
  data: InsertQuote,
  userId: string
): Promise<string> {
  try {
    // Valida e normalizza prodotti con prezzi trusted da catalog
    const validatedProducts: QuoteProduct[] = [];
    let subtotale = 0;
    
    for (const product of data.products) {
      // Se productId esiste, recupera prezzo trusted da Firestore
      if (product.productId) {
        const productDoc = await getDoc(doc(db, 'products', product.productId));
        if (productDoc.exists()) {
          const catalogProduct = productDoc.data() as Product;
          const trustedPrice = catalogProduct.prezzoFinale || catalogProduct.prezzo;
          
          // Usa prezzo trusted dal catalog (ignora client-side price)
          validatedProducts.push({
            ...product,
            prezzo: trustedPrice
          });
          subtotale += trustedPrice;
        } else {
          throw new Error(`Prodotto catalogo non trovato: ${product.productId}`);
        }
      } else {
        // Prodotto custom - usa prezzo fornito (già validato lato form)
        validatedProducts.push(product);
        subtotale += product.prezzo;
      }
    }
    
    // Valida sconto server-side
    const validation = validateDiscount(subtotale, data.discountType, data.discountValue);
    if (!validation.valid) {
      throw new Error(validation.error || 'Sconto non valido');
    }
    
    // Calcola totali finali con sconto (server-side)
    const { totalBeforeDiscount, totalAfterDiscount } = calculateQuoteTotals(
      subtotale,
      data.discountType,
      data.discountValue
    );
    
    // Prepara clausole con ID
    const clausesWithIds = data.contractClauses.map(c => ({
      ...c,
      id: nanoid()
    }));
    
    // Merge theme preservando tutti i campi
    const defaultTheme = getDefaultTheme();
    const theme = {
      ...defaultTheme,
      ...data.theme // Sovrascrive con campi forniti (preserva headerImage, fontFamily, etc.)
    };

    // Prepara paymentScheduleConfig solo se autoGenerate attivo
    const paymentScheduleConfig: PaymentScheduleConfig | undefined = data.paymentScheduleConfig?.autoGenerate
      ? {
          autoGenerate: true,
          numberOfPayments: data.paymentScheduleConfig.numberOfPayments || 2,
          accontoType: data.paymentScheduleConfig.accontoType || 'percentage',
          accontoPercentage: data.paymentScheduleConfig.accontoPercentage || 30,
          accontoAmount: data.paymentScheduleConfig.accontoAmount,
          useEventDateReference: data.paymentScheduleConfig.useEventDateReference ?? false,
          accontoRelativeDays: data.paymentScheduleConfig.accontoRelativeDays,
          rateIntervalDays: data.paymentScheduleConfig.rateIntervalDays || 30
        }
      : undefined;

    const quoteData: Omit<Quote, 'id'> = {
      jobId: data.jobId,
      clienteId: data.clienteId,
      type: data.type,
      ...(data.templateId && { templateId: data.templateId }), // Solo se definito
      ...(data.templateId && { templateName: await getTemplateName(data.templateId) }), // Solo se templateId definito
      theme,
      products: validatedProducts,  // Prodotti con prezzi validati server-side
      discountType: data.discountType,
      discountValue: data.discountValue,
      totalBeforeDiscount,  // Server-calculated from trusted prices
      totalAfterDiscount,   // Server-calculated from trusted prices
      totaleBase: totalBeforeDiscount, // Backward compatibility
      totaleSelezionato: data.type === 'variabile' ? 0 : totalAfterDiscount,
      contractClauses: clausesWithIds,
      status: 'bozza',
      publicToken: generatePublicToken(),
      ...(data.expiresAt && { expiresAt: Timestamp.fromDate(data.expiresAt) }), // Solo se definito
      ...(data.noteInterne && { noteInterne: data.noteInterne }), // Solo se definito
      ...(paymentScheduleConfig && { paymentScheduleConfig }), // Solo se definito
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId
    };

    const docRef = await addDoc(collection(db, QUOTES_COLLECTION), quoteData);
    
    // Aggiorna job con quoteId e financials
    const jobDoc = await getDoc(doc(db, 'jobs', data.jobId));
    if (jobDoc.exists()) {
      const currentQuoteIds = jobDoc.data().quoteIds || [];
      await updateDoc(doc(db, 'jobs', data.jobId), {
        quoteIds: [...currentQuoteIds, docRef.id],
        'financials.totalePreventivato': totalAfterDiscount, // Server-calculated
        updatedAt: Timestamp.now()
      });
    }
    
    // Timeline event
    await addTimelineEvent({
      jobId: data.jobId,
      tipo: 'preventivo_inviato',
      descrizione: `Preventivo creato (${data.type})`,
      userId,
      metadata: { quoteId: docRef.id }
    });

    console.log('✅ Preventivo creato:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore creazione preventivo:', error);
    throw error;
  }
}

/**
 * Get quote by ID
 */
export async function getQuote(quoteId: string): Promise<Quote | null> {
  try {
    const quoteDoc = await getDoc(doc(db, QUOTES_COLLECTION, quoteId));
    if (!quoteDoc.exists()) return null;
    
    return {
      id: quoteDoc.id,
      ...quoteDoc.data()
    } as Quote;
  } catch (error) {
    console.error('❌ Errore get quote:', error);
    throw error;
  }
}

/**
 * Get quote by public token
 */
export async function getQuoteByToken(token: string): Promise<Quote | null> {
  try {
    const q = query(
      collection(db, QUOTES_COLLECTION),
      where('publicToken', '==', token)
    );
    
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    
    const quoteDoc = snapshot.docs[0];
    const quote = {
      id: quoteDoc.id,
      ...quoteDoc.data()
    } as Quote;
    
    // Aggiorna viewedAt se prima visualizzazione
    if (!quote.viewedAt) {
      await updateDoc(doc(db, QUOTES_COLLECTION, quoteDoc.id), {
        viewedAt: Timestamp.now(),
        status: 'visionato'
      });
      quote.viewedAt = Timestamp.now();
      quote.status = 'visionato';
    }
    
    return quote;
  } catch (error) {
    console.error('❌ Errore get quote by token:', error);
    throw error;
  }
}

/**
 * Get all quotes for job
 */
export async function getQuotesForJob(jobId: string): Promise<Quote[]> {
  try {
    const q = query(
      collection(db, QUOTES_COLLECTION),
      where('jobId', '==', jobId),
      orderBy('createdAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Quote[];
  } catch (error) {
    console.error('❌ Errore get quotes for job:', error);
    throw error;
  }
}

/**
 * Update quote status
 */
export async function updateQuoteStatus(
  quoteId: string,
  newStatus: QuoteStatus
): Promise<void> {
  try {
    await updateDoc(doc(db, QUOTES_COLLECTION, quoteId), {
      status: newStatus,
      updatedAt: Timestamp.now()
    });
    
    console.log('✅ Quote status aggiornato:', quoteId, newStatus);
  } catch (error) {
    console.error('❌ Errore update quote status:', error);
    throw error;
  }
}

/**
 * Send quote to client (marca come inviato)
 */
export async function sendQuoteToClient(
  quoteId: string,
  clientEmail: string
): Promise<string> {
  try {
    const quote = await getQuote(quoteId);
    if (!quote) throw new Error('Preventivo non trovato');
    
    await updateDoc(doc(db, QUOTES_COLLECTION, quoteId), {
      status: 'inviato',
      sentAt: Timestamp.now(),
      sentTo: clientEmail,
      updatedAt: Timestamp.now()
    });
    
    // Timeline event
    await addTimelineEvent({
      jobId: quote.jobId,
      tipo: 'preventivo_inviato',
      descrizione: `Preventivo inviato a ${clientEmail}`,
      metadata: { quoteId }
    });
    
    // Aggiorna job status se ancora lead
    const jobDoc = await getDoc(doc(db, 'jobs', quote.jobId));
    if (jobDoc.exists() && jobDoc.data().status === 'lead') {
      await updateJobStatus(quote.jobId, 'preventivo_inviato', quote.createdBy);
    }
    
    // Costruisci URL pubblico
    const baseUrl = window.location.origin;
    const publicUrl = `${baseUrl}/preventivo/${quoteId}?token=${quote.publicToken}`;
    
    console.log('✅ Preventivo inviato:', publicUrl);
    return publicUrl;
  } catch (error) {
    console.error('❌ Errore invio preventivo:', error);
    throw error;
  }
}

/**
 * Accept quote (firma cliente)
 */
export async function acceptQuote(data: AcceptQuoteData): Promise<void> {
  try {
    const quote = await getQuote(data.quoteId);
    if (!quote) throw new Error('Preventivo non trovato');
    
    // Verifica clausole obbligatorie
    const requiredClauses = quote.contractClauses.filter(c => c.required);
    const allAccepted = requiredClauses.every(c => 
      data.clausesAccepted.includes(c.id)
    );
    if (!allAccepted) {
      throw new Error('Tutte le clausole obbligatorie devono essere accettate');
    }
    
    // Upload firma su Storage
    const signatureRef = ref(
      storage,
      `quotes/${data.quoteId}/signature.png`
    );
    await uploadString(signatureRef, data.signature.imageDataUrl, 'data_url');
    const signatureUrl = await getDownloadURL(signatureRef);
    
    // Get IP address (browser API limitato, usa placeholder)
    const ipAddress = await fetch('https://api.ipify.org?format=json')
      .then(res => res.json())
      .then(data => data.ip)
      .catch(() => 'unknown');
    
    // Aggiorna clausole accettate
    const updatedClauses = quote.contractClauses.map(clause => ({
      ...clause,
      accepted: data.clausesAccepted.includes(clause.id),
      acceptedAt: data.clausesAccepted.includes(clause.id) ? Timestamp.now() : undefined
    }));
    
    // Calcola totale selezionato (per preventivo variabile)
    let totaleSelezionato = quote.totaleBase || 0;
    if (quote.type === 'variabile' && data.selectedProducts) {
      totaleSelezionato = quote.products
        .filter(p => data.selectedProducts?.includes(p.nome))
        .reduce((sum, p) => sum + p.prezzo, 0);
    }
    
    // Update quote
    await updateDoc(doc(db, QUOTES_COLLECTION, data.quoteId), {
      status: 'firmato',
      signature: {
        imageUrl: signatureUrl,
        signedAt: Timestamp.now(),
        ipAddress,
        userAgent: navigator.userAgent,
        clientName: data.signature.clientName
      },
      contractClauses: updatedClauses,
      totaleSelezionato,
      updatedAt: Timestamp.now()
    });
    
    // Update job status
    await updateJobStatus(quote.jobId, 'confermato', quote.createdBy);
    
    // Update job financials
    await updateDoc(doc(db, 'jobs', quote.jobId), {
      'financials.totalePreventivato': totaleSelezionato,
      updatedAt: Timestamp.now()
    });
    
    // Timeline event
    await addTimelineEvent({
      jobId: quote.jobId,
      tipo: 'preventivo_firmato',
      descrizione: `Preventivo firmato da ${data.signature.clientName}`,
      metadata: { quoteId: data.quoteId, totale: totaleSelezionato }
    });
    
    // Auto-genera piano pagamenti se configurato
    if (quote.paymentScheduleConfig?.autoGenerate && totaleSelezionato > 0) {
      try {
        // Fetch job per eventDate
        const jobDoc = await getDoc(doc(db, 'jobs', quote.jobId));
        const jobData = jobDoc.exists() ? jobDoc.data() : null;
        const eventDate = jobData?.eventDate ? 
          (jobData.eventDate instanceof Date ? jobData.eventDate : jobData.eventDate.toDate?.() || null)
          : null;

        await autoGeneratePaymentSchedule(
          data.quoteId,
          quote.jobId,
          quote.clienteId,
          totaleSelezionato,
          quote.paymentScheduleConfig,
          eventDate || undefined
        );
        console.log('✅ Piano pagamenti auto-generato');
      } catch (error) {
        console.error('⚠️ Errore auto-generazione piano pagamenti:', error);
        // Non bloccare la firma se la generazione fallisce
      }
    }
    
    console.log('✅ Preventivo accettato e firmato');
  } catch (error) {
    console.error('❌ Errore accettazione preventivo:', error);
    throw error;
  }
}

/**
 * Auto-genera piano pagamenti alla firma preventivo
 * Usa utility condivisa per calcolo rate avanzato
 */
async function autoGeneratePaymentSchedule(
  quoteId: string,
  jobId: string,
  clienteId: string,
  totale: number,
  config: PaymentScheduleConfig,
  eventDate?: Date
): Promise<void> {
  // Import dinamico per evitare circular dependency
  const { calculatePaymentSchedule } = await import('@shared/payment-schedule-utils');
  
  // Calcola piano pagamenti usando utility condivisa
  const schedule = calculatePaymentSchedule(totale, config, eventDate);
  
  // Converti in formato API
  const payments = schedule.payments.map(p => ({
    importo: p.importo,
    dataScadenza: p.dataScadenza.toISOString(),
    descrizione: p.descrizione
  }));
  
  // Chiama API generazione
  const response = await fetch('/api/payment-schedules/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteId,
      jobId,
      clienteId,
      payments,
      totale
    })
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Errore generazione payment schedule');
  }
  
  console.log(`✅ Piano pagamenti generato: ${payments.length} rate per €${totale.toFixed(2)}`);
}

/**
 * QUOTE TEMPLATES
 */

export async function createQuoteTemplate(
  data: InsertQuoteTemplate,
  userId: string
): Promise<string> {
  try {
    const templateData: Omit<QuoteTemplate, 'id'> = {
      ...data,
      attivo: data.attivo !== undefined ? data.attivo : true,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId
    };

    const docRef = await addDoc(collection(db, TEMPLATES_COLLECTION), templateData);
    console.log('✅ Template preventivo creato:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('❌ Errore creazione template:', error);
    throw error;
  }
}

export async function getAllQuoteTemplates(): Promise<QuoteTemplate[]> {
  try {
    const q = query(
      collection(db, TEMPLATES_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as QuoteTemplate[];
  } catch (error) {
    console.error('❌ Errore get templates:', error);
    throw error;
  }
}

export async function getQuoteTemplate(templateId: string): Promise<QuoteTemplate | null> {
  try {
    const templateDoc = await getDoc(doc(db, TEMPLATES_COLLECTION, templateId));
    if (!templateDoc.exists()) return null;
    
    return {
      id: templateDoc.id,
      ...templateDoc.data()
    } as QuoteTemplate;
  } catch (error) {
    console.error('❌ Errore get template:', error);
    throw error;
  }
}

/**
 * Helper functions
 */

async function getTemplateName(templateId: string): Promise<string | undefined> {
  const template = await getQuoteTemplate(templateId);
  return template?.nome;
}

function getDefaultTheme() {
  return {
    primaryColor: '#8B9A8B',
    secondaryColor: '#C8B8A8',
    footerText: 'Image Studio - Fotografia professionale'
  };
}
