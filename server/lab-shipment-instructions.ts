import { Readable } from 'node:stream';
import { db, FieldValue, Timestamp } from './firebase-admin.js';
import {
  deleteDriveFile,
  updateDriveFileContent,
  uploadStreamToDriveFolder,
} from './google-drive.js';
import type { LabShipment, LabShipmentFile } from '../shared/lab-types.js';

export const LAB_INSTRUCTIONS_FILE_NAME = 'ISTRUZIONI-DI-STAMPA.txt';

interface PhotobookInstructionContext {
  name: string;
  version?: number;
}

interface ShipmentDocumentReference {
  get(): Promise<{ exists: boolean; data(): Record<string, unknown> | undefined }>;
  update(data: Record<string, unknown>): Promise<unknown>;
}

function buildInstructionDocument(
  shipment: LabShipment,
  photobook: PhotobookInstructionContext,
): string {
  const photoNotes = Array.isArray(shipment.jobNotesSnapshot?.photoNotes)
    ? shipment.jobNotesSnapshot.photoNotes
    : [];
  const supplementalFiles = (shipment.files || []).filter(
    (file) => file.kind === 'supplemental' || file.kind === 'other',
  );
  const generalNote = shipment.labNote || shipment.jobNotesSnapshot?.generalNote || '';
  const lines: string[] = [
    'ISTRUZIONI DI STAMPA',
    '=====================',
    '',
    `Fotolibro: ${photobook.name}`,
    ...(photobook.version ? [`Versione: ${photobook.version}`] : []),
    ...(shipment.descrizione ? [`Descrizione: ${shipment.descrizione}`] : []),
    '',
    'ISTRUZIONI GENERALI',
    '--------------------',
    generalNote || 'Nessuna istruzione generale.',
    '',
    'NOTE CON ALLEGATI',
    '------------------',
  ];

  if (photoNotes.length === 0) {
    lines.push('Nessuna nota con allegato.');
  } else {
    photoNotes.forEach((note, index) => {
      lines.push(
        `${index + 1}. ${note.note || 'Nota senza testo.'}`,
        ...(note.driveFileName ? [`   File collegato: ${note.driveFileName}`] : []),
      );
    });
  }

  lines.push('', 'COPERTINE E ALTRI FILE', '-----------------------');
  if (supplementalFiles.length === 0) {
    lines.push('Nessun file aggiuntivo.');
  } else {
    supplementalFiles.forEach((file, index) => lines.push(`${index + 1}. ${file.name}`));
  }

  lines.push(
    '',
    'IMPORTANTE',
    '----------',
    'Questo documento è il riepilogo unico delle istruzioni e dei materiali allegati alla spedizione.',
    '',
  );
  return lines.join('\r\n');
}

async function resolvePhotobookContext(
  shipment: LabShipment,
  supplied?: PhotobookInstructionContext,
): Promise<PhotobookInstructionContext> {
  if (supplied) return supplied;
  if (shipment.photobookId) {
    const photobookDoc = await db.collection('photobooks').doc(shipment.photobookId).get();
    if (photobookDoc.exists) {
      const data = photobookDoc.data() || {};
      return {
        name: String(data.name || shipment.descrizione || 'Fotolibro'),
        ...(typeof data.currentVersion === 'number' ? { version: data.currentVersion } : {}),
      };
    }
  }
  return { name: shipment.descrizione || 'Fotolibro' };
}

/**
 * Rigenera il documento unico della spedizione partendo dalla copia corrente
 * delle note e dall'elenco degli allegati. Il vecchio file viene eliminato
 * solo dopo che il nuovo documento è stato caricato e registrato.
 */
export async function refreshLabShipmentInstructions(
  shipmentRef: ShipmentDocumentReference,
  suppliedContext?: PhotobookInstructionContext,
): Promise<LabShipment> {
  const shipmentDoc = await shipmentRef.get();
  if (!shipmentDoc.exists) throw new Error('Spedizione non trovata');
  const shipment = shipmentDoc.data() as unknown as LabShipment;
  if (shipment.sourceType !== 'photobook') return shipment;
  if (!shipment.driveFolderId) throw new Error('Cartella Drive della spedizione mancante');

  const context = await resolvePhotobookContext(shipment, suppliedContext);
  const body = buildInstructionDocument(shipment, context);
  const oldManifests = (shipment.files || []).filter(
    (file) => file.kind === 'manifest' || file.name === LAB_INSTRUCTIONS_FILE_NAME,
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
        LAB_INSTRUCTIONS_FILE_NAME,
        'text/plain; charset=utf-8',
        Readable.from([Buffer.from(body, 'utf8')]),
      );
  const manifestFile: LabShipmentFile = {
    driveFileId: uploaded.fileId,
    name: LAB_INSTRUCTIONS_FILE_NAME,
    size: uploaded.size || Buffer.byteLength(body, 'utf8'),
    kind: 'manifest',
    mimeType: 'text/plain; charset=utf-8',
    ...(uploaded.webViewLink ? { webViewLink: uploaded.webViewLink } : {}),
    uploadedAt: Timestamp.now() as unknown as LabShipmentFile['uploadedAt'],
  };
  const files = [
    ...(shipment.files || []).filter(
      (file) => file.kind !== 'manifest' && file.name !== LAB_INSTRUCTIONS_FILE_NAME,
    ),
    manifestFile,
  ];

  await shipmentRef.update({ files, updatedAt: FieldValue.serverTimestamp() });
  await Promise.all(
    oldManifests
      .slice(1)
      .filter((file) => file.driveFileId !== uploaded.fileId)
      .map((file) => deleteDriveFile(file.driveFileId).catch(() => undefined)),
  );

  const updated = await shipmentRef.get();
  return updated.data() as unknown as LabShipment;
}
