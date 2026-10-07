import { Readable } from 'node:stream';
import { db, FieldValue, Timestamp } from './firebase-admin.js';
import {
  deleteDriveFile,
  updateDriveFileContent,
  uploadStreamToDriveFolder,
} from './google-drive.js';
import type { LabShipment, LabShipmentFile } from '../shared/lab-types.js';
import {
  buildWalkInLabManifest,
  WALK_IN_LAB_MANIFEST_FILENAME,
} from './walk-in-lab-shipment.js';

interface ShipmentDocumentReference {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  update(data: Record<string, unknown>): Promise<unknown>;
}

/** Mantiene aggiornata la distinta dell'ordine nella cartella Drive dell'invio. */
export async function refreshWalkInLabShipmentInstructions(
  shipmentRef: ShipmentDocumentReference,
): Promise<LabShipment> {
  const shipmentDoc = await shipmentRef.get();
  if (!shipmentDoc.exists) throw new Error('Spedizione non trovata');

  const shipment = shipmentDoc.data() as unknown as LabShipment;
  if (shipment.sourceType !== 'walk_in') return shipment;
  if (!shipment.driveFolderId) {
    throw new Error('Cartella Drive della spedizione mancante');
  }
  if (!shipment.walkInOrderSnapshot) {
    throw new Error('Snapshot dell’ordine walk-in mancante');
  }

  const body = buildWalkInLabManifest(shipment.walkInOrderSnapshot, shipment);
  const oldManifests = (shipment.files || []).filter(
    (file) =>
      file.kind === 'manifest' ||
      file.name === WALK_IN_LAB_MANIFEST_FILENAME,
  );
  const primaryManifest = oldManifests[0];
  const uploaded = primaryManifest
    ? await updateDriveFileContent(
        primaryManifest.driveFileId,
        'text/plain; charset=utf-8',
        Readable.from([Buffer.from(body, 'utf8')]),
      )
    : await uploadStreamToDriveFolder(
        shipment.driveFolderId,
        WALK_IN_LAB_MANIFEST_FILENAME,
        'text/plain; charset=utf-8',
        Readable.from([Buffer.from(body, 'utf8')]),
      );

  const manifestFile: LabShipmentFile = {
    driveFileId: uploaded.fileId,
    name: WALK_IN_LAB_MANIFEST_FILENAME,
    size: uploaded.size || Buffer.byteLength(body, 'utf8'),
    kind: 'manifest',
    mimeType: 'text/plain; charset=utf-8',
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
    uploadedAt: Timestamp.now() as unknown as LabShipmentFile['uploadedAt'],
  };
  const files = [
    ...(shipment.files || []).filter(
      (file) =>
        file.kind !== 'manifest' &&
        file.name !== WALK_IN_LAB_MANIFEST_FILENAME,
    ),
    manifestFile,
  ];

  await shipmentRef.update({
    files,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await Promise.all(
    oldManifests
      .slice(1)
      .filter((file) => file.driveFileId !== uploaded.fileId)
      .map((file) => deleteDriveFile(file.driveFileId).catch(() => undefined)),
  );

  const updated = await shipmentRef.get();
  return updated.data() as unknown as LabShipment;
}
