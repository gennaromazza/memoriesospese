import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { db } from './firebase-admin.js';
import { FieldValue, Timestamp, type DocumentReference, type DocumentSnapshot } from 'firebase-admin/firestore';
import { uploadStreamToDriveFolder, findMatchingShipmentFile } from './google-drive.js';
import { hasValidLabDpa } from './lab-dpa.js';
import type { SavedMockup } from '../shared/mockup-types.js';
import { buildMockupPackage, MOCKUP_PACKAGE_VERSION, type MockupPackageFile } from './photobook-mockup-package.js';

export class MockupDeliveryError extends Error { constructor(public status: number, message: string) { super(message); } }

type FileState = 'pending' | 'uploading' | 'uploaded' | 'found' | 'missing' | 'ambiguous';
type FileProgress = { name: string; size: number; sha256: string; status: FileState; driveFileId?: string; message?: string };

function progressFor(file: MockupPackageFile, status: FileState, match?: { fileId: string }): FileProgress {
  return { name: file.name, size: file.bytes.length, sha256: file.sha256, status, ...(match ? { driveFileId: match.fileId } : {}) };
}

function shipmentFile(file: MockupPackageFile, uploaded: { fileId: string; webViewLink?: string }) {
  return { driveFileId: uploaded.fileId, name: file.name, size: file.bytes.length, kind: 'supplemental',
    mimeType: file.mimeType, uploadedAt: Timestamp.now(),
    ...(file.sourceQuality ? { sourceQuality: file.sourceQuality } : {}),
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}) };
}

function packageSnapshot(bookId: string, version: number, revision: number, saved: SavedMockup, reportFile: ReturnType<typeof shipmentFile>, files: ReturnType<typeof shipmentFile>[]) {
  return { version, revision, packageVersion: MOCKUP_PACKAGE_VERSION, photobookId: bookId, labId: saved.option!.labId,
    modelName: saved.option!.name, confirmedAt: saved.confirmedAt!, driveFileId: reportFile.driveFileId,
    materialFileNames: files.map(file => file.name) };
}

async function validateRecoveryContext(book: DocumentSnapshot, version: number, revision: number, attachment: any) {
  const current = await book.ref.collection('mockups').doc(`v${version}`).get();
  const saved = (current.data()?.revision === revision ? current.data() :
    (await book.ref.collection('mockupHistory').doc(`v${version}-r${revision}`).get()).data()) as SavedMockup | undefined;
  if (book.data()?.currentVersion !== version || saved?.revision !== revision || saved.status !== 'confirmed' || !saved.reportPath || !saved.option) {
    throw new MockupDeliveryError(409, 'Copia confermata non disponibile per questa versione e revisione');
  }
  const shipmentRef = db.collection('labShipments').doc(attachment.shipmentId);
  const shipmentDoc = await shipmentRef.get();
  const shipment = shipmentDoc.data();
  if (!shipmentDoc.exists || !shipment?.driveFolderId || shipment.sourceType !== 'photobook' || shipment.photobookId !== book.id
    || shipment.jobId !== book.data()?.jobId || shipment.labId !== saved.option.labId || shipment.status !== 'da_inviare'
    || shipment.sentAt || shipment.deletedFromDrive || shipment.mockupDispatching || shipment.pageTransfer?.status === 'running'
    || (attachment.driveFolderId && attachment.driveFolderId !== shipment.driveFolderId)) {
    throw new MockupDeliveryError(409, 'La spedizione è cambiata: verifica manualmente prima di proseguire');
  }
  const lab = await db.collection('labs').doc(saved.option.labId).get();
  if (!lab.exists || lab.data()?.attivo === false || !hasValidLabDpa(lab.data()!)) {
    throw new MockupDeliveryError(409, 'Verifica laboratorio attivo e accordo DPA firmato prima di allegare fotografie');
  }
  return { saved, shipmentRef, shipment, folderId: shipment.driveFolderId as string };
}

async function persistProgress(attachmentRef: DocumentReference, shipmentRef: DocumentReference, claim: string, fileProgress: FileProgress[], status: 'uploading' | 'needs_review') {
  await db.runTransaction(async tx => {
    const attachmentDoc = await tx.get(attachmentRef);
    const shipmentDoc = await tx.get(shipmentRef);
    if (attachmentDoc.data()?.claim !== claim || shipmentDoc.data()?.mockupTransfer?.claim !== claim) {
      throw new MockupDeliveryError(409, 'Il trasferimento è cambiato durante la verifica');
    }
    tx.set(attachmentRef, { ...attachmentDoc.data(), status, fileProgress, recoveryClaim: status === 'needs_review' ? null : attachmentDoc.data()?.recoveryClaim, progressUpdatedAt: new Date().toISOString() });
    if (shipmentDoc.data()?.mockupTransfer?.status !== 'attached') {
      tx.update(shipmentRef, { mockupTransfer: { status, claim, revision: attachmentDoc.data()?.revision } });
    }
  });
}

