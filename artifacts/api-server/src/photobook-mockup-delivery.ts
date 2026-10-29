import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { db, storage } from './firebase-admin.js';
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { uploadStreamToDriveFolder, findMatchingShipmentFile } from './google-drive.js';
import { hasValidLabDpa } from './lab-dpa.js';
import type { SavedMockup } from '../shared/mockup-types.js';
import { buildMockupPackage, MOCKUP_PACKAGE_VERSION, type MockupPackageFile } from './photobook-mockup-package.js';

export class MockupDeliveryError extends Error { constructor(public status: number, message: string) { super(message); } }

function shipmentFile(file: MockupPackageFile, uploaded: { fileId: string; webViewLink?: string }) {
  return { driveFileId: uploaded.fileId, name: file.name, size: file.bytes.length, kind: 'supplemental',
    mimeType: file.mimeType, uploadedAt: Timestamp.now(),
    ...(file.sourceQuality ? { sourceQuality: file.sourceQuality } : {}),
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}) };
}

/** Used after page transfer and again before email. Never sends an email. */
export async function ensureConfirmedMockupAttached(book: DocumentSnapshot) {
  if (!book.exists) throw new MockupDeliveryError(409, 'Fotolibro non trovato');
  const version = book.data()!.currentVersion;
  const saved = (await book.ref.collection('mockups').doc(`v${version}`).get()).data();
  if (saved?.status !== 'confirmed') return;
  return attachConfirmedMockup(book, version, saved.revision);
}

/** Risolve un esito ambiguo solo trovando la stessa copia; mai un nuovo upload. */
export async function reconcileMockupAttachment(book: DocumentSnapshot, version: number, revision: number) {
  const attachmentRef = book.ref.collection('mockupAttachments').doc(`v${version}-r${revision}`);
  const previous = await attachmentRef.get();
  const attachment = previous.data();
  if (!attachment) throw new MockupDeliveryError(404, 'Nessun trasferimento da verificare per questa revisione');
  if (attachment.status === 'attached' && attachment.packageVersion === MOCKUP_PACKAGE_VERSION) return attachment;
  if (attachment.status === 'uploading' && Date.now() - Date.parse(attachment.startedAt) < 15 * 60_000) throw new MockupDeliveryError(409, 'Trasferimento ancora in corso: attendi prima di verificare');
  const current = await book.ref.collection('mockups').doc(`v${version}`).get();
  const saved = (current.data()?.revision === revision ? current.data() : (await book.ref.collection('mockupHistory').doc(`v${version}-r${revision}`).get()).data()) as SavedMockup | undefined;
  if (saved?.status !== 'confirmed' || !saved.reportPath || !saved.option) throw new MockupDeliveryError(409, 'Copia confermata non disponibile');
  const shipmentRef = db.collection('labShipments').doc(attachment.shipmentId);
  const shipmentDoc = await shipmentRef.get();
  const shipment = shipmentDoc.data();
  if (!shipment?.driveFolderId || shipment.sourceType !== 'photobook' || shipment.photobookId !== book.id || shipment.jobId !== book.data()!.jobId || shipment.labId !== saved.option.labId || shipment.status !== 'da_inviare' || shipment.sentAt || shipment.deletedFromDrive || shipment.mockupDispatching || shipment.pageTransfer?.status === 'running') throw new MockupDeliveryError(409, 'La spedizione è cambiata: verifica manualmente prima di proseguire');
  const packageFiles = await buildMockupPackage(book, saved);
  const files: ReturnType<typeof shipmentFile>[] = [];
  for (const file of packageFiles) {
    const matched = await findMatchingShipmentFile(shipment.driveFolderId, file.name, file.bytes);
    if (!matched) throw new MockupDeliveryError(409, `File non trovato su Drive: ${file.name}. Nessun nuovo upload eseguito: verifica il precedente tentativo prima di riprovare.`);
    files.push(shipmentFile(file, matched));
  }
  const reportFile = files[0];
  await db.runTransaction(async tx => {
    const freshAttachment = await tx.get(attachmentRef);
    const freshShipment = await tx.get(shipmentRef);
    const freshBook = await tx.get(book.ref);
    const data = freshShipment.data();
    if (freshAttachment.data()?.status === 'attached' && freshAttachment.data()?.packageVersion === MOCKUP_PACKAGE_VERSION) return;
    if (freshAttachment.data()?.claim !== attachment.claim || !data || data.mockupTransfer?.claim !== attachment.claim || data.jobId !== freshBook.data()?.jobId || data.driveFolderId !== shipment.driveFolderId || data.labId !== saved.option!.labId || data.status !== 'da_inviare' || data.sentAt || data.mockupDispatching) throw new MockupDeliveryError(409, 'Spedizione cambiata durante la verifica');
    const existingIds = new Set((data.files || []).map((file: any) => file.driveFileId));
    const additions = files.filter(file => !existingIds.has(file.driveFileId));
    tx.update(shipmentRef, { ...(additions.length ? { files: FieldValue.arrayUnion(...additions) } : {}), mockupTransfer: { status: 'attached', claim: attachment.claim, revision }, mockupSnapshot: { version, revision, packageVersion: MOCKUP_PACKAGE_VERSION, photobookId: book.id, labId: saved.option!.labId, modelName: saved.option!.name, confirmedAt: saved.confirmedAt!, driveFileId: reportFile.driveFileId, materialFileNames: files.map(file => file.name) }, updatedAt: Timestamp.now() });
    tx.set(attachmentRef, { ...attachment, status: 'attached', packageVersion: MOCKUP_PACKAGE_VERSION, driveFileId: reportFile.driveFileId, name: reportFile.name, attachedAt: new Date().toISOString() });
  });
  return (await attachmentRef.get()).data();
}

