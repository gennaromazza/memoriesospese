/**
 * Quote API Routes - Portale cliente preventivi firmati
 */

import { Router, Request, Response } from "express";
import { db, FieldValue } from "./firebase-admin.js";
import { getAuth } from "firebase-admin/auth";
import type { Quote, RevokedToken } from "../shared/quotes-types.js";
import type { PaymentSchedule } from "../shared/payment-schedule-types.js";
import {
  sendGmailEmail,
  getStudioContactInfo,
  createQuoteSignedEmailHTML,
  createPaymentReminderEmailHTML,
  createQuoteSentEmailHTML,
  createAdminQuoteSignedNotificationHTML,
} from "./email-routes.js";
import { nanoid } from "nanoid";
import { nowRomeDate, toRomeDateTime, daysFromNowRome, formatRomeDateLocale } from "./utils/timezone.js";
import { normalizeEmail } from "./utils/normalize.js";

const router = Router();

/**
 * Helper: Calcola il totale corretto per una quote considerando sconti
 * Gestisce sia quote nuove (con totalAfterDiscount) che legacy (senza)
 * 
 * Logica prioritizzata:
 * 1. totalAfterDiscount → valore corretto per quote nuove
 * 2. totaleSelezionato → valore scelto dal cliente (quote variabili firmate)
 * 3. Ricalcolo da sconto se ci sono metadati → per quote legacy con sconto
 * 4. totaleBase → fallback per quote senza sconto
 * 
 * Questa funzione è progettata per quote GIÀ FIRMATE o in stato da visualizzare.
 * Per quote fisse, lo sconto è già applicato in totalAfterDiscount/totaleSelezionato.
 */
function calculateCorrectQuoteTotal(quote: Quote): number {
  // REGOLA CRITICA: per preventivi variabili, totaleSelezionato (scelta del cliente)
  // ha SEMPRE priorità su totalAfterDiscount (che include TUTTI i prodotti, anche non selezionati).
  // Per preventivi fissi/a consumo, totalAfterDiscount è il valore corretto post-sconto.
  
  const isVariabile = quote.type === 'variabile';
  
  // 1. Quote variabili: totaleSelezionato ha la priorità assoluta
  if (isVariabile && quote.totaleSelezionato !== undefined && quote.totaleSelezionato !== null && quote.totaleSelezionato > 0) {
    return quote.totaleSelezionato;
  }
  
  // 2. totalAfterDiscount: valore corretto per quote fisso/a consumo (sconto già applicato)
  //    Per variabili lo usiamo solo come fallback se totaleSelezionato non è presente
  if (quote.totalAfterDiscount !== undefined && quote.totalAfterDiscount !== null && quote.totalAfterDiscount > 0) {
    return quote.totalAfterDiscount;
  }
  
  // 3. totaleSelezionato come fallback finale (quote variabili senza totalAfterDiscount)
  if (quote.totaleSelezionato !== undefined && quote.totaleSelezionato !== null && quote.totaleSelezionato > 0) {
    return quote.totaleSelezionato;
  }
  
  // 4. Ricalcola da totaleBase/totalBeforeDiscount se ci sono metadati sconto (quote legacy)
  const baseTotal = quote.totalBeforeDiscount ?? quote.totaleBase;
  if (quote.discountValue && quote.discountValue > 0 && baseTotal && baseTotal > 0) {
    if (quote.discountType === 'percent') {
      return Math.round(baseTotal * (1 - quote.discountValue / 100) * 100) / 100;
    } else if (quote.discountType === 'amount') {
      return Math.max(0, baseTotal - quote.discountValue);
    }
    return Math.max(0, baseTotal - quote.discountValue);
  }
  
  // 5. Fallback a totaleBase (per quote senza sconto)
  return quote.totaleBase ?? quote.totalBeforeDiscount ?? 0;
}

/**
 * Middleware: Verifica autenticazione Firebase e permessi admin
 * Protegge endpoint admin da accesso non autorizzato
 * SICUREZZA: Verifica solo il token Firebase, NON il header x-admin-email (spoofable)
 */
async function verifyAdminAuth(req: Request, res: Response, next: Function) {
  try {
    const authHeader = req.headers.authorization;

    // 1. Verifica presenza token
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Non autorizzato",
        message: "Token di autenticazione mancante",
      });
    }

    // 2. Verifica Firebase ID token
    const idToken = authHeader.split("Bearer ")[1];
    let decodedToken;

    try {
      decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (error) {
      console.error("❌ Token Firebase non valido:", error);
      return res.status(403).json({
        error: "Accesso negato",
        message: "Token di autenticazione non valido o scaduto",
      });
    }

    // 3. Verifica che il token appartenga all'admin
    // SICUREZZA: Usa SOLO decodedToken.email (verificato da Firebase)
    // NON fidarsi di req.headers['x-admin-email'] (può essere spoofato)
    const ADMIN_EMAIL = "gennaro.mazzacane@gmail.com";
    const verifiedEmail = decodedToken.email;

    if (verifiedEmail !== ADMIN_EMAIL) {
      console.warn(
        `⚠️ Tentativo accesso admin non autorizzato: ${verifiedEmail}`,
      );
      return res.status(403).json({
        error: "Accesso negato",
        message: "Solo gli admin possono accedere a questa risorsa",
      });
    }

    // 4. Inietta identità verificata in req per downstream handlers
    (req as any).verifiedAdmin = {
      email: verifiedEmail,
      uid: decodedToken.uid,
    };

    // Token valido e utente admin: procedi
    next();
  } catch (error) {
    console.error("❌ Errore verifica autenticazione:", error);
    return res.status(500).json({
      error: "Errore server",
      message: "Errore durante la verifica dell'autenticazione",
    });
  }
}

/**
 * Helper: Converte Firestore Timestamp in ISO string per serializzazione JSON
 * Gestisce: Firestore Timestamp, Date JavaScript nativo, stringhe ISO, oggetti con _seconds
 */
function serializeTimestamp(timestamp: any): string | null {
  if (!timestamp) return null;
  // Firebase Timestamp con metodo toDate()
  if (timestamp.toDate) {
    return timestamp.toDate().toISOString();
  }
  // Oggetto con _seconds (Firestore Timestamp serializzato)
  if (timestamp._seconds !== undefined) {
    return new Date(timestamp._seconds * 1000).toISOString();
  }
  // Date JavaScript nativo
  if (timestamp instanceof Date) {
    return timestamp.toISOString();
  }
  // Stringa già formattata (ISO, etc.)
  if (typeof timestamp === 'string') {
    return timestamp;
  }
  // Fallback: tenta conversione
  try {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) {
      return d.toISOString();
    }
  } catch {
    // Ignora errori di conversione
  }
  return null;
}

/**
 * Registra evento audit log preventivo
 */
async function logAuditEvent(data: {
  quoteId: string;
  adminEmail: string;
  action:
    | "status_change"
    | "signature_override"
    | "token_regenerated"
    | "quote_created"
    | "quote_deleted";
  previousValue?: any;
  newValue?: any;
  reason?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await db.collection("quoteAuditLog").add({
      quoteId: data.quoteId,
      adminEmail: data.adminEmail,
      action: data.action,
      previousValue: data.previousValue || null,
      newValue: data.newValue || null,
      reason: data.reason || "",
      metadata: data.metadata || {},
      timestamp: nowRomeDate(),
    });
  } catch (error) {
    console.error("❌ Errore logging audit event:", error);
    // Non blocca l'operazione se logging fallisce
  }
}

/**
 * Valida cambio stato preventivo con controlli finanziari
 */
async function validateQuoteStatusChange(
  quote: Quote,
  newStatus: string,
): Promise<{ allowed: boolean; error?: string; warnings?: string[] }> {
  const warnings: string[] = [];

  try {
    // Fetch payment schedule collegato
    const scheduleSnapshot = await db
      .collection("paymentSchedules")
      .where("quoteId", "==", quote.id)
      .limit(1)
      .get();

    let schedule: PaymentSchedule | null = null;
    if (!scheduleSnapshot.empty) {
      const scheduleDoc = scheduleSnapshot.docs[0];
      schedule = {
        id: scheduleDoc.id,
        ...scheduleDoc.data(),
      } as PaymentSchedule;
    }

    // BLOCCO HARD: Preventivo firmato con pagamenti ricevuti
    // Non è possibile riportare il preventivo a stati pre-firma se ci sono incassi registrati
    if (
      quote.status === "firmato" &&
      schedule?.totalePagato &&
      schedule.totalePagato > 0
    ) {
      const statiPreFirma = [
        "bozza",
        "inviato",
        "visionato",
        "rifiutato",
        "annullato",
        "scaduto",
      ];
      if (statiPreFirma.includes(newStatus)) {
        return {
          allowed: false,
          error: `Impossibile riportare il preventivo a stato "${newStatus}": sono già stati incassati ${schedule.totalePagato}€. Il preventivo deve rimanere "firmato".`,
        };
      }
    }

    // WARNING: Pagamenti schedulati (ma non ancora ricevuti)
    if (schedule?.payments && schedule.payments.length > 0) {
      const paymentsScheduled = schedule.payments.filter(
        (p: any) => p.stato !== "pagato",
      ).length;
      if (paymentsScheduled > 0) {
        warnings.push(
          `⚠️ Ci sono ${paymentsScheduled} pagamenti schedulati nel piano. Verificare l'impatto del cambio stato.`,
        );
      }
    }

    // BLOCCO: Firma mancante per stato "firmato"
    if (newStatus === "firmato" && !quote.signature) {
      return {
        allowed: false,
        error:
          'Inserisci prima la firma del cliente per impostare lo stato "firmato"',
      };
    }

    return { allowed: true, warnings };
  } catch (error) {
    console.error("❌ Errore validazione cambio stato:", error);
    return {
      allowed: false,
      error: "Errore durante la validazione. Riprova.",
    };
  }
}

/**
 * GET /api/quotes/public/:token
 * Portale pubblico per preview e firma preventivo (NON richiede status='firmato')
 */
