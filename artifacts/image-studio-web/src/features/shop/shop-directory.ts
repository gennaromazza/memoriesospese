/** Gli shop del sito e il modo di capire quali sono attivi, per la pagina che li raccoglie. */
export const SHOP_DIRECTORY_PATH = '/negozi';

export interface ShopDirectoryEntry {
  key: 'natale' | 'gift-card' | 'stampe';
  title: string;
  description: string;
  href: string;
  cta: string;
}

export const SHOP_DIRECTORY: readonly ShopDirectoryEntry[] = [
  {
    key: 'natale',
    title: 'Shop online',
    description: 'Regali personalizzati con le tue foto, con ritiro in studio o spedizione in tutta Italia.',
    href: '/online-shop',
    cta: 'Vai allo shop online',
  },
  {
    key: 'gift-card',
    title: 'Gift card',
    description: 'Un regalo da scegliere insieme: scrivi la dedica e invialo subito o nel giorno che vuoi.',
    href: '/regala',
    cta: 'Regala una gift card',
  },
  {
    key: 'stampe',
    title: 'Stampe online',
    description: 'Stampa le tue foto in vari formati e ricevile a casa o ritirale in studio.',
    href: '/stampa-foto-aversa/ordine',
    cta: 'Ordina le tue stampe',
  },
];

/** Stato di ogni shop: `true` attivo, `false` spento, `null` non ancora saputo o non raggiungibile. */
export type ShopActivity = Record<ShopDirectoryEntry['key'], boolean | null>;

export function activeShops(activity: ShopActivity): ShopDirectoryEntry[] {
  return SHOP_DIRECTORY.filter(entry => activity[entry.key] === true);
}

export function shopIsActive(catalog: { enabled: boolean; products: unknown[] } | null | undefined): boolean {
  return Boolean(catalog?.enabled && catalog.products.length > 0);
}