async function finalizeAttachment(book: DocumentSnapshot, version: number, revision: number, attachmentRef: DocumentReference, shipmentRef: DocumentReference,
  attachment: any, saved: SavedMockup, files: ReturnType<typeof shipmentFile>[], fileProgress: FileProgress[]) {
  if (fileProgress.some(file => !['uploaded', 'found'].includes(file.status)) || files.length !== fileProgress.length) {
    throw new MockupDeliveryError(409, 'Il pacchetto mockup non è completo: nessuna email inviata');
  }
  const reportFile = files[0];
  return db.runTransaction(async tx => {
    const freshAttachment = await tx.get(attachmentRef);
    const freshShipment = await tx.get(shipmentRef);
    const freshBook = await tx.get(book.ref);
    const labDoc = await tx.get(db.collection('labs').doc(saved.option!.labId));
    const data = freshShipment.data();
    if (freshAttachment.data()?.claim !== attachment.claim || freshAttachment.data()?.recoveryClaim !== attachment.recoveryClaim || !data || !freshBook.exists
      || freshBook.data()?.currentVersion !== version || freshBook.data()?.jobId !== data.jobId
      || data.mockupTransfer?.claim !== attachment.claim
      || data.driveFolderId !== attachment.driveFolderId || data.labId !== saved.option!.labId
      || data.sourceType !== 'photobook' || data.photobookId !== book.id || data.status !== 'da_inviare'
      || data.sentAt || data.deletedFromDrive || data.mockupDispatching || data.pageTransfer?.status === 'running'
      || !labDoc.exists || labDoc.data()?.attivo === false || !hasValidLabDpa(labDoc.data()!)) {
      throw new MockupDeliveryError(409, 'Destinazione, laboratorio o autorizzazione cambiati durante il trasferimento');
    }
    const existingIds = new Set((data.files || []).map((file: any) => file.driveFileId));
    const additions = files.filter(file => !existingIds.has(file.driveFileId));
    tx.update(shipmentRef, {
      ...(additions.length ? { files: FieldValue.arrayUnion(...additions) } : {}),
      mockupTransfer: { status: 'attached', claim: attachment.claim, revision },
      mockupSnapshot: packageSnapshot(book.id, version, revision, saved, reportFile, files),
      updatedAt: Timestamp.now(),
    });
    const result = { ...freshAttachment.data(), status: 'attached', recoveryClaim: null, packageVersion: MOCKUP_PACKAGE_VERSION,
      driveFileId: reportFile.driveFileId, name: reportFile.name, fileProgress, attachedAt: new Date().toISOString() };
    tx.set(attachmentRef, result);
    return result;
  });
}

async function inspectRemoteFiles(folderId: string, packageFiles: MockupPackageFile[]) {
  const files: ReturnType<typeof shipmentFile>[] = [];
  const fileProgress: FileProgress[] = [];
  for (const file of packageFiles) {
    try {
      const matched = await findMatchingShipmentFile(folderId, file.name, file.bytes);
      if (!matched) fileProgress.push(progressFor(file, 'missing'));
      else {
        files.push(shipmentFile(file, matched));
        fileProgress.push(progressFor(file, 'found', matched));
      }
    } catch (error) {
      fileProgress.push({ ...progressFor(file, 'ambiguous'), message: (error as Error).message || 'Esito Drive non verificabile' });
    }
  }
  return { files, fileProgress };
}

/** Used after page transfer and again before email. Never sends an email. */
export async function ensureConfirmedMockupAttached(book: DocumentSnapshot) {
  if (!book.exists) throw new MockupDeliveryError(409, 'Fotolibro non trovato');
  const version = book.data()!.currentVersion;
  const saved = (await book.ref.collection('mockups').doc(`v${version}`).get()).data();
  if (saved?.status !== 'confirmed') return;
  return attachConfirmedMockup(book, version, saved.revision);
}

