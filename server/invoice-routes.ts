import { Router, type Response } from 'express';
import { createHash } from 'node:crypto';
import { db, Timestamp } from './firebase-admin.js';
import { authenticateFirebase } from './email-routes.js';
import { buildFatturaPaXml, calculateInvoiceTotals, validateFatturaPaInput, type FatturaPaRecipient, type FatturaPaSender } from '../shared/fattura-pa.js';
import type { InvoiceDraftInput, InvoiceHistoryItem, InvoiceLineInput } from '../shared/fatture-types.js';
import { getIndirizzoFiscale } from '../shared/clienti-address.js';

const router = Router();
const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];
const INVOICES_COLLECTION = 'invoices';

function requireAdmin(req: any, res: Response, next: any) {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso riservato agli amministratori' });
  }
  next();
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseDraft(body: any): InvoiceDraftInput {
  const amount = typeof body?.taxableAmount === 'number'
    ? body.taxableAmount
    : Number(String(body?.taxableAmount ?? '').replace(',', '.'));
  return {
    jobId: cleanString(body?.jobId),
    clienteId: cleanString(body?.clienteId),
    issueDate: cleanString(body?.issueDate),
    taxableAmount: amount,
    taxTreatment: body?.taxTreatment,
    taxRate: body?.taxRate === undefined || body?.taxRate === '' ? undefined : Number(body.taxRate),
    description: cleanString(body?.description),
  };
}

function requestHash(draft: InvoiceDraftInput): string {
  return createHash('sha256').update(JSON.stringify({
    jobId: draft.jobId,
    clienteId: draft.clienteId,
    issueDate: draft.issueDate,
    taxableAmount: draft.taxableAmount,
    taxTreatment: draft.taxTreatment,
    taxRate: draft.taxRate ?? null,
    description: draft.description,
  })).digest('hex');
}

function senderFromSettings(settings: any): FatturaPaSender {
  return {
    name: cleanString(settings?.name),
    partitaIVA: cleanString(settings?.partitaIVA || settings?.partitaIva),
    codiceFiscale: cleanString(settings?.codiceFiscale),
    regimeFiscale: cleanString(settings?.regimeFiscale || settings?.regimeFiscaleIva),
    fiscalVia: cleanString(settings?.fiscalVia),
    fiscalCap: cleanString(settings?.fiscalCap),
    fiscalComune: cleanString(settings?.fiscalComune),
    fiscalProvincia: cleanString(settings?.fiscalProvincia),
    address: cleanString(settings?.address),
  };
}

function recipientFromDocument(data: any): FatturaPaRecipient {
  return {
    nome: cleanString(data?.nome),
    cognome: cleanString(data?.cognome),
    ragioneSociale: cleanString(data?.ragioneSociale),
    email: cleanString(data?.email),
    codiceFiscale: cleanString(data?.codiceFiscale),
    partitaIva: cleanString(data?.partitaIva),
    codiceSdi: cleanString(data?.codiceSdi),
    pec: cleanString(data?.pec),
    tipoSoggetto: data?.tipoSoggetto,
    via: cleanString(data?.via),
    citta: cleanString(data?.citta),
    cap: cleanString(data?.cap),
    provincia: cleanString(data?.provincia),
    indirizzoFiscaleUguale: data?.indirizzoFiscaleUguale,
    viaFiscale: cleanString(data?.viaFiscale),
    cittaFiscale: cleanString(data?.cittaFiscale),
    capFiscale: cleanString(data?.capFiscale),
    provinciaFiscale: cleanString(data?.provinciaFiscale),
  };
}

function dateToIso(value: any): string | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value._seconds === 'number') return new Date(value._seconds * 1000).toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function serializeInvoice(id: string, data: any): InvoiceHistoryItem {
  return {
    id,
    jobId: data.jobId,
    clienteId: data.clienteId,
    numero: data.numero,
    year: data.year,
    issueDate: data.issueDate,
    description: data.input?.description || data.description || '',
    totals: data.totals,
    filename: data.filename,
    createdAt: dateToIso(data.createdAt),
  };
}