router.get("/public/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: "Token mancante",
        message: "Il token di accesso è richiesto",
      });
    }

    // 1. Cerca quote tramite publicToken ATTIVO (non revocato)
    const quotesSnapshot = await db
      .collection("quotes")
      .where("publicToken", "==", token)
      .limit(1)
      .get();

    if (quotesSnapshot.empty) {
      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il link non è valido, è stato revocato o è scaduto. Richiedi un nuovo link aggiornato.",
      });
    }

    const quoteDoc = quotesSnapshot.docs[0];
    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // 2. Verifica scadenza (se presente)
    if (quote.expiresAt) {
      const now = nowRomeDate();
      const expiryDate = quote.expiresAt.toDate();
      if (expiryDate < now) {
        return res.status(410).json({
          error: "Link scaduto",
          message: "Questo preventivo è scaduto",
        });
      }
    }

    if (quote.status === "inviato" && !quote.viewedAt) {
      try {
        await db.collection("quotes").doc(quote.id).update({
          status: "visionato",
          viewedAt: nowRomeDate(),
        });
        quote.status = "visionato";
      } catch (error) {
        console.error("⚠️ Errore update viewedAt:", error);
        // Non bloccare se fallisce
      }
    }

    // 4. Fetch job info - SEMPRE dal job attuale per avere dati aggiornati
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

    // 4b. Fetch jobType info per immagine copertina
    let jobTypeInfo: {
      id?: string;
      nome?: string;
      imageUrl?: string;
    } | null = null;

    // SEMPRE recupera dati real-time dal job per avere info aggiornate
    if (quote.jobId) {
      try {
        const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          jobInfo = {
            nomeEvento: jobData?.nomeEvento,
            eventDate: serializeTimestamp(jobData?.eventDate),
            rito: jobData?.rituLocation || jobData?.locationCerimonia || jobData?.jobDataValues?.locationCerimonia || undefined,
            location: jobData?.eventLocation || undefined,
            rituTime: jobData?.rituTime || jobData?.oraCerimonia || jobData?.jobDataValues?.oraCerimonia || undefined,
            startTime: jobData?.startTime,
            endTime: jobData?.endTime,
            allDay: jobData?.allDay,
          };

          // Recupera immagine copertina dal jobType
          const jobTypeSlug = jobData?.jobType;
          if (jobTypeSlug) {
            try {
              const jobTypesSnapshot = await db
                .collection("jobTypes")
                .where("slug", "==", jobTypeSlug)
                .limit(1)
                .get();
              
              if (!jobTypesSnapshot.empty) {
                const jobTypeData = jobTypesSnapshot.docs[0].data();
                jobTypeInfo = {
                  id: jobTypesSnapshot.docs[0].id,
                  nome: jobTypeData?.nome,
                  imageUrl: jobTypeData?.imageUrl,
                };
              }
            } catch (jobTypeErr) {
              console.warn("⚠️ Impossibile recuperare jobType:", jobTypeErr);
            }
          }
        } else if (quote.jobInfo) {
          // Job non esiste più (cancellato/archiviato) - usa snapshot
          console.log(`ℹ️ Job ${quote.jobId} non trovato, uso snapshot per quote ${quote.id}`);
          jobInfo = {
            nomeEvento: quote.jobInfo.nomeEvento,
            eventDate: serializeTimestamp(quote.jobInfo.eventDate),
            rito: quote.jobInfo.rito,
            location: quote.jobInfo.location,
          };
        }
      } catch (err) {
        console.warn("⚠️ Impossibile recuperare dati job, uso snapshot:", err);
        // Fallback allo snapshot solo se job non accessibile
        if (quote.jobInfo) {
          jobInfo = {
            nomeEvento: quote.jobInfo.nomeEvento,
            eventDate: serializeTimestamp(quote.jobInfo.eventDate),
            rito: quote.jobInfo.rito,
            location: quote.jobInfo.location,
          };
        }
      }
    } else if (quote.jobInfo) {
      // Fallback: usa snapshot se non c'è jobId (legacy)
      jobInfo = {
        nomeEvento: quote.jobInfo.nomeEvento,
        eventDate: serializeTimestamp(quote.jobInfo.eventDate),
        rito: quote.jobInfo.rito,
        location: quote.jobInfo.location,
      };
    }

    // 5. Fetch clienti info - SEMPRE real-time da Firestore, snapshot solo come ultimo fallback
    let clientiInfo: Array<{
      id: string;
      nome?: string;
      cognome?: string;
      email?: string;
      telefono?: string;
      indirizzo?: string;
      citta?: string;
      cap?: string;
      provincia?: string;
    }> = [];

    try {
      let clientIds: string[] = [];

      // Prima cerca clientiIds dal job
      if (quote.jobId) {
        try {
          const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
          if (jobDoc.exists) {
            clientIds = jobDoc.data()?.clientiIds || [];
          }
        } catch (jobError) {
          console.warn(`⚠️ Job ${quote.jobId} non accessibile per quote ${quote.id}`, jobError);
        }
      }

      // Fallback: clientIds dallo snapshot salvato nel preventivo
      if (clientIds.length === 0 && quote.clientiInfo && quote.clientiInfo.length > 0) {
        clientIds = quote.clientiInfo.map((c: any) => c.id).filter(Boolean);
      }

      // Fallback finale: quote.clienteId
      if (clientIds.length === 0 && quote.clienteId) {
        clientIds = [quote.clienteId];
      }

      if (clientIds.length > 0) {
        const clientiDocs = await Promise.all(
          clientIds.map((id: string) => db.collection("clienti").doc(id).get()),
        );

        clientiInfo = clientiDocs
          .filter((doc) => doc.exists)
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              nome: data?.nome,
              cognome: data?.cognome,
              email: data?.email,
              telefono: data?.cellulare1 || data?.cellulare2 || "",
              indirizzo: data?.via || "",
              citta: data?.citta || "",
              cap: data?.cap || "",
              provincia: data?.provincia || "",
            };
          });
      }
    } catch (firestoreError) {
      console.warn(`⚠️ Errore Firestore fetch clienti per quote ${quote.id}, uso snapshot`, firestoreError);
    }

    // Fallback finale: usa snapshot salvato nel preventivo se Firestore non ha restituito nulla
    if (clientiInfo.length === 0 && quote.clientiInfo && quote.clientiInfo.length > 0) {
      clientiInfo = quote.clientiInfo.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        cognome: c.cognome,
        email: c.email,
        telefono: c.telefono,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap,
        provincia: c.provincia,
      }));
    }

    // 5b. Fetch appuntamenti clienti dal job (per mostrare orari appuntamento)
    let appuntamentiClienti: Array<{
      clienteId: string;
      orarioAppuntamento?: string;
      noteAppuntamento?: string;
    }> = [];
    
    if (quote.jobId) {
      try {
        const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          if (jobData?.appuntamentiClienti && Array.isArray(jobData.appuntamentiClienti)) {
            appuntamentiClienti = jobData.appuntamentiClienti.map((app: any) => ({
              clienteId: app.clienteId,
              orarioAppuntamento: app.orarioAppuntamento,
              noteAppuntamento: app.noteAppuntamento,
            }));
          }
        }
      } catch (err) {
        console.warn("⚠️ Impossibile recuperare appuntamenti clienti:", err);
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
      contractClauses: (quote.contractClauses ?? []).map((c) => ({
        id: c.id,
        text: c.text,
        required: c.required,
        // NON include 'accepted' e 'acceptedAt' per preview
      })),
      status: quote.status,
      expiresAt: serializeTimestamp(quote.expiresAt),
      templateName: quote.templateName,
      // Benefit rules: necessarie per mostrare omaggi sbloccabili nella vista cliente
      benefitRules: quote.benefitRules || [],
    };

    // 7. Return dati per preview cliente
    return res.status(200).json({
      success: true,
      data: {
        quote: safeQuote,
        jobInfo,
        clientiInfo,
        appuntamentiClienti,
        jobTypeInfo,
      },
    });
  } catch (error) {
    console.error("❌ Errore fetch quote pubblico:", error);
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * GET /api/quotes/signed/:token
 * Portale pubblico preventivo firmato con piano pagamenti
 */
router.get("/signed/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        error: "Token mancante",
        message: "Il token di accesso è richiesto",
      });
    }

    // 1. Cerca quote tramite publicToken ATTIVO (non revocato)
    const quotesSnapshot = await db
      .collection("quotes")
      .where("publicToken", "==", token)
      .limit(1)
      .get();

    if (quotesSnapshot.empty) {
      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il link non è valido, è stato revocato o è scaduto. Richiedi un nuovo link aggiornato.",
      });
    }

    const quoteDoc = quotesSnapshot.docs[0];
    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // 2. Verifica che sia firmato
    if (quote.status !== "firmato") {
      return res.status(403).json({
        error: "Accesso negato",
        message: "Questo preventivo non è ancora stato firmato",
      });
    }

    // 3. Verifica scadenza (se presente)
    if (quote.expiresAt) {
      const now = nowRomeDate();
      const expiryDate = quote.expiresAt.toDate();
      if (expiryDate < now) {
        return res.status(410).json({
          error: "Link scaduto",
          message: "Questo preventivo è scaduto",
        });
      }
    }

    // 4. Fetch payment schedule associato
    // Prima cerca per quoteId, poi fallback a jobId (per dati legacy importati)
    let safePaymentSchedule: any = null;

    // Strategia 1: Cerca per quoteId
    let scheduleSnapshot = await db
      .collection("paymentSchedules")
      .where("quoteId", "==", quote.id)
      .limit(1)
      .get();

    // Strategia 2: Fallback - cerca per jobId (dati legacy importati)
    if (scheduleSnapshot.empty && quote.jobId) {
      scheduleSnapshot = await db
        .collection("paymentSchedules")
        .where("jobId", "==", quote.jobId)
        .limit(1)
        .get();
    }

    // Dati legacy ordine (acconto/saldo) - usato come fallback se paymentSchedule non esiste
    let legacyOrderData: {
      totale: number;
      acconto: number;
      saldo: number;
    } | null = null;

    if (!scheduleSnapshot.empty) {
      const scheduleDoc = scheduleSnapshot.docs[0];
      const fullSchedule = {
        id: scheduleDoc.id,
        ...scheduleDoc.data(),
      } as PaymentSchedule;

      // Redact private fields for client viewing + serialize timestamps
      safePaymentSchedule = {
        id: fullSchedule.id,
        totale: fullSchedule.totale,
        totalePagato: fullSchedule.totalePagato,
        saldoResiduo: fullSchedule.saldoResiduo,
        payments: (fullSchedule.payments || []).map((p) => ({
          id: p.id,
          tipo: p.tipo,
          importo: p.importo,
          dataScadenza: serializeTimestamp(p.dataScadenza),
          stato: p.stato,
          dataPagamento: serializeTimestamp(p.dataPagamento),
          note: p.note || "",
        })),
      };
    } else if (quote.jobId) {
      // Fallback: cerca ordine legacy con acconto/saldo se non esiste paymentSchedule
      const ordersSnapshot = await db
        .collection("orders")
        .where("jobId", "==", quote.jobId)
        .limit(1)
        .get();

      if (!ordersSnapshot.empty) {
        const orderData = ordersSnapshot.docs[0].data() as any;
        if (orderData.acconto !== undefined || orderData.saldo !== undefined || orderData.totale !== undefined) {
          // Calcola totale con fallback sicuro
          const resolvedTotal = orderData.totale ?? quote.totalAfterDiscount ?? 0;
          const resolvedAcconto = orderData.acconto ?? 0;
          // Calcola saldo: priorità a saldo esplicito, altrimenti calcola
          const resolvedSaldo = orderData.saldo ?? Math.max(0, resolvedTotal - resolvedAcconto);
          
          legacyOrderData = {
            totale: resolvedTotal,
            acconto: resolvedAcconto,
            saldo: resolvedSaldo,
          };
        }
      }
    }

    // 5. Fetch job info - SEMPRE dal job attuale per avere dati aggiornati
    let jobInfo: {
      nomeEvento?: string;
      eventDate?: string | null;
      rito?: string;
      rituTime?: string;
      location?: string;
    } | null = null;

    // SEMPRE recupera dati real-time dal job per avere info aggiornate
    if (quote.jobId) {
      try {
        const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          jobInfo = {
            nomeEvento: jobData?.nomeEvento,
            eventDate: serializeTimestamp(jobData?.eventDate),
            rito: jobData?.rituLocation || jobData?.locationCerimonia || jobData?.jobDataValues?.locationCerimonia || undefined,
            rituTime: jobData?.rituTime || jobData?.oraCerimonia || jobData?.jobDataValues?.oraCerimonia || undefined,
            location: jobData?.eventLocation || undefined,
          };
        } else if (quote.jobInfo) {
          // Job non esiste più (cancellato/archiviato) - usa snapshot
          console.log(`ℹ️ Job ${quote.jobId} non trovato (signed), uso snapshot per quote ${quote.id}`);
          jobInfo = {
            nomeEvento: quote.jobInfo.nomeEvento,
            eventDate: serializeTimestamp(quote.jobInfo.eventDate),
            rito: quote.jobInfo.rito,
            location: quote.jobInfo.location,
          };
        }
      } catch (err) {
        console.warn("⚠️ Impossibile recuperare dati job (signed), uso snapshot:", err);
        // Fallback allo snapshot solo se job non accessibile
        if (quote.jobInfo) {
          jobInfo = {
            nomeEvento: quote.jobInfo.nomeEvento,
            eventDate: serializeTimestamp(quote.jobInfo.eventDate),
            rito: quote.jobInfo.rito,
            location: quote.jobInfo.location,
          };
        }
      }
    } else if (quote.jobInfo) {
      // Fallback: usa snapshot se non c'è jobId (legacy)
      jobInfo = {
        nomeEvento: quote.jobInfo.nomeEvento,
        eventDate: serializeTimestamp(quote.jobInfo.eventDate),
        rito: quote.jobInfo.rito,
        location: quote.jobInfo.location,
      };
    }

    // 5b. Fetch appuntamenti clienti dal job (per mostrare orari appuntamento)
    let appuntamentiClientiSigned: Array<{
      clienteId: string;
      orarioAppuntamento?: string;
      noteAppuntamento?: string;
    }> = [];
    
    if (quote.jobId) {
      try {
        const jobDocApp = await db.collection("jobs").doc(quote.jobId).get();
        if (jobDocApp.exists) {
          const jobDataApp = jobDocApp.data();
          if (jobDataApp?.appuntamentiClienti && Array.isArray(jobDataApp.appuntamentiClienti)) {
            appuntamentiClientiSigned = jobDataApp.appuntamentiClienti.map((app: any) => ({
              clienteId: app.clienteId,
              orarioAppuntamento: app.orarioAppuntamento,
              noteAppuntamento: app.noteAppuntamento,
            }));
          }
        }
      } catch (err) {
        console.warn("⚠️ Impossibile recuperare appuntamenti clienti (signed):", err);
      }
    }

    // 6. Fetch clienti info - SEMPRE fetch real-time da Firestore per avere dati aggiornati
    let clientiInfo: Array<{
      id: string;
      nome?: string;
      cognome?: string;
      email?: string;
      telefono?: string;
      indirizzo?: string;
      citta?: string;
      cap?: string;
      provincia?: string;
    }> = [];

    // Prova prima a fetchare da Firestore (real-time data) con error handling
    try {
      let clientIds: string[] = [];

      // Fetch job clientiIds con error handling per job archiviati/cancellati
      if (quote.jobId) {
        try {
          const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
          if (jobDoc.exists) {
            clientIds = jobDoc.data()?.clientiIds || [];
          }
        } catch (jobError) {
          // Job non accessibile (permission error, deleted, etc.) - ignora e procedi con fallback
          console.warn(
            `⚠️ Job ${quote.jobId} non accessibile per quote ${quote.id}, uso fallback`,
            jobError,
          );
        }
      }

      if (clientIds.length > 0) {
        // Fetch clienti REAL-TIME da Firestore
        const clientiDocs = await Promise.all(
          clientIds.map((id: string) => db.collection("clienti").doc(id).get()),
        );

        clientiInfo = clientiDocs
          .filter((doc) => doc.exists)
          .map((doc) => {
            const data = doc.data();
            return {
              id: doc.id,
              nome: data?.nome,
              cognome: data?.cognome,
              email: data?.email,
              telefono: data?.cellulare1 || data?.cellulare2 || "",
              indirizzo: data?.via || "",
              citta: data?.citta || "",
              cap: data?.cap || "",
              provincia: data?.provincia || "",
            };
          });
      } else if (quote.clienteId) {
        // Fallback se job non ha clientiIds
        const clienteDoc = await db
          .collection("clienti")
          .doc(quote.clienteId)
          .get();
        if (clienteDoc.exists) {
          const clienteData = clienteDoc.data();
          clientiInfo.push({
            id: clienteDoc.id,
            nome: clienteData?.nome,
            cognome: clienteData?.cognome,
            email: clienteData?.email,
            telefono: clienteData?.cellulare1 || clienteData?.cellulare2 || "",
            indirizzo: clienteData?.via || "",
            citta: clienteData?.citta || "",
            cap: clienteData?.cap || "",
            provincia: clienteData?.provincia || "",
          });
        }
      }
    } catch (firestoreError) {
      // Errore generale Firestore (permission, network, etc.) - usa snapshot
      console.warn(
        `⚠️ Errore Firestore durante fetch clienti per quote ${quote.id}, uso snapshot`,
        firestoreError,
      );
    }

    // Fallback finale: usa snapshot salvato in quote se real-time fetch ha fallito
    if (
      clientiInfo.length === 0 &&
      quote.clientiInfo &&
      quote.clientiInfo.length > 0
    ) {
      clientiInfo = quote.clientiInfo.map((c: any) => ({
        id: c.id,
        nome: c.nome,
        cognome: c.cognome,
        email: c.email,
        telefono: c.telefono,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap,
        provincia: c.provincia || "",
      }));
    }

    // 7. Prepara dati sicuri (redact internal fields + serialize timestamps)
    // Normalizza firma legacy - gestisce formati alternativi (nomeFirmatario, name, etc.)
    let normalizedSignature = null;
    if (quote.signature) {
      // Cast a any per gestire campi legacy non tipizzati
      const sig = quote.signature as any;
      
      // DEBUG: Log firma ricevuta per diagnostica
      console.log(`🔍 DEBUG Firma quote ${quote.id}:`, JSON.stringify(sig, null, 2));
      
      // Prova a estrarre clientName da formati alternativi
      const clientName =
        sig.clientName ||
        sig.nomeFirmatario ||
        sig.name ||
        sig.firmatario ||
        // Fallback: usa primo cliente se disponibile
        (clientiInfo.length > 0
          ? `${clientiInfo[0].nome || ""} ${clientiInfo[0].cognome || ""}`.trim()
          : null);

      console.log(`🔍 DEBUG clientName estratto: "${clientName}"`);

      if (clientName) {
        normalizedSignature = {
          clientName,
          signedAt: serializeTimestamp(sig.signedAt),
          imageUrl: sig.imageUrl || sig.firmaUrl || null,
        };
        console.log(`✅ Firma normalizzata:`, JSON.stringify(normalizedSignature, null, 2));
      } else {
        console.warn(`⚠️ clientName non trovato per quote ${quote.id}, firma non mostrata`);
      }
    } else {
      console.log(`ℹ️ Quote ${quote.id} non ha firma`);
    }

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
      signature: normalizedSignature,
      status: quote.status,
      // FIX: Usa signedAt a livello root (priorità) o fallback a signature.signedAt
      signedAt: serializeTimestamp((quote as any).signedAt) || serializeTimestamp(quote.signature?.signedAt),
    };

    // 8. Return dati completi
    return res.json({
      success: true,
      data: {
        quote: safeQuote,
        paymentSchedule: safePaymentSchedule,
        legacyOrderData: legacyOrderData, // Fallback per ordini legacy senza paymentSchedule
        jobInfo: jobInfo || null,
        clientiInfo: clientiInfo || [],
        appuntamentiClienti: appuntamentiClientiSigned || [],
      },
    });
  } catch (error) {
    console.error("❌ Errore fetch quote firmato:", error);
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * DELETE /api/quotes/:id
 * Delete quote con cascade cleanup (admin-only)
 * Query params: forceDelete=true per override protezione preventivi firmati
 */
router.delete("/:id", verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminEmail = (req as any).verifiedAdmin?.email || req.headers["x-admin-email"] as string;
    const forceDelete = req.query.forceDelete === "true";

    // 2. Pre-fetch legacy schedules for quotes without paymentScheduleIds
    //    NOTE: Query MUST be OUTSIDE transaction (Firestore limitation)
    const legacyQuery = db
      .collection("paymentSchedules")
      .where("quoteId", "==", id);
    const legacySnapshot = await legacyQuery.get();
    const legacyScheduleRefs = legacySnapshot.docs.map((doc) => doc.ref);

    // 3. Firestore transaction per atomicità (usando paymentScheduleIds se disponibili)
    let deletedQuoteJobId: string | null = null;
    await db.runTransaction(async (transaction) => {
      const quoteRef = db.collection("quotes").doc(id);
      const quoteDoc = await transaction.get(quoteRef);

      if (!quoteDoc.exists) {
        throw new Error("Preventivo non trovato");
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
      deletedQuoteJobId = quote.jobId || null;

      // 4. Get payment schedule IDs from quote (atomic lookup) OR fallback to legacy
      const scheduleIds = quote.paymentScheduleIds || [];

      if (scheduleIds.length === 0 && legacyScheduleRefs.length > 0) {
        console.warn(
          `⚠️ Quote ${id} senza paymentScheduleIds, usando ${legacyScheduleRefs.length} schedules da fallback query`,
        );
      }

      // 5. Re-read payment schedules INSIDE transaction for atomicity
      const scheduleRefs =
        scheduleIds.length > 0
          ? scheduleIds.map((scheduleId) =>
              db.collection("paymentSchedules").doc(scheduleId),
            )
          : legacyScheduleRefs;

      const scheduleSnapshots = await Promise.all(
        scheduleRefs.map((ref) => transaction.get(ref)),
      );

      // 6. Read job BEFORE any writes (Firestore transaction requirement)
      let jobDoc: any = null;
      if (quote.jobId) {
        const jobRef = db.collection("jobs").doc(quote.jobId);
        jobDoc = await transaction.get(jobRef);
      }

      // 7. PROTEZIONE: Blocca delete preventivi firmati senza forceDelete
      if (quote.status === "firmato" && !forceDelete) {
        // Check if any schedule has payments for detailed error message
        const hasPagamenti = scheduleSnapshots.some((snap) => {
          if (!snap.exists) return false;
          const schedule = snap.data() as PaymentSchedule;
          return (
            (schedule.totalePagato ?? 0) > 0 ||
            schedule.payments?.some(
              (p) => p.stato === "pagato" || p.stato === "parziale",
            )
          );
        });

        if (hasPagamenti) {
          throw new Error("SIGNED_QUOTE_WITH_PAYMENTS");
        } else {
          throw new Error("SIGNED_QUOTE_PROTECTION");
        }
      }

      // 8. Delete quote (WRITE operation starts here)
      transaction.delete(quoteRef);

      // 9. Update job: remove preventivoId, quoteIds array entry, AND update financials
      if (quote.jobId && jobDoc && jobDoc.exists) {
        const jobRef = db.collection("jobs").doc(quote.jobId);
        const jobData = jobDoc.data();

        // Calcola nuovo totale preventivato sottraendo il quote eliminato
        // FIX: Usa totalAfterDiscount (netto con sconto) invece di totaleBase (lordo)
        const currentTotale = jobData.financials?.totalePreventivato || 0;
        const quoteTotale = quote.totaleSelezionato || quote.totalAfterDiscount || quote.totaleBase || 0;
        const newTotale = Math.max(0, currentTotale - quoteTotale);

        transaction.update(jobRef, {
          preventivoId: FieldValue.delete(),
          quoteIds: FieldValue.arrayRemove(id), // Remove quote ID from array to prevent orphan references
          "financials.totalePreventivato": newTotale,
        });
      }

      // 10. Delete related payment schedules
      for (const snap of scheduleSnapshots) {
        if (snap.exists) {
          transaction.delete(snap.ref);
        }
      }
    });

    // Sync Google Calendar after deletion (outside transaction)
    if (deletedQuoteJobId) {
      try {
        const { ensureJobCalendarEvent } = await import('./job-routes.js');
        await ensureJobCalendarEvent(deletedQuoteJobId);
        console.log(`✅ Google Calendar aggiornato per job ${deletedQuoteJobId} dopo eliminazione preventivo`);
      } catch (calendarError) {
        console.warn(`⚠️ Errore sync Calendar dopo eliminazione (non critico):`, calendarError);
      }
    }

    return res.status(200).json({
      success: true,
      message: "Preventivo eliminato con successo",
    });
  } catch (error) {
    console.error("❌ Errore delete quote:", error);

    // Bubble specific protection errors to frontend
    if (error instanceof Error) {
      if (error.message === "SIGNED_QUOTE_PROTECTION") {
        return res.status(403).json({
          error: "SIGNED_QUOTE_PROTECTION",
          message:
            "Impossibile eliminare un preventivo firmato senza forceDelete",
        });
      }

      if (error.message === "SIGNED_QUOTE_WITH_PAYMENTS") {
        return res.status(403).json({
          error: "SIGNED_QUOTE_WITH_PAYMENTS",
          message:
            "Impossibile eliminare un preventivo firmato con pagamenti già registrati",
        });
      }
    }

    // Generic error fallback
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * PATCH /api/quotes/:id/reset-signature
 * Reimposta firma preventivo (firmato → bozza)
 * Admin-only - Rimuove firma e dataFirma mantenendo resto dei dati
 */
router.patch("/:id/reset-signature", verifyAdminAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminEmail = (req as any).verifiedAdmin?.email || req.headers["x-admin-email"] as string;

    // 2. Fetch quote
    const quoteRef = db.collection("quotes").doc(id);
    const quoteDoc = await quoteRef.get();

    if (!quoteDoc.exists) {
      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il preventivo specificato non esiste",
      });
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // 3. Validate quote is signed
    if (quote.status !== "firmato") {
      return res.status(400).json({
        error: "Preventivo non firmato",
        message: "Solo i preventivi firmati possono essere reimpostati",
      });
    }

    // 4. Reset signature fields and clause acceptance
    // Build update object
    const updateData: any = {
      status: "bozza",
      signature: FieldValue.delete(), // Remove QuoteSignature object
      clausesAccepted: FieldValue.delete(), // Remove top-level accepted clauses array
      // Legacy fields (backward compatibility)
      dataFirma: FieldValue.delete(),
      clienteFirma: FieldValue.delete(),
    };

    // Reset contractClauses if present (omit accepted/acceptedAt - Firestore doesn't allow FieldValue.delete in arrays)
    if (quote.contractClauses && Array.isArray(quote.contractClauses)) {
      const resetClauses = quote.contractClauses.map((clause) => {
        const { accepted, acceptedAt, ...rest } = clause as any;
        return rest;
      });
      updateData.contractClauses = resetClauses;
    }

    await quoteRef.update(updateData);

    // FIX: Aggiorna job status da "confermato" a stato precedente e sync Calendar
    if (quote.jobId) {
      try {
        const jobRef = db.collection("jobs").doc(quote.jobId);
        const jobDoc = await jobRef.get();
        if (jobDoc.exists) {
          const jobData = jobDoc.data();
          // Se il job era "confermato" (impostato dalla firma), verifica se ci sono ALTRI preventivi firmati
          if (jobData?.status === 'confermato') {
            const otherSignedQuotes = await db.collection('quotes')
              .where('jobId', '==', quote.jobId)
              .where('status', '==', 'firmato')
              .get();
            // Filtra via il preventivo corrente (che stiamo resettando)
            const remainingSignedQuotes = otherSignedQuotes.docs.filter(d => d.id !== id);
            if (remainingSignedQuotes.length === 0) {
              // Nessun altro preventivo firmato: riporta job a "preventivo_inviato"
              await jobRef.update({
                status: 'preventivo_inviato',
                updatedAt: nowRomeDate(),
              });
              console.log(`✅ Job ${quote.jobId} riportato a stato "preventivo_inviato" dopo reset firma`);
            }
          }
        }
      } catch (jobError) {
        console.warn(`⚠️ Errore aggiornamento job dopo reset firma (non critico):`, jobError);
      }

      // Sync Google Calendar description
      try {
        const { ensureJobCalendarEvent } = await import('./job-routes.js');
        await ensureJobCalendarEvent(quote.jobId);
        console.log(`✅ Google Calendar aggiornato per job ${quote.jobId} dopo reset firma`);
      } catch (calendarError) {
        console.warn(`⚠️ Errore sync Calendar dopo reset firma (non critico):`, calendarError);
      }
    }

    // Audit log
    await logAuditEvent({
      quoteId: id,
      adminEmail: adminEmail,
      action: 'signature_override',
      previousValue: 'firmato',
      newValue: 'bozza',
      reason: 'Reset firma manuale admin',
    });

    return res.status(200).json({
      success: true,
      message: "Firma reimpostata con successo",
    });
  } catch (error) {
    console.error("❌ Errore reset signature:", error);
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * POST /api/quotes/send-quote
 * Invia preventivo via email al cliente
 * PUBBLICO - può essere chiamato dall'admin senza autenticazione Firebase
 */
router.post("/send-quote", async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.body;

    if (!quoteId) {
      return res.status(400).json({
        error: "Quote ID mancante",
        message: "Il parametro quoteId è richiesto",
      });
    }

    // Fetch quote
    const quoteDoc = await db.collection("quotes").doc(quoteId).get();

    if (!quoteDoc.exists) {
      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il preventivo specificato non esiste",
      });
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // Raccoglie TUTTE le email dei clienti
    const recipientEmails: string[] = [];

    // Aggiungi email da clientiInfo (tutti i clienti)
    if (quote.clientiInfo && quote.clientiInfo.length > 0) {
      quote.clientiInfo.forEach((cliente) => {
        if (cliente.email && !recipientEmails.includes(cliente.email)) {
          recipientEmails.push(cliente.email);
        }
      });
    }

    // Fallback: aggiungi email da clienteId se non ci sono altre email
    if (recipientEmails.length === 0 && quote.clienteId) {
      const clienteDoc = await db
        .collection("clienti")
        .doc(quote.clienteId)
        .get();
      if (clienteDoc.exists) {
        const clienteData = clienteDoc.data();
        if (clienteData?.email) {
          recipientEmails.push(clienteData.email);
        }
      }
    }

    // Fallback finale: usa quote.sentTo se presente (split se contiene virgole)
    if (recipientEmails.length === 0 && quote.sentTo) {
      const sentToEmails = quote.sentTo
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      recipientEmails.push(...sentToEmails);
    }

    if (recipientEmails.length === 0) {
      return res.status(400).json({
        error: "Email destinatario mancante",
        message: "Impossibile determinare l'email del cliente",
      });
    }

    // Determina nome cliente
    let clienteName = "Cliente";
    if (quote.clientiInfo && quote.clientiInfo.length > 0) {
      const firstCliente = quote.clientiInfo[0];
      clienteName =
        `${firstCliente.nome || ""} ${firstCliente.cognome || ""}`.trim();
    }

    // Costruisci URL pubblico
    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:5000";
    const quoteUrl = `${baseUrl}/quote/${quote.publicToken}`;

    // Formato data evento
    let eventDate: string | undefined;
    if (quote.jobInfo?.eventDate) {
      const timestamp = quote.jobInfo.eventDate as any;
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      eventDate = date.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      });
    }

    // Recupera dati studio
    const studioInfo = await getStudioContactInfo();

    // Calcola data scadenza preventivo (opzionale, es: 30 giorni da oggi)
    let expiresAt: Date | undefined = undefined;
    if (quote.expiresAt) {
      const expiry = quote.expiresAt as any;
      expiresAt = expiry.toDate ? expiry.toDate() : new Date(expiry);
    }

    // Crea HTML email per PREVENTIVO INVIATO (non ancora firmato)
    const htmlContent = createQuoteSentEmailHTML(
      clienteName,
      quote.type || "fisso",
      quote.jobInfo?.nomeEvento || "Evento",
      quote.totalAfterDiscount || 0,
      quoteUrl,
      expiresAt,
      studioInfo,
    );

    const subject = `Preventivo Personalizzato - ${quote.jobInfo?.nomeEvento || "Evento"}`;

    // Invia email a TUTTI i clienti
    await sendGmailEmail(recipientEmails, subject, htmlContent);

    // Update quote con tracking invio
    // FIX: Non sovrascrivere status se il preventivo è in stato avanzato (firmato, visionato)
    const statusesNotToOverwrite = ['firmato', 'visionato'];
    const updateFields: any = {
      sentAt: nowRomeDate(),
      sentTo: recipientEmails.join(", "),
      emailSentAt: nowRomeDate(),
    };
    if (!statusesNotToOverwrite.includes(quote.status)) {
      updateFields.status = "inviato";
    }
    await db
      .collection("quotes")
      .doc(quoteId)
      .update(updateFields);

    console.log(
      `✅ Preventivo ${quoteId} inviato via email a ${recipientEmails.join(", ")}`,
    );

    return res.status(200).json({
      success: true,
      message: `Preventivo inviato con successo a ${recipientEmails.length} ${recipientEmails.length === 1 ? "cliente" : "clienti"}`,
      recipientEmails,
    });
  } catch (error) {
    console.error("❌ Errore send-quote:", error);
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * POST /api/quotes/quote-signed-notification
 * Invia email di conferma quando il cliente firma il preventivo
 * PUBBLICO - chiamato automaticamente dopo accettazione preventivo
 */
router.post(
  "/quote-signed-notification",
  async (req: Request, res: Response) => {
    try {
      const { quoteId } = req.body;

      if (!quoteId) {
        return res.status(400).json({
          error: "Quote ID mancante",
          message: "Il parametro quoteId è richiesto",
        });
      }

      // Fetch quote
      const quoteDoc = await db.collection("quotes").doc(quoteId).get();

      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: "Preventivo non trovato",
          message: "Il preventivo specificato non esiste",
        });
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

      // Verifica che sia firmato
      if (quote.status !== "firmato" || !quote.signature) {
        return res.status(400).json({
          error: "Preventivo non firmato",
          message: "Il preventivo deve essere firmato per inviare la notifica",
        });
      }

      // Raccoglie TUTTE le email dei clienti
      const recipientEmails: string[] = [];

      // Aggiungi email da clientiInfo (tutti i clienti)
      if (quote.clientiInfo && quote.clientiInfo.length > 0) {
        quote.clientiInfo.forEach((cliente) => {
          if (cliente.email && !recipientEmails.includes(cliente.email)) {
            recipientEmails.push(cliente.email);
          }
        });
      }

      // Fallback: usa quote.sentTo se presente (split se contiene virgole)
      if (recipientEmails.length === 0 && quote.sentTo) {
        const sentToEmails = quote.sentTo
          .split(",")
          .map((e) => e.trim())
          .filter((e) => e.length > 0);
        recipientEmails.push(...sentToEmails);
      }

      if (recipientEmails.length === 0) {
        return res.status(400).json({
          error: "Email destinatario mancante",
          message: "Impossibile determinare l'email del cliente",
        });
      }

      // Nome cliente
      const clienteName = quote.signature.clientName || "Cliente";

      // Data firma
      const signedAt = quote.signature.signedAt
        .toDate()
        .toLocaleDateString("it-IT", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

      // Recupera prossimo pagamento (se esiste payment schedule)
      let nextPaymentAmount: number | undefined;
      let nextPaymentDate: string | undefined;

      if (quote.paymentScheduleIds && quote.paymentScheduleIds.length > 0) {
        const scheduleDoc = await db
          .collection("paymentSchedules")
          .doc(quote.paymentScheduleIds[0])
          .get();
        if (scheduleDoc.exists) {
          const schedule = scheduleDoc.data() as PaymentSchedule;
          const nextPayment = schedule.payments.find(
            (p) => p.stato === "atteso",
          );
          if (nextPayment) {
            nextPaymentAmount = nextPayment.importo;
            nextPaymentDate = nextPayment.dataScadenza
              .toDate()
              .toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              });
          }
        }
      }

      // URL portale unificato (auto-adatta a stato preventivo)
      const baseUrl = process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
        : "http://localhost:5000";
      const portalUrl = `${baseUrl}/quote/${quote.publicToken}`;

      // Recupera dati studio
      const studioInfo = await getStudioContactInfo();

      // Crea HTML email (TODO: creare template specifico per firma preventivo)
      const nextPaymentData =
        nextPaymentAmount && nextPaymentDate
          ? {
              importo: nextPaymentAmount,
              dataScadenza: new Date(nextPaymentDate),
              descrizione: "Prossimo pagamento",
            }
          : undefined;

      // FIX: Usa helper che gestisce correttamente sconti e quote legacy
      const quoteTotaleEmail = calculateCorrectQuoteTotal(quote);

      const htmlContent = createQuoteSignedEmailHTML(
        clienteName,
        quote.type || "fisso",
        quote.jobInfo?.nomeEvento || "Evento",
        quoteTotaleEmail,
        new Date(signedAt),
        portalUrl,
        nextPaymentData,
        undefined,
        studioInfo,
      );

      const subject = `Preventivo Firmato - ${quote.jobInfo?.nomeEvento || "Evento"}`;

      // Invia email a TUTTI i clienti
      await sendGmailEmail(recipientEmails, subject, htmlContent);

      console.log(
        `✅ Notifica firma preventivo ${quoteId} inviata a ${recipientEmails.join(", ")}`,
      );

      return res.status(200).json({
        success: true,
        message: `Notifica firma inviata con successo a ${recipientEmails.length} ${recipientEmails.length === 1 ? "cliente" : "clienti"}`,
        recipientEmails,
      });
    } catch (error) {
      console.error("❌ Errore quote-signed-notification:", error);
      return res.status(500).json({
        error: "Errore server",
        message: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * POST /api/quotes/admin-quote-signed-notification
 * Invia email ADMIN quando cliente firma preventivo
 * Email creativa e social-ready per Instagram Stories
 * PUBBLICO - chiamato automaticamente dopo firma preventivo
 */
router.post(
  "/admin-quote-signed-notification",
  async (req: Request, res: Response) => {
    try {
      const { quoteId } = req.body;

      if (!quoteId) {
        return res.status(400).json({
          error: "Quote ID mancante",
          message: "Il parametro quoteId è richiesto",
        });
      }

      // Fetch quote
      const quoteDoc = await db.collection("quotes").doc(quoteId).get();

      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: "Preventivo non trovato",
          message: "Il preventivo specificato non esiste",
        });
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

      // Verifica che sia firmato
      if (quote.status !== "firmato" || !quote.signature) {
        return res.status(400).json({
          error: "Preventivo non firmato",
          message: "Il preventivo deve essere firmato per inviare la notifica",
        });
      }

      // Email admin hardcoded
      const ADMIN_EMAIL = "gennaro.mazzacane@gmail.com";

      // Nome cliente
      let clienteName = "Cliente";
      if (quote.signature?.clientName) {
        clienteName = quote.signature.clientName;
      } else if (quote.clientiInfo && quote.clientiInfo.length > 0) {
        const firstCliente = quote.clientiInfo[0];
        clienteName =
          `${firstCliente.nome || ""} ${firstCliente.cognome || ""}`.trim();
      }

      // Recupera dati studio
      const studioInfo = await getStudioContactInfo();

      // FIX: Usa helper che gestisce correttamente sconti e quote legacy
      const adminQuoteTotale = calculateCorrectQuoteTotal(quote);

      // Crea HTML email per admin (riusa template standard)
      const htmlContent = createQuoteSignedEmailHTML(
        clienteName,
        quote.type || "fisso",
        quote.jobInfo?.nomeEvento || "Nuovo Evento",
        adminQuoteTotale,
        quote.signature.signedAt.toDate(),
        `${process.env.REPLIT_DOMAINS ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}` : "http://localhost:5000"}/quote/${quote.publicToken}`,
        undefined,
        undefined,
        studioInfo,
      );

      const subject = ` CONTRATTO FIRMATO! ${clienteName} - ${quote.jobInfo?.nomeEvento || "Evento"}`;

      // Invia email all'admin
      await sendGmailEmail([ADMIN_EMAIL], subject, htmlContent);

      console.log(
        `✅ Notifica ADMIN firma preventivo ${quoteId} inviata a ${ADMIN_EMAIL}`,
      );

      return res.status(200).json({
        success: true,
        message: "Notifica admin inviata con successo",
        adminEmail: ADMIN_EMAIL,
      });
    } catch (error) {
      console.error("❌ Errore admin-quote-signed-notification:", error);
      return res.status(500).json({
        error: "Errore server",
        message: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * POST /api/quotes/payment-reminder
 * Invia promemoria pagamento in scadenza
 * PUBBLICO - chiamato manualmente dall'admin o da job schedulato
 */
router.post("/payment-reminder", async (req: Request, res: Response) => {
  try {
    const { paymentScheduleId, paymentIndex } = req.body;

    if (!paymentScheduleId || paymentIndex === undefined) {
      return res.status(400).json({
        error: "Parametri mancanti",
        message: "paymentScheduleId e paymentIndex sono richiesti",
      });
    }

    // Fetch payment schedule
    const scheduleDoc = await db
      .collection("paymentSchedules")
      .doc(paymentScheduleId)
      .get();

    if (!scheduleDoc.exists) {
      return res.status(404).json({
        error: "Scadenzario non trovato",
        message: "Il piano pagamenti specificato non esiste",
      });
    }

    const schedule = {
      id: scheduleDoc.id,
      ...scheduleDoc.data(),
    } as PaymentSchedule;
    const payment = schedule.payments[paymentIndex];

    if (!payment) {
      return res.status(404).json({
        error: "Pagamento non trovato",
        message: "Il pagamento specificato non esiste",
      });
    }

    // Fetch quote per dati cliente ed evento
    // Note: quoteId non è ufficialmente nel tipo PaymentSchedule ma esiste in Firestore
    const scheduleQuoteId = (schedule as any).quoteId as string | undefined;
    if (!scheduleQuoteId) {
      return res.status(400).json({
        error: "Quote ID mancante",
        message: "Il payment schedule non ha un quoteId collegato",
      });
    }

    const quoteDoc = await db.collection("quotes").doc(scheduleQuoteId).get();

    if (!quoteDoc.exists) {
      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il preventivo collegato non esiste",
      });
    }

    const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

    // Raccoglie TUTTE le email dei clienti
    const recipientEmails: string[] = [];

    // Aggiungi email da clientiInfo (tutti i clienti)
    if (quote.clientiInfo && quote.clientiInfo.length > 0) {
      quote.clientiInfo.forEach((cliente) => {
        if (cliente.email && !recipientEmails.includes(cliente.email)) {
          recipientEmails.push(cliente.email);
        }
      });
    }

    // Fallback: usa quote.sentTo se presente (split se contiene virgole)
    if (recipientEmails.length === 0 && quote.sentTo) {
      const sentToEmails = quote.sentTo
        .split(",")
        .map((e) => e.trim())
        .filter((e) => e.length > 0);
      recipientEmails.push(...sentToEmails);
    }

    if (recipientEmails.length === 0) {
      return res.status(400).json({
        error: "Email destinatario mancante",
        message: "Impossibile determinare l'email del cliente",
      });
    }

    // Nome cliente
    let clienteName = "Cliente";
    if (quote.signature?.clientName) {
      clienteName = quote.signature.clientName;
    } else if (quote.clientiInfo && quote.clientiInfo.length > 0) {
      const firstCliente = quote.clientiInfo[0];
      clienteName =
        `${firstCliente.nome || ""} ${firstCliente.cognome || ""}`.trim();
    }

    // Calcola giorni fino a scadenza
    const dueDate = payment.dataScadenza.toDate();
    const today = nowRomeDate();
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    const isOverdue = daysUntilDue < 0;

    const paymentDueDate = formatRomeDateLocale(dueDate);

    // URL portale unificato (auto-adatta a stato preventivo)
    const baseUrl = process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
      : "http://localhost:5000";
    const portalUrl = `${baseUrl}/quote/${quote.publicToken}`;

    // Recupera dati studio
    const studioInfo = await getStudioContactInfo();

    // Crea HTML email
    const htmlContent = createPaymentReminderEmailHTML(
      clienteName,
      quote.jobInfo?.nomeEvento || "Evento",
      payment.importo,
      paymentDueDate,
      (payment as any).descrizione || "Rata",
      daysUntilDue,
      isOverdue,
      portalUrl,
      studioInfo,
    );

    const subject = isOverdue
      ? `Pagamento Scaduto - ${quote.jobInfo?.nomeEvento || "Evento"}`
      : `Promemoria Pagamento - ${quote.jobInfo?.nomeEvento || "Evento"}`;

    // Invia email a TUTTI i clienti
    await sendGmailEmail(recipientEmails, subject, htmlContent);

    console.log(
      `✅ Promemoria pagamento inviato a ${recipientEmails.join(", ")} per scadenzario ${paymentScheduleId}`,
    );

    return res.status(200).json({
      success: true,
      message: `Promemoria pagamento inviato con successo a ${recipientEmails.length} ${recipientEmails.length === 1 ? "cliente" : "clienti"}`,
      recipientEmails,
      daysUntilDue,
      isOverdue,
    });
  } catch (error) {
    console.error("❌ Errore payment-reminder:", error);
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * GET /api/quotes/status/validate
 * Valida cambio stato preventivo con controlli finanziari
 * Ritorna warnings e blocchi senza modificare il preventivo
 * Admin-only + Firebase Auth
 */
router.get(
  "/:id/status/validate",
  verifyAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { newStatus } = req.query;

      // 2. Validate newStatus
      const validStatuses = [
        "bozza",
        "inviato",
        "visionato",
        "firmato",
        "rifiutato",
        "scaduto",
        "annullato",
      ];
      if (!newStatus || !validStatuses.includes(newStatus as string)) {
        return res.status(400).json({
          error: "Stato non valido",
          message: `Lo stato deve essere uno tra: ${validStatuses.join(", ")}`,
        });
      }

      // 3. Fetch quote
      const quoteDoc = await db.collection("quotes").doc(id).get();

      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: "Preventivo non trovato",
          message: "Il preventivo specificato non esiste",
        });
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

      // 4. Validazioni finanziarie (senza modificare nulla)
      const validation = await validateQuoteStatusChange(
        quote,
        newStatus as string,
      );

      return res.status(200).json({
        success: true,
        allowed: validation.allowed,
        warnings: validation.warnings || [],
        error: validation.error || null,
        currentStatus: quote.status,
        requestedStatus: newStatus,
      });
    } catch (error) {
      console.error("❌ Errore validazione stato preventivo:", error);
      return res.status(500).json({
        error: "Errore server",
        message: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * PATCH /api/quotes/:id/status
 * Cambio manuale stato preventivo con validazioni finanziarie e rigenerazione token
 * Admin-only + Firebase Auth
 */
router.patch(
  "/:id/status",
  verifyAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { newStatus, reason } = req.body;
      const adminEmail = (req as any).verifiedAdmin.email; // Usa identità verificata da middleware

      // 2. Validate newStatus
      const validStatuses = [
        "bozza",
        "inviato",
        "visionato",
        "firmato",
        "rifiutato",
        "scaduto",
        "annullato",
      ];
      if (!newStatus || !validStatuses.includes(newStatus)) {
        return res.status(400).json({
          error: "Stato non valido",
          message: `Lo stato deve essere uno tra: ${validStatuses.join(", ")}`,
        });
      }

      // 3. Fetch quote
      const quoteRef = db.collection("quotes").doc(id);
      const quoteDoc = await quoteRef.get();

      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: "Preventivo non trovato",
          message: "Il preventivo specificato non esiste",
        });
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
      const oldStatus = quote.status;

      // 4. Validazioni finanziarie
      const validation = await validateQuoteStatusChange(quote, newStatus);

      if (!validation.allowed) {
        return res.status(400).json({
          error: "Cambio stato bloccato",
          message: validation.error,
          warnings: validation.warnings,
        });
      }

      // 5. Determina se rigenerare token
      const shouldRegenerateToken = ["annullato", "bozza", "scaduto"].includes(
        newStatus,
      );

      const updateData: any = {
        status: newStatus,
        updatedAt: nowRomeDate(),
      };

      // 6. Rigenerazione token se necessario
      if (shouldRegenerateToken && quote.publicToken) {
        const oldToken = quote.publicToken;
        const newToken = nanoid(32);

        // Crea entry per token revocato
        const revokedEntry: RevokedToken = {
          token: oldToken,
          revokedAt: nowRomeDate() as any,
          revokedBy: adminEmail,
          reason: `status_change: ${oldStatus} → ${newStatus}`,
        };

        updateData.publicToken = newToken;
        updateData.revokedTokens = FieldValue.arrayUnion(revokedEntry);

        // Log rigenerazione token
        await logAuditEvent({
          quoteId: id,
          adminEmail,
          action: "token_regenerated",
          previousValue: oldToken,
          newValue: newToken,
          reason: `Cambio stato: ${oldStatus} → ${newStatus}`,
        });
      }

      // 7. Update preventivo
      await quoteRef.update(updateData);

      // 8. Log cambio stato
      await logAuditEvent({
        quoteId: id,
        adminEmail,
        action: "status_change",
        previousValue: oldStatus,
        newValue: newStatus,
        reason: reason || "Cambio manuale admin",
        metadata: {
          tokenRegenerated: shouldRegenerateToken,
          warnings: validation.warnings,
        },
      });

      // 9. Sync Google Calendar description (reflects new status)
      if (quote.jobId) {
        try {
          const { ensureJobCalendarEvent } = await import('./job-routes.js');
          await ensureJobCalendarEvent(quote.jobId);
          console.log(`✅ Google Calendar aggiornato per job ${quote.jobId} dopo cambio stato ${oldStatus} → ${newStatus}`);
        } catch (calendarError) {
          console.warn(`⚠️ Errore sync Calendar dopo cambio stato (non critico):`, calendarError);
        }
      }

      return res.status(200).json({
        success: true,
        message: `Stato aggiornato da "${oldStatus}" a "${newStatus}"`,
        warnings: validation.warnings,
        tokenRegenerated: shouldRegenerateToken,
        newToken: shouldRegenerateToken ? updateData.publicToken : undefined,
      });
    } catch (error) {
      console.error("❌ Errore cambio stato preventivo:", error);
      return res.status(500).json({
        error: "Errore server",
        message: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * PATCH /api/quotes/:id/signature/manual
 * Inserimento manuale firma cliente (retroattiva o forzata)
 * Admin-only + Firebase Auth
 * 
 * FIX Dicembre 2025: Aggiunto signedAt a livello root + invio email conferma
 * Il portale firmato usa quote.signedAt per mostrare la data della firma
 */
router.patch(
  "/:id/signature/manual",
  verifyAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { clientName, signedAt, reason, sendEmail = true } = req.body;
      const adminEmail = (req as any).verifiedAdmin.email;

      // 1. Validate input
      if (!clientName || !signedAt) {
        return res.status(400).json({
          error: "Dati incompleti",
          message: "Nome cliente e data firma sono obbligatori",
        });
      }

      // 2. Fetch quote
      const quoteRef = db.collection("quotes").doc(id);
      const quoteDoc = await quoteRef.get();

      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: "Preventivo non trovato",
          message: "Il preventivo specificato non esiste",
        });
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;
      const signedAtDate = new Date(signedAt);

      // 3. Crea oggetto firma manuale
      const manualSignature = {
        clientName: clientName.trim(),
        signedAt: signedAtDate,
        ipAddress: "admin-manual-override",
        userAgent: `Admin: ${adminEmail}`,
      };

      // 4. Update preventivo con firma + stato firmato + signedAt root
      // IMPORTANTE: signedAt a livello root è usato da QuoteSignedPortalPage
      await quoteRef.update({
        signature: manualSignature,
        signedAt: signedAtDate, // FIX: Aggiunto signedAt a livello root per visualizzazione portale
        status: "firmato",
        updatedAt: nowRomeDate(),
      });

      // 5. Log inserimento firma manuale
      await logAuditEvent({
        quoteId: id,
        adminEmail,
        action: "signature_override",
        newValue: {
          clientName,
          signedAt,
        },
        reason: reason || "Inserimento manuale firma admin",
        metadata: {
          previousStatus: quote.status,
          hadPreviousSignature: !!quote.signature,
        },
      });

      // 5b. Sync Google Calendar description (reflects signed quote)
      if (quote.jobId) {
        try {
          const { ensureJobCalendarEvent } = await import('./job-routes.js');
          await ensureJobCalendarEvent(quote.jobId);
          console.log(`✅ Google Calendar aggiornato per job ${quote.jobId} dopo firma manuale`);
        } catch (calendarError) {
          console.warn(`⚠️ Errore sync Calendar dopo firma manuale (non critico):`, calendarError);
        }
      }

      // 6. Invia email conferma (se richiesto)
      let emailSent = false;
      if (sendEmail) {
        try {
          // Fetch job e clienti per email
          let clientEmail: string | null = null;
          let jobInfo: any = null;

          if (quote.jobId) {
            const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
            if (jobDoc.exists) {
              const jobData = jobDoc.data();
              jobInfo = {
                nomeEvento: jobData?.nomeEvento,
                eventDate: jobData?.eventDate,
              };

              // Recupera email da clienti collegati
              if (jobData?.clientiIds && jobData.clientiIds.length > 0) {
                const clienteDoc = await db
                  .collection("clienti")
                  .doc(jobData.clientiIds[0])
                  .get();
                if (clienteDoc.exists) {
                  clientEmail = clienteDoc.data()?.email || null;
                }
              }
            }
          }

          if (clientEmail) {
            // Genera email conferma firma
            const studioInfo = await getStudioContactInfo();
            const baseUrl =
              process.env.REPLIT_DOMAINS
                ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
                : "http://localhost:5000";
            const portalUrl = `${baseUrl}/quote/${quote.publicToken}`;

            // Usa la firma corretta della funzione createQuoteSignedEmailHTML
            const emailHTML = createQuoteSignedEmailHTML(
              clientName.trim(),
              quote.type || "fisso",
              jobInfo?.nomeEvento || "Il tuo evento",
              quote.totalAfterDiscount || quote.totaleBase || 0,
              signedAtDate,
              portalUrl,
              undefined, // nextPayment
              undefined, // payments
              studioInfo
            );

            await sendGmailEmail(
              clientEmail,
              `Contratto Firmato - ${jobInfo?.nomeEvento || "Il tuo evento"}`,
              emailHTML,
              undefined,
              {
                type: "contract",
                relatedDocId: id,
                relatedDocType: "quote",
                clientName: clientName.trim(),
              }
            );

            emailSent = true;
            console.log(`✅ Email conferma firma manuale inviata a ${clientEmail}`);
          } else {
            console.log("⚠️ Nessuna email cliente trovata per invio conferma firma manuale");
          }

          // Email notifica admin (template professionale)
          try {
            const studioInfo = await getStudioContactInfo();
            const adminEmail = studioInfo?.email || "gennaro.mazzacane@gmail.com";
            const baseUrl = process.env.REPLIT_DOMAINS
              ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
              : "http://localhost:5000";
            const adminDashboardUrl = `${baseUrl}/admin/dashboard?tab=lavori&job=${quote.jobId}`;
            const quoteTotale = calculateCorrectQuoteTotal(quote);

            const adminEmailHTML = createAdminQuoteSignedNotificationHTML(
              clientName.trim(),
              (quote.type || "fisso") as "fisso" | "variabile",
              jobInfo?.nomeEvento || "Evento",
              quoteTotale,
              signedAtDate,
              adminDashboardUrl,
              studioInfo || undefined
            );

            await sendGmailEmail(
              adminEmail,
              `Contratto Firmato - ${clientName.trim()} - ${jobInfo?.nomeEvento || "Evento"}`,
              adminEmailHTML,
              undefined,
              {
                type: "contract",
                relatedDocId: id,
                relatedDocType: "quote",
                clientName: clientName.trim(),
              }
            );
            console.log(`✅ Email notifica admin firma manuale inviata a ${adminEmail}`);
          } catch (adminEmailError) {
            console.error("⚠️ Errore invio email admin firma manuale:", adminEmailError);
          }
        } catch (emailError) {
          console.error("⚠️ Errore invio email conferma firma manuale:", emailError);
        }
      }

      return res.status(200).json({
        success: true,
        message: "Firma inserita manualmente con successo",
        signature: {
          clientName,
          signedAt,
          insertedBy: adminEmail,
        },
        emailSent,
      });
    } catch (error) {
      console.error("❌ Errore inserimento firma manuale:", error);
      return res.status(500).json({
        error: "Errore server",
        message: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * POST /api/quotes/:id/post-signature
 * Endpoint PUBBLICO per aggiornamenti post-firma (job status, timeline, email)
 * Chiamato automaticamente dopo che il cliente firma il preventivo
 * 
 * MOTIVAZIONE: Le regole Firestore per jobs/jobTimeline richiedono isAdmin(),
 * quindi il client non può aggiornare direttamente. Questo endpoint esegue
 * gli update con privilegi server-side.
 * 
 * Sicurezza: Verifica publicToken + stato firmato + idempotenza
 */
router.post(
  "/:id/post-signature",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { publicToken, clientName, totaleSelezionato } = req.body;

      console.log(`📝 Post-signature request per quote ${id}`);

      // 1. Validate input
      if (!publicToken) {
        return res.status(400).json({
          error: "Token mancante",
          message: "publicToken è obbligatorio",
        });
      }

      // 2. Fetch quote
      const quoteRef = db.collection("quotes").doc(id);
      const quoteDoc = await quoteRef.get();

      if (!quoteDoc.exists) {
        return res.status(404).json({
          error: "Preventivo non trovato",
          message: "Il preventivo specificato non esiste",
        });
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

      // FIX: Calcola totale SEMPRE server-side per sicurezza
      // Per quote variabili, usa totaleSelezionato già salvato in Firestore (impostato al momento della firma)
      // Non fidarsi del valore passato dal client
      const correctTotale = calculateCorrectQuoteTotal(quote);

      // 3. Verify publicToken matches
      if (quote.publicToken !== publicToken) {
        return res.status(403).json({
          error: "Token non valido",
          message: "Il token fornito non corrisponde",
        });
      }

      // 4. Verify quote is signed (firma già avvenuta)
      if (quote.status !== "firmato") {
        return res.status(400).json({
          error: "Preventivo non firmato",
          message: "Il preventivo deve essere firmato prima di chiamare questo endpoint",
        });
      }

      // 5. Idempotency check: se job già confermato, skip
      const jobRef = db.collection("jobs").doc(quote.jobId);
      const jobDoc = await jobRef.get();
      
      if (!jobDoc.exists) {
        console.warn(`⚠️ Job ${quote.jobId} non trovato per quote ${id}`);
        return res.status(200).json({
          success: true,
          message: "Operazione completata (job non trovato)",
          skipped: true,
        });
      }

      const job = jobDoc.data();
      
      // IDEMPOTENZA GRANULARE: Traccia cosa è stato fatto per supportare retry parziali
      const completedSteps = {
        jobStatusUpdated: false,
        timelineEventAdded: false,
        clientEmailSent: false,
        adminEmailSent: false,
      };
      
      // 6. Update job status a "confermato" (skip se già fatto)
      if (job?.status !== "confermato" && job?.status !== "completato") {
        await jobRef.update({
          status: "confermato",
          updatedAt: nowRomeDate(),
          "financials.totalePreventivato": correctTotale,
        });
        completedSteps.jobStatusUpdated = true;
        console.log(`✅ Job ${quote.jobId} aggiornato a stato "confermato"`);
      } else {
        console.log(`⏭️ Job ${quote.jobId} già in stato ${job?.status}, skip update`);
      }

      // 6b. Sync Google Calendar description (reflects signed quote status)
      try {
        const { ensureJobCalendarEvent } = await import('./job-routes.js');
        await ensureJobCalendarEvent(quote.jobId);
        console.log(`✅ Google Calendar aggiornato per job ${quote.jobId} post-firma`);
      } catch (calendarError) {
        console.warn(`⚠️ Errore sync Calendar post-firma (non critico):`, calendarError);
      }

      // 7. Add timeline event (check se già esiste per questo quote)
      const existingTimelineEvent = await db.collection("jobTimeline")
        .where("jobId", "==", quote.jobId)
        .where("tipo", "==", "preventivo_firmato")
        .where("metadata.quoteId", "==", id)
        .limit(1)
        .get();
      
      if (existingTimelineEvent.empty) {
        await db.collection("jobTimeline").add({
          jobId: quote.jobId,
          tipo: "preventivo_firmato",
          descrizione: `Preventivo firmato da ${clientName || quote.signature?.clientName || "Cliente"}`,
          data: nowRomeDate(),
          metadata: { 
            quoteId: id, 
            totale: correctTotale 
          },
        });
        completedSteps.timelineEventAdded = true;
        console.log(`✅ Timeline event aggiunto per job ${quote.jobId}`);
      } else {
        console.log(`⏭️ Timeline event già esiste per quote ${id}, skip`);
      }

      // 8. Invia email conferma al cliente
      try {
        const studioInfo = await getStudioContactInfo();
        const baseUrl =
          process.env.REPLIT_DOMAINS
            ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
            : "http://localhost:5000";
        const portalUrl = `${baseUrl}/quote/${quote.publicToken}`;

        // Recupera email clienti dal job
        let clientEmails: string[] = [];
        if (job?.clientiIds && job.clientiIds.length > 0) {
          const clienteDocs = await Promise.all(
            job.clientiIds.map((cid: string) => db.collection("clienti").doc(cid).get())
          );
          clientEmails = clienteDocs
            .filter(doc => doc.exists && doc.data()?.email)
            .map(doc => doc.data()?.email);
        }

        if (clientEmails.length > 0) {
          const signedAt = (quote as any).signedAt || quote.signature?.signedAt || nowRomeDate();
          const signedAtDate = signedAt instanceof Date ? signedAt : 
            (signedAt as any).toDate ? (signedAt as any).toDate() : new Date(signedAt);

          const emailHTML = createQuoteSignedEmailHTML(
            clientName || quote.signature?.clientName || "Cliente",
            quote.type || "fisso",
            job?.nomeEvento || "Il tuo evento",
            correctTotale,
            signedAtDate,
            portalUrl,
            undefined, // nextPayment
            undefined, // payments
            studioInfo
          );

          await sendGmailEmail(
            clientEmails.join(","),
            `Contratto Firmato - ${job?.nomeEvento || "Il tuo evento"}`,
            emailHTML,
            undefined,
            {
              type: "contract",
              relatedDocId: id,
              relatedDocType: "quote",
              clientName: clientName || quote.signature?.clientName || "Cliente",
            }
          );
          completedSteps.clientEmailSent = true;
          console.log(`✅ Email conferma firma inviata a ${clientEmails.join(", ")}`);
        }
      } catch (emailError) {
        console.error("⚠️ Errore invio email post-firma:", emailError);
        // Non blocchiamo per errore email
      }

      // 9. Invia email notifica all'admin
      try {
        const studioInfo = await getStudioContactInfo();
        const adminEmail = studioInfo?.email || "gennaro.mazzacane@gmail.com";
        const baseUrlAdmin = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "http://localhost:5000";
        const adminDashboardUrl = `${baseUrlAdmin}/admin/dashboard?tab=lavori&job=${quote.jobId}`;

        const signedAt = (quote as any).signedAt || quote.signature?.signedAt || nowRomeDate();
        const signedAtDate = signedAt instanceof Date ? signedAt :
          (signedAt as any).toDate ? (signedAt as any).toDate() : new Date(signedAt);

        const adminEmailHTML = createAdminQuoteSignedNotificationHTML(
          clientName || quote.signature?.clientName || "Cliente",
          (quote.type || "fisso") as "fisso" | "variabile",
          job?.nomeEvento || "Evento",
          correctTotale,
          signedAtDate,
          adminDashboardUrl,
          studioInfo || undefined
        );

        await sendGmailEmail(
          adminEmail,
          `Contratto Firmato - ${clientName || quote.signature?.clientName || "Cliente"} - ${job?.nomeEvento || "Evento"}`,
          adminEmailHTML,
          undefined,
          {
            type: "contract",
            relatedDocId: id,
            relatedDocType: "quote",
          }
        );
        completedSteps.adminEmailSent = true;
        console.log(`✅ Email notifica admin inviata a ${adminEmail}`);
      } catch (adminEmailError) {
        console.error("⚠️ Errore invio email admin:", adminEmailError);
      }

      return res.status(200).json({
        success: true,
        message: "Post-signature updates completati",
        completedSteps,
      });
    } catch (error) {
      console.error("❌ Errore post-signature:", error);
      return res.status(500).json({
        error: "Errore server",
        message: error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * ============================================
 * PREVENTIVO RAPIDO - Link pubblico condivisibile
 * ============================================
 */

/**
 * GET /api/quotes/quick/:token
 * Fetch template data per link pubblico (NO AUTH)
 */
router.get("/quick/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(400).json({ error: "Token mancante" });
    }

    const templatesSnapshot = await db
      .collection("quoteTemplates")
      .where("shareableToken", "==", token)
      .where("attivo", "==", true)
      .limit(1)
      .get();

    if (templatesSnapshot.empty) {
      return res.status(404).json({
        error: "Template non trovato",
        message: "Il link non è valido o il template non è più attivo.",
      });
    }

    const templateDoc = templatesSnapshot.docs[0];
    const template = { id: templateDoc.id, ...templateDoc.data() };

    const jobTypeDoc = await db
      .collection("jobTypes")
      .where("slug", "==", (template as any).jobType)
      .limit(1)
      .get();

    let jobTypeInfo = null;
    if (!jobTypeDoc.empty) {
      const jt = jobTypeDoc.docs[0].data();
      jobTypeInfo = {
        id: jobTypeDoc.docs[0].id,
        nome: jt.nome,
        slug: jt.slug,
        imageUrl: jt.imageUrl || null,
      };
    }

    let studioInfo = null;
    try {
      studioInfo = await getStudioContactInfo();
    } catch (e) {
      console.warn("⚠️ Studio info non disponibile");
    }

    return res.json({
      success: true,
      data: {
        template: {
          id: template.id,
          nome: (template as any).nome,
          jobType: (template as any).jobType,
          type: (template as any).type,
          theme: (template as any).theme,
          defaultProducts: (template as any).defaultProducts || [],
          defaultClauses: (template as any).defaultClauses || [],
          discountType: (template as any).discountType,
          discountValue: (template as any).discountValue,
        },
        jobTypeInfo,
        studioInfo: studioInfo
          ? {
              studioName: studioInfo.name,
              email: studioInfo.email,
              phone: studioInfo.phone,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("❌ Errore fetch quick quote template:", error);
    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

/**
 * POST /api/quotes/quick/:token/activate
 * Crea client + job + quote da template (NO AUTH - pubblico)
 */
router.post("/quick/:token/activate", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const {
      nome,
      cognome,
      email,
      cellulare,
      nomeEvento,
      eventDate,
      eventLocation,
      rituLocation,
      rituTime,
      dataNonDefinita,
      noteCliente,
      selectedProducts,
      signerName,
      clausesAccepted,
      // ✅ IDs da save-draft: se presenti, salta la creazione di cliente/job
      existingJobId,
      existingClienteId,
    } = req.body;

    if (!nome || !cognome || !email) {
      return res.status(400).json({
        error: "Dati mancanti",
        message: "Nome, cognome e email sono obbligatori.",
      });
    }

    if (!nomeEvento) {
      return res.status(400).json({
        error: "Dati mancanti",
        message: "Il nome dell'evento è obbligatorio.",
      });
    }

    const templatesSnapshot = await db
      .collection("quoteTemplates")
      .where("shareableToken", "==", token)
      .where("attivo", "==", true)
      .limit(1)
      .get();

    if (templatesSnapshot.empty) {
      return res.status(404).json({
        error: "Template non trovato",
        message: "Il link non è valido o il template non è più attivo.",
      });
    }

    const templateDoc = templatesSnapshot.docs[0];
    const template = templateDoc.data();

    // 0. Salva submission "pending" prima di qualsiasi altra operazione.
    //    Se il server crasha a metà, il record rimane pending e l'admin può recuperare i dati.
    let submissionRef: FirebaseFirestore.DocumentReference | null = null;
    try {
      submissionRef = await db.collection("quickQuoteSubmissions").add({
        token,
        templateId: templateDoc.id,
        templateName: template.nome || "",
        rawData: {
          nome,
          cognome,
          email,
          cellulare: cellulare || "",
          nomeEvento,
          eventDate: eventDate || null,
          eventLocation: eventLocation || "",
          dataNonDefinita: dataNonDefinita || false,
          noteCliente: noteCliente || "",
          selectedProducts: selectedProducts || [],
          hasSigned: !!(signerName && signerName.trim()),
        },
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch (preErr) {
      console.warn("⚠️ quickQuoteSubmissions pre-save fallita (non bloccante):", preErr);
    }

    // 1. Cerca cliente esistente per email, altrimenti crea nuovo
    // ✅ Se save-draft ha già creato cliente/job, li riusa senza duplicati
    let clienteId: string;
    let jobRef: FirebaseFirestore.DocumentReference;
    let jobId: string;

    if (existingJobId && existingClienteId) {
      // ✅ Job e cliente già creati da save-draft — riusa gli ID
      const existingJobDoc = await db.collection("jobs").doc(existingJobId).get();
      if (existingJobDoc.exists) {
        jobId = existingJobId;
        jobRef = db.collection("jobs").doc(existingJobId);
        clienteId = existingClienteId;
        console.log(`✅ activate: riuso job=${jobId} cliente=${clienteId} da save-draft`);
      } else {
        // Job non trovato (raro), crea normalmente
        jobId = existingJobId; // fallback - verrà sovrascritto sotto
        jobRef = db.collection("jobs").doc(); // placeholder
        clienteId = existingClienteId;
      }
    } else {
      // Flusso normale: cerca/crea cliente e job
      const existingClientSnapshot = await db
        .collection("clienti")
        .where("email", "==", normalizeEmail(email))
        .limit(1)
        .get();

      if (!existingClientSnapshot.empty) {
        clienteId = existingClientSnapshot.docs[0].id;
        await db.collection("clienti").doc(clienteId).update({
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const clienteData: Record<string, any> = {
          nome: nome.trim(),
          cognome: cognome.trim(),
          email: normalizeEmail(email),
          cellulare1: cellulare?.trim() || "",
          tags: ["preventivo-rapido"],
          sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], jobIds: [] },
          lifecycle: { firstContactAt: FieldValue.serverTimestamp(), lastInteractionAt: FieldValue.serverTimestamp(), status: "lead" },
          financials: { totalRevenue: 0, outstandingBalance: 0, totalOrders: 0 },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        };
        const clienteRef = await db.collection("clienti").add(clienteData);
        clienteId = clienteRef.id;
      }

      // 2. Cerca job lead preesistente (stessa logica dedup di save-draft)
      // Evita di creare un secondo job se save-draft ha già creato il lead
      const isDND = dataNonDefinita === true;
      const candidateLeads = await db.collection("jobs")
        .where("clientiIds", "array-contains", clienteId)
        .where("provenance", "==", "preventivo-rapido")
        .limit(20)
        .get();
      const existingLead = candidateLeads.docs.find(d => {
        const data = d.data();
        return data.status === "lead" && data.jobType === template.jobType && (!data.quoteIds || data.quoteIds.length === 0);
      }) || null;

      if (existingLead) {
        jobId = existingLead.id;
        jobRef = db.collection("jobs").doc(existingLead.id);
        console.log(`✅ activate: riuso job lead=${jobId} trovato per dedup (no existingJobId fornito)`);
      } else {
        // Crea nuovo Job
        const jobData: Record<string, any> = {
          nomeEvento: nomeEvento.trim(),
          clientiIds: [clienteId],
          jobType: template.jobType,
          dataNonDefinita: isDND,
          allDay: true,
          provenance: "preventivo-rapido",
          orderIds: [], galleryIds: [], quoteIds: [],
          status: "lead",
          financials: { totalePreventivato: 0, totaleOrdini: 0, totalePagato: 0, saldoResiduo: 0 },
          costi: [], pdfs: [], workflowEvents: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: "preventivo-rapido",
          jobSource: "preventivo-rapido",
        };
        if (!isDND && eventDate) { jobData.eventDate = new Date(eventDate); }
        if (eventLocation) jobData.eventLocation = eventLocation.trim();
        if (rituLocation) jobData.rituLocation = rituLocation.trim();
        if (rituTime) jobData.rituTime = rituTime.trim();
        if (noteCliente) jobData.noteInterne = `[Nota cliente] ${noteCliente.trim()}`;
        const newJobRef = await db.collection("jobs").add(jobData);
        jobRef = newJobRef;
        jobId = newJobRef.id;
      }

      // Link cliente -> job
      await db.collection("clienti").doc(clienteId).update({
        "sourceRefs.jobIds": FieldValue.arrayUnion(jobId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 2b. Crea evento Google Calendar (se data disponibile)
    try {
      if (!isDND && eventDate) {
        const { createEvent } = await import("./google-calendar.js");
        const dateStr = new Date(eventDate).toISOString().split("T")[0];

        // NOTA: no attendees - Service Account non supporta invite senza Domain-Wide Delegation
        const calendarEvent = await createEvent("primary", {
          summary: `${template.jobType || "Shooting"}: ${nome} ${cognome} - ${nomeEvento}`,
          description: `Preventivo Rapido\n\nCliente: ${nome} ${cognome}\nEmail: ${email}\n${cellulare ? `Tel: ${cellulare}\n` : ""}Evento: ${nomeEvento}\n${eventLocation ? `Location: ${eventLocation}\n` : ""}${noteCliente ? `Note: ${noteCliente}` : ""}`,
          isAllDay: true,
          startDateStr: dateStr,
          location: eventLocation || rituLocation || "",
        });

        if (calendarEvent?.id) {
          await jobRef.update({
            googleCalendarEventId: calendarEvent.id,
            updatedAt: FieldValue.serverTimestamp(),
          });
          console.log(`✅ Evento Google Calendar creato per preventivo rapido: ${calendarEvent.id}`);
        }
      }
    } catch (calendarError) {
      console.warn("⚠️ Evento Google Calendar non creato per preventivo rapido:", calendarError);
    }

    // 3. Crea Quote dal template
    const products = template.defaultProducts || [];
    const quoteProducts = products.map((p: any) => {
      const result: any = {
        ...p,
        selectable: template.type === "variabile",
      };
      if (template.type === "variabile") {
        result.selected = selectedProducts?.includes(p.productId || p.nome) || false;
      }
      return result;
    });

    let subtotale = 0;
    if (template.type === "variabile") {
      quoteProducts.forEach((p: any) => {
        if (p.selected) subtotale += p.prezzo || 0;
      });
    } else {
      quoteProducts.forEach((p: any) => {
        subtotale += p.prezzo || 0;
      });
    }

    const discountType = template.discountType;
    const discountValue = template.discountValue;
    let totalBeforeDiscount = subtotale;
    let totalAfterDiscount = subtotale;
    let discountAmount = 0;

    if (discountType && discountValue && discountValue > 0) {
      if (discountType === "percent") {
        discountAmount = Math.round(subtotale * (discountValue / 100) * 100) / 100;
      } else {
        discountAmount = Math.min(discountValue, subtotale);
      }
      totalAfterDiscount = Math.max(0, subtotale - discountAmount);
    }

    const clausesWithIds = (template.defaultClauses || []).map((c: any) => ({
      ...c,
      id: nanoid(),
      accepted: clausesAccepted?.includes(c.text) || false,
      ...(clausesAccepted?.includes(c.text)
        ? { acceptedAt: nowRomeDate() }
        : {}),
    }));

    const quoteToken = nanoid(32);
    const quoteData: Record<string, any> = {
      jobId,
      clienteId,
      type: template.type,
      products: quoteProducts,
      contractClauses: clausesWithIds,
      theme: template.theme || {},
      totaleBase: totalBeforeDiscount,
      totalBeforeDiscount,
      totalAfterDiscount,
      discountType: discountType || null,
      discountValue: discountValue || null,
      discountAmount,
      publicToken: quoteToken,
      status: "inviato",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "preventivo-rapido",
      revokedTokens: [],
      auditLog: [
        {
          id: nanoid(),
          quoteId: "",
          timestamp: nowRomeDate(),
          adminEmail: "preventivo-rapido",
          action: "quote_created",
          newValue: "inviato",
          reason: "Creato da Preventivo Rapido",
        },
      ],
    };

    // Se il cliente ha firmato (signerName presente), segna come firmato
    if (signerName && signerName.trim()) {
      const allRequired = clausesWithIds
        .filter((c: any) => c.required)
        .every((c: any) => c.accepted);

      if (allRequired) {
        quoteData.status = "firmato";
        quoteData.signature = {
          signedAt: nowRomeDate(),
          ipAddress: req.ip || "unknown",
          userAgent: req.headers["user-agent"] || "unknown",
          clientName: signerName.trim(),
        };
        quoteData.totaleSelezionato = totalAfterDiscount;

        // Aggiorna job financials
        await jobRef.update({
          "financials.totalePreventivato": totalAfterDiscount,
          status: "confermato",
          updatedAt: FieldValue.serverTimestamp(),
        });
      }
    }

    // Cerca quote preesistente per questo job (creata da save-draft come "inviato")
    // Il cliente potrebbe averla già aperta → status "visionato", oppure è ancora "inviato"
    let quoteId: string;
    const existingQuoteSnap = await db.collection("quotes")
      .where("jobId", "==", jobId)
      .where("createdBy", "==", "preventivo-rapido")
      .limit(5)
      .get();
    const existingQuoteDoc = existingQuoteSnap.docs.find(d => {
      const s = d.data().status;
      return s === "inviato" || s === "visionato" || s === "bozza";
    }) || null;

    if (existingQuoteDoc) {
      // ✅ Aggiorna la quote esistente invece di crearne una nuova
      const bozzaDoc = existingQuoteDoc;
      quoteId = bozzaDoc.id;
      await bozzaDoc.ref.update({
        ...quoteData,
        auditLog: FieldValue.arrayUnion({
          id: nanoid(),
          quoteId: bozzaDoc.id,
          timestamp: nowRomeDate(),
          adminEmail: "preventivo-rapido",
          action: "quote_updated",
          newValue: quoteData.status,
          reason: "Preventivo attivato dal cliente",
        }),
      });
      // Assicura che il job abbia il quoteId (già dovrebbe averlo)
      await jobRef.update({
        quoteIds: FieldValue.arrayUnion(quoteId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      // Fallback: crea nuova quote se non esiste bozza
      const quoteRef = await db.collection("quotes").add(quoteData);
      quoteId = quoteRef.id;
      await jobRef.update({
        quoteIds: FieldValue.arrayUnion(quoteId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // Aggiorna job financials con totale preventivato
    if (quoteData.status !== "firmato") {
      await jobRef.update({
        "financials.totalePreventivato": totalAfterDiscount,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    // 4. Invia email di notifica
    try {
      const studioInfo = await getStudioContactInfo();
      const baseUrl = process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : process.env.REPL_SLUG
          ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
          : "https://imagestudiofotografico.com";

      if (quoteData.status === "firmato") {
        // CASO FIRMATO: Email professionale al cliente + admin
        const portalLink = `${baseUrl}/portale-cliente/${quoteToken}`;

        // Email al cliente
        if (email) {
          try {
            const clientEmailHtml = createQuoteSignedEmailHTML(
              `${nome} ${cognome}`,
              template.type || "fisso",
              nomeEvento,
              totalAfterDiscount,
              nowRomeDate(),
              portalLink,
              undefined,
              undefined,
              studioInfo || undefined
            );
            await sendGmailEmail(
              email,
              `Contratto Firmato - ${nomeEvento}`,
              clientEmailHtml,
              undefined,
              {
                type: "quote_signed_client",
                relatedDocId: quoteId,
                relatedDocType: "quote",
                clientName: `${nome} ${cognome}`,
              }
            );
            console.log(`✅ Email conferma firma inviata al cliente: ${email}`);
          } catch (clientEmailError) {
            console.warn("⚠️ Email conferma firma al cliente non inviata:", clientEmailError);
          }
        }

        // Email admin con template professionale
        if (studioInfo?.email) {
          try {
            const adminEmailHtml = createAdminQuoteSignedNotificationHTML(
              `${nome} ${cognome}`,
              (template.type || "fisso") as "fisso" | "variabile",
              nomeEvento,
              totalAfterDiscount,
              nowRomeDate(),
              `${baseUrl}/admin/dashboard?tab=lavori&job=${jobId}`,
              studioInfo || undefined
            );
            await sendGmailEmail(
              studioInfo.email,
              `Preventivo Rapido Firmato: ${nomeEvento} - ${nome} ${cognome}`,
              adminEmailHtml,
              undefined,
              {
                type: "quick_quote_signed_admin",
                relatedDocId: quoteId,
                relatedDocType: "quote",
                clientName: `${nome} ${cognome}`,
              }
            );
            console.log(`✅ Email notifica firma inviata all'admin`);
          } catch (adminEmailError) {
            console.warn("⚠️ Email notifica admin non inviata:", adminEmailError);
          }
        }
      } else {
        // CASO NON FIRMATO (inviato): Solo notifica admin
        // L'email riepilogo al cliente è già inviata in save-draft, quando vede l'anteprima
        if (studioInfo?.email) {
          try {
            const eventDateFormatted = eventDate
              ? new Date(eventDate).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
              : "Data non definita";
            const adminEmailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #fff8f0; border-left: 4px solid #e65100; padding: 16px; border-radius: 4px; margin-bottom: 24px;">
                  <h2 style="color: #e65100; margin: 0 0 8px;">Nuovo cliente dal form online</h2>
                  <p style="margin: 0; color: #555;">Ha compilato il preventivo rapido "<strong>${template.nome}</strong>" e non ha ancora firmato.</p>
                </div>
                <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                  <tr style="background:#f9f9f9"><td style="padding: 10px 12px; font-weight: bold; width: 140px; color: #555;">Cliente</td><td style="padding: 10px 12px; font-size: 16px; font-weight: 600;">${nome} ${cognome}</td></tr>
                  <tr><td style="padding: 10px 12px; font-weight: bold; color: #555;">Email</td><td style="padding: 10px 12px;"><a href="mailto:${email}" style="color:#e65100">${email}</a></td></tr>
                  <tr style="background:#f9f9f9"><td style="padding: 10px 12px; font-weight: bold; color: #555;">Telefono</td><td style="padding: 10px 12px;">${cellulare || "Non fornito"}</td></tr>
                  <tr><td style="padding: 10px 12px; font-weight: bold; color: #555;">Evento</td><td style="padding: 10px 12px;">${nomeEvento}</td></tr>
                  <tr style="background:#f9f9f9"><td style="padding: 10px 12px; font-weight: bold; color: #555;">Data evento</td><td style="padding: 10px 12px;">${eventDateFormatted}</td></tr>
                  ${eventLocation ? `<tr><td style="padding: 10px 12px; font-weight: bold; color: #555;">Location</td><td style="padding: 10px 12px;">${eventLocation}</td></tr>` : ""}
                  <tr style="background:#f9f9f9"><td style="padding: 10px 12px; font-weight: bold; color: #555;">Totale stimato</td><td style="padding: 10px 12px; font-size: 16px; font-weight: 700; color: #e65100;">€${totalAfterDiscount.toFixed(2)}</td></tr>
                </table>
                ${noteCliente ? `<div style="background:#f5f5f5; padding: 12px; border-radius: 4px; margin-bottom: 20px;"><strong>Note cliente:</strong><br>${noteCliente}</div>` : ""}
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${baseUrl}/admin/dashboard?tab=lavori&job=${jobId}" style="display: inline-block; background: #e65100; color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    Apri il lavoro nel CRM →
                  </a>
                </div>
                <p style="color: #999; font-size: 12px; text-align: center;">Cliente e lavoro già registrati nel database. Il preventivo attende firma.</p>
              </div>
            `;
            await sendGmailEmail(
              studioInfo.email,
              `Nuovo cliente online: ${nome} ${cognome} — ${nomeEvento}`,
              adminEmailHtml,
              undefined,
              {
                type: "quick_quote_created_admin",
                relatedDocId: quoteId,
                relatedDocType: "quote",
                clientName: `${nome} ${cognome}`,
              }
            );
            console.log(`✅ Email notifica admin inviata per nuovo preventivo rapido`);
          } catch (adminEmailError) {
            console.warn("⚠️ Email notifica admin non inviata:", adminEmailError);
          }
        }
      }
    } catch (emailError) {
      console.warn("⚠️ Errore generale invio email:", emailError);
    }

    // 5. Salva notifica in Firestore per il NotificationBell admin
    try {
      await db.collection("adminNotifications").add({
        type: quoteData.status === "firmato" ? "quick_quote_signed" : "quick_quote_created",
        title: quoteData.status === "firmato"
          ? `Preventivo Rapido FIRMATO`
          : `Nuovo Preventivo Rapido`,
        description: `${nome} ${cognome} - ${nomeEvento} (€${totalAfterDiscount.toFixed(2)})`,
        clientName: `${nome} ${cognome}`,
        jobId,
        quoteId,
        isRead: false,
        createdAt: FieldValue.serverTimestamp(),
        deepLink: `/admin/dashboard?tab=lavori&job=${jobId}`,
      });
    } catch (notifError) {
      console.warn("⚠️ Notifica admin non salvata:", notifError);
    }

    // Segna la submission come "processed"
    if (submissionRef) {
      submissionRef.update({
        status: "processed",
        processedAt: FieldValue.serverTimestamp(),
        jobId,
        clienteId,
        quoteId,
      }).catch((e: unknown) => console.warn("⚠️ Update submission processed fallita:", e));
    }

    return res.json({
      success: true,
      data: {
        clienteId,
        jobId,
        quoteId,
        quoteToken,
        status: quoteData.status,
      },
    });
  } catch (error) {
    console.error("❌ Errore activate quick quote:", error);

    // Rete di sicurezza: prova a inviare email di emergenza all'admin con i dati grezzi
    // così anche se il server è crashato Gennaro riceve i dati del cliente
    try {
      const { nome, cognome, email, cellulare, nomeEvento, eventDate, eventLocation, noteCliente } = req.body;
      if (nome && cognome && email) {
        const studioEmail = "gennaro.mazzacane@gmail.com";
        await sendGmailEmail(
          studioEmail,
          `⚠️ DATI NON SALVATI - Preventivo Rapido da ${nome} ${cognome}`,
          `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
              <div style="background:#fef2f2;border:2px solid #ef4444;border-radius:8px;padding:16px;margin-bottom:20px;">
                <h2 style="color:#dc2626;margin:0 0 8px">⚠️ Compilazione non salvata</h2>
                <p style="margin:0;color:#7f1d1d">Un cliente ha compilato il form Preventivo Rapido ma si è verificato un errore nel salvataggio.<br>
                <strong>I dati sono stati recuperati e sono riportati sotto — inserisci manualmente il lavoro.</strong></p>
              </div>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280;width:140px">Nome</td><td style="padding:8px;border-bottom:1px solid #e5e7eb;font-weight:600">${nome} ${cognome}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Email</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${email}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Telefono</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${cellulare || "—"}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Evento</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${nomeEvento || "—"}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Data evento</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${eventDate || "non definita"}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #e5e7eb;color:#6b7280">Location</td><td style="padding:8px;border-bottom:1px solid #e5e7eb">${eventLocation || "—"}</td></tr>
                <tr><td style="padding:8px;color:#6b7280">Note</td><td style="padding:8px">${noteCliente || "—"}</td></tr>
              </table>
              <p style="margin-top:20px;color:#6b7280;font-size:12px">Errore tecnico: ${error instanceof Error ? error.message : "Errore sconosciuto"}</p>
            </div>
          `
        );
        console.log(`📧 Email di emergenza inviata per submission fallita di ${nome} ${cognome}`);
      }
    } catch (emailErr) {
      console.error("❌ Anche l'email di emergenza è fallita:", emailErr);
    }

    return res.status(500).json({
      error: "Errore server",
      message: error instanceof Error ? error.message : "Errore sconosciuto",
    });
  }
});

// ─── OTP Store in-memory ────────────────────────────────────────────────────
// key: `${token}:${normalizedEmail}` — value: { code, expiresAt, attempts }
const otpStore = new Map<string, { code: string; expiresAt: number; attempts: number }>();

// Pulizia automatica ogni 15 minuti per evitare memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore.entries()) {
    if (val.expiresAt < now) otpStore.delete(key);
  }
}, 15 * 60 * 1000);

/**
 * POST /api/quotes/quick/:token/send-otp
 * Genera un codice OTP a 6 cifre, lo invia via email e lo memorizza in-memory (TTL 10 min).
 * Pubblico (no auth).
 */
router.post("/quick/:token/send-otp", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { email, nome } = req.body as { email?: string; nome?: string };

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Email non valida" });
    }

    // Verifica che il template esista e sia attivo
    const templateSnapshot = await db.collection("quoteTemplates")
      .where("shareableToken", "==", token)
      .where("attivo", "==", true)
      .limit(1)
      .get();
    if (templateSnapshot.empty) {
      return res.status(404).json({ error: "Link non valido o scaduto" });
    }

    const normalizedEmail = normalizeEmail(email);
    const otpKey = `${token}:${normalizedEmail}`;
    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 cifre
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minuti

    otpStore.set(otpKey, { code, expiresAt, attempts: 0 });

    // Carica info studio per branding email
    const studioInfo = await getStudioContactInfo();
    const studioName = studioInfo?.studioName || "Image Studio";

    const html = `
<!DOCTYPE html>
<html lang="it">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
        <tr><td style="background:#6b7f6b;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:normal;letter-spacing:1px;">${studioName}</h1>
        </td></tr>
        <tr><td style="padding:40px 32px;text-align:center;">
          <p style="margin:0 0 8px;color:#555;font-size:15px;">Ciao ${nome || ""}! Ecco il tuo codice di verifica:</p>
          <div style="margin:28px auto;display:inline-block;background:#f5f0e8;border:2px dashed #6b7f6b;border-radius:12px;padding:20px 40px;">
            <span style="font-size:40px;font-weight:bold;letter-spacing:10px;color:#3d4f3d;">${code}</span>
          </div>
          <p style="margin:12px 0 0;color:#6b7f6b;font-size:13px;font-weight:600;">📋 Tieni premuto il codice per copiarlo, poi incollalo nella pagina con il pulsante "Incolla".</p>
          <p style="margin:12px 0 0;color:#888;font-size:13px;">Il codice è valido per <strong>10 minuti</strong>.</p>
          <p style="margin:8px 0 0;color:#aaa;font-size:12px;">Se non hai richiesto tu questo codice, ignora questa email.</p>
        </td></tr>
        <tr><td style="background:#f9f6f1;padding:20px 32px;text-align:center;">
          <p style="margin:0;color:#aaa;font-size:11px;">${studioName} · Verifica identità preventivo</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await sendGmailEmail(
      [email],
      `${code} - Codice di verifica ${studioName}`,
      html
    );

    console.log(`✅ OTP inviato a ${email} (token=${token})`);
    return res.json({ success: true, message: "Codice inviato" });
  } catch (error) {
    console.error("❌ Errore send-otp:", error);
    return res.status(500).json({ error: "Impossibile inviare l'email. Riprova tra qualche secondo." });
  }
});

/**
 * POST /api/quotes/quick/:token/verify-otp
 * Verifica il codice OTP inserito dal cliente.
 * Max 3 tentativi errati → codice invalidato.
 * Pubblico (no auth).
 */
router.post("/quick/:token/verify-otp", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { email, code } = req.body as { email?: string; code?: string };

    if (!email || !code) {
      return res.status(400).json({ error: "Email e codice sono obbligatori" });
    }

    const normalizedEmail = normalizeEmail(email);
    const otpKey = `${token}:${normalizedEmail}`;
    const record = otpStore.get(otpKey);

    if (!record) {
      return res.status(400).json({ error: "Codice scaduto o non trovato. Richiedine uno nuovo." });
    }
    if (Date.now() > record.expiresAt) {
      otpStore.delete(otpKey);
      return res.status(400).json({ error: "Il codice è scaduto. Richiedine uno nuovo." });
    }
    if (record.attempts >= 3) {
      otpStore.delete(otpKey);
      return res.status(400).json({ error: "Troppi tentativi errati. Richiedine uno nuovo." });
    }

    if (code.trim() !== record.code) {
      record.attempts += 1;
      const rimanenti = 3 - record.attempts;
      return res.status(400).json({
        error: rimanenti > 0
          ? `Codice errato. ${rimanenti} ${rimanenti === 1 ? 'tentativo rimasto' : 'tentativi rimasti'}.`
          : "Codice errato. Nessun tentativo rimasto.",
        attemptsLeft: rimanenti,
      });
    }

    // ✅ Codice corretto — elimina dall'OTP store e restituisci token di verifica
    otpStore.delete(otpKey);
    console.log(`✅ OTP verificato per ${email} (token=${token})`);
    return res.json({ success: true, verified: true });
  } catch (error) {
    console.error("❌ Errore verify-otp:", error);
    return res.status(500).json({ error: "Errore server. Riprova." });
  }
});

