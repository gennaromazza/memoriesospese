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
  createQuoteSentEmailHTML, // Importato il nuovo template
} from "./email-routes.js";
import { nanoid } from "nanoid";

const router = Router();

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
      timestamp: new Date(),
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
      // Token non trovato come publicToken attivo, verifica se è revocato
      const allQuotesSnapshot = await db.collection("quotes").get();
      let isRevoked = false;

      for (const doc of allQuotesSnapshot.docs) {
        const data = doc.data();
        if (data.revokedTokens && Array.isArray(data.revokedTokens)) {
          const revoked = data.revokedTokens.find(
            (rt: any) => rt.token === token,
          );
          if (revoked) {
            isRevoked = true;
            break;
          }
        }
      }

      if (isRevoked) {
        return res.status(410).json({
          error: "Link revocato",
          message:
            "Questo link è stato revocato. Richiedi un nuovo link aggiornato.",
        });
      }

      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il link non è valido o è scaduto",
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
          error: "Link scaduto",
          message: "Questo preventivo è scaduto",
        });
      }
    }

    // 3. Update viewedAt se prima visualizzazione (solo per status 'inviato')
    if (quote.status === "inviato" && !quote.viewedAt) {
      try {
        await db.collection("quotes").doc(quote.id).update({
          status: "visionato",
          viewedAt: new Date(),
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
      clientiInfo = quote.clientiInfo.map((c) => ({
        id: c.id,
        nome: c.nome,
        cognome: c.cognome,
        email: c.email,
        telefono: c.telefono,
        indirizzo: c.indirizzo,
        citta: c.citta,
        cap: c.cap,
      }));
    } else {
      // Fallback: fetch da Firestore se quote non ha clientiInfo (backward compatibility)
      // Prima recupera clientiIds dal job
      let clientIds: string[] = [];
      if (quote.jobId) {
        const jobDoc = await db.collection("jobs").doc(quote.jobId).get();
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
            };
          });
      }
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
      // Token non trovato come publicToken attivo, verifica se è revocato
      const allQuotesSnapshot = await db.collection("quotes").get();
      let isRevoked = false;

      for (const doc of allQuotesSnapshot.docs) {
        const data = doc.data();
        if (data.revokedTokens && Array.isArray(data.revokedTokens)) {
          const revoked = data.revokedTokens.find(
            (rt: any) => rt.token === token,
          );
          if (revoked) {
            isRevoked = true;
            break;
          }
        }
      }

      if (isRevoked) {
        return res.status(410).json({
          error: "Link revocato",
          message:
            "Questo link è stato revocato. Richiedi un nuovo link aggiornato.",
        });
      }

      return res.status(404).json({
        error: "Preventivo non trovato",
        message: "Il link non è valido o è scaduto",
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
      const now = new Date();
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

      if (clientName) {
        normalizedSignature = {
          clientName,
          signedAt: serializeTimestamp(sig.signedAt),
          imageUrl: sig.imageUrl || sig.firmaUrl || null,
        };
      }
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
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminEmail = req.headers["x-admin-email"] as string;
    const forceDelete = req.query.forceDelete === "true";

    // 1. Admin-only check
    if (!adminEmail || adminEmail !== "gennaro.mazzacane@gmail.com") {
      return res.status(403).json({
        error: "Accesso negato",
        message: "Solo gli amministratori possono eliminare preventivi",
      });
    }

    // 2. Pre-fetch legacy schedules for quotes without paymentScheduleIds
    //    NOTE: Query MUST be OUTSIDE transaction (Firestore limitation)
    const legacyQuery = db
      .collection("paymentSchedules")
      .where("quoteId", "==", id);
    const legacySnapshot = await legacyQuery.get();
    const legacyScheduleRefs = legacySnapshot.docs.map((doc) => doc.ref);

    // 3. Firestore transaction per atomicità (usando paymentScheduleIds se disponibili)
    await db.runTransaction(async (transaction) => {
      const quoteRef = db.collection("quotes").doc(id);
      const quoteDoc = await transaction.get(quoteRef);

      if (!quoteDoc.exists) {
        throw new Error("Preventivo non trovato");
      }

      const quote = { id: quoteDoc.id, ...quoteDoc.data() } as Quote;

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
        const currentTotale = jobData.financials?.totalePreventivato || 0;
        const quoteTotale = quote.totaleBase || 0;
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
router.patch("/:id/reset-signature", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminEmail = req.headers["x-admin-email"] as string;

    // 1. Validate admin
    if (!adminEmail || adminEmail !== "gennaro.mazzacane@gmail.com") {
      return res.status(403).json({
        error: "Non autorizzato",
        message: "Solo gli admin possono reimpostare le firme",
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
    await db
      .collection("quotes")
      .doc(quoteId)
      .update({
        sentAt: new Date(),
        sentTo: recipientEmails.join(", "), // Salva tutte le email
        emailSentAt: new Date(), // Traccia invio manuale email
        status: "inviato",
      });

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

      const htmlContent = createQuoteSignedEmailHTML(
        clienteName,
        quote.type || "fisso",
        quote.jobInfo?.nomeEvento || "Evento",
        quote.totaleSelezionato || quote.totalAfterDiscount || 0,
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

      // Crea HTML email per admin (riusa template standard)
      const htmlContent = createQuoteSignedEmailHTML(
        clienteName,
        quote.type || "fisso",
        quote.jobInfo?.nomeEvento || "Nuovo Evento",
        quote.totaleSelezionato || quote.totalAfterDiscount || 0,
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
    const today = new Date();
    const daysUntilDue = Math.ceil(
      (dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );
    const isOverdue = daysUntilDue < 0;

    // Formato data scadenza
    const paymentDueDate = dueDate.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

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
        updatedAt: new Date(),
      };

      // 6. Rigenerazione token se necessario
      if (shouldRegenerateToken && quote.publicToken) {
        const oldToken = quote.publicToken;
        const newToken = nanoid(32);

        // Crea entry per token revocato
        const revokedEntry: RevokedToken = {
          token: oldToken,
          revokedAt: new Date() as any,
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
        updatedAt: new Date(),
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
          updatedAt: new Date(),
          "financials.totalePreventivato": totaleSelezionato || quote.totaleSelezionato || quote.totalAfterDiscount || 0,
        });
        completedSteps.jobStatusUpdated = true;
        console.log(`✅ Job ${quote.jobId} aggiornato a stato "confermato"`);
      } else {
        console.log(`⏭️ Job ${quote.jobId} già in stato ${job?.status}, skip update`);
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
          data: new Date(),
          metadata: { 
            quoteId: id, 
            totale: totaleSelezionato || quote.totaleSelezionato || quote.totalAfterDiscount || 0 
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
          const signedAt = quote.signedAt || quote.signature?.signedAt || new Date();
          const signedAtDate = signedAt instanceof Date ? signedAt : 
            (signedAt as any).toDate ? (signedAt as any).toDate() : new Date(signedAt);

          const emailHTML = createQuoteSignedEmailHTML(
            clientName || quote.signature?.clientName || "Cliente",
            quote.type || "fisso",
            job?.nomeEvento || "Il tuo evento",
            totaleSelezionato || quote.totaleSelezionato || quote.totalAfterDiscount || 0,
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
        
        const adminEmailHTML = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #8b9a7d;">Nuovo Contratto Firmato</h2>
            <p>Il cliente <strong>${clientName || quote.signature?.clientName || "Cliente"}</strong> ha firmato il preventivo per:</p>
            <ul>
              <li><strong>Evento:</strong> ${job?.nomeEvento || "N/A"}</li>
              <li><strong>Totale:</strong> €${(totaleSelezionato || quote.totaleSelezionato || quote.totalAfterDiscount || 0).toLocaleString("it-IT")}</li>
            </ul>
            <p>Accedi al pannello admin per visualizzare i dettagli.</p>
          </div>
        `;

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