function filenameForInvoice(sender: FatturaPaSender, year: number, sequence: number): string {
  const senderId = cleanString(sender.partitaIVA || sender.codiceFiscale).replace(/[^A-Za-z0-9]/g, '') || 'MITTENTE';
  return `IT${senderId}_${year}_${String(sequence).padStart(5, '0')}.xml`;
}

async function loadDraftContext(draft: InvoiceDraftInput) {
  const [settingsDoc, jobDoc, clienteDoc] = await Promise.all([
    db.collection('settings').doc('studio').get(),
    db.collection('jobs').doc(draft.jobId).get(),
    db.collection('clienti').doc(draft.clienteId).get(),
  ]);
  if (!jobDoc.exists) throw Object.assign(new Error('Lavoro non trovato'), { statusCode: 404 });
  if (!clienteDoc.exists) throw Object.assign(new Error('Cliente non trovato'), { statusCode: 404 });
  const job = jobDoc.data() || {};
  const cliente = clienteDoc.data() || {};
  if (!(job.clientiIds || []).includes(draft.clienteId) && job.clienteId !== draft.clienteId) {
    throw Object.assign(new Error('Il cliente selezionato non è collegato al lavoro'), { statusCode: 400 });
  }
  const sender = senderFromSettings(settingsDoc.exists ? settingsDoc.data() : {});
  const recipient = recipientFromDocument(cliente);
  const validation = validateFatturaPaInput(sender, recipient, draft);
  return { sender, recipient, validation, job, cliente };
}

function validationResponse(res: Response, validation: ReturnType<typeof validateFatturaPaInput>) {
  return res.status(422).json({
    error: 'Dati insufficienti per creare la fattura elettronica',
    missing: validation.missing,
    errors: validation.errors,
    totals: validation.totals,
  });
}

router.use(authenticateFirebase, requireAdmin);

router.post('/preview', async (req: any, res: Response) => {
  try {
    const draft = parseDraft(req.body);
    if (!draft.jobId || !draft.clienteId) return res.status(400).json({ error: 'Lavoro e cliente sono obbligatori' });
    const context = await loadDraftContext(draft);
    if (!context.validation.valid) return validationResponse(res, context.validation);
    return res.json({
      valid: true,
      totals: context.validation.totals,
      sender: {
        name: context.sender.name,
        regimeFiscale: context.sender.regimeFiscale,
      },
      recipient: {
        name: context.recipient.ragioneSociale || `${context.recipient.nome} ${context.recipient.cognome}`.trim(),
        address: getIndirizzoFiscale(context.recipient),
      },
    });
  } catch (error: any) {
    const status = error?.statusCode || 500;
    console.error('Errore anteprima fattura:', error);
    return res.status(status).json({ error: error?.message || 'Errore durante l’anteprima' });
  }
});

router.get('/job/:jobId', async (req: any, res: Response) => {
  try {
    const snapshot = await db.collection(INVOICES_COLLECTION).where('jobId', '==', req.params.jobId).get();
    const invoices = snapshot.docs
      .map((doc) => serializeInvoice(doc.id, doc.data()))
      .sort((a, b) => `${b.issueDate}-${b.numero}`.localeCompare(`${a.issueDate}-${a.numero}`));
    return res.json({ invoices });
  } catch (error) {
    console.error('Errore storico fatture:', error);
    return res.status(500).json({ error: 'Impossibile caricare lo storico fatture' });
  }
});

