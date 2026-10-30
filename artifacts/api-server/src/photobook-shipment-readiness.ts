import { orderPhotobookPages, photobookPageFileName } from './photobook-page-order.js';

/**
 * Current originals are compared by both filename/page identity and the exact
 * Firebase Storage path registered when the file was copied to Drive. Legacy
 * entries without a source path can only be matched by their stable filename.
 */
export async function comparePhotobookShipmentPages(tx: any, db: any, shipment: any) {
  if (!shipment.photobookId) {
    return { obsoleteFiles: [], missingPages: [], pages: [], version: undefined, expectedPageCount: undefined };
  }
  const bookDoc = await tx.get(db.collection('photobooks').doc(shipment.photobookId));
  if (!bookDoc.exists) {
    return { obsoleteFiles: [], missingPages: [], pages: [], version: undefined, expectedPageCount: undefined };
  }
  const book = bookDoc.data();
  const version = shipment.photobookVersion ?? book.currentVersion;
  const expectedPageCount = book.versions?.find((entry: any) => entry.version === version)?.pageCount;
  const pagesSnapshot = await tx.get(db.collection('photobookPages')
    .where('photobookId', '==', shipment.photobookId).where('version', '==', version));
  const pages = orderPhotobookPages(pagesSnapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })));
  const originalFiles = (shipment.files || []).filter((file: any) =>
    file.driveFileId && (file.kind === 'original' || /^pagina-\d+-/.test(file.name || '')),
  );
  const usedFileIds = new Set<string>();
  const missingPages: Array<{ pageNumber: number; name: string; storagePath: string }> = [];

  for (const page of pages) {
    if (!page.storagePath) {
      missingPages.push({ pageNumber: page.pageNumber, name: '', storagePath: '' });
      continue;
    }
    const name = photobookPageFileName(page);
    const candidates = originalFiles.filter((file: any) =>
      file.name === name && !usedFileIds.has(file.driveFileId),
    );
    // Prefer exact provenance; the filename-only fallback keeps legacy
    // shipments usable while still detecting all replacements made after
    // provenance tracking was introduced.
    const matching = candidates.find((file: any) => file.sourceStoragePath === page.storagePath)
      || candidates.find((file: any) => !file.sourceStoragePath);
    if (matching) usedFileIds.add(matching.driveFileId);
    else missingPages.push({ pageNumber: page.pageNumber, name, storagePath: page.storagePath });
  }

  const obsoleteFiles = originalFiles
    .filter((file: any) => !usedFileIds.has(file.driveFileId))
    .map((file: any) => ({
      driveFileId: file.driveFileId,
      name: file.name,
      pageNumber: file.sourcePageNumber
        || Number(String(file.name).match(/^pagina-(\d+)-/)?.[1])
        || undefined,
      sourceStoragePath: file.sourceStoragePath,
    }));
  return { obsoleteFiles, missingPages, pages, version, expectedPageCount };
}

/**
 * Must run inside the dispatch transaction: cleanup and dispatch compete for
 * the same shipment document.
 */
export async function photobookShipmentReadiness(tx: any, db: any, shipment: any): Promise<string | null> {
  if (shipment.deletedFromDrive) return 'I file della spedizione non sono più disponibili.';
  if (shipment.photobookPageCleanup?.status === 'running') {
    return 'È in corso l’archiviazione delle pagine obsolete. Attendi il completamento.';
  }
  if (shipment.photobookPageCleanup?.status === 'needs_review'
    || (shipment.photobookPageCleanup?.status === 'completed' && shipment.photobookPageCleanup.instructionsUpdated === false)) {
    return 'La sistemazione delle pagine obsolete richiede una verifica. Completa o ripeti l’archiviazione prima di inviare.';
  }
  const transfer = shipment.pageTransfer;
  if (transfer && (transfer.status !== 'completed' || transfer.failed?.length)) {
    return 'Trasferimento pagine incompleto: completa o riprova le pagine mancanti prima di inviare.';
  }
  if (transfer?.instructionsError) return 'Le pagine sono verificate ma le istruzioni sono incomplete. Riprendi la preparazione prima dell’email.';
  if (!shipment.photobookId) {
    return transfer ? 'Fotolibro di origine non trovato.' : null; // Valid legacy mockup-only shipment.
  }
  const comparison = await comparePhotobookShipmentPages(tx, db, shipment);
  const bookDoc = await tx.get(db.collection('photobooks').doc(shipment.photobookId));
  if (!bookDoc.exists) return transfer ? 'Fotolibro di origine non trovato.' : null;
  const book = bookDoc.data();
  const version = shipment.photobookVersion ?? book.currentVersion;
  if (version !== book.currentVersion) return 'La spedizione contiene una versione precedente: trasferisci le pagine della versione corrente.';
  const mockup = (await tx.get(bookDoc.ref.collection('mockups').doc(`v${version}`))).data();
  if (mockup?.status === 'confirmed') {
    const snapshot = shipment.mockupSnapshot;
    if (shipment.mockupTransfer?.status !== 'attached' || snapshot?.version !== version || snapshot?.revision !== mockup.revision || snapshot?.packageVersion !== 2) {
      return 'Il mockup confermato e tutti i suoi materiali devono essere allegati prima di inviare.';
    }
    const names = new Set((shipment.files || []).filter((file: any) => file.driveFileId).map((file: any) => file.name));
    if (!snapshot.materialFileNames?.length || snapshot.materialFileNames.some((name: string) => !names.has(name))) {
      return 'Mancano file del pacchetto mockup. Verifica gli allegati prima di inviare.';
    }
  }
  const versionInfo = book.versions?.find((entry: any) => entry.version === version);
  const pages = comparison.pages;
  const expectedCount = versionInfo?.pageCount;
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || pages.length !== expectedCount) {
    return 'Le pagine del fotolibro sono mancanti o il conteggio non coincide. Verifica le pagine prima di inviare.';
  }
  if (comparison.obsoleteFiles.length) {
    return `La spedizione contiene ${comparison.obsoleteFiles.length} pagine obsolete. Archiviali fuori dalla cartella del laboratorio prima di inviare.`;
  }
  if (comparison.missingPages.length) {
    if (comparison.missingPages.some((page: any) => !page.storagePath)) {
      return 'Una pagina non ha il file originale. Ripristinala prima di inviare.';
    }
    return 'Mancano pagine correnti nella spedizione. Premi “Riprova pagine mancanti” prima di inviare.';
  }
  return null;
}
