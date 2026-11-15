export interface OrderedPhotobookPage {
  id: string;
  pageNumber: number;
  storagePath: string;
  driveOrderWidth?: number;
}

/** The editor's page number, not original filename or query order, is authoritative.
 * Gaps are legal. Reject collisions rather than silently dropping a page. */
export function orderPhotobookPages<T extends OrderedPhotobookPage>(pages: T[]): T[] {
  const numbers = new Set<number>();
  const ids = new Set<string>();
  for (const page of pages) {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber < 1
      || !page.id || !page.storagePath || numbers.has(page.pageNumber) || ids.has(page.id)) {
      throw new Error('Numerazione pagine non valida o duplicata: verifica l’ordine nell’editor prima del trasferimento.');
    }
    numbers.add(page.pageNumber);
    ids.add(page.id);
  }
  const width = Math.max(3, ...pages.map(page => String(page.pageNumber).length));
  return pages.map(page => ({ ...page, driveOrderWidth: width })).sort((a, b) => a.pageNumber - b.pageNumber);
}

export function photobookPageFileName(page: OrderedPhotobookPage): string {
  const extension = page.storagePath.match(/\.(\w+)$/)?.[1] || 'jpg';
  return `pagina-${String(page.pageNumber).padStart(page.driveOrderWidth || 3, '0')}-${page.id}.${extension}`;
}
