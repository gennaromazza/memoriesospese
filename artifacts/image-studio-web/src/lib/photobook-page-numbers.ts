/**
 * Assegna il numero pagina ai file caricati nell'editor fotolibro.
 *
 * Se il nome contiene un numero (ultima sequenza di cifre prima
 * dell'estensione, es. "7.jpg", "IMG_0007.jpg") e quel numero è libero,
 * diventa il numero della pagina: così ricaricare "7.jpg" rimette la
 * pagina 7 al suo posto. Negli altri casi (nome senza numero, numero già
 * occupato o ripetuto nello stesso caricamento) la pagina va in coda.
 */

const MAX_PAGE_NUMBER = 999;

export function pageNumberFromFileName(name: string): number | null {
  const base = name.replace(/\.[^.]+$/, '');
  const matches = base.match(/\d+/g);
  if (!matches) return null;
  const n = Number(matches[matches.length - 1]);
  return Number.isInteger(n) && n >= 1 && n <= MAX_PAGE_NUMBER ? n : null;
}

export interface PageNumberAssignment<T extends { name: string }> {
  file: T;
  pageNumber: number;
  /** true se il numero non viene dal nome file (messa in coda) */
  appended: boolean;
}

/** Restituisce le assegnazioni ordinate per numero pagina crescente. */
export function assignPageNumbers<T extends { name: string }>(
  files: T[],
  takenNumbers: Iterable<number>,
): PageNumberAssignment<T>[] {
  const taken = new Set(takenNumbers);
  const sorted = [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
  const result: PageNumberAssignment<T>[] = [];
  const pending: T[] = [];

  // 1° passaggio: numeri espliciti liberi, prima di toccare la coda
  for (const file of sorted) {
    const n = pageNumberFromFileName(file.name);
    if (n !== null && !taken.has(n)) {
      taken.add(n);
      result.push({ file, pageNumber: n, appended: false });
    } else {
      pending.push(file);
    }
  }

  // 2° passaggio: tutto il resto in coda dopo l'ultima pagina
  let next = Math.max(0, ...taken) + 1;
  for (const file of pending) {
    result.push({ file, pageNumber: next++, appended: true });
  }

  return result.sort((a, b) => a.pageNumber - b.pageNumber);
}