/**
 * POST /api/quotes/quick/:token/save-draft
 * Salva bozza (cliente + job lead) quando il cliente raggiunge la preview.
 * NON crea il preventivo (quello avviene al confirm).
 * Idempotente: se il cliente esiste già per email, aggiorna; se il job esiste già (existingJobId) non ne crea uno nuovo.
 * Pubblico (no auth).
 */
router.post("/quick/:token/save-draft", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const {
      nome, cognome, email, cellulare,
      nomeEvento, eventDate, eventLocation, rituLocation, rituTime,
      dataNonDefinita, noteCliente,
      existingJobId,
    } = req.body;

    if (!nome || !cognome || !email || !nomeEvento) {
      return res.status(400).json({ error: "Dati mancanti", message: "Nome, cognome, email e nome evento sono obbligatori." });
    }

    // Verifica template valido
    const templatesSnapshot = await db.collection("quoteTemplates")
      .where("shareableToken", "==", token)
      .where("attivo", "==", true)
      .limit(1)
      .get();

    if (templatesSnapshot.empty) {
      return res.status(404).json({ error: "Template non trovato" });
    }

    const template = templatesSnapshot.docs[0].data();

    // Se il job esiste già (chiamata ripetuta), restituisci gli ID esistenti
    if (existingJobId) {
      const existingJob = await db.collection("jobs").doc(existingJobId).get();
      if (existingJob.exists) {
        const jobData = existingJob.data()!;
        const clienteId = jobData.clientiIds?.[0] || null;
        return res.json({ success: true, jobId: existingJobId, clienteId, isExisting: true });
      }
    }

    // 1. Cerca cliente esistente per email, altrimenti crea nuovo
    let clienteId: string;
    const existingClientSnapshot = await db.collection("clienti")
      .where("email", "==", normalizeEmail(email))
      .limit(1)
      .get();

    if (!existingClientSnapshot.empty) {
      clienteId = existingClientSnapshot.docs[0].id;
      await db.collection("clienti").doc(clienteId).update({ updatedAt: FieldValue.serverTimestamp() });
    } else {
      const clienteRef = await db.collection("clienti").add({
        nome: nome.trim(),
        cognome: cognome.trim(),
        email: normalizeEmail(email),
        cellulare1: cellulare?.trim() || "",
        tags: ["preventivo-rapido"],
        sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], jobIds: [] },
        lifecycle: { firstContactAt: FieldValue.serverTimestamp(), lastInteractionAt: FieldValue.serverTimestamp(), status: "lead" },
        financials: { totalRevenue: 0, outstandingBalance: 0, totalOrders: 0 },
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      clienteId = clienteRef.id;
    }

    // 2. Cerca job lead preesistente per stesso cliente + stesso template (deduplicazione)
    // Evita la proliferazione di job lead quando il cliente compila più volte o viene ricreato dall'admin
    // Query semplice (array-contains + una equality) per evitare indici compositi mancanti;
    // il filtro su status/jobType avviene in memoria.
    const candidateLeadSnapshot = await db.collection("jobs")
      .where("clientiIds", "array-contains", clienteId)
      .where("provenance", "==", "preventivo-rapido")
      .limit(20)
      .get();

    const existingLead = candidateLeadSnapshot.docs.find(doc => {
      const d = doc.data();
      return d.status === "lead" && d.jobType === template.jobType;
    }) || null;

    const isDND = dataNonDefinita === true;

    // Calcola totali dal template (usati sia per la bozza quote che per l'email)
    const templateDocId = templatesSnapshot.docs[0].id;
    const draftProducts = (template.defaultProducts || []).map((p: any) => ({
      ...p, selectable: template.type === "variabile",
    }));
    let draftSubtotale = 0;
    draftProducts.forEach((p: any) => { draftSubtotale += p.prezzo || 0; });
    const draftDiscountType = template.discountType;
    const draftDiscountValue = template.discountValue;
    let draftDiscountAmount = 0;
    let draftTotalAfterDiscount = draftSubtotale;
    if (draftDiscountType && draftDiscountValue && draftDiscountValue > 0) {
      draftDiscountAmount = draftDiscountType === "percent"
        ? Math.round(draftSubtotale * (draftDiscountValue / 100) * 100) / 100
        : Math.min(draftDiscountValue, draftSubtotale);
      draftTotalAfterDiscount = Math.max(0, draftSubtotale - draftDiscountAmount);
    }

    // Helper: crea quote "inviato" dal template — visibile nell'admin e accessibile dal portale cliente
    const createInitialQuote = async (jobId: string, clienteId: string): Promise<{ quoteId: string; publicToken: string }> => {
      const clausesWithIds = (template.defaultClauses || []).map((c: any) => ({ ...c, id: nanoid(), accepted: false }));
      const initialPublicToken = nanoid(32);
      const quoteRef = await db.collection("quotes").add({
        jobId, clienteId,
        type: template.type,
        products: draftProducts,
        contractClauses: clausesWithIds,
        theme: template.theme || {},
        totaleBase: draftSubtotale,
        totalBeforeDiscount: draftSubtotale,
        totalAfterDiscount: draftTotalAfterDiscount,
        discountType: draftDiscountType || null,
        discountValue: draftDiscountValue || null,
        discountAmount: draftDiscountAmount,
        publicToken: initialPublicToken,
        status: "inviato",
        templateId: templateDocId,
        templateName: template.nome || "",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "preventivo-rapido",
        revokedTokens: [],
        auditLog: [{ id: nanoid(), quoteId: "", timestamp: nowRomeDate(), adminEmail: "preventivo-rapido", action: "quote_created", newValue: "inviato", reason: "Creato da Preventivo Rapido" }],
      });
      await db.collection("jobs").doc(jobId).update({
        quoteIds: FieldValue.arrayUnion(quoteRef.id),
        "financials.totalePreventivato": draftTotalAfterDiscount,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { quoteId: quoteRef.id, publicToken: initialPublicToken };
    };

    // Helper: invia email con link al portale preventivo (non bloccante)
    const sendPortalLinkEmail = async (publicToken: string) => {
      if (!email) return;
      try {
        const studioInfo = await getStudioContactInfo();
        const studioNome = studioInfo?.nome || "Image Studio";
        const studioEmailAddr = studioInfo?.email || "";
        const studioTel = studioInfo?.telefono || "";
        const baseUrl = process.env.REPLIT_DOMAINS
          ? `https://${process.env.REPLIT_DOMAINS.split(",")[0]}`
          : "http://localhost:5000";
        const portalLink = `${baseUrl}/quote/${publicToken}`;
        const eventDateFormatted = eventDate
          ? new Date(eventDate).toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" })
          : "Da definire";
        const isVariabile = template.type === "variabile";
        const html = `
          <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; background: #fff; border: 1px solid #e8e0d4;">
            <div style="background: #2d3b2d; padding: 32px; text-align: center;">
              <h1 style="color: #f5f0e8; margin: 0; font-size: 24px; letter-spacing: 2px;">${studioNome.toUpperCase()}</h1>
              <p style="color: #b8c9b0; margin: 8px 0 0; font-size: 13px; letter-spacing: 1px;">IL TUO PREVENTIVO PERSONALIZZATO</p>
            </div>
            <div style="padding: 32px 40px;">
              <p style="color: #555; font-size: 16px; margin: 0 0 8px;">Caro/a <strong>${nome} ${cognome}</strong>,</p>
              <p style="color: #777; font-size: 14px; line-height: 1.7; margin: 0 0 24px;">
                Grazie per aver compilato il nostro preventivo online per <strong>${nomeEvento}</strong>
                ${eventDate ? ` del <strong>${eventDateFormatted}</strong>` : ""}.
                Il tuo preventivo personalizzato è pronto.
              </p>
              ${isVariabile ? `
              <div style="background: #f9f5f0; border-left: 3px solid #c4724a; padding: 14px 18px; border-radius: 4px; margin-bottom: 24px;">
                <p style="margin: 0; font-size: 13px; color: #666; line-height: 1.6;">
                  <strong style="color: #c4724a;">Preventivo personalizzabile:</strong> puoi aprire il preventivo, aggiungere o rimuovere servizi,
                  e vedere come cambia il totale in tempo reale — prima di firmare.
                </p>
              </div>` : ""}
              <div style="text-align: center; margin: 32px 0;">
                <a href="${portalLink}" style="display: inline-block; background: #2d3b2d; color: #f5f0e8; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; letter-spacing: 0.5px;">
                  Visualizza il tuo preventivo →
                </a>
              </div>
              <p style="color: #999; font-size: 12px; text-align: center; margin: 0 0 24px;">
                Puoi aprire questo link in qualsiasi momento — rimarrà sempre disponibile.
              </p>
              <p style="color: #777; font-size: 13px; line-height: 1.6; margin: 0;">
                Siamo a tua disposizione per qualsiasi domanda o per perfezionare i dettagli insieme.
                ${studioTel ? `Puoi contattarci al <strong>${studioTel}</strong>.` : ""}
              </p>
            </div>
            <div style="background:#f5f0e8; padding:20px 40px; text-align:center; border-top:1px solid #e8e0d4;">
              <p style="margin:0; color:#888; font-size:12px;">${studioNome}${studioEmailAddr ? ` · <a href="mailto:${studioEmailAddr}" style="color:#c4724a;">${studioEmailAddr}</a>` : ""}</p>
            </div>
          </div>`;
        await sendGmailEmail(
          email,
          `Il tuo preventivo - ${nomeEvento}`,
          html,
          undefined,
          { type: "quick_quote_link_client", relatedDocType: "quote", clientName: `${nome} ${cognome}` }
        );
        console.log(`✅ Email link portale preventivo inviata al cliente: ${email} → ${portalLink}`);
      } catch (err) {
        console.warn("⚠️ Email link portale al cliente non inviata:", err);
      }
    };

    if (existingLead) {
      // ✅ Job lead già esistente — aggiorna i dati invece di crearne uno nuovo
      const jobId = existingLead.id;
      const existingLeadData = existingLead.data();
      const updatePayload: Record<string, any> = {
        nomeEvento: nomeEvento.trim(),
        dataNonDefinita: isDND,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!isDND && eventDate) updatePayload.eventDate = new Date(eventDate);
      if (eventLocation) updatePayload.eventLocation = eventLocation.trim();
      if (rituLocation) updatePayload.rituLocation = rituLocation.trim();
      if (rituTime) updatePayload.rituTime = rituTime.trim();
      if (noteCliente) updatePayload.noteInterne = `[Nota cliente] ${noteCliente.trim()}`;
      await db.collection("jobs").doc(jobId).update(updatePayload);

      // Ottieni o crea la quote per recuperare il publicToken
      let portalToken: string;
      if (existingLeadData.quoteIds && existingLeadData.quoteIds.length > 0) {
        // Quote già esistente — recupera il token
        const existingQuoteDoc = await db.collection("quotes").doc(existingLeadData.quoteIds[0]).get();
        portalToken = existingQuoteDoc.data()?.publicToken || "";
      } else {
        // Crea nuova quote
        const { publicToken } = await createInitialQuote(jobId, clienteId);
        portalToken = publicToken;
      }
      // Invia sempre email con link al portale quando il cliente vede l'anteprima
      sendPortalLinkEmail(portalToken);
      console.log(`✅ Quick Quote save-draft: riusato job lead=${jobId} cliente=${clienteId} (${nome} ${cognome})`);
      return res.json({ success: true, jobId, clienteId, isExisting: true });
    }

    // 3. Crea Job lead nuovo
    const jobData: Record<string, any> = {
      nomeEvento: nomeEvento.trim(),
      clientiIds: [clienteId],
      jobType: template.jobType,
      dataNonDefinita: isDND,
      allDay: true,
      provenance: "preventivo-rapido",
      orderIds: [], galleryIds: [], quoteIds: [],
      status: "lead",
      financials: { totalePreventivato: 0, totaleOrdini: 0, totalePagato: 0, saldoResiduo: 0 },
      costi: [], pdfs: [], workflowEvents: [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdBy: "preventivo-rapido",
      jobSource: "preventivo-rapido",
    };

    if (!isDND && eventDate) jobData.eventDate = new Date(eventDate);
    if (eventLocation) jobData.eventLocation = eventLocation.trim();
    if (rituLocation) jobData.rituLocation = rituLocation.trim();
    if (rituTime) jobData.rituTime = rituTime.trim();
    if (noteCliente) jobData.noteInterne = `[Nota cliente] ${noteCliente.trim()}`;

    const jobRef = await db.collection("jobs").add(jobData);
    const jobId = jobRef.id;

    // Link cliente -> job
    await db.collection("clienti").doc(clienteId).update({
      "sourceRefs.jobIds": FieldValue.arrayUnion(jobId),
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Crea quote come "inviato" e invia email con link al portale interattivo
    const { publicToken: newPublicToken } = await createInitialQuote(jobId, clienteId);
    sendPortalLinkEmail(newPublicToken);

    console.log(`✅ Quick Quote save-draft: cliente=${clienteId} job=${jobId} (${nome} ${cognome} - ${nomeEvento})`);
    return res.json({ success: true, jobId, clienteId });
  } catch (error) {
    console.error("❌ Errore save-draft quick quote:", error);
    return res.status(500).json({ error: "Errore server", message: error instanceof Error ? error.message : "Errore sconosciuto" });
  }
});

/**
 * POST /api/quotes/quick/generate-token/:templateId
 * Genera shareableToken per un template (AUTH REQUIRED)
 */
router.post(
  "/quick/generate-token/:templateId",
  async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Non autorizzato" });
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await getAuth().verifyIdToken(idToken);
      if (!decodedToken) {
        return res.status(401).json({ error: "Token non valido" });
      }

      const { templateId } = req.params;
      const templateDoc = await db
        .collection("quoteTemplates")
        .doc(templateId)
        .get();

      if (!templateDoc.exists) {
        return res.status(404).json({ error: "Template non trovato" });
      }

      const templateData = templateDoc.data();
      if (templateData?.shareableToken) {
        return res.json({
          success: true,
          shareableToken: templateData.shareableToken,
        });
      }

      const shareableToken = nanoid(16);
      await db.collection("quoteTemplates").doc(templateId).update({
        shareableToken,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({
        success: true,
        shareableToken,
      });
    } catch (error) {
      console.error("❌ Errore generate shareable token:", error);
      return res.status(500).json({
        error: "Errore server",
        message:
          error instanceof Error ? error.message : "Errore sconosciuto",
      });
    }
  },
);

/**
 * POST /api/quotes/quick/:token/activate-admin
 * Crea job+preventivo direttamente dal pannello admin (bypass OTP).
 * Richiede auth admin. Non firma il preventivo — stato "inviato" pronto per compilazione.
 */
router.post(
  "/quick/:token/activate-admin",
  verifyAdminAuth,
  async (req: Request, res: Response) => {
    try {
      const { token } = req.params;
      const {
        nome, cognome, email, cellulare,
        nomeEvento, eventDate, dataNonDefinita,
        eventLocation,
      } = req.body;

      if (!nome || !cognome || !nomeEvento) {
        return res.status(400).json({ error: "Dati mancanti", message: "Nome, cognome e nome evento obbligatori." });
      }

      // 1. Verifica template
      const templatesSnap = await db.collection("quoteTemplates")
        .where("shareableToken", "==", token)
        .where("attivo", "==", true)
        .limit(1)
        .get();
      if (templatesSnap.empty) {
        return res.status(404).json({ error: "Template non trovato" });
      }
      const templateDoc = templatesSnap.docs[0];
      const template = templateDoc.data();

      // 2. Cerca/crea cliente
      let clienteId: string;
      const normalizedEmail = email ? normalizeEmail(email) : null;
      if (normalizedEmail) {
        const existingSnap = await db.collection("clienti").where("email", "==", normalizedEmail).limit(1).get();
        if (!existingSnap.empty) {
          clienteId = existingSnap.docs[0].id;
          await db.collection("clienti").doc(clienteId).update({ updatedAt: FieldValue.serverTimestamp() });
        } else {
          const ref = await db.collection("clienti").add({
            nome: nome.trim(), cognome: cognome.trim(),
            email: normalizedEmail,
            cellulare1: cellulare?.trim() || "",
            tags: ["preventivo-rapido"],
            sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], jobIds: [] },
            lifecycle: { firstContactAt: FieldValue.serverTimestamp(), lastInteractionAt: FieldValue.serverTimestamp(), status: "lead" },
            financials: { totalRevenue: 0, outstandingBalance: 0, totalOrders: 0 },
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          clienteId = ref.id;
        }
      } else {
        // Senza email: crea sempre nuovo cliente
        const ref = await db.collection("clienti").add({
          nome: nome.trim(), cognome: cognome.trim(),
          email: "",
          cellulare1: cellulare?.trim() || "",
          tags: ["preventivo-rapido"],
          sourceRefs: { bookingIds: [], orderIds: [], galleryIds: [], jobIds: [] },
          lifecycle: { firstContactAt: FieldValue.serverTimestamp(), lastInteractionAt: FieldValue.serverTimestamp(), status: "lead" },
          financials: { totalRevenue: 0, outstandingBalance: 0, totalOrders: 0 },
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        clienteId = ref.id;
      }

      // 3. Crea Job (con dedup: cerca lead preesistente stesso cliente+template)
      const isDND = dataNonDefinita === true;
      const candidateLeads = await db.collection("jobs")
        .where("clientiIds", "array-contains", clienteId)
        .where("provenance", "==", "preventivo-rapido")
        .limit(20)
        .get();
      const existingLead = candidateLeads.docs.find(d => {
        const data = d.data();
        return data.status === "lead" && data.jobType === template.jobType && (!data.quoteIds || data.quoteIds.length === 0);
      }) || null;

      let jobId: string;
      let jobRef: FirebaseFirestore.DocumentReference;

      if (existingLead) {
        jobId = existingLead.id;
        jobRef = db.collection("jobs").doc(jobId);
        await jobRef.update({ nomeEvento: nomeEvento.trim(), updatedAt: FieldValue.serverTimestamp() });
        console.log(`✅ activate-admin: riuso job lead=${jobId}`);
      } else {
        const jobData: Record<string, any> = {
          nomeEvento: nomeEvento.trim(),
          clientiIds: [clienteId],
          jobType: template.jobType,
          dataNonDefinita: isDND,
          allDay: true,
          provenance: "preventivo-rapido",
          orderIds: [], galleryIds: [], quoteIds: [],
          status: "lead",
          financials: { totalePreventivato: 0, totaleOrdini: 0, totalePagato: 0, saldoResiduo: 0 },
          costi: [], pdfs: [], workflowEvents: [],
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          createdBy: "preventivo-rapido",
          jobSource: "preventivo-rapido",
        };
        if (!isDND && eventDate) jobData.eventDate = new Date(eventDate);
        if (eventLocation) jobData.eventLocation = eventLocation.trim();
        const newRef = await db.collection("jobs").add(jobData);
        jobRef = newRef;
        jobId = newRef.id;
        await db.collection("clienti").doc(clienteId).update({
          "sourceRefs.jobIds": FieldValue.arrayUnion(jobId),
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      // 4. Crea Quote dal template (stato "inviato", non firmato)
      const products = (template.defaultProducts || []).map((p: any) => ({
        ...p,
        selectable: template.type === "variabile",
      }));
      let subtotale = 0;
      products.forEach((p: any) => { subtotale += p.prezzo || 0; });

      const discountType = template.discountType;
      const discountValue = template.discountValue;
      let discountAmount = 0;
      let totalAfterDiscount = subtotale;
      if (discountType && discountValue && discountValue > 0) {
        discountAmount = discountType === "percent"
          ? Math.round(subtotale * (discountValue / 100) * 100) / 100
          : Math.min(discountValue, subtotale);
        totalAfterDiscount = Math.max(0, subtotale - discountAmount);
      }

      const clausesWithIds = (template.defaultClauses || []).map((c: any) => ({
        ...c, id: nanoid(), accepted: false,
      }));

      const quoteToken = nanoid(32);
      const quoteRef = await db.collection("quotes").add({
        jobId,
        clienteId,
        type: template.type,
        products,
        contractClauses: clausesWithIds,
        theme: template.theme || {},
        totaleBase: subtotale,
        totalBeforeDiscount: subtotale,
        totalAfterDiscount,
        discountType: discountType || null,
        discountValue: discountValue || null,
        discountAmount,
        publicToken: quoteToken,
        status: "inviato",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        createdBy: "admin-studio",
        templateId: templateDoc.id,
        templateName: template.nome || "",
        revokedTokens: [],
        auditLog: [{
          id: nanoid(),
          quoteId: "",
          timestamp: nowRomeDate(),
          adminEmail: "admin-studio",
          action: "quote_created",
          newValue: "inviato",
          reason: "Compilazione in studio (admin)",
        }],
      });

      // Collega quote al job
      await jobRef.update({
        quoteIds: FieldValue.arrayUnion(quoteRef.id),
        "financials.totalePreventivato": totalAfterDiscount,
        updatedAt: FieldValue.serverTimestamp(),
      });

      console.log(`✅ activate-admin: job=${jobId} quote=${quoteRef.id} cliente=${clienteId}`);
      return res.json({ success: true, jobId, quoteId: quoteRef.id, clienteId });
    } catch (error) {
      console.error("❌ Errore activate-admin:", error);
      return res.status(500).json({ error: "Errore server", message: error instanceof Error ? error.message : "Errore sconosciuto" });
    }
  }
);

/**
 * GET /api/quotes/health
 * Health check per quote API
 */
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "quote-api",
    timestamp: new Date().toISOString(),
  });
});

export default router;
