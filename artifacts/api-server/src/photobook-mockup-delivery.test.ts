import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ docs: new Map<string, any>(), uploads: [] as string[], remoteFiles: new Map<string, { fileId: string; size: number }>(), failUpload: false, failAtName: '', commitFailedUpload: true, ambiguousName: '', failAfterCommit: false, found: false, afterUpload: null as (() => void) | null, txQueue: Promise.resolve() }));
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
      if (h.failAfterCommit && [...h.docs.values()].some((doc: any) => doc.status === 'attached')) { h.failAfterCommit = false; throw new Error('Risposta persa dopo commit'); }
      return value;
    });
    h.txQueue = result.then(() => undefined, () => undefined);
    return result;
  },
}, storage: { bucket: () => ({ file: () => ({ download: async () => [Buffer.from('<html>Mockup confermato</html>')] }) }) } }));
vi.mock('./google-drive.js', () => ({ uploadStreamToDriveFolder: async (_folder: string, name: string) => {
  h.uploads.push(name);
  const failed = h.failUpload || name === h.failAtName;
  if (!failed || h.commitFailedUpload) h.remoteFiles.set(name, { fileId: name.endsWith('.html') ? 'drive-report' : `drive-${name}`, size: 28 });
  if (failed) throw new Error('Risposta Drive incerta');
  h.afterUpload?.();
  return { fileId: name.endsWith('.html') ? 'drive-report' : `drive-${name}`, size: 28 };
}, findMatchingShipmentFile: async (_folder: string, name: string) => {
  if (name === h.ambiguousName) throw new Error('Più file con lo stesso nome: verifica manualmente la cartella Drive');
  const remote = h.remoteFiles.get(name);
  if (remote) return remote;
  return h.found ? { fileId: name.endsWith('.html') ? 'drive-report' : `drive-${name}`, size: 28 } : null;
} }));
import { attachConfirmedMockup, reconcileMockupAttachment, resumeMockupAttachment } from './photobook-mockup-delivery';
import { photobookShipmentReadiness } from './photobook-shipment-readiness';