router.post('/', async (req: any, res: Response) => {
  try {
    const draft = parseDraft(req.body);
    if (!draft.jobId || !draft.clienteId) return res.status(400).json({ error: 'Lavoro e cliente sono obbligatori' });
    const year = Number(draft.issueDate.slice(0, 4));
    const idempotencyKey = cleanString(req.body?.idempotencyKey).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
    const idempotencyRef = idempotencyKey
      ? db.collection('invoiceIdempotency').doc(idempotencyKey)
      : null;
    const counterRef = db.collection('counters').doc(`invoices_${year}`);
    const invoiceRef = db.collection(INVOICES_COLLECTION).doc();
    const draftHash = requestHash(draft);
    let createdResponse: { invoiceId: string; numero: string; filename: string; totals: any } | null = null;
    let createdSequence = 0;

    await db.runTransaction(async (transaction) => {
      if (idempotencyRef) {
        const existingKey = await transaction.get(idempotencyRef);
        if (existingKey.exists) {
          const existing = existingKey.data() || {};
          if (existing.requestHash !== draftHash) {
            throw Object.assign(new Error('Chiave di idempotenza già usata per una fattura diversa'), { statusCode: 409 });
          }
          createdResponse = existing.response;
          return;
        }
      }

      const [settingsDoc, jobDoc, clienteDoc, counterDoc] = await Promise.all([
        transaction.get(db.collection('settings').doc('studio')),
        transaction.get(db.collection('jobs').doc(draft.jobId)),
        transaction.get(db.collection('clienti').doc(draft.clienteId)),
        transaction.get(counterRef),
      ]);
      if (!jobDoc.exists) throw Object.assign(new Error('Lavoro non trovato'), { statusCode: 404 });
      if (!clienteDoc.exists) throw Object.assign(new Error('Cliente non trovato'), { statusCode: 404 });
      const job = jobDoc.data() || {};
      if (!(job.clientiIds || []).includes(draft.clienteId) && job.clienteId !== draft.clienteId) {
        throw Object.assign(new Error('Il cliente selezionato non è collegato al lavoro'), { statusCode: 400 });
      }
      const sender = senderFromSettings(settingsDoc.exists ? settingsDoc.data() : {});
      const recipient = recipientFromDocument(clienteDoc.data() || {});
      const validation = validateFatturaPaInput(sender, recipient, draft);
      if (!validation.valid) throw Object.assign(new Error('Dati insufficienti per creare la fattura elettronica'), {
        statusCode: 422, validation,
      });

      const totals = validation.totals!;
      createdSequence = Number(counterDoc.exists ? counterDoc.data()?.lastNumber || 0 : 0) + 1;
      const numero = `${year}/${String(createdSequence).padStart(4, '0')}`;
      const xml = buildFatturaPaXml({
        sender,
        recipient,
        totals,
        input: {
          ...draft,
          invoiceNumber: numero,
          jobReference: job.nomeEvento || draft.jobId,
        },
      });
      const filename = filenameForInvoice(sender, year, createdSequence);
      createdResponse = { invoiceId: invoiceRef.id, numero, filename, totals };
      transaction.set(counterRef, { lastNumber: createdSequence, updatedAt: Timestamp.now() }, { merge: true });
      transaction.create(invoiceRef, {
        jobId: draft.jobId,
        clienteId: draft.clienteId,
        numero,
        year,
        issueDate: draft.issueDate,
        input: draft,
        totals,
        filename,
        xml,
        senderSnapshot: sender,
        recipientSnapshot: recipient,
        createdBy: req.user?.uid || '',
        createdAt: Timestamp.now(),
      });
      if (idempotencyRef) {
        transaction.create(idempotencyRef, {
          invoiceId: invoiceRef.id,
          sequence: createdSequence,
          requestHash: draftHash,
          response: createdResponse,
          createdAt: Timestamp.now(),
        });
      }
    });

    if (!createdResponse) throw new Error('Fattura non creata');
    const finalResponse = createdResponse as { invoiceId: string; numero: string; filename: string; totals: any };
    if (finalResponse.invoiceId !== invoiceRef.id) {
      return res.json({ ...finalResponse, reused: true });
    }
    return res.status(201).json(finalResponse);
  } catch (error: any) {
    const status = error?.statusCode || 500;
    console.error('Errore creazione fattura:', error);
    if (error?.validation) return validationResponse(res, error.validation);
    return res.status(status).json({ error: error?.message || 'Errore durante la creazione della fattura' });
  }
});

router.get('/:invoiceId/xml', async (req: any, res: Response) => {
  try {
    const invoiceDoc = await db.collection(INVOICES_COLLECTION).doc(req.params.invoiceId).get();
    if (!invoiceDoc.exists) return res.status(404).json({ error: 'Fattura non trovata' });
    const data = invoiceDoc.data()!;
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${String(data.filename || 'fattura.xml').replace(/["\r\n]/g, '')}"`);
    return res.send(data.xml);
  } catch (error) {
    console.error('Errore download fattura:', error);
    return res.status(500).json({ error: 'Impossibile scaricare la fattura' });
  }
});

export default router;