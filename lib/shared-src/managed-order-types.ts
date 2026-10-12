/**
 * Tipi di ordine che nascono dallo shop online del sito e vivono nella
 * collezione `orders` del gestionale, ma si modificano soltanto dal backend
 * dedicato (Admin SDK): è lì che stanno i controlli su PayPal, cassa, foto e
 * conservazione dei file. Le schermate legacy del gestionale non li mostrano e
 * non possono scriverli.
 *
 * - `print_shop`: stampe online (stampe da foto, polaroid, formati classici)
 * - `shop`: vetrina prodotti (per esempio "Shopping online Natale 2026")
 *
 * Le regole Firestore (`isPrintShopOrder` in firestore.rules) hanno lo stesso
 * elenco: se ne aggiungi uno qui, aggiornalo anche lì.
 */
export const MANAGED_ORDER_TYPES = ['print_shop', 'shop'] as const;

export type ManagedOrderType = typeof MANAGED_ORDER_TYPES[number];

export function isManagedOrderType(value: unknown): value is ManagedOrderType {
  return typeof value === 'string' && (MANAGED_ORDER_TYPES as readonly string[]).includes(value);
}