/** Verifica nome e byte di ogni file, senza caricare o inviare email. */
export async function reconcileMockupAttachment(book: DocumentSnapshot, version: number, revision: number) {
  const attachmentRef = book.ref.collection('mockupAttachments').doc(`v${version}-r${revision}`);
  const attachmentDoc = await attachmentRef.get();
  const attachment = attachmentDoc.data();
  if (!attachment) throw new MockupDeliveryError(404, 'Nessun trasferimento da verificare per questa revisione');
  if (attachment.status === 'attached' && attachment.packageVersion === MOCKUP_PACKAGE_VERSION) return attachment;
  if (attachment.status === 'uploading' && (attachment.recoveryClaim || Date.now() - Date.parse(attachment.startedAt) < 15 * 60_000)) {
    throw new MockupDeliveryError(409, 'Trasferimento ancora in corso: attendi prima di verificare');
  }
  const { saved, shipmentRef, folderId } = await validateRecoveryContext(book, version, revision, attachment);
  const packageFiles = await buildMockupPackage(book, saved);
  const inspected = await inspectRemoteFiles(folderId, packageFiles);
  const report = await attachmentRef.get();
  if (report.data()?.claim !== attachment.claim) throw new MockupDeliveryError(409, 'Il trasferimento è cambiato durante la verifica');
  if (inspected.fileProgress.some(file => file.status === 'ambiguous')) {
    await persistProgress(attachmentRef, shipmentRef, attachment.claim, inspected.fileProgress, 'needs_review');
    return { ...attachment, status: 'needs_review', fileProgress: inspected.fileProgress, canResume: false };
  }
  if (inspected.fileProgress.some(file => file.status === 'missing')) {
    await persistProgress(attachmentRef, shipmentRef, attachment.claim, inspected.fileProgress, 'needs_review');
    return { ...attachment, status: 'needs_review', fileProgress: inspected.fileProgress, canResume: true };
  }
  return finalizeAttachment(book, version, revision, attachmentRef, shipmentRef, attachment, saved, inspected.files, inspected.fileProgress);
}

/** Rechecks every remote file and uploads only files proven absent. */
export async function resumeMockupAttachment(book: DocumentSnapshot, version: number, revision: number) {
  const attachmentRef = book.ref.collection('mockupAttachments').doc(`v${version}-r${revision}`);
  const shipmentRefForClaim = (shipmentId: string) => db.collection('labShipments').doc(shipmentId);
  const initial = (await attachmentRef.get()).data();
  if (!initial) throw new MockupDeliveryError(404, 'Nessun trasferimento da riprendere');
  if (initial.status === 'attached' && initial.packageVersion === MOCKUP_PACKAGE_VERSION) return initial;
  const recoveryClaim = randomUUID();
  await db.runTransaction(async tx => {
    const attachmentDoc = await tx.get(attachmentRef);
    const attachment = attachmentDoc.data();
    if (!attachment || attachment.claim !== initial.claim || attachment.status !== 'needs_review' || attachment.recoveryClaim) {
      throw new MockupDeliveryError(409, 'Recupero già in corso o trasferimento da verificare prima');
    }
    const shipmentRef = shipmentRefForClaim(attachment.shipmentId);
    const shipmentDoc = await tx.get(shipmentRef);
    const shipment = shipmentDoc.data();
    const bookDoc = await tx.get(book.ref);
    const savedDoc = await tx.get(book.ref.collection('mockups').doc(`v${version}`));
    const saved = (savedDoc.data()?.revision === revision ? savedDoc.data() :
      (await tx.get(book.ref.collection('mockupHistory').doc(`v${version}-r${revision}`))).data()) as SavedMockup | undefined;
    const labDoc = saved?.option ? await tx.get(db.collection('labs').doc(saved.option.labId)) : null;
    if (!bookDoc.exists || bookDoc.data()?.currentVersion !== version || !saved || saved.revision !== revision || saved.status !== 'confirmed'
      || !saved.option || !shipment || shipment.sourceType !== 'photobook' || shipment.photobookId !== book.id
      || shipment.jobId !== bookDoc.data()?.jobId || shipment.labId !== saved.option.labId || !shipment.driveFolderId
      || (attachment.driveFolderId && shipment.driveFolderId !== attachment.driveFolderId) || shipment.status !== 'da_inviare' || shipment.sentAt
      || shipment.deletedFromDrive || shipment.mockupDispatching || shipment.pageTransfer?.status === 'running'
      || shipment.mockupTransfer?.claim !== attachment.claim || shipment.mockupTransfer?.status !== 'needs_review'
      || !labDoc?.exists || labDoc.data()?.attivo === false || !hasValidLabDpa(labDoc.data()!)) {
      throw new MockupDeliveryError(409, 'Destinazione, revisione o laboratorio non è più idoneo al recupero');
    }
    tx.set(attachmentRef, { ...attachment, driveFolderId: shipment.driveFolderId, status: 'uploading', recoveryClaim, startedAt: new Date().toISOString() });
    tx.update(shipmentRef, { mockupTransfer: { status: 'uploading', claim: attachment.claim, recoveryClaim, revision } });
  });
  const attachment = (await attachmentRef.get()).data()!;
  let shipmentRef: any;
  let progress: FileProgress[] = [];
  let files: ReturnType<typeof shipmentFile>[] = [];
  let currentFileName: string | undefined;
  try {
    const { saved, shipment, folderId } = await validateRecoveryContext(book, version, revision, attachment);
    shipmentRef = db.collection('labShipments').doc(attachment.shipmentId);
    const packageFiles = await buildMockupPackage(book, saved);
    const inspected = await inspectRemoteFiles(folderId, packageFiles);
    progress = inspected.fileProgress;
    files = inspected.files;
    if (progress.some(file => file.status === 'ambiguous')) {
      await persistProgress(attachmentRef, shipmentRef, attachment.claim, progress, 'needs_review');
      return { ...attachment, status: 'needs_review', fileProgress: progress, canResume: false };
    }
    for (const source of packageFiles) {
      const state = progress.find(file => file.name === source.name)!;
      if (state.status !== 'missing') continue;
      currentFileName = source.name;
      state.status = 'uploading';
      await persistProgress(attachmentRef, shipmentRef, attachment.claim, progress, 'uploading');
      const uploaded = await uploadStreamToDriveFolder(folderId, source.name, source.mimeType, Readable.from([source.bytes]));
      const file = shipmentFile(source, uploaded);
      files.push(file);
      Object.assign(state, { status: 'uploaded', driveFileId: uploaded.fileId });
      await persistProgress(attachmentRef, shipmentRef, attachment.claim, progress, 'uploading');
    }
    return await finalizeAttachment(book, version, revision, attachmentRef, shipmentRef, attachment, saved, packageFiles.map(source =>
      files.find(file => file.name === source.name)!), progress);
  } catch (error) {
    const failed = progress.find(file => file.name === currentFileName);
    if (failed?.status === 'uploading') {
      failed.status = 'ambiguous';
      failed.message = 'Risposta dell’upload non confermata: verifica prima di riprovare';
    }
    if (shipmentRef) await persistProgress(attachmentRef, shipmentRef, attachment.claim, progress, 'needs_review').catch(() => undefined);
    else await db.runTransaction(async tx => {
      const fresh = await tx.get(attachmentRef);
      if (fresh.data()?.recoveryClaim === attachment.recoveryClaim) tx.set(attachmentRef, { ...fresh.data(), status: 'needs_review', recoveryClaim: null, fileProgress: progress });
    }).catch(() => undefined);
    throw error;
  }
}

