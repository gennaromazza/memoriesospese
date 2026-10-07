import type { HttpHandlerResult } from "./http-types.js";
/**
 * LAB ROUTES - Anagrafica laboratori di stampa + spedizioni file (consegne)
 *
 * Tracce operative INDIPENDENTI dal flusso commerciale del job:
 * - i file vivono su Google Drive (cartella dedicata, separata dai backup/gallerie)
 * - sono transitori: auto-eliminati dopo la scadenza configurabile
 *
 * Tutte le route sono admin-only: authenticateFirebase + check ADMIN_EMAILS.
 */

import express from 'express';
import { db } from './firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid';
import { nowRome, formatRomeDateLocale } from './utils/timezone.js';
import {
  sendGmailEmail,
  getStudioContactInfo,
  getSiteBaseUrl,
} from './email-routes.js';
import { authenticatePrintShop as authenticateFirebase } from './print-shop/auth.js';
import {
  findOrCreateLabParentFolder,
  createShipmentFolder,
  createResumableUploadSession,
  deleteDriveFile,
  revokeShipmentFolderPermission,
} from './google-drive.js';
import {
  LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
  type LabShipment,
  type LabShipmentFile,
  type LabShipmentStatus,
} from '@shared/lab-types';
import type { CostoLavoro } from '@shared/jobs-types';
import {
  createLabDpaFields,
  LabDpaValidationError,
  updateLabDpaFields,
} from './lab-dpa.js';
import { refreshLabShipmentInstructions } from './lab-shipment-instructions.js';
import {
  createWalkInOrderSnapshot,
  WALK_IN_LAB_MANIFEST_FILENAME,
} from './walk-in-lab-shipment.js';
import { refreshWalkInLabShipmentInstructions } from './walk-in-lab-shipment-instructions.js';
import { labMockupCatalogRouter } from './lab-mockup-catalog.js';
import { recentLabShipments } from './lab-recent-shipments.js';
import { GetRecentLabShipmentsQueryParams, GetRecentLabShipmentsResponse } from '@workspace/api-zod';

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

const router = express.Router();