describe('Allegato mockup confermato nella spedizione esistente', () => {
  beforeEach(() => {
    h.docs.clear(); h.uploads = []; h.remoteFiles.clear(); h.failUpload = false; h.failAtName = ''; h.commitFailedUpload = true; h.ambiguousName = ''; h.failAfterCommit = false; h.found = false; h.afterUpload = null; h.txQueue = Promise.resolve();
    h.docs.set('photobooks/book', { currentVersion: 1, jobId: 'job', labShipmentId: 'shipment', versions: [{ version: 1, pageCount: 1 }] });
    h.docs.set('photobooks/book/mockups/v1', { status: 'confirmed', revision: 3, version: 1, reportPath: 'private.html', confirmedAt: '2026-09-09T10:00:00Z', option: { labId: 'lab', name: 'Custodia' } });
    h.docs.set('photobookPages/page', { photobookId: 'book', version: 1, pageNumber: 1, storagePath: 'photobooks/book/page.jpg' });
    h.docs.set('labShipments/shipment', { sourceType: 'photobook', photobookId: 'book', photobookVersion: 1, jobId: 'job', labId: 'lab', status: 'da_inviare', driveFolderId: 'folder', files: [{ driveFileId: 'original-page', name: 'pagina-001-page.jpg' }], pageTransfer: { status: 'completed' } });
    h.docs.set('labs/lab', { attivo: true, dataProcessingAgreementStatus: 'signed', dataProcessingAgreementReference: 'DPA-01', dataProcessingAgreementSignedAt: { toMillis: () => 1000 } });
  });
  const attach = async () => attachConfirmedMockup(await ref('photobooks/book').get(), 1, 3);
  const readiness = async () => {
    const dbMock = { collection: (name: string) => name === 'photobookPages'
      ? { where: () => ({ where: () => ({ get: async () => ({ docs: [{ id: 'page', data: () => h.docs.get('photobookPages/page') }] }) }) }) }
      : { doc: (id: string) => ref(`${name}/${id}`) } };
    return photobookShipmentReadiness({ get: (document: any) => document.get() }, dbMock, h.docs.get('labShipments/shipment'));
  };
  it('blocca l’invio quando esiste una bozza non confermata, ma conserva il percorso legacy senza mockup', async () => {
    h.docs.get('photobooks/book/mockups/v1').status = 'draft';
    expect(await readiness()).toMatch(/non è confermato/i);
    h.docs.delete('photobooks/book/mockups/v1');
    expect(await readiness()).toBeNull();
  });
  it('aggiunge il pacchetto a una spedizione già inviata solo con il recupero esplicito', async () => {
    h.docs.get('photobooks/book').locked = true;
    Object.assign(h.docs.get('labShipments/shipment'), { status: 'inviato', sentAt: 'original-send-date' });
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    const book = await ref('photobooks/book').get();
    await attachConfirmedMockup(book, 1, 3, true);
    await attachConfirmedMockup(book, 1, 3, true);
    expect(h.uploads).toHaveLength(2);
    expect(h.docs.get('labShipments/shipment')).toMatchObject({ status: 'inviato', sentAt: 'original-send-date' });
    expect(h.docs.get('labShipments/shipment').files[0].driveFileId).toBe('original-page');
    expect(h.docs.get('photobooks/book').locked).toBe(true);
  });
  it.each([{ status: 'in_stampa' }, { photobookVersion: 2 }, { mockupSnapshot: { revision: 2 } }, { labId: 'other' }])('rifiuta il recupero su una destinazione non più compatibile %j', async change => {
    h.docs.get('photobooks/book').locked = true;
    Object.assign(h.docs.get('labShipments/shipment'), { status: 'inviato', sentAt: 'original-send-date' }, change);
    await expect(attachConfirmedMockup(await ref('photobooks/book').get(), 1, 3, true)).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(0);
  });
  it('non registra il recupero se cambia la spedizione collegata durante il trasferimento', async () => {
    h.docs.get('photobooks/book').locked = true;
    Object.assign(h.docs.get('labShipments/shipment'), { status: 'inviato', sentAt: 'original-send-date' });
    h.afterUpload = () => { h.docs.get('photobooks/book').labShipmentId = 'other-shipment'; };
    await expect(attachConfirmedMockup(await ref('photobooks/book').get(), 1, 3, true)).rejects.toMatchObject({ status: 409 });
    expect(h.docs.get('labShipments/shipment').mockupSnapshot).toBeUndefined();
  });
  it('riconcilia un recupero post-invio ambiguo senza duplicare HTML o reinviare email', async () => {
    h.docs.get('photobooks/book').locked = true;
    Object.assign(h.docs.get('labShipments/shipment'), { status: 'inviato', sentAt: 'original-send-date' });
    h.failUpload = true;
    await expect(attachConfirmedMockup(await ref('photobooks/book').get(), 1, 3, true)).rejects.toThrow('incerta');
    const checked = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(checked).toMatchObject({ status: 'needs_review', canResume: true });
    h.failUpload = false;
    await resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(h.uploads.filter(name => name.endsWith('.html'))).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment')).toMatchObject({ status: 'inviato', sentAt: 'original-send-date' });
  });
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
    expect(h.docs.get('photobooks/book/mockupAttachments/v1-r3').fileProgress[0].driveFileId).toBe('drive-report');
  });
  it('serializza due richieste concorrenti senza doppio upload', async () => {
    const results = await Promise.allSettled([attach(), attach()]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(h.uploads).toHaveLength(2);
  });
  it('riconcilia la copia già presente dopo un errore senza ripetere l’upload', async () => {
    h.failUpload = true;
    await expect(attach()).rejects.toThrow();
    const partial = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(partial).toMatchObject({ status: 'needs_review', canResume: true });
    expect(partial.fileProgress.map((file: any) => file.status)).toEqual(['found', 'missing']);
    expect(partial.fileProgress[0].sha256).toMatch(/^[a-f0-9]{64}$/);
    h.failUpload = false;
    const result = await resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(result?.status).toBe('attached');
    expect(h.uploads).toHaveLength(2);
    expect(h.uploads[0]).toMatch(/\.html$/);
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('attached');
  });
  it('non sblocca né ricrea la copia se la verifica non trova il file', async () => {
    h.failUpload = true; h.commitFailedUpload = false;
    await expect(attach()).rejects.toThrow();
    const result = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(result).toMatchObject({ status: 'needs_review', canResume: true });
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
    h.remoteFiles.set('MOCKUP-book-v1-r3.html', { fileId: 'drive-report', size: 28 });
    await attach();
    expect(h.uploads).toEqual(['MOCKUP-book-v1-r3-MATERIALI.txt']);
    expect(h.docs.get('labShipments/shipment').files.filter((file: any) => file.driveFileId === 'drive-report')).toHaveLength(1);
  });
  it('non dichiara completo un pacchetto fallito dopo il caricamento HTML', async () => {
    h.failAtName = 'MOCKUP-book-v1-r3-MATERIALI.txt';
    h.commitFailedUpload = false;
    await expect(attach()).rejects.toThrow('incerta');
    expect(h.docs.get('labShipments/shipment').mockupSnapshot).toBeUndefined();
    await expect(attach()).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(2);
    const verification = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(verification).toMatchObject({ status: 'needs_review', canResume: true });
    expect(verification.fileProgress.map((file: any) => file.status)).toEqual(['found', 'missing']);
    expect(await readiness()).toMatch(/mockup confermato/i);
    h.failAtName = '';
    const completed = await resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(completed.status).toBe('attached');
    expect(h.uploads.filter(name => name.endsWith('.html'))).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment').mockupTransfer.status).toBe('attached');
    expect(await readiness()).toBeNull();
  });
  it('riprende solo i file mancanti dopo un’interruzione durante il caricamento di una foto', async () => {
    h.docs.get('photobooks/book/mockups/v1').configuration = { modelId: 'imagebox', coverLayout: 'plaque', photoAssetId: 'bottom' };
    h.docs.set('photobooks/book/mockupAssets/bottom', { version: 1, storagePath: 'photobook-mockups/book/bottom.jpg' });
    h.failAtName = 'MOCKUP-book-v1-r3-foto-fondo-scatola-bottom.jpg';
    h.commitFailedUpload = false;
    await expect(attach()).rejects.toThrow('incerta');
    const verification = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(verification).toMatchObject({ canResume: true });
    h.failAtName = '';
    const result = await resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(result.status).toBe('attached');
    expect(h.uploads.filter(name => name.endsWith('.html'))).toHaveLength(1);
    expect(h.uploads.filter(name => name.includes('foto-fondo-scatola-bottom.jpg'))).toHaveLength(2);
    expect(h.docs.get('labShipments/shipment').files).toHaveLength(4);
  });
  it('blocca il recupero se una corrispondenza remota è ambigua', async () => {
    h.failUpload = true; h.commitFailedUpload = false;
    await expect(attach()).rejects.toThrow();
    h.ambiguousName = 'MOCKUP-book-v1-r3.html';
    const result = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(result).toMatchObject({ status: 'needs_review', canResume: false });
    expect(result.fileProgress[0].status).toBe('ambiguous');
    const resume = await resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(resume).toMatchObject({ status: 'needs_review', canResume: false });
    expect(h.uploads).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment').mockupSnapshot).toBeUndefined();
  });
  it.each([
    ['cartella Drive cambiata', () => { h.docs.get('labShipments/shipment').driveFolderId = 'different-folder'; }],
    ['DPA non valido', () => { h.docs.get('labs/lab').dataProcessingAgreementStatus = 'pending'; }],
    ['versione non più attuale', () => { h.docs.get('photobooks/book').currentVersion = 2; }],
  ])('rifiuta il recupero se cambiano %s', async (_label, change) => {
    h.failAtName = 'MOCKUP-book-v1-r3-MATERIALI.txt';
    h.commitFailedUpload = false;
    await expect(attach()).rejects.toThrow();
    const verification = await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    expect(verification).toMatchObject({ canResume: true });
    change();
    const uploadCount = h.uploads.length;
    await expect(resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3)).rejects.toMatchObject({ status: 409 });
    expect(h.uploads).toHaveLength(uploadCount);
    expect(h.docs.get('labShipments/shipment').mockupSnapshot).toBeUndefined();
  });
  it('gestisce il doppio clic sul recupero senza caricare due volte lo stesso file mancante', async () => {
    h.failUpload = true; h.commitFailedUpload = false;
    await expect(attach()).rejects.toThrow();
    await reconcileMockupAttachment(await ref('photobooks/book').get(), 1, 3);
    h.failUpload = false;
    const results = await Promise.allSettled([
      resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3),
      resumeMockupAttachment(await ref('photobooks/book').get(), 1, 3),
    ]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(h.uploads.filter(name => name.endsWith('.html'))).toHaveLength(2);
    expect(h.uploads.filter(name => name.endsWith('-MATERIALI.txt'))).toHaveLength(1);
    expect(h.docs.get('labShipments/shipment').mockupSnapshot.packageVersion).toBe(2);
  });
});
