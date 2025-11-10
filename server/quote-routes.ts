/**
 * Quote API Routes - Portale cliente preventivi firmati
 */

import { Router, Request, Response } from 'express';
import { db, FieldValue } from './firebase-admin.js';
import type { Quote } from '../shared/quotes-types.js';
import type { PaymentSchedule } from '../shared/payment-schedule-types.js';

const router = Router();

/**
 * Helper: Converte Firestore Timestamp in ISO string per serializzazione JSON
 */
function serializeTimestamp(timestamp: any): string | null {
  if (!timestamp) return null;
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000).toISOString();
  }
  return timestamp;
}

/**
 * GET /api/quotes/public/:token
 * Portale pubblico per preview e firma preventivo (NON richiede status='firmato')
 */
router.get('/public/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: 'Token mancante',
        message: 'Il token di accesso è richiesto'
      });
    }

    // 1. Cerca quote tramite publicToken
    const quotesSnapshot = await db.collection('quotes')
      .where('publicToken', '==', token)
      .limit(1)
      .get();

    if (quotesSnapshot.empty) {
      return res.status(404).json({
        error: 'Preventivo non trovato',
        message: 'Il link non è valido o è scaduto'
      });
    }

    const quoteDoc = quotesSnapshot.docs[0];
    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // 2. Verifica scadenza (se presente)
    if (quote.expiresAt) {
      const now = new Date();
      const expiryDate = quote.expiresAt.toDate();
      if (expiryDate < now) {
        return res.status(410).json({
          error: 'Link scaduto',
          message: 'Questo preventivo è scaduto'
        });
      }
    }

    // 3. Update viewedAt se prima visualizzazione (solo per status 'inviato')
    if (quote.status === 'inviato' && !quote.viewedAt) {
      try {
        await db.collection('quotes').doc(quote.id).update({
          status: 'visionato',
          viewedAt: new Date()
        });
        quote.status = 'visionato';
      } catch (error) {
        console.error('⚠️ Errore update viewedAt:', error);
        // Non bloccare se fallisce
      }
    }

    // 4. Fetch job info - priorità dati salvati in quote, fallback a Firestore
    let jobInfo: { 
      nomeEvento?: string; 
      eventDate?: string | null;
      rito?: string;
      location?: string;
      rituTime?: string;
      startTime?: string;
      endTime?: string;
      allDay?: boolean;
    } | null = null;

    if (quote.jobInfo) {
      // Usa dati salvati in quote (più completi: include rito e location)
      jobInfo = {
        nomeEvento: quote.jobInfo.nomeEvento,
        eventDate: serializeTimestamp(quote.jobInfo.eventDate),
        rito: quote.jobInfo.rito,
        location: quote.jobInfo.location
      };
    } else if (quote.jobId) {
      // Fallback: fetch da Firestore se quote non ha jobInfo (backward compatibility)
      const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        jobInfo = {
          nomeEvento: jobData?.nomeEvento,
          eventDate: serializeTimestamp(jobData?.eventDate),
          rito: jobData?.rituLocation || '',
          location: jobData?.eventLocation || '',
          rituTime: jobData?.rituTime,
          startTime: jobData?.startTime,
          endTime: jobData?.endTime,
          allDay: jobData?.allDay
        };
      }
    }

    // 5. Fetch clienti info - priorità dati salvati in quote, fallback a Firestore
    let clientiInfo: Array<{ 
      id: string;
      nome?: string; 
      cognome?: string;
      email?: string;
      telefono?: string;
      indirizzo?: string;
      citta?: string;
      cap?: string;
    }> = [];

    if (quote.clientiInfo && quote.clientiInfo.length > 0) {
      // Usa dati salvati in quote (nomi campi allineati con frontend)
      clientiInfo = quote.clientiInfo.map(c => ({
        id: c.id,
        nome: c.nome,
        cognome: c.cognome,
        email: c.email,
        telefono: c.telefono,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap
      }));
    } else {
      // Fallback: fetch da Firestore se quote non ha clientiInfo (backward compatibility)
      // Prima recupera clientiIds dal job
      let clientIds: string[] = [];
      if (quote.jobId) {
        const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
        if (jobDoc.exists) {
          clientIds = jobDoc.data()?.clientiIds || [];
        }
      }
      
      // Fallback a quote.clienteId se job non ha clientiIds
      if (clientIds.length === 0 && quote.clienteId) {
        clientIds = [quote.clienteId];
      }

      if (clientIds.length > 0) {
        const clientiDocs = await Promise.all(
          clientIds.map((id: string) => db.collection('clienti').doc(id).get())
        );

        clientiInfo = clientiDocs
          .filter(doc => doc.exists)
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              nome: data?.nome,
              cognome: data?.cognome,
              email: data?.email,
              telefono: data?.cellulare1 || data?.cellulare2 || '',
              indirizzo: data?.via || '',
              citta: data?.citta || '',
              cap: data?.cap || ''
            };
          });
      }
    }

    // 6. Prepara dati sicuri (redact internal fields + serialize timestamps)
    const safeQuote = {
      id: quote.id,
      type: quote.type,
      theme: quote.theme,
      products: quote.products || [],
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      totalBeforeDiscount: quote.totalBeforeDiscount,
      totalAfterDiscount: quote.totalAfterDiscount,
      totaleBase: quote.totaleBase,
      totaleSelezionato: quote.totaleSelezionato,
      contractClauses: (quote.contractClauses ?? []).map(c => ({
        id: c.id,
        text: c.text,
        required: c.required
        // NON include 'accepted' e 'acceptedAt' per preview
      })),
      status: quote.status,
      expiresAt: serializeTimestamp(quote.expiresAt),
      templateName: quote.templateName
    };

    // 7. Return dati per preview cliente
    return res.status(200).json({
      success: true,
      data: {
        quote: safeQuote,
        jobInfo,
        clientiInfo
      }
    });

  } catch (error) {
    console.error('❌ Errore fetch quote pubblico:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * GET /api/quotes/signed/:token
 * Portale pubblico preventivo firmato con piano pagamenti
 */
router.get('/signed/:token', async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: 'Token mancante',
        message: 'Il token di accesso è richiesto'
      });
    }

    // 1. Cerca quote tramite publicToken
    const quotesSnapshot = await db.collection('quotes')
      .where('publicToken', '==', token)
      .limit(1)
      .get();

    if (quotesSnapshot.empty) {
      return res.status(404).json({
        error: 'Preventivo non trovato',
        message: 'Il link non è valido o è scaduto'
      });
    }

    const quoteDoc = quotesSnapshot.docs[0];
    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // 2. Verifica che sia firmato
    if (quote.status !== 'firmato') {
      return res.status(403).json({
        error: 'Accesso negato',
        message: 'Questo preventivo non è ancora stato firmato'
      });
    }

    // 3. Verifica scadenza (se presente)
    if (quote.expiresAt) {
      const now = new Date();
      const expiryDate = quote.expiresAt.toDate();
      if (expiryDate < now) {
        return res.status(410).json({
          error: 'Link scaduto',
          message: 'Questo preventivo è scaduto'
        });
      }
    }

    // 4. Fetch payment schedule associato
    let safePaymentSchedule: any = null;

    const scheduleSnapshot = await db.collection('paymentSchedules')
      .where('quoteId', '==', quote.id)
      .limit(1)
      .get();

    if (!scheduleSnapshot.empty) {
      const scheduleDoc = scheduleSnapshot.docs[0];
      const fullSchedule = { id: scheduleDoc.id, ...scheduleDoc.data() } as PaymentSchedule;

      // Redact private fields for client viewing + serialize timestamps
      safePaymentSchedule = {
        id: fullSchedule.id,
        totale: fullSchedule.totale,
        totalePagato: fullSchedule.totalePagato,
        saldoResiduo: fullSchedule.saldoResiduo,
        payments: (fullSchedule.payments || []).map(p => ({
          id: p.id,
          tipo: p.tipo,
          importo: p.importo,
          dataScadenza: serializeTimestamp(p.dataScadenza),
          stato: p.stato,
          dataPagamento: serializeTimestamp(p.dataPagamento),
          note: p.note || ''
        }))
      };
    }

    // 5. Fetch job info - priorità dati salvati in quote, fallback a Firestore
    let jobInfo: { 
      nomeEvento?: string; 
      eventDate?: string | null;
      rito?: string;
      location?: string;
    } | null = null;

    if (quote.jobInfo) {
      // Usa dati salvati in quote (più completi: include rito e location)
      jobInfo = {
        nomeEvento: quote.jobInfo.nomeEvento,
        eventDate: serializeTimestamp(quote.jobInfo.eventDate),
        rito: quote.jobInfo.rito,
        location: quote.jobInfo.location
      };
    } else if (quote.jobId) {
      // Fallback: fetch da Firestore se quote non ha jobInfo (backward compatibility)
      const jobDoc = await db.collection('jobs').doc(quote.jobId).get();
      if (jobDoc.exists) {
        const jobData = jobDoc.data();
        jobInfo = {
          nomeEvento: jobData?.nomeEvento,
          eventDate: serializeTimestamp(jobData?.eventDate),
          rito: jobData?.rituLocation || '',
          location: jobData?.eventLocation || ''
        };
      }
    }

    // 6. Fetch clienti info - priorità dati salvati in quote, fallback a Firestore
    let clientiInfo: Array<{ 
      id: string;
      nome?: string; 
      cognome?: string;
      email?: string;
      telefono?: string;
      indirizzo?: string;
      citta?: string;
      cap?: string;
    }> = [];

    if (quote.clientiInfo && quote.clientiInfo.length > 0) {
      // Usa dati salvati in quote (nomi campi allineati con frontend)
      clientiInfo = quote.clientiInfo.map(c => ({
        id: c.id,
        nome: c.nome,
        cognome: c.cognome,
        email: c.email,
        telefono: c.telefono,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap
      }));
    } else {
      // Fallback: fetch da Firestore se quote non ha clientiInfo (backward compatibility)
      const clientIds = quote.jobId ? (await db.collection('jobs').doc(quote.jobId).get()).data()?.clientiIds : [];

      if (clientIds && clientIds.length > 0) {
        const clientiDocs = await Promise.all(
          clientIds.map((id: string) => db.collection('clienti').doc(id).get())
        );

        clientiInfo = clientiDocs
          .filter(doc => doc.exists)
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              nome: data?.nome,
              cognome: data?.cognome,
              email: data?.email,
              telefono: data?.cellulare1 || data?.cellulare2 || '',
              indirizzo: data?.via || '',
              citta: data?.citta || '',
              cap: data?.cap || ''
            };
          });
      } else if (quote.clienteId) {
        // Fallback se job non ha clientiIds
        const clienteDoc = await db.collection('clienti').doc(quote.clienteId).get();
        if (clienteDoc.exists) {
          const clienteData = clienteDoc.data();
          clientiInfo.push({
            id: clienteDoc.id,
            nome: clienteData?.nome,
            cognome: clienteData?.cognome,
            email: clienteData?.email,
            telefono: clienteData?.cellulare1 || clienteData?.cellulare2 || '',
            indirizzo: clienteData?.via || '',
            citta: clienteData?.citta || '',
            cap: clienteData?.cap || ''
          });
        }
      }
    }

    // 7. Prepara dati sicuri (redact internal fields + serialize timestamps)
    const safeQuote = {
      id: quote.id,
      type: quote.type,
      theme: quote.theme,
      products: quote.products,
      discountType: quote.discountType,
      discountValue: quote.discountValue,
      totalBeforeDiscount: quote.totalBeforeDiscount,
      totalAfterDiscount: quote.totalAfterDiscount,
      totaleSelezionato: quote.totaleSelezionato,
      contractClauses: quote.contractClauses,
      signature: quote.signature ? {
        clientName: quote.signature.clientName,
        signedAt: serializeTimestamp(quote.signature.signedAt),
        imageUrl: quote.signature.imageUrl
      } : null,
      status: quote.status,
      signedAt: serializeTimestamp(quote.signature?.signedAt)
    };

    // 8. Return dati completi
    return res.json({
      success: true,
      data: {
        quote: safeQuote,
        paymentSchedule: safePaymentSchedule,
        jobInfo: jobInfo || null,
        clientiInfo: clientiInfo || []
      }
    });

  } catch (error) {
    console.error('❌ Errore fetch quote firmato:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * DELETE /api/quotes/:id
 * Delete quote con cascade cleanup (admin-only)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminEmail = req.headers['x-admin-email'] as string;

    // 1. Admin-only check
    if (!adminEmail || adminEmail !== 'gennaro.mazzacane@gmail.com') {
      return res.status(403).json({
        error: 'Accesso negato',
        message: 'Solo gli amministratori possono eliminare preventivi'
      });
    }

    // 2. Pre-fetch legacy schedules for quotes without paymentScheduleIds
    //    NOTE: Query MUST be OUTSIDE transaction (Firestore limitation)
    const legacyQuery = db.collection('paymentSchedules').where('quoteId', '==', id);
    const legacySnapshot = await legacyQuery.get();
    const legacyScheduleRefs = legacySnapshot.docs.map(doc => doc.ref);

    // 3. Firestore transaction per atomicità (usando paymentScheduleIds se disponibili)
    await db.runTransaction(async (transaction) => {
      const quoteRef = db.collection('quotes').doc(id);
      const quoteDoc = await transaction.get(quoteRef);

      if (!quoteDoc.exists) {
        throw new Error('Preventivo non trovato');
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

      // 4. Get payment schedule IDs from quote (atomic lookup) OR fallback to legacy
      const scheduleIds = quote.paymentScheduleIds || [];

      if (scheduleIds.length === 0 && legacyScheduleRefs.length > 0) {
        console.warn(`⚠️ Quote ${id} senza paymentScheduleIds, usando ${legacyScheduleRefs.length} schedules da fallback query`);
      }

      // 5. Re-read payment schedules INSIDE transaction for atomicity
      const scheduleRefs = scheduleIds.length > 0 
        ? scheduleIds.map(scheduleId => db.collection('paymentSchedules').doc(scheduleId))
        : legacyScheduleRefs;

      const scheduleSnapshots = await Promise.all(
        scheduleRefs.map(ref => transaction.get(ref))
      );

      // 6. Read job BEFORE any writes (Firestore transaction requirement)
      let jobDoc: any = null;
      if (quote.jobId) {
        const jobRef = db.collection('jobs').doc(quote.jobId);
        jobDoc = await transaction.get(jobRef);
      }

      // 7. Validation: blocca delete se firmato con pagamenti registrati
      if (quote.status === 'firmato') {
        // Check if any schedule has payments
        const hasPagamenti = scheduleSnapshots.some(snap => {
          if (!snap.exists) return false;
          const schedule = snap.data() as PaymentSchedule;
          return (schedule.totalePagato ?? 0) > 0 || 
            schedule.payments?.some(p => p.stato === 'pagato' || p.stato === 'parziale');
        });

        if (hasPagamenti) {
          throw new Error('Impossibile eliminare un preventivo firmato con pagamenti già registrati');
        }
      }

      // 8. Delete quote (WRITE operation starts here)
      transaction.delete(quoteRef);

      // 9. Update job: remove preventivoId AND update financials
      if (quote.jobId && jobDoc && jobDoc.exists) {
        const jobRef = db.collection('jobs').doc(quote.jobId);
        const jobData = jobDoc.data();

        // Calcola nuovo totale preventivato sottraendo il quote eliminato
        const currentTotale = jobData.financials?.totalePreventivato || 0;
        const quoteTotale = quote.totaleBase || 0;
        const newTotale = Math.max(0, currentTotale - quoteTotale);

        transaction.update(jobRef, {
          preventivoId: FieldValue.delete(),
          'financials.totalePreventivato': newTotale
        });
      }

      // 10. Delete related payment schedules
      for (const snap of scheduleSnapshots) {
        if (snap.exists) {
          transaction.delete(snap.ref);
        }
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Preventivo eliminato con successo'
    });

  } catch (error) {
    console.error('❌ Errore delete quote:', error);
    return res.status(500).json({
      error: 'Errore server',
      message: error instanceof Error ? error.message : 'Errore sconosciuto'
    });
  }
});

/**
 * GET /api/quotes/health
 * Health check per quote API
 */
router.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'quote-api',
    timestamp: new Date().toISOString() 
  });
});

export default router;