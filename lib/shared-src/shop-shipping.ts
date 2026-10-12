import {
  SHOP_MAX_SHIPPING_GRAMS,
  SHOP_MAX_SHIPPING_TIERS,
  type ShopShippingConfig,
  type ShopShippingTier,
} from './shop-types';

/**
 * Costo della spedizione dello shop. Lo usano il server (che decide il prezzo)
 * e il sito (che lo mostra): con la stessa funzione i due non possono divergere.
 */

/** Fasce valide in ordine di peso: scarta quelle sbagliate e quelle con lo stesso limite (resta l'ultima). */
export function shopShippingTiers(config: ShopShippingConfig | { tiers?: ShopShippingTier[] } | null | undefined): ShopShippingTier[] {
  const byLimit = new Map<number, ShopShippingTier>();
  for (const tier of Array.isArray(config?.tiers) ? config!.tiers! : []) {
    if (
      Number.isSafeInteger(tier?.maxGrams) && tier.maxGrams >= 1 && tier.maxGrams <= SHOP_MAX_SHIPPING_GRAMS &&
      Number.isSafeInteger(tier?.priceCents) && tier.priceCents >= 0 && tier.priceCents <= 100_000_000
    ) {
      byLimit.set(tier.maxGrams, { maxGrams: tier.maxGrams, priceCents: tier.priceCents });
    }
  }
  return [...byLimit.values()].sort((left, right) => left.maxGrams - right.maxGrams).slice(0, SHOP_MAX_SHIPPING_TIERS);
}

/** Il costo dipende dal peso (ci sono fasce) oppure è unico. */
export function isShopShippingByWeight(config: ShopShippingConfig | { tiers?: ShopShippingTier[] } | null | undefined): boolean {
  return shopShippingTiers(config).length > 0;
}

/** Peso dell'ordine in grammi; `complete` è falso se qualche prodotto non ha il peso. */
export function shopOrderWeight(
  lines: ReadonlyArray<{ quantity: number; weightGrams?: number | null }>,
): { grams: number; complete: boolean } {
  let grams = 0;
  let complete = true;
  for (const line of lines) {
    const unit = line.weightGrams;
    if (typeof unit === 'number' && Number.isFinite(unit) && unit > 0) grams += Math.round(unit) * line.quantity;
    else complete = false;
  }
  return { grams, complete };
}

export type ShopShippingQuote =
  | { available: true; cents: number; weightGrams: number | null; tier: ShopShippingTier | null }
  | {
      available: false;
      reason: 'disabled' | 'missing_weight' | 'too_heavy';
      weightGrams: number | null;
      /** Peso massimo spedibile online (ultima fascia), per i messaggi. */
      maxGrams: number | null;
    };

/** Quanto costa spedire queste righe, oppure perché non si può spedire online. */
export function shopShippingQuote(
  config: ShopShippingConfig,
  lines: ReadonlyArray<{ quantity: number; weightGrams?: number | null }>,
): ShopShippingQuote {
  if (!config.enabled) return { available: false, reason: 'disabled', weightGrams: null, maxGrams: null };
  const tiers = shopShippingTiers(config);
  if (tiers.length === 0) {
    const weight = shopOrderWeight(lines);
    return { available: true, cents: config.priceCents, weightGrams: weight.complete ? weight.grams : null, tier: null };
  }
  const maxGrams = tiers[tiers.length - 1].maxGrams;
  const weight = shopOrderWeight(lines);
  if (!weight.complete) return { available: false, reason: 'missing_weight', weightGrams: null, maxGrams };
  const tier = tiers.find(candidate => weight.grams <= candidate.maxGrams);
  if (!tier) return { available: false, reason: 'too_heavy', weightGrams: weight.grams, maxGrams };
  return { available: true, cents: tier.priceCents, weightGrams: weight.grams, tier };
}

/** Soglia di spedizione gratuita valida (centesimi), oppure null se non è attiva. */
export function shopFreeShippingThreshold(config: ShopShippingConfig | null | undefined): number | null {
  const value = config?.freeShippingOverCents;
  if (!config?.enabled || !Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100_000_000) return null;
  return value as number;
}

/** La spedizione è gratuita per questo importo di prodotti? */
export function isShopShippingFree(config: ShopShippingConfig | null | undefined, subtotalCents: number): boolean {
  const threshold = shopFreeShippingThreshold(config);
  return threshold !== null && subtotalCents >= threshold;
}

/** A che punto è il cliente verso la spedizione gratuita; null se l'offerta non c'è. */
export function shopFreeShippingProgress(
  config: ShopShippingConfig | null | undefined,
  subtotalCents: number,
): { thresholdCents: number; remainingCents: number; percent: number; unlocked: boolean } | null {
  const thresholdCents = shopFreeShippingThreshold(config);
  if (thresholdCents === null) return null;
  const spent = Math.max(0, subtotalCents);
  const remainingCents = Math.max(0, thresholdCents - spent);
  return {
    thresholdCents,
    remainingCents,
    percent: Math.min(100, Math.floor((spent / thresholdCents) * 100)),
    unlocked: remainingCents === 0,
  };
}

/** Costo più basso e più alto della spedizione, per la vetrina; null se non c'è un costo da mostrare. */
export function shopShippingPriceRange(config: ShopShippingConfig): { minCents: number; maxCents: number } | null {
  if (!config.enabled) return null;
  const tiers = shopShippingTiers(config);
  if (tiers.length === 0) return { minCents: config.priceCents, maxCents: config.priceCents };
  const prices = tiers.map(tier => tier.priceCents);
  return { minCents: Math.min(...prices), maxCents: Math.max(...prices) };
}

/** Peso per le persone: "450 g", "1,5 kg". */
export function formatShopWeight(grams: number): string {
  if (grams < 1000) return `${Math.round(grams)} g`;
  const kilos = grams / 1000;
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(kilos)} kg`;
}

/** Descrizione di una fascia: "fino a 1 kg", "da 1 a 3 kg". */
export function describeShopShippingTier(tiers: readonly ShopShippingTier[], index: number): string {
  const current = tiers[index];
  if (!current) return '';
  if (index === 0) return `fino a ${formatShopWeight(current.maxGrams)}`;
  return `da ${formatShopWeight(tiers[index - 1].maxGrams)} a ${formatShopWeight(current.maxGrams)}`;
}

/** Perché non si può spedire, in parole per il cliente. */
export function shopShippingUnavailableMessage(
  quote: Extract<ShopShippingQuote, { available: false }>,
): string {
  if (quote.reason === 'disabled') return 'La spedizione non è disponibile.';
  if (quote.reason === 'too_heavy') {
    return `Questo ordine pesa circa ${formatShopWeight(quote.weightGrams ?? 0)}: online spediamo fino a ${formatShopWeight(quote.maxGrams ?? 0)}. Scegli il ritiro in studio o contattaci.`;
  }
  return 'Per uno dei prodotti non abbiamo ancora il peso, quindi non possiamo calcolare la spedizione online. Scegli il ritiro in studio o contattaci.';
}