/** Copia esplicita, mai email o sostituzione di un file già consegnato. */
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
    const attachment = { status: 'uploading', claim, shipmentId, version, revision, labId: saved.option.labId, startedAt: new Date().toISOString() };
    tx.set(attachmentRef, attachment);
    tx.update(shipmentRef, { mockupTransfer: { status: 'uploading', claim, revision } });
    return { done: false as const, attachment, saved, shipmentRef, folderId: shipment!.driveFolderId as string, legacyReportId: upgradeLegacy ? previous.data()?.driveFileId as string | undefined : undefined, existingFiles: shipment!.files || [] };
  });
  if (prepared.done) return prepared.attachment;
  // Dal primo tentativo Drive in poi un errore è potenzialmente ambiguo: non
  // liberare il claim né ripetere automaticamente l'upload (evita duplicati).
  let driveFileId: string | undefined;
  let driveAttempted = false;
  try {
    const packageFiles = await buildMockupPackage(book, prepared.saved);
    const files: ReturnType<typeof shipmentFile>[] = [];
    for (let index = 0; index < packageFiles.length; index++) {
      const source = packageFiles[index];
      let uploaded;
      if (index === 0 && prepared.legacyReportId) {
        uploaded = await findMatchingShipmentFile(prepared.folderId, source.name, source.bytes);
        if (!uploaded) throw new MockupDeliveryError(409, 'Il riepilogo precedente non è più presente su Drive: verifica la cartella.');
      } else {
        driveAttempted = true;
        uploaded = await uploadStreamToDriveFolder(prepared.folderId, source.name, source.mimeType, Readable.from([source.bytes]));
      }
      if (index === 0) driveFileId = uploaded.fileId;
      files.push(shipmentFile(source, uploaded));
    }
    const reportFile = files[0];
    const completed = await db.runTransaction(async tx => {
      const attachment = await tx.get(attachmentRef);
      const shipment = await tx.get(prepared.shipmentRef);
      const freshBook = await tx.get(book.ref);
      if (attachment.data()?.claim !== claim || !shipment.exists || !freshBook.exists || shipment.data()!.jobId !== freshBook.data()!.jobId || shipment.data()!.mockupTransfer?.claim !== claim || shipment.data()!.mockupDispatching || shipment.data()!.driveFolderId !== prepared.folderId || shipment.data()!.labId !== prepared.saved.option!.labId || shipment.data()!.status !== 'da_inviare' || shipment.data()!.sentAt) throw new MockupDeliveryError(409, 'Spedizione cambiata durante il trasferimento: verifica manualmente la cartella Drive');
      if (attachment.data()?.status === 'attached') return attachment.data()!;
      const existingIds = new Set((shipment.data()!.files || []).map((file: any) => file.driveFileId));
      const additions = files.filter(file => !existingIds.has(file.driveFileId));
      tx.update(prepared.shipmentRef, { ...(additions.length ? { files: FieldValue.arrayUnion(...additions) } : {}), mockupTransfer: { status: 'attached', claim, revision }, mockupSnapshot: { version, revision, packageVersion: MOCKUP_PACKAGE_VERSION, photobookId: book.id, labId: prepared.saved.option!.labId, modelName: prepared.saved.option!.name, confirmedAt: prepared.saved.confirmedAt!, driveFileId: reportFile.driveFileId, materialFileNames: files.map(file => file.name) }, updatedAt: Timestamp.now() });
      const result = { ...prepared.attachment, status: 'attached', packageVersion: MOCKUP_PACKAGE_VERSION, driveFileId: reportFile.driveFileId, name: reportFile.name, attachedAt: new Date().toISOString() };
      tx.set(attachmentRef, result);
      return result;
    });
    return completed;
  } catch (error) {
    await db.runTransaction(async tx => {
      const attachment = await tx.get(attachmentRef);
      const shipment = await tx.get(prepared.shipmentRef);
      // Una risposta Firestore fallita può arrivare DOPO il commit: non
      // regredire una copia già registrata né riaprire un altro trasferimento.
      if (attachment.data()?.claim !== claim || attachment.data()?.status === 'attached') return;
      tx.set(attachmentRef, { ...prepared.attachment, status: 'needs_review', driveAttempted, ...(driveFileId ? { driveFileId } : {}), message: (error as Error).message || 'Verificare la cartella Drive prima di ripetere il trasferimento' });
      if (shipment.data()?.mockupTransfer?.claim === claim) tx.update(prepared.shipmentRef, { mockupTransfer: { status: 'needs_review', claim, revision } });
    }).catch(() => undefined);
    throw error;
  }
}