/** First-time copy. Any uncertain Drive response requires reconciliation, never an automatic retry. */
export async function attachConfirmedMockup(book: DocumentSnapshot, version: number, revision: number) {
  const claim = randomUUID();
  const source = book.ref.collection('mockups').doc(`v${version}`);
  const attachmentRef = book.ref.collection('mockupAttachments').doc(`v${version}-r${revision}`);
  const prepared = await db.runTransaction(async tx => {
    const fresh = await tx.get(book.ref);
    const savedDoc = await tx.get(source);
    const saved = savedDoc.data() as SavedMockup | undefined;
    const previous = await tx.get(attachmentRef);
    if (!fresh.exists || fresh.data()!.currentVersion !== version || !saved || saved.revision !== revision || saved.status !== 'confirmed' || !saved.reportPath || !saved.option) throw new MockupDeliveryError(409, 'Conferma prima la revisione corrente del mockup');
    const shipmentId = fresh.data()!.labShipmentId;
    if (!shipmentId) throw new MockupDeliveryError(409, 'Prepara prima la spedizione dal comando Manda in stampa del fotolibro');
    const shipmentRef = db.collection('labShipments').doc(shipmentId);
    const shipmentDoc = await tx.get(shipmentRef);
    const shipment = shipmentDoc.data();
    if (!shipmentDoc.exists || shipment!.sourceType !== 'photobook' || shipment!.photobookId !== book.id || shipment!.jobId !== fresh.data()!.jobId || shipment!.labId !== saved.option.labId) throw new MockupDeliveryError(409, 'La spedizione deve appartenere a questo lavoro, fotolibro e laboratorio del mockup');
    if (previous.data()?.status === 'attached' && previous.data()?.shipmentId === shipmentId && previous.data()?.packageVersion === MOCKUP_PACKAGE_VERSION) return { done: true as const, attachment: previous.data()! };
    const retryPreflight = previous.data()?.status === 'needs_review' && previous.data()?.driveAttempted === false && previous.data()?.shipmentId === shipmentId;
    const upgradeLegacy = previous.data()?.status === 'attached' && previous.data()?.shipmentId === shipmentId;
    if (previous.exists && !retryPreflight && !upgradeLegacy) throw new MockupDeliveryError(409, 'Esiste già un tentativo per questa revisione. Verifica la cartella Drive prima di ripetere: nessun duplicato è stato creato.');
    if (shipment!.mockupDispatching || shipment!.mockupTransfer?.status === 'uploading' || (shipment!.mockupTransfer?.status === 'needs_review' && !(retryPreflight && shipment!.mockupTransfer?.claim === previous.data()?.claim))) throw new MockupDeliveryError(409, 'Spedizione occupata da un trasferimento o invio da verificare');
    if (shipment!.status !== 'da_inviare' || shipment!.sentAt || shipment!.deletedFromDrive || !shipment!.driveFolderId || shipment!.pageTransfer?.status === 'running') throw new MockupDeliveryError(409, 'Attendi il trasferimento delle pagine; la spedizione deve essere ancora da inviare');
    const lab = await tx.get(db.collection('labs').doc(saved.option.labId));
    if (!lab.exists || lab.data()!.attivo === false || !hasValidLabDpa(lab.data()!)) throw new MockupDeliveryError(409, 'Verifica laboratorio attivo e accordo DPA firmato prima di allegare fotografie');
    const attachment = { status: 'uploading', claim, shipmentId, driveFolderId: shipment!.driveFolderId, version, revision, labId: saved.option.labId, startedAt: new Date().toISOString() };
    tx.set(attachmentRef, attachment);
    tx.update(shipmentRef, { mockupTransfer: { status: 'uploading', claim, revision } });
    return { done: false as const, attachment, saved, shipmentRef, folderId: shipment!.driveFolderId as string,
      legacyReportId: upgradeLegacy ? previous.data()?.driveFileId as string | undefined : undefined };
  });
  if (prepared.done) return prepared.attachment;
  let driveAttempted = false;
  let currentFile: MockupPackageFile | undefined;
  let progress: FileProgress[] = [];
  try {
    const packageFiles = await buildMockupPackage(book, prepared.saved);
    progress = packageFiles.map(file => progressFor(file, 'pending'));
    await persistProgress(attachmentRef, prepared.shipmentRef, claim, progress, 'uploading');
    const files: ReturnType<typeof shipmentFile>[] = [];
    for (let index = 0; index < packageFiles.length; index++) {
      const source = packageFiles[index];
      currentFile = source;
      let uploaded;
      if (index === 0 && prepared.legacyReportId) {
        uploaded = await findMatchingShipmentFile(prepared.folderId, source.name, source.bytes);
        if (!uploaded) throw new MockupDeliveryError(409, 'Il riepilogo precedente non è più presente su Drive: verifica la cartella.');
        progress[index] = progressFor(source, 'found', uploaded);
      } else {
        driveAttempted = true;
        progress[index] = progressFor(source, 'uploading');
        await persistProgress(attachmentRef, prepared.shipmentRef, claim, progress, 'uploading');
        uploaded = await uploadStreamToDriveFolder(prepared.folderId, source.name, source.mimeType, Readable.from([source.bytes]));
        progress[index] = progressFor(source, 'uploaded', uploaded);
      }
      files.push(shipmentFile(source, uploaded));
      await persistProgress(attachmentRef, prepared.shipmentRef, claim, progress, 'uploading');
    }
    return await finalizeAttachment(book, version, revision, attachmentRef, prepared.shipmentRef, prepared.attachment,
      prepared.saved, files, progress);
  } catch (error) {
    if (currentFile && progress.find(file => file.name === currentFile!.name)?.status === 'uploading') {
      const item = progress.find(file => file.name === currentFile!.name)!;
      item.status = 'ambiguous';
      item.message = 'Risposta dell’upload non confermata: verifica prima di riprovare';
    }
    await db.runTransaction(async tx => {
      const attachment = await tx.get(attachmentRef);
      const shipment = await tx.get(prepared.shipmentRef);
      if (attachment.data()?.claim !== claim || attachment.data()?.status === 'attached') return;
      tx.set(attachmentRef, { ...prepared.attachment, status: 'needs_review', driveAttempted,
        fileProgress: progress, ...(error instanceof Error ? { message: error.message } : {}) });
      if (shipment.data()?.mockupTransfer?.claim === claim) tx.update(prepared.shipmentRef, { mockupTransfer: { status: 'needs_review', claim, revision } });
    }).catch(() => undefined);
    throw error;
  }
}
