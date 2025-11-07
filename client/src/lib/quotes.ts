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
  QuoteStatus
} from '@shared/quotes-types';
import { nanoid } from 'nanoid';
import { addTimelineEvent, updateJobStatus } from './jobs';

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
    // Calcola totale base
    const totaleBase = data.products.reduce((sum, p) => sum + p.prezzo, 0);
    
    // Prepara clausole con ID
    const clausesWithIds = data.contractClauses.map(c => ({
      ...c,
      id: nanoid()
    }));
    
    const quoteData: Omit<Quote, 'id'> = {
      jobId: data.jobId,
      clienteId: data.clienteId,
      type: data.type,
      templateId: data.templateId,
      templateName: data.templateId ? await getTemplateName(data.templateId) : undefined,
      theme: data.theme || getDefaultTheme(),
      products: data.products,
      totaleBase,
      totaleSelezionato: data.type === 'variabile' ? 0 : totaleBase,
      contractClauses: clausesWithIds,
      status: 'bozza',
      publicToken: generatePublicToken(),
      expiresAt: data.expiresAt ? Timestamp.fromDate(data.expiresAt) : undefined,
      noteInterne: data.noteInterne,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      createdBy: userId
    };

    const docRef = await addDoc(collection(db, QUOTES_COLLECTION), quoteData);
    
    // Aggiorna job con quoteId
    const jobDoc = await getDoc(doc(db, 'jobs', data.jobId));
    if (jobDoc.exists()) {
      const currentQuoteIds = jobDoc.data().quoteIds || [];
      await updateDoc(doc(db, 'jobs', data.jobId), {
        quoteIds: [...currentQuoteIds, docRef.id],
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
    let totaleSelezionato = quote.totaleBase;
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
    
    console.log('✅ Preventivo accettato e firmato');
  } catch (error) {
    console.error('❌ Errore accettazione preventivo:', error);
    throw error;
  }
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