const VALID_SHIPMENT_STATUSES: LabShipmentStatus[] = [
  'da_inviare',
  'inviato',
  'in_stampa',
  'ricevuto',
  'scaduto',
];

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function multilineHtml(value: unknown): string {
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

function rejectPrintShopLegacyMutation(shipment: LabShipment, res: express.Response): boolean {
  if (shipment.mockupDispatching || ['uploading', 'needs_review'].includes(shipment.mockupTransfer?.status || '')) {
    res.status(409).json({ error: 'Spedizione occupata: completa o verifica il trasferimento mockup / invio prima di modificarla.' });
    return true;
  }
  if (shipment.sourceType !== 'print_shop') return false;
  res.status(409).json({
    error: 'Questa spedizione appartiene allo shop stampe: usa le azioni dedicate dell’ordine',
    code: 'print_shop_route_required',
  });
  return true;
}

/**
 * Middleware: consente l'accesso solo agli admin autorizzati.
 */
function requireAdmin(req: any, res: express.Response, next: express.NextFunction): HttpHandlerResult {
  if (!ADMIN_EMAILS.includes(req.user?.email || '')) {
    return res.status(403).json({ error: 'Accesso negato: solo admin' });
  }
  next();
}

// ============================================================================
// LABS - Anagrafica laboratori di stampa
// ============================================================================

/**
 * GET /api/labs?attiviOnly=true
 * Lista laboratori (opzionalmente solo attivi).
 */
router.use('/labs/:labId/mockup-catalog', authenticateFirebase, requireAdmin, labMockupCatalogRouter);
router.get('/labs/costs-report', authenticateFirebase, requireAdmin, async (req: any, res): Promise<void> => {
  try {
    const [labsSnapshot, jobsSnapshot] = await Promise.all([
      db.collection('labs').get(),
      db.collection('jobs').get(),
    ]);
    const groups = new Map<string, {
      labId: string;
      labNome: string;
      attivo: boolean | null;
      totaleCentesimi: number;
      numeroCosti: number;
      costi: Array<{
        jobId: string;
        jobNome: string;
        costoId: string;
        descrizione: string;
        importo: number;
        data?: any;
      }>;
      labelAt: number;
    }>();
    const currentLabIds = new Set<string>();

    for (const labDoc of labsSnapshot.docs) {
      const lab = labDoc.data() || {};
      currentLabIds.add(labDoc.id);
      groups.set(labDoc.id, {
        labId: labDoc.id,
        labNome: typeof lab.nome === 'string' && lab.nome.trim() ? lab.nome : 'Laboratorio senza nome',
        attivo: lab.attivo !== false,
        totaleCentesimi: 0,
        numeroCosti: 0,
        costi: [],
        labelAt: Number.POSITIVE_INFINITY,
      });
    }

    const unassigned = { totaleCentesimi: 0, numeroCosti: 0 };
    const seenCostIds = new Set<string>();
    const timestampMillis = (value: any): number => {
      if (!value) return 0;
      if (typeof value.toMillis === 'function') return value.toMillis();
      const seconds = value.seconds ?? value._seconds;
      if (typeof seconds === 'number') return seconds * 1000;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? 0 : date.getTime();
    };

    for (const jobDoc of jobsSnapshot.docs) {
      const job = jobDoc.data() || {};
      const costs = Array.isArray(job.costi) ? job.costi : [];
      for (const [index, costo] of costs.entries()) {
        if (!costo || typeof costo.importo !== 'number' || !Number.isFinite(costo.importo)) continue;
        const costoId = typeof costo.id === 'string' ? costo.id : '';
        if (costoId) {
          const uniqueKey = `${jobDoc.id}:${costoId}`;
          if (seenCostIds.has(uniqueKey)) continue;
          seenCostIds.add(uniqueKey);
        }
        const amountCents = Math.round(costo.importo * 100);
        const labId = typeof costo.labId === 'string' && costo.labId.length > 0
          ? costo.labId
          : null;

        if (!labId) {
          unassigned.totaleCentesimi += amountCents;
          unassigned.numeroCosti += 1;
          continue;
        }

        let group = groups.get(labId);
        if (!group) {
          group = {
            labId,
            labNome: 'Laboratorio rimosso',
            attivo: null,
            totaleCentesimi: 0,
            numeroCosti: 0,
            costi: [],
            labelAt: Number.NEGATIVE_INFINITY,
          };
          groups.set(labId, group);
        }

        const costDate = timestampMillis(costo.data);
        const historicalName = typeof costo.labNome === 'string' ? costo.labNome.trim() : '';
        if (!currentLabIds.has(labId) && historicalName && costDate >= group.labelAt) {
          group.labNome = historicalName;
          group.labelAt = costDate;
        }
        group.totaleCentesimi += amountCents;
        group.numeroCosti += 1;
        group.costi.push({
          jobId: jobDoc.id,
          jobNome: typeof job.nomeEvento === 'string' && job.nomeEvento.trim()
            ? job.nomeEvento
            : 'Lavoro senza nome',
          costoId: costoId || `senza-id-${index}`,
          descrizione: typeof costo.descrizione === 'string' ? costo.descrizione : '',
          importo: costo.importo,
          data: costo.data,
        });
      }
    }

    const laboratori = [...groups.values()]
      .map(({ totaleCentesimi, labelAt: _labelAt, ...group }) => ({
        ...group,
        totale: totaleCentesimi / 100,
        costi: group.costi.sort((a, b) => timestampMillis(b.data) - timestampMillis(a.data)),
      }))
      .sort((a, b) => a.labNome.localeCompare(b.labNome, 'it'));

    res.json({
      laboratori,
      senzaLaboratorio: {
        totale: unassigned.totaleCentesimi / 100,
        numeroCosti: unassigned.numeroCosti,
      },
    });
  } catch (error: any) {
    req.log.error({ err: error }, 'Unable to build lab costs report');
    res.status(500).json({ error: error.message || 'Errore caricamento rendiconto laboratori' });
  }
});

router.get('/labs', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const attiviOnly = req.query.attiviOnly === 'true';

    const snapshot = await db.collection('labs').get();

    let labs = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Array<{ id: string; attivo?: boolean; nome?: string }>;

    if (attiviOnly) {
      labs = labs.filter((l) => l.attivo !== false);
    }

    labs.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    res.json(labs);
  } catch (error: any) {
    console.error('❌ Error fetching labs:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/labs
 * Crea un nuovo laboratorio.
 */
router.post('/labs', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const {
      nome,
      email,
      telefono,
      note,
      dataProcessingAgreementStatus,
      dataProcessingAgreementReference,
    } = req.body;

    if (!nome || !email) {
      return res.status(400).json({ error: 'Nome ed email sono obbligatori' });
    }

    const now = Timestamp.now();
    const dpaFields = createLabDpaFields({
      dataProcessingAgreementStatus,
      dataProcessingAgreementReference,
    }, now);
    const labData: any = {
      nome,
      email,
      attivo: true,
      ...dpaFields,
      createdAt: now,
      updatedAt: now,
    };

    if (telefono) labData.telefono = telefono;
    if (note) labData.note = note;
    const docRef = await db.collection('labs').add(labData);

    console.log(`✅ Laboratorio creato: ${docRef.id} (${nome})`);
    res.json({ id: docRef.id, ...labData });
  } catch (error: any) {
    if (error instanceof LabDpaValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error creating lab:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/labs/:id
 * Aggiorna un laboratorio.
 */
router.patch('/labs/:id', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;
    const {
      nome,
      email,
      telefono,
      note,
      attivo,
      dataProcessingAgreementStatus,
      dataProcessingAgreementReference,
    } = req.body;

    const labDoc = await db.collection('labs').doc(id).get();
    if (!labDoc.exists) {
      return res.status(404).json({ error: 'Laboratorio non trovato' });
    }

    const updateData: any = { updatedAt: Timestamp.now() };
    if (nome !== undefined) updateData.nome = nome;
    if (email !== undefined) updateData.email = email;
    if (telefono !== undefined) updateData.telefono = telefono;
    if (note !== undefined) updateData.note = note;
    if (attivo !== undefined) updateData.attivo = attivo;
    Object.assign(updateData, updateLabDpaFields(
      labDoc.data() || {},
      { dataProcessingAgreementStatus, dataProcessingAgreementReference },
      Timestamp.now(),
      FieldValue.delete(),
    ));

    await db.collection('labs').doc(id).update(updateData);

    const updated = await db.collection('labs').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    if (error instanceof LabDpaValidationError) {
      return res.status(400).json({ error: error.message });
    }
    console.error('❌ Error updating lab:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/labs/:id
 * Elimina un laboratorio dall'anagrafica.
 */
router.delete('/labs/:id', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;

    const labDoc = await db.collection('labs').doc(id).get();
    if (!labDoc.exists) {
      return res.status(404).json({ error: 'Laboratorio non trovato' });
    }

    await db.collection('labs').doc(id).delete();

    console.log(`🗑️ Laboratorio eliminato: ${id}`);
    res.json({ success: true, message: 'Laboratorio eliminato' });
  } catch (error: any) {
    console.error('❌ Error deleting lab:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// LAB SHIPMENTS - Spedizioni file verso i laboratori
// ============================================================================

/**
 * GET /api/lab-shipments/job/:jobId
 * Lista spedizioni collegate a un job.
 */
router.get('/lab-shipments/recent', authenticateFirebase, requireAdmin, async (req: any, res) => {
  const parsed = GetRecentLabShipmentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Seleziona un laboratorio valido.' });
    return;
  }
  try {
    // One equality filter: no per-Job requests or composite index dependency.
    const snapshot = await db.collection('labShipments').where('labId', '==', parsed.data.labId).get();
    const recent = recentLabShipments(
      snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })), parsed.data.labId,
    );
    res.setHeader('Cache-Control', 'no-store');
    res.json(GetRecentLabShipmentsResponse.parse(recent));
  } catch (error) {
    req.log?.error({ err: error }, 'Failed to load recent laboratory sends');
    res.status(500).json({ error: 'Non riesco a caricare gli invii al laboratorio.' });
  }
});

router.get('/lab-shipments/job/:jobId', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { jobId } = req.params;

    const snapshot = await db.collection('labShipments').where('jobId', '==', jobId).get();

    const shipments = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.json(shipments);
  } catch (error: any) {
    console.error('❌ Error fetching lab shipments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lab-shipments/order/:orderId
 * Lista esclusivamente gli invii al laboratorio creati per un ordine walk-in.
 */
router.get('/lab-shipments/order/:orderId', authenticateFirebase, requireAdmin, async (req: any, res) => {
  try {
    const { orderId } = req.params;
    const snapshot = await db.collection('labShipments').where('orderId', '==', orderId).get();
    const shipments = snapshot.docs
      .filter((doc) => doc.data()?.sourceType === 'walk_in')
      .map((doc) => ({ id: doc.id, ...doc.data() }));
    res.setHeader('Cache-Control', 'no-store');
    res.json(shipments);
  } catch (error: any) {
    console.error('❌ Error fetching walk-in lab shipments:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/lab-shipments/:id
 * Dettaglio singola spedizione (usato dalla scheda fotolibro collegata).
 */
router.get('/lab-shipments/:id', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const doc = await db.collection('labShipments').doc(req.params.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }
    res.json({ id: doc.id, ...doc.data() });
  } catch (error: any) {
    console.error('❌ Error fetching lab shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lab-shipments
 * Crea una nuova spedizione (stato iniziale: da_inviare).
 */
router.post('/lab-shipments', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const {
      jobId,
      orderId: requestedOrderId,
      sourceType: requestedSourceType,
      descrizione,
      labId,
      expiryDays,
    } = req.body || {};
    const sourceType = requestedSourceType || 'job';
    const isWalkIn = sourceType === 'walk_in';
    let walkInOrderSnapshot: any;

    if (isWalkIn) {
      if (typeof requestedOrderId !== 'string' || !requestedOrderId.trim() || jobId) {
        return res.status(400).json({ error: 'orderId valido obbligatorio per un invio walk-in' });
      }
      const orderDoc = await db.collection('orders').doc(requestedOrderId.trim()).get();
      if (!orderDoc.exists) {
        return res.status(404).json({ error: 'Ordine non trovato' });
      }
      const order = orderDoc.data() || {};
      if (order.source !== 'walk_in') {
        return res.status(400).json({ error: 'L’ordine selezionato non è un ordine walk-in' });
      }
      walkInOrderSnapshot = createWalkInOrderSnapshot(requestedOrderId.trim(), order);
      if (walkInOrderSnapshot.products.length === 0) {
        return res.status(400).json({ error: 'L’ordine non contiene prodotti da inviare al laboratorio' });
      }
    } else if (sourceType !== 'job' || !jobId) {
      return res.status(400).json({ error: 'jobId obbligatorio per gli invii collegati a un lavoro' });
    }

    const now = Timestamp.now();
    const shipmentData: any = {
      files: [],
      status: 'da_inviare' as LabShipmentStatus,
      expiryDays: isWalkIn
        ? LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS
        : typeof expiryDays === 'number' && expiryDays > 0
          ? expiryDays
          : LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS,
      createdAt: now,
      updatedAt: now,
      createdBy: req.user?.email || undefined,
    };

    if (isWalkIn) {
      const orderId = requestedOrderId.trim();
      shipmentData.orderId = orderId;
      shipmentData.sourceType = 'walk_in';
      shipmentData.walkInOrderSnapshot = {
        ...walkInOrderSnapshot,
        capturedAt: now,
      };
      shipmentData.descrizione =
        typeof descrizione === 'string' && descrizione.trim()
          ? descrizione.trim().slice(0, 500)
          : `Ordine walk-in · ${walkInOrderSnapshot.customerName} · ${walkInOrderSnapshot.products
              .map((product: any) => `${product.name} ×${product.quantity}`)
              .join(', ')}`
              .slice(0, 500);
    } else {
      shipmentData.jobId = jobId;
      if (descrizione) shipmentData.descrizione = descrizione;
    }

    // Denormalizza dati lab se fornito
    if (labId) {
      shipmentData.labId = labId;
      const labDoc = await db.collection('labs').doc(labId).get();
      if (isWalkIn && !labDoc.exists) {
        return res.status(404).json({ error: 'Laboratorio non trovato' });
      }
      if (labDoc.exists) {
        const lab = labDoc.data();
        shipmentData.labNome = lab?.nome;
        shipmentData.labEmail = lab?.email;
      }
    }

    const docRef = await db.collection('labShipments').add(shipmentData);

    console.log(
      `✅ Spedizione laboratorio creata: ${docRef.id} (${isWalkIn ? `ordine ${requestedOrderId}` : `job ${jobId}`})`,
    );
    res.json({ id: docRef.id, ...shipmentData });
  } catch (error: any) {
    console.error('❌ Error creating lab shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lab-shipments/:id/upload-session
 * Conia una sessione di upload resumable browser → Drive.
 * Al primo upload crea la cartella Drive dedicata (anyone-reader) e salva
 * driveFolderId + shareableLink sul doc.
 * IMPORTANTE: NON loggare il sessionUrl.
 */
router.post('/lab-shipments/:id/upload-session', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;
    const { fileName, mimeType, fileSize } = req.body;

    if (!fileName || !mimeType || typeof fileSize !== 'number') {
      return res.status(400).json({ error: 'fileName, mimeType e fileSize sono obbligatori' });
    }

    const shipmentDoc = await db.collection('labShipments').doc(id).get();
    if (!shipmentDoc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }

    const shipment = shipmentDoc.data() as LabShipment;
    if (rejectPrintShopLegacyMutation(shipment, res)) return;

    let driveFolderId = shipment.driveFolderId;
    let shareableLink = shipment.shareableLink;

    // Crea cartella dedicata al primo upload
    if (!driveFolderId) {
      const parentId = await findOrCreateLabParentFolder();
      const folderName = `${shipment.labNome ? shipment.labNome + ' - ' : ''}${
        shipment.descrizione || 'Consegna'
      } - ${id}`;
      const folder = await createShipmentFolder(parentId, folderName);
      driveFolderId = folder.folderId;
      shareableLink = folder.webViewLink;

      await db.collection('labShipments').doc(id).update({
        driveFolderId,
        shareableLink: shareableLink || null,
        updatedAt: Timestamp.now(),
      });
    }

    // L'Origin del browser è necessario perché Google abiliti il CORS
    // sull'URI di sessione (upload chunk diretti browser → Drive).
    const origin = (req.headers.origin as string) || undefined;
    const sessionUrl = await createResumableUploadSession(
      driveFolderId,
      fileName,
      mimeType,
      fileSize,
      origin
    );

    // NON loggare sessionUrl
    res.json({ sessionUrl, driveFolderId, shareableLink });
  } catch (error: any) {
    console.error('❌ Error creating upload session:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lab-shipments/:id/file-uploaded
 * Notifica il completamento di un upload: append a files[].
 */
router.post('/lab-shipments/:id/file-uploaded', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;
    const { driveFileId, name, size, mimeType, webViewLink, kind } = req.body;

    if (!driveFileId || !name) {
      return res.status(400).json({ error: 'driveFileId e name sono obbligatori' });
    }
    if (kind !== undefined && !['supplemental', 'other'].includes(kind)) {
      return res.status(400).json({ error: 'Tipo file spedizione non valido' });
    }

    const shipmentDoc = await db.collection('labShipments').doc(id).get();
    if (!shipmentDoc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }

    const shipment = shipmentDoc.data() as LabShipment;
    if (rejectPrintShopLegacyMutation(shipment, res)) return;
    const files: LabShipmentFile[] = Array.isArray(shipment.files) ? [...shipment.files] : [];

    const newFile: any = {
      driveFileId,
      name,
      size: typeof size === 'number' ? size : 0,
      kind: kind || 'other',
      uploadedAt: Timestamp.now(),
    };
    if (mimeType) newFile.mimeType = mimeType;
    if (webViewLink) newFile.webViewLink = webViewLink;

    files.push(newFile);

    const shipmentRef = db.collection('labShipments').doc(id);
    await shipmentRef.update({
      files,
      updatedAt: Timestamp.now(),
    });

    try {
      if (shipment.sourceType === 'walk_in') {
        await refreshWalkInLabShipmentInstructions(shipmentRef);
      } else {
        await refreshLabShipmentInstructions(shipmentRef);
      }
    } catch (instructionError) {
      await shipmentRef.update({
        files: shipment.files || [],
        updatedAt: Timestamp.now(),
      });
      await deleteDriveFile(driveFileId).catch(() => undefined);
      throw instructionError;
    }

    const updated = await shipmentRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error registering uploaded file:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/lab-shipments/:id
 * Aggiorna campi della spedizione (status, descrizione, labId, expiryDays).
 */
router.patch('/lab-shipments/:id', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;
    const { status, descrizione, labNote, labId, expiryDays } = req.body;

    const shipmentDoc = await db.collection('labShipments').doc(id).get();
    if (!shipmentDoc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }
    const existingShipment = shipmentDoc.data() as LabShipment;
    if (rejectPrintShopLegacyMutation(existingShipment, res)) return;

    const updateData: any = { updatedAt: Timestamp.now() };

    if (status !== undefined) {
      if (!VALID_SHIPMENT_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Status non valido. Valori ammessi: ${VALID_SHIPMENT_STATUSES.join(', ')}`,
        });
      }
      updateData.status = status;
    }

    if (descrizione !== undefined) updateData.descrizione = descrizione;
    if (labNote !== undefined) {
      if (typeof labNote !== 'string' || labNote.length > 10000) {
        return res.status(400).json({ error: 'Note laboratorio non valide' });
      }
      updateData.labNote = labNote.trim();
      if (shipmentDoc.data()?.jobNotesSnapshot) {
        updateData['jobNotesSnapshot.generalNote'] = labNote.trim();
      }
    }

    if (
      existingShipment.sourceType !== 'walk_in' &&
      expiryDays !== undefined &&
      typeof expiryDays === 'number' &&
      expiryDays > 0
    ) {
      updateData.expiryDays = expiryDays;
    }

    if (labId !== undefined) {
      updateData.labId = labId;
      if (labId) {
        const labDoc = await db.collection('labs').doc(labId).get();
        if (labDoc.exists) {
          const lab = labDoc.data();
          updateData.labNome = lab?.nome;
          updateData.labEmail = lab?.email;
        }
      } else {
        updateData.labNome = null;
        updateData.labEmail = null;
      }
    }

    const shipmentRef = db.collection('labShipments').doc(id);
    if (existingShipment.sourceType === 'photobook') {
      const allowed = await db.runTransaction(async tx => {
        const fresh = await tx.get(shipmentRef);
        const data = fresh.data();
        if (!data || data.mockupDispatching || ['uploading', 'needs_review'].includes(data.mockupTransfer?.status) || (data.mockupSnapshot && labId !== undefined && labId !== data.mockupSnapshot.labId)) return false;
        tx.update(shipmentRef, updateData);
        return true;
      });
      if (!allowed) return res.status(409).json({ error: 'Mockup in trasferimento o laboratorio diverso dalla conferma allegata. Verifica la spedizione prima di modificarla.' });
    } else await shipmentRef.update(updateData);

    if (existingShipment.sourceType === 'photobook') {
      await refreshLabShipmentInstructions(shipmentRef);
    } else if (
      existingShipment.sourceType === 'walk_in' &&
      existingShipment.driveFolderId &&
      (descrizione !== undefined || labNote !== undefined)
    ) {
      await refreshWalkInLabShipmentInstructions(shipmentRef);
    }

    const updated = await shipmentRef.get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error updating lab shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/lab-shipments/:id/send
 * Invia il link condiviso al laboratorio via email.
 * status='inviato', sentAt=now, expiresAt=now+expiryDays.
 */
router.post('/lab-shipments/:id/send', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  let mockupDispatchClaimed = false;
  let emailAttempted = false;
  let emailPersisted = false;
  try {
    const { id } = req.params;
    const { labId: labIdFromBody } = req.body;

    const shipmentDoc = await db.collection('labShipments').doc(id).get();
    if (!shipmentDoc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }

    let shipment = shipmentDoc.data() as LabShipment;
    if (rejectPrintShopLegacyMutation(shipment, res)) return;

    if (shipment.sourceType === 'photobook') {
      const claimed = await db.runTransaction(async tx => {
        const ref = db.collection('labShipments').doc(id);
        const fresh = await tx.get(ref);
        const data = fresh.data();
        if (!data || data.mockupDispatching || ['uploading', 'needs_review'].includes(data.mockupTransfer?.status) || (data.mockupSnapshot && (labIdFromBody || data.labId) !== data.mockupSnapshot.labId)) return false;
        tx.update(ref, { mockupDispatching: true });
        return true;
      });
      if (!claimed) return res.status(409).json({ error: 'Invio bloccato: controlla trasferimento mockup e laboratorio destinatario della conferma.' });
      mockupDispatchClaimed = true;
      shipment = await refreshLabShipmentInstructions(
        db.collection('labShipments').doc(id),
      );
    }

    if (!shipment.shareableLink) {
      return res.status(400).json({
        error: 'Nessun file caricato: carica almeno un file prima di inviare il link',
      });
    }
    if (
      shipment.sourceType === 'walk_in' &&
      !(shipment.files || []).some(
        (file) => file.kind !== 'manifest' && file.name !== WALK_IN_LAB_MANIFEST_FILENAME,
      )
    ) {
      return res.status(400).json({
        error: 'Allega almeno un materiale dell’ordine prima di inviare il link al laboratorio',
      });
    }

    const labId = labIdFromBody || shipment.labId;
    if (!labId) {
      return res.status(400).json({ error: 'Nessun laboratorio selezionato per la spedizione' });
    }

    const labDoc = await db.collection('labs').doc(labId).get();
    if (!labDoc.exists) {
      return res.status(404).json({ error: 'Laboratorio non trovato' });
    }

    const lab = labDoc.data();
    if (!lab?.email) {
      return res.status(400).json({ error: 'Email del laboratorio mancante' });
    }

    const expiryDays = shipment.expiryDays || LAB_SHIPMENT_DEFAULT_EXPIRY_DAYS;
    const nowDate = nowRome().toJSDate();
    const sentAt = Timestamp.fromDate(nowDate);
    const expiresAtDate = nowRome().plus({ days: expiryDays }).toJSDate();
    const expiresAt = Timestamp.fromDate(expiresAtDate);

    // Recupera il contesto associato alla spedizione, senza esporre dati di pagamento.
    let jobNome = 'Consegna';
    if (shipment.sourceType === 'walk_in') {
      const orderSnapshot = shipment.walkInOrderSnapshot;
      jobNome = [
        orderSnapshot?.orderTitle || 'Ordine walk-in',
        orderSnapshot?.customerName,
      ].filter(Boolean).join(' · ');
    } else if (shipment.jobId) {
      try {
        const jobDoc = await db.collection('jobs').doc(shipment.jobId).get();
        if (jobDoc.exists) {
          jobNome = jobDoc.data()?.nomeEvento || jobNome;
        }
      } catch {
        // non bloccante
      }
    }

    const studioInfo = await getStudioContactInfo();
    const scadenzaFormatted = formatRomeDateLocale(expiresAtDate, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const numFile = Array.isArray(shipment.files) ? shipment.files.length : 0;
    const photoNotes = Array.isArray(shipment.jobNotesSnapshot?.photoNotes)
      ? shipment.jobNotesSnapshot.photoNotes
      : [];
    const orderDescription = shipment.walkInOrderSnapshot?.orderDescription || '';
    const labNotesHtml = shipment.labNote || orderDescription || photoNotes.length > 0
      ? `
          <div style="background:#eef4f6;border-radius:12px;padding:22px;margin-bottom:25px;border-left:4px solid #58798a;">
            <h2 style="font-size:17px;color:#334e5c;margin:0 0 12px 0;">${shipment.sourceType === 'walk_in' ? 'Dettagli ordine' : 'Istruzioni di stampa'}</h2>
            ${orderDescription
              ? `<p style="font-size:15px;color:#3f515a;line-height:1.6;margin:0 0 ${shipment.labNote ? '16px' : '0'} 0;"><strong>Descrizione inserita nell’ordine:</strong><br>${multilineHtml(orderDescription)}</p>`
              : ''}
            ${shipment.labNote
              ? `<p style="font-size:15px;color:#3f515a;line-height:1.6;margin:0 0 ${photoNotes.length ? '16px' : '0'} 0;">${multilineHtml(shipment.labNote)}</p>`
              : ''}
            ${photoNotes.map((note, index) => `
              <div style="border-top:1px solid #ccd9df;padding-top:12px;margin-top:12px;">
                <p style="font-size:14px;color:#3f515a;line-height:1.5;margin:0;">
                  <strong>Nota con allegato ${index + 1}:</strong> ${multilineHtml(note.note || '')}
                </p>
                ${note.driveFileName ? `<p style="font-size:12px;color:#6b7d86;margin:5px 0 0 0;">File nella cartella: ${escapeHtml(note.driveFileName)}</p>` : ''}
              </div>`).join('')}
          </div>`
      : '';

    const htmlContent = `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #8b5a3c 0%, #6b4a2c 100%); padding: 30px 20px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
            File pronti per la stampa
          </h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0 0; font-size: 14px;">
            ${escapeHtml(studioInfo.name)}
          </p>
        </div>

        <div style="padding: 30px 25px;">
          <p style="font-size: 18px; color: #333; margin: 0 0 25px 0;">
            Ciao <strong style="color: #8b5a3c;">${escapeHtml(lab.nome || 'Laboratorio')}</strong>,
          </p>

          <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0 0 25px 0;">
            Trovi pronti i file da stampare per il lavoro <strong>${escapeHtml(jobNome)}</strong>.
            ${shipment.descrizione ? `<br><span style="color:#666;">${escapeHtml(shipment.descrizione)}</span>` : ''}
          </p>

          ${labNotesHtml}

          <div style="background: #f8f5f2; border-radius: 12px; padding: 25px; margin-bottom: 25px; border-left: 4px solid #8b5a3c;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px; width: 150px;">File disponibili:</td>
                <td style="padding: 8px 0; color: #333; font-size: 14px; font-weight: 600;">${numFile}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #666; font-size: 14px;">Disponibili fino al:</td>
                <td style="padding: 8px 0; color: #c0392b; font-size: 14px; font-weight: 600;">${escapeHtml(scadenzaFormatted)}</td>
              </tr>
            </table>
          </div>

          <div style="text-align: center; margin-bottom: 25px;">
            <a href="${escapeHtml(shipment.shareableLink)}"
               style="display: inline-block; background: linear-gradient(135deg, #8b5a3c 0%, #a06b4c 100%);
                      color: #ffffff; padding: 16px 40px; text-decoration: none;
                      border-radius: 8px; font-weight: 600; font-size: 16px;
                      box-shadow: 0 4px 15px rgba(139, 90, 60, 0.3);">
              Scarica i file
            </a>
          </div>

          <div style="background: #fff3cd; border-radius: 8px; padding: 15px; margin-bottom: 25px;">
            <p style="font-size: 14px; color: #856404; margin: 0;">
              ⚠️ I file saranno automaticamente eliminati dopo il <strong>${escapeHtml(scadenzaFormatted)}</strong>.
              Ti consigliamo di scaricarli quanto prima.
            </p>
          </div>

          <p style="font-size: 14px; color: #666; margin: 25px 0 0 0;">
            Grazie per la collaborazione!<br>
            <strong style="color: #8b5a3c;">${escapeHtml(studioInfo.name)}</strong>
          </p>
        </div>

        <div style="background: #f5f5f5; padding: 20px 25px; text-align: center; border-top: 1px solid #e0e0e0;">
          <p style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: #333;">${escapeHtml(studioInfo.name)}</p>
          <p style="margin: 0 0 5px 0; font-size: 12px; color: #666;">${escapeHtml(studioInfo.email)}</p>
          <p style="margin: 0; font-size: 12px; color: #666;">${escapeHtml(studioInfo.phone)}</p>
        </div>
      </div>
    `;

    emailAttempted = true;
    await sendGmailEmail(
      lab.email,
      `File pronti per la stampa: ${jobNome} | ${studioInfo.name}`,
      htmlContent,
      undefined,
      {
        type: 'lab_shipment',
        relatedDocId: id,
        relatedDocType: 'labShipment',
        clientName: lab.nome,
      }
    );

    await db.collection('labShipments').doc(id).update({
      status: 'inviato' as LabShipmentStatus,
      sentAt,
      expiresAt,
      labId,
      labNome: lab.nome,
      labEmail: lab.email,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Spedizione ${id} inviata a ${lab.email} (scadenza ${scadenzaFormatted})`);
    emailPersisted = true;

    const updated = await db.collection('labShipments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error sending lab shipment:', error);
    res.status(500).json({ error: error.message });
  } finally {
    // Non liberare il blocco dopo un invio email dall'esito ambiguo.
    if (mockupDispatchClaimed && (!emailAttempted || emailPersisted)) {
      await db.collection('labShipments').doc(req.params.id).update({ mockupDispatching: false }).catch(() => undefined);
    }
  }
});

/**
 * POST /api/lab-shipments/:id/cost
 * Crea o aggiorna un CostoLavoro (tipo 'fornitore') sul job collegato.
 * Salva costoId + costoImporto sulla spedizione.
 */
router.post('/lab-shipments/:id/cost', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;
    const { importo, labId: labIdFromBody } = req.body;

    if (typeof importo !== 'number' || importo < 0) {
      return res.status(400).json({ error: 'Importo non valido' });
    }

    const shipmentDoc = await db.collection('labShipments').doc(id).get();
    if (!shipmentDoc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }

    const shipment = shipmentDoc.data() as LabShipment;
    if (rejectPrintShopLegacyMutation(shipment, res)) return;

    let costLabId = shipment.labId || null;
    let costLabNome = shipment.labNome || null;
    let costLabEmail = shipment.labEmail || null;
    const shipmentLabPatch: Record<string, any> = {};
    if (labIdFromBody !== undefined) {
      if (typeof labIdFromBody !== 'string') {
        res.status(400).json({ error: 'Laboratorio selezionato non valido' });
        return;
      }
      if (labIdFromBody) {
        const selectedLabDoc = await db.collection('labs').doc(labIdFromBody).get();
        if (selectedLabDoc.exists) {
          const selectedLab = selectedLabDoc.data() || {};
          costLabId = labIdFromBody;
          costLabNome = typeof selectedLab.nome === 'string' ? selectedLab.nome : null;
          costLabEmail = typeof selectedLab.email === 'string' ? selectedLab.email : null;
        } else if (labIdFromBody !== shipment.labId) {
          res.status(404).json({ error: 'Laboratorio selezionato non trovato' });
          return;
        }
      } else {
        costLabId = null;
        costLabNome = null;
        costLabEmail = null;
      }
      shipmentLabPatch.labId = costLabId;
      shipmentLabPatch.labNome = costLabNome;
      shipmentLabPatch.labEmail = costLabEmail;
    }

    if (!shipment.jobId) {
      return res.status(409).json({
        error: 'Questa spedizione non è collegata a un job; usa la gestione costi dello shop stampe',
      });
    }

    const jobRef = db.collection('jobs').doc(shipment.jobId);
    const jobDoc = await jobRef.get();
    if (!jobDoc.exists) {
      return res.status(404).json({ error: 'Job collegato non trovato' });
    }

    const job = jobDoc.data();
    const costi: CostoLavoro[] = Array.isArray(job?.costi) ? [...job.costi] : [];

    const descrizione = `Laboratorio stampa${shipment.labNome ? ` - ${shipment.labNome}` : ''}${
      shipment.descrizione ? ` (${shipment.descrizione})` : ''
    }`;

    let costoId = shipment.costoId;

    if (costoId && costi.some((c) => c.id === costoId)) {
      // Sostituisci il costo esistente
      const idx = costi.findIndex((c) => c.id === costoId);
      const { labId: _oldLabId, labNome: _oldLabNome, ...costoEsistente } = costi[idx];
      costi[idx] = {
        ...costoEsistente,
        descrizione,
        importo,
        tipo: 'fornitore',
        data: costi[idx].data || Timestamp.now(),
        ...(costLabId ? {
          labId: costLabId,
          ...(costLabNome ? { labNome: costLabNome } : {}),
        } : {}),
      };
    } else {
      // Crea nuovo costo
      costoId = nanoid();
      const nuovoCosto: CostoLavoro = {
        id: costoId,
        descrizione,
        importo,
        tipo: 'fornitore',
        data: Timestamp.now() as any,
        createdBy: req.user?.email || undefined,
        ...(costLabId ? {
          labId: costLabId,
          ...(costLabNome ? { labNome: costLabNome } : {}),
        } : {}),
      };
      costi.push(nuovoCosto);
    }

    await jobRef.update({
      costi,
      updatedAt: Timestamp.now(),
    });

    await db.collection('labShipments').doc(id).update({
      costoId,
      costoImporto: importo,
      ...shipmentLabPatch,
      updatedAt: Timestamp.now(),
    });

    console.log(`✅ Costo fornitore ${costoId} (€${importo}) salvato per spedizione ${id}`);

    const updated = await db.collection('labShipments').doc(id).get();
    res.json({ id: updated.id, ...updated.data() });
  } catch (error: any) {
    console.error('❌ Error saving lab shipment cost:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/lab-shipments/:id
 * Elimina cartella Drive (best-effort), il costo collegato e il doc.
 */
router.delete('/lab-shipments/:id', authenticateFirebase, requireAdmin, async (req: any, res): Promise<HttpHandlerResult> => {
  try {
    const { id } = req.params;

    const shipmentDoc = await db.collection('labShipments').doc(id).get();
    if (!shipmentDoc.exists) {
      return res.status(404).json({ error: 'Spedizione non trovata' });
    }

    const shipment = shipmentDoc.data() as LabShipment;
    if (rejectPrintShopLegacyMutation(shipment, res)) return;

    // 1. Elimina cartella Drive. Se fallisce mantieni il doc per un retry sicuro.
    if (shipment.driveFolderId) {
      try {
        await deleteDriveFile(shipment.driveFolderId);
      } catch (driveErr: any) {
        console.error(
          `⚠️ Eliminazione cartella Drive ${shipment.driveFolderId} fallita:`,
          driveErr.message
        );
        await shipmentDoc.ref.update({
          deleteLastAttemptAt: Timestamp.now(),
          deleteLastError: String(driveErr?.message || driveErr).slice(0, 500),
          updatedAt: Timestamp.now(),
        });
        return res.status(503).json({
          error: 'Impossibile eliminare i file Drive; la spedizione è stata mantenuta e puoi riprovare',
          code: 'drive_delete_failed',
        });
      }
    }

    // 2. Rimuovi il costo collegato dal job
    if (shipment.costoId && shipment.jobId) {
      try {
        const jobRef = db.collection('jobs').doc(shipment.jobId);
        const jobDoc = await jobRef.get();
        if (jobDoc.exists) {
          const job = jobDoc.data();
          const costi: CostoLavoro[] = Array.isArray(job?.costi) ? job.costi : [];
          const filtered = costi.filter((c) => c.id !== shipment.costoId);
          if (filtered.length !== costi.length) {
            await jobRef.update({
              costi: filtered,
              updatedAt: Timestamp.now(),
            });
          }
        }
      } catch (costErr: any) {
        console.error(
          `⚠️ Rimozione costo collegato ${shipment.costoId} fallita (non bloccante):`,
          costErr.message
        );
      }
    }

    // 3. Elimina il doc
    await db.collection('labShipments').doc(id).delete();

    console.log(`🗑️ Spedizione laboratorio eliminata: ${id}`);
    res.json({ success: true, message: 'Spedizione eliminata' });
  } catch (error: any) {
    console.error('❌ Error deleting lab shipment:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SCHEDULER - Auto-eliminazione file scaduti
// ============================================================================

/**
 * Controlla le spedizioni scadute: elimina i file da Drive, marca status='scaduto'
 * e deletedFromDrive=true, aggiunge un evento timeline al job.
 * Ritorna il numero di spedizioni scadute processate.
 */
export async function runLabShipmentExpiryCheck(): Promise<{ expired: number }> {
  const now = Timestamp.fromDate(nowRome().toJSDate());

  // deletedFromDrive != true: include doc senza il campo. Filtriamo lato codice
  // per evitare requisiti di indici compositi.
  const snapshot = await db
    .collection('labShipments')
    .where('expiresAt', '<=', now)
    .get();

  let expired = 0;

  for (const doc of snapshot.docs) {
    const shipment = doc.data() as LabShipment;

    if (shipment.deletedFromDrive === true) continue;
    if (shipment.status === 'scaduto') continue;

    // Marca la spedizione eliminata solo dopo una cancellazione Drive riuscita.
    // In caso di errore resta eleggibile per il prossimo ciclo scheduler.
    if (shipment.driveFolderId) {
      try {
        if (
          shipment.sourceType === 'print_shop' &&
          shipment.drivePermissionId &&
          !shipment.drivePermissionRevokedAt
        ) {
          await revokeShipmentFolderPermission(
            shipment.driveFolderId,
            shipment.drivePermissionId,
          );
          await db.collection('labShipments').doc(doc.id).update({
            drivePermissionRevokedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
        }
        await deleteDriveFile(shipment.driveFolderId);
      } catch (driveErr: any) {
        console.error(
          `⚠️ [Expiry] Eliminazione cartella Drive ${shipment.driveFolderId} fallita; verrà ritentata:`,
          driveErr.message
        );
        await db.collection('labShipments').doc(doc.id).update({
          expiryDeletionLastAttemptAt: Timestamp.now(),
          expiryDeletionLastError: String(driveErr?.message || driveErr).slice(0, 500),
          updatedAt: Timestamp.now(),
        });
        continue;
      }
    }

    await db.collection('labShipments').doc(doc.id).update({
      status: 'scaduto' as LabShipmentStatus,
      deletedFromDrive: true,
      expiryDeletionLastAttemptAt: Timestamp.now(),
      expiryDeletionLastError: FieldValue.delete(),
      updatedAt: Timestamp.now(),
    });

    // Evento timeline sul job (best-effort)
    if (shipment.jobId) {
      try {
        const timelineEvent = {
          id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          jobId: shipment.jobId,
          tipo: 'nota_aggiunta',
          descrizione: `File consegna laboratorio${
            shipment.labNome ? ` (${shipment.labNome})` : ''
          } scaduti ed eliminati automaticamente da Google Drive.`,
          data: Timestamp.now(),
          metadata: { labShipmentId: doc.id },
        };
        await db.collection('jobTimeline').add(timelineEvent);
      } catch (timelineErr: any) {
        console.error(
          `⚠️ [Expiry] Evento timeline non salvato per job ${shipment.jobId}:`,
          timelineErr.message
        );
      }
    }

    expired++;
  }

  return { expired };
}

export default router;
