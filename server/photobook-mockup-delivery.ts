import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { db, storage } from './firebase-admin.js';
import { FieldValue, Timestamp, type DocumentSnapshot } from 'firebase-admin/firestore';
import { uploadStreamToDriveFolder, findMatchingShipmentFile } from './google-drive.js';
import { hasValidLabDpa } from './lab-dpa.js';
import type { SavedMockup } from '../shared/mockup-types.js';

export class MockupDeliveryError extends Error { constructor(public status: number, message: string) { super(message); } }

/** Risolve un esito ambiguo solo trovando la stessa copia; mai un nuovo upload. */
export async function reconcileMockupAttachment(book: DocumentSnapshot, version: number, revision: number) {
  const attachmentRef = book.ref.collection('mockupAttachments').doc(`v${version}-r${revision}`);
  const previous = await attachmentRef.get();
  const attachment = previous.data();
  if (!attachment) throw new MockupDeliveryError(404, 'Nessun trasferimento da verificare per questa revisione');
  if (attachment.status === 'attached') return attachment;
  if (attachment.status === 'uploading' && Date.now() - Date.parse(attachment.startedAt) < 15 * 60_000) throw new MockupDeliveryError(409, 'Trasferimento ancora in corso: attendi prima di verificare');
  const current = await book.ref.collection('mockups').doc(`v${version}`).get();
  const saved = (current.data()?.revision === revision ? current.data() : (await book.ref.collection('mockupHistory').doc(`v${version}-r${revision}`).get()).data()) as SavedMockup | undefined;
  if (saved?.status !== 'confirmed' || !saved.reportPath || !saved.option) throw new MockupDeliveryError(409, 'Copia confermata non disponibile');
  const shipmentRef = db.collection('labShipments').doc(attachment.shipmentId);
  const shipmentDoc = await shipmentRef.get();
  const shipment = shipmentDoc.data();
  if (!shipment?.driveFolderId || shipment.sourceType !== 'photobook' || shipment.photobookId !== book.id || shipment.jobId !== book.data()!.jobId || shipment.labId !== saved.option.labId || shipment.status !== 'da_inviare' || shipment.sentAt || shipment.deletedFromDrive || shipment.mockupDispatching) throw new MockupDeliveryError(409, 'La spedizione è cambiata: verifica manualmente prima di proseguire');
  const [bytes] = await storage.bucket().file(saved.reportPath).download();
  const name = `MOCKUP-${book.id}-v${version}-r${revision}.html`;
  const matched = await findMatchingShipmentFile(shipment.driveFolderId, name, bytes);
  if (!matched) throw new MockupDeliveryError(409, 'Copia non trovata su Drive. Nessun nuovo upload eseguito: serve verificare il precedente tentativo prima di riprovare.');
  await db.runTransaction(async tx => {
    const freshAttachment = await tx.get(attachmentRef);
    const freshShipment = await tx.get(shipmentRef);
    const freshBook = await tx.get(book.ref);
    const data = freshShipment.data();
    if (freshAttachment.data()?.status === 'attached') return;
    if (freshAttachment.data()?.claim !== attachment.claim || !data || data.mockupTransfer?.claim !== attachment.claim || data.jobId !== freshBook.data()?.jobId || data.driveFolderId !== shipment.driveFolderId || data.labId !== saved.option!.labId || data.status !== 'da_inviare' || data.sentAt || data.mockupDispatching) throw new MockupDeliveryError(409, 'Spedizione cambiata durante la verifica');
    const file = { driveFileId: matched.fileId, name, size: bytes.length, kind: 'supplemental', mimeType: 'text/html', uploadedAt: Timestamp.now(), ...(matched.webViewLink ? { webViewLink: matched.webViewLink } : {}) };
    tx.update(shipmentRef, { files: FieldValue.arrayUnion(file), mockupTransfer: { status: 'attached', claim: attachment.claim, revision }, mockupSnapshot: { version, revision, photobookId: book.id, labId: saved.option!.labId, modelName: saved.option!.name, confirmedAt: saved.confirmedAt!, driveFileId: matched.fileId }, updatedAt: Timestamp.now() });
    tx.set(attachmentRef, { ...attachment, status: 'attached', driveFileId: matched.fileId, name, attachedAt: new Date().toISOString() });
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
    if (previous.data()?.status === 'attached' && previous.data()?.shipmentId === shipmentId) return { done: true as const, attachment: previous.data()! };
    if (previous.exists) throw new MockupDeliveryError(409, 'Esiste già un tentativo per questa revisione. Verifica la cartella Drive prima di ripetere: nessun duplicato è stato creato.');
    if (shipment!.mockupDispatching || shipment!.mockupTransfer?.status === 'uploading' || shipment!.mockupTransfer?.status === 'needs_review') throw new MockupDeliveryError(409, 'Spedizione occupata da un trasferimento o invio da verificare');
    if (shipment!.status !== 'da_inviare' || shipment!.sentAt || shipment!.deletedFromDrive || !shipment!.driveFolderId || shipment!.pageTransfer?.status === 'running') throw new MockupDeliveryError(409, 'Attendi il trasferimento delle pagine; la spedizione deve essere ancora da inviare');
    const lab = await tx.get(db.collection('labs').doc(saved.option.labId));
    if (!lab.exists || lab.data()!.attivo === false || !hasValidLabDpa(lab.data()!)) throw new MockupDeliveryError(409, 'Verifica laboratorio attivo e accordo DPA firmato prima di allegare fotografie');
    const attachment = { status: 'uploading', claim, shipmentId, version, revision, labId: saved.option.labId, startedAt: new Date().toISOString() };
    tx.set(attachmentRef, attachment);
    tx.update(shipmentRef, { mockupTransfer: { status: 'uploading', claim, revision } });
    return { done: false as const, attachment, saved, shipmentRef, folderId: shipment!.driveFolderId as string };
  });
  if (prepared.done) return prepared.attachment;
  // Dal primo tentativo Drive in poi un errore è potenzialmente ambiguo: non
  // liberare il claim né ripetere automaticamente l'upload (evita duplicati).
  let driveFileId: string | undefined;
  try {
    const [bytes] = await storage.bucket().file(prepared.saved.reportPath!).download();
    const name = `MOCKUP-${book.id}-v${version}-r${revision}.html`;
    const uploaded = await uploadStreamToDriveFolder(prepared.folderId, name, 'text/html', Readable.from([bytes]));
    driveFileId = uploaded.fileId;
    const file = { driveFileId, name, size: bytes.length, kind: 'supplemental', mimeType: 'text/html', uploadedAt: Timestamp.now(), ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}) };
    const completed = await db.runTransaction(async tx => {
      const attachment = await tx.get(attachmentRef);
      const shipment = await tx.get(prepared.shipmentRef);
      const freshBook = await tx.get(book.ref);
      if (attachment.data()?.claim !== claim || !shipment.exists || !freshBook.exists || shipment.data()!.jobId !== freshBook.data()!.jobId || shipment.data()!.mockupTransfer?.claim !== claim || shipment.data()!.mockupDispatching || shipment.data()!.driveFolderId !== prepared.folderId || shipment.data()!.labId !== prepared.saved.option!.labId || shipment.data()!.status !== 'da_inviare' || shipment.data()!.sentAt) throw new MockupDeliveryError(409, 'Spedizione cambiata durante il trasferimento: verifica manualmente la cartella Drive');
      if (attachment.data()?.status === 'attached') return attachment.data()!;
      tx.update(prepared.shipmentRef, { files: FieldValue.arrayUnion(file), mockupTransfer: { status: 'attached', claim, revision }, mockupSnapshot: { version, revision, photobookId: book.id, labId: prepared.saved.option!.labId, modelName: prepared.saved.option!.name, confirmedAt: prepared.saved.confirmedAt!, driveFileId }, updatedAt: Timestamp.now() });
      const result = { ...prepared.attachment, status: 'attached', driveFileId, name, attachedAt: new Date().toISOString() };
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
      tx.set(attachmentRef, { ...prepared.attachment, status: 'needs_review', ...(driveFileId ? { driveFileId } : {}), message: 'Verificare la cartella Drive prima di ripetere il trasferimento' });
      if (shipment.data()?.mockupTransfer?.claim === claim) tx.update(prepared.shipmentRef, { mockupTransfer: { status: 'needs_review', claim, revision } });
    }).catch(() => undefined);
    throw error;
  }
}
