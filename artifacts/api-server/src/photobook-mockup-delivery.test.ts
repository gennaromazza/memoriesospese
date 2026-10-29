import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ docs: new Map<string, any>(), uploads: [] as string[], failUpload: false, failAtName: '', failAfterCommit: false, found: true, afterUpload: null as (() => void) | null, txQueue: Promise.resolve() }));
function patch(path: string, value: any) {
  const result = { ...h.docs.get(path) };
  for (const [key, item] of Object.entries(value) as [string, any][]) result[key] = item?.__union ? [...(result[key] || []), ...item.__union] : item;
  h.docs.set(path, result);
}
function ref(path: string): any {
  return { path, id: path.split('/').pop(), collection: (name: string) => ({ doc: (id: string) => ref(`${path}/${name}/${id}`) }),
    get: async () => { const value = h.docs.get(path); return { exists: !!value, ref: ref(path), id: path.split('/').pop(), data: () => value ? { ...value } : undefined }; },
    update: async (data: any) => patch(path, data), set: async (data: any) => h.docs.set(path, data),
  };
}
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { arrayUnion: (...items: unknown[]) => ({ __union: items }) }, Timestamp: { now: () => ({ toMillis: () => 1000 }) } }));
vi.mock('./firebase-admin.js', () => ({ db: {
  collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
  runTransaction: (run: any) => {
    const result = h.txQueue.then(async () => {
      const writes: (() => void)[] = [];
      const value = await run({ get: (r: any) => r.get(), set: (r: any, data: any) => writes.push(() => h.docs.set(r.path, data)), update: (r: any, data: any) => writes.push(() => patch(r.path, data)) });
      writes.forEach(write => write());
      if (h.failAfterCommit) { h.failAfterCommit = false; throw new Error('Risposta persa dopo commit'); }
      return value;
    });
    h.txQueue = result.then(() => undefined, () => undefined);
    return result;
  },
}, storage: { bucket: () => ({ file: () => ({ download: async () => [Buffer.from('<html>Mockup confermato</html>')] }) }) } }));
vi.mock('./google-drive.js', () => ({ uploadStreamToDriveFolder: async (_folder: string, name: string) => {
  h.uploads.push(name); if (h.failUpload || name === h.failAtName) throw new Error('Risposta Drive incerta'); h.afterUpload?.(); return { fileId: name.endsWith('.html') ? 'drive-report' : `drive-${name}`, size: 28 };
}, findMatchingShipmentFile: async (_folder: string, name: string) => h.found ? { fileId: name.endsWith('.html') ? 'drive-report' : `drive-${name}`, size: 28 } : null }));
import { attachConfirmedMockup, reconcileMockupAttachment } from './photobook-mockup-delivery';

