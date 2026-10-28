/**
 * Must run inside the dispatch transaction: retry and dispatch compete for the
 * same shipment document. File names are the stable keys used by the page copier.
 */
export async function photobookShipmentReadiness(tx: any, db: any, shipment: any): Promise<string | null> {
  if (shipment.deletedFromDrive) return 'I file della spedizione non sono più disponibili.';
  const transfer = shipment.pageTransfer;
  if (transfer && (transfer.status !== 'completed' || transfer.failed?.length)) {
    return 'Trasferimento pagine incompleto: completa o riprova le pagine mancanti prima di inviare.';
  }
  if (!shipment.photobookId) {
    return transfer ? 'Fotolibro di origine non trovato.' : null; // Valid legacy mockup-only shipment.
  }
  const bookDoc = await tx.get(db.collection('photobooks').doc(shipment.photobookId));
  if (!bookDoc.exists) return transfer ? 'Fotolibro di origine non trovato.' : null;
  const book = bookDoc.data();
  const version = shipment.photobookVersion ?? book.currentVersion;
  if (version !== book.currentVersion) return 'La spedizione contiene una versione precedente: trasferisci le pagine della versione corrente.';
  const versionInfo = book.versions?.find((entry: any) => entry.version === version);
  const pages = await tx.get(db.collection('photobookPages')
    .where('photobookId', '==', shipment.photobookId).where('version', '==', version));
  const expectedCount = versionInfo?.pageCount;
  if (!Number.isInteger(expectedCount) || expectedCount < 1 || pages.docs.length !== expectedCount) {
    return 'Le pagine del fotolibro sono mancanti o il conteggio non coincide. Verifica le pagine prima di inviare.';
  }
  const files = new Set((shipment.files || []).filter((file: any) => file.driveFileId).map((file: any) => file.name));
  for (const doc of pages.docs) {
    const page = doc.data();
    if (!page.storagePath) return 'Una pagina non ha il file originale. Ripristinala prima di inviare.';
    const extension = String(page.storagePath).match(/\.(\w+)$/)?.[1] || 'jpg';
    const name = `pagina-${String(page.pageNumber).padStart(3, '0')}-${doc.id}.${extension}`;
    if (!files.has(name)) return 'Mancano pagine nella spedizione. Premi “Riprova pagine mancanti” prima di inviare.';
  }
  return null;
}
