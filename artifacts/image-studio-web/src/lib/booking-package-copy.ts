import { format } from 'date-fns';
import { it } from 'date-fns/locale';
import type { BundleItem, Product } from '@shared/booking-types';
import { getBundleGalleryPhotoCount } from './bundle-photos';

/**
 * Testi della pagina di prenotazione che i clienti leggono sui pacchetti.
 * Parole semplici: niente "bundle", "galleria sorgente", "selezione libera".
 */

/** Intervallo della settimana su una sola riga: "20 – 26 nov 2026". */
export function formatWeekRange(start: Date, end: Date): string {
  const fmt = (date: Date, pattern: string) => format(date, pattern, { locale: it });
  if (start.toDateString() === end.toDateString()) return fmt(end, 'd MMM yyyy');
  if (start.getFullYear() !== end.getFullYear()) return `${fmt(start, 'd MMM yyyy')} – ${fmt(end, 'd MMM yyyy')}`;
  if (start.getMonth() !== end.getMonth()) return `${fmt(start, 'd MMM')} – ${fmt(end, 'd MMM yyyy')}`;
  return `${fmt(start, 'd')} – ${fmt(end, 'd MMM yyyy')}`;
}

const FREE_PHOTOS = 'Foto a tua scelta';

/** Riga sotto il prezzo: quante foto comprende il pacchetto. */
export function packageHeadline(product: Product): string {
  if (product.isBundle && product.bundleItems && product.bundleItems.length > 0) {
    const photos = product.fotoCondivise
      ? product.prodottoSorgenteFotoId ? getBundleGalleryPhotoCount(product.bundleItems, product.prodottoSorgenteFotoId) : 0
      : getBundleGalleryPhotoCount(product.bundleItems);
    if (photos > 0) return `${photos} foto nella galleria digitale`;
    const sourceIncluded = product.bundleItems.some(item => item.prodottoId === product.prodottoSorgenteFotoId && item.numeroFoto > 0);
    return product.fotoCondivise && !sourceIncluded ? 'Foto da concordare con lo studio' : FREE_PHOTOS;
  }
  return product.numeroFoto > 0 ? `${product.numeroFoto} foto incluse` : FREE_PHOTOS;
}

export function packageItemsTitle(count: number): string {
  return `Nel pacchetto: ${count} ${count === 1 ? 'prodotto' : 'prodotti'}`;
}

/** Una frase sola per i pacchetti con foto condivise. */
export function sharedPhotosNotice(): string {
  return 'Le foto di tutti i prodotti si scelgono dalla stessa galleria dello shooting.';
}

/** Nota breve accanto a ogni prodotto del pacchetto. */
export function packageItemNote(product: Product, item: BundleItem): string {
  if (!(item.numeroFoto > 0)) return FREE_PHOTOS;
  if (product.fotoCondivise && item.prodottoId !== product.prodottoSorgenteFotoId) {
    return item.quantita > 1
      ? `${item.numeroFoto} foto ciascuno, scelte tra quelle dello shooting`
      : `${item.numeroFoto} foto, scelta tra quelle dello shooting`;
  }
  return `${item.numeroFoto} foto`;
}