describe('Allegato mockup confermato nella spedizione esistente', () => {
  beforeEach(() => {
    h.docs.clear(); h.uploads = []; h.failUpload = false; h.failAtName = ''; h.failAfterCommit = false; h.found = true; h.afterUpload = null; h.txQueue = Promise.resolve();
    h.docs.set('photobooks/book', { currentVersion: 1, jobId: 'job', labShipmentId: 'shipment' });
    h.docs.set('photobooks/book/mockups/v1', { status: 'confirmed', revision: 3, version: 1, reportPath: 'private.html', confirmedAt: '2026-09-09T10:00:00Z', option: { labId: 'lab', name: 'Custodia' } });
    h.docs.set('labShipments/shipment', { sourceType: 'photobook', photobookId: 'book', jobId: 'job', labId: 'lab', status: 'da_inviare', driveFolderId: 'folder', files: [{ driveFileId: 'original-page' }], pageTransfer: { status: 'completed' } });
    h.docs.set('labs/lab', { attivo: true, dataProcessingAgreementStatus: 'signed', dataProcessingAgreementReference: 'DPA-01', dataProcessingAgreementSignedAt: { toMillis: () => 1000 } });
  });
  const attach = async () => attachConfirmedMockup(await ref('photobooks/book').get(), 1, 3);
  it('allega la copia confermata una sola volta, preserva gli originali e non invia email', async () => {
    await attach(); await attach();
    expect(h.uploads).toEqual(['MOCKUP-book-v1-r3.html', 'MOCKUP-book-v1-r3-MATERIALI.txt']);
    expect(h.docs.get('labShipments/shipment').files).toHaveLength(3);
    expect(h.docs.get('labShipments/shipment').files[0].driveFileId).toBe('original-page');
    expect(h.docs.get('labShipments/shipment').mockupSnapshot.revision).toBe(3);
    expect(h.docs.get('labShipments/shipment').status).toBe('da_inviare');
  });
  it.each([{ labId: 'other' }, { jobId: 'other' }, { photobookId: 'other' }, { sourceType: 'print_shop' }, { status: 'inviato' }, { deletedFromDrive: true }, { pageTransfer: { status: 'running' } }, { mockupDispatching: true }])('blocca destinazioni e stati incompatibili %j', async data => {
    Object.assign(h.docs.get('labShipments/shipment'), data);
    await expect(attach()).rejects.toMatchObject({ status: 409 }); expect(h.uploads).toHaveLength(0);
  });
  it('rifiuta bozze, revisioni obsolete e laboratori senza DPA', async () => {
    h.docs.get('photobooks/book/mockups/v1').status = 'draft';
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    h.docs.get('photobooks/book/mockups/v1').status = 'confirmed';
    h.docs.get('labs/lab').dataProcessingAgreementStatus = 'pending';
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(0);
  });
  it('non duplica dopo una risposta Drive ambigua e mantiene la spedizione bloccata', async () => {
    h.failUpload = true;
    await expect(attach()).rejects.toThrow('incerta');
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('needs_review');
    expect(h.docs.get('photobooks/book/mockupAttachments/v1-r3').status).toBe('needs_review');
  });
  it('ricontrolla la destinazione dopo il trasferimento senza registrare una conferma falsa', async () => {
    h.afterUpload = () => { h.docs.get('labShipments/shipment').labId = 'other'; };
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    expect(h.docs.get('labShipments/shipment').mockupSnapshot).toBeUndefined();
    expect(h.docs.get('photobooks/book/mockupAttachments/v1-r3').driveFileId).toBe('drive-report');
  });
  it('serializza due richieste concorrenti senza doppio upload', async () => {
    const results = await Promise.allSettled([attach(), attach()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(h.uploads).toHaveLength(2);
  });
  it('riconcilia la copia già presente dopo un errore senza ripetere l’upload', async () => {
    h.failUpload = true;
    await expect(attach()).rejects.toThrow();
    const result = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(result?.status).toBe('attached');
    expect(h.uploads).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('attached');
  });
  it('non sblocca né ricrea la copia se la verifica non trova il file', async () => {
    h.failUpload = true; h.found = false;
    await expect(attach()).rejects.toThrow();
    await expect(reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3)).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('needs_review');
  });
  it('non regredisce un allegato già registrato dopo una risposta persa post-commit', async () => {
    h.afterUpload = () => { h.failAfterCommit = true; };
    await expect(attach()).rejects.toThrow('dopo commit');
    expect(h.docs.get('photobooks/book/mockupAttachments/v1-r3').status).toBe('attached');
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('attached');
    await attach();
    expect(h.uploads).toHaveLength(2);
    expect(h.docs.get('labShipments/shipment').files).toHaveLength(3);
  });
  it('allega foto del retro e grafica incisione, preservando il file PNG sorgente', async () => {
    h.docs.get('photobooks/book/mockups/v1').configuration = {
      modelId: 'imagebox', coverLayout: 'plaque', photoAssetId: 'bottom', coverPhotoAssetId: 'unused',
      coverEngraving: { mode: 'graphic', assetId: 'engraving' }, glassEngraving: null,
    };
    h.docs.set('photobooks/book/mockupAssets/bottom', { version: 1, storagePath: 'photobook-mockups/book/bottom.jpg', originalStoragePath: 'photobook-mockups/book/bottom-original.jpg' });
    h.docs.set('photobooks/book/mockupAssets/engraving', { version: 1, storagePath: 'photobook-mockups/book/engraving.png', originalStoragePath: 'photobook-mockups/book/engraving-original.png' });
    await attach();
    expect(h.uploads).toContain('MOCKUP-book-v1-r3-foto-fondo-scatola-bottom.jpg');
    expect(h.uploads).toContain('MOCKUP-book-v1-r3-grafica-incisione-copertina-engraving.png');
    expect(h.uploads.some(name => name.includes('unused'))).toBe(false);
    expect(h.docs.get('labShipments/shipment').mockupSnapshot.materialFileNames).toHaveLength(4);
  });
  it('blocca la spedizione quando una foto usata dal mockup è mancante, senza upload parziali', async () => {
    h.docs.get('photobooks/book/mockups/v1').configuration = { modelId: 'album-girevole', coverLayout: 'plaque', backCover: 'photo', backPhotoAssetId: 'missing' };
    await expect(attach()).rejects.toThrow('non disponibile');
    expect(h.uploads).toHaveLength(0);
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('needs_review');
  });
  it('produce il file del monogramma e allega la foto posteriore salvata dei caricamenti precedenti', async () => {
    h.docs.get('photobooks/book/mockups/v1').configuration = {
      modelId: 'album-girevole', assetRevision: 4, coverLayout: 'plaque',
      engravingNames: { first: 'Anna', second: 'Luca' }, backCover: 'photo', backPhotoAssetId: 'back',
    };
    h.docs.set('photobooks/book/mockupAssets/back', { version: 1, storagePath: 'photobook-mockups/book/back.jpg' });
    await attach();
    const shipment = h.docs.get('labShipments/shipment');
    expect(h.uploads).toContain('MOCKUP-book-v1-r3-INCISIONE-monogramma.png');
    expect(shipment.files.find((file: any) => file.name?.includes('posteriore'))).toMatchObject({ sourceQuality: 'stored-preview' });
    expect(shipment.mockupSnapshot.packageVersion).toBe(2);
  });
  it('completa un allegato HTML precedente senza duplicarlo', async () => {
    h.docs.set('photobooks/book/mockupAttachments/v1-r3', { status: 'attached', shipmentId: 'shipment', driveFileId: 'drive-report' });
    h.docs.get('labShipments/shipment').files.push({ driveFileId: 'drive-report', name: 'MOCKUP-book-v1-r3.html' });
    await attach();
    expect(h.uploads).toEqual(['MOCKUP-book-v1-r3-MATERIALI.txt']);
    expect(h.docs.get('labShipments/shipment').files.filter((file: any) => file.driveFileId === 'drive-report')).toHaveLength(1);
  });
  it('non dichiara completo un pacchetto fallito dopo il caricamento HTML', async () => {
    h.failAtName = 'MOCKUP-book-v1-r3-MATERIALI.txt';
    await expect(attach()).rejects.toThrow('incerta');
    expect(h.docs.get('labShipments/shipment').mockupSnapshot).toBeUndefined();
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(2);
    h.found = false;
    await expect(reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3)).rejects.toMatchObject({ status: 409 });
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('needs_review');
  });
});
