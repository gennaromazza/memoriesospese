import { SHOP_MAX_SHIPPING_GRAMS, SHOP_MAX_SHIPPING_TIERS, type ShopShippingTier } from '@shared/shop-types';

/**
 * Le fasce di peso nel modulo delle impostazioni: chili e euro come testo
 * (si scrive "0,5" o "1.5"), poi convertiti in grammi e centesimi.
 */
export interface ShippingTierRow {
  kg: string;
  euro: string;
}

const MAX_KG = SHOP_MAX_SHIPPING_GRAMS / 1000;

function toNumber(text: string): number {
  const normalized = text.trim().replace(',', '.');
  return normalized === '' ? NaN : Number(normalized);
}

function trimNumber(value: number): string {
  return String(value).replace('.', ',');
}

export function tiersToRows(tiers: readonly ShopShippingTier[] | undefined): ShippingTierRow[] {
  return (tiers ?? []).map(tier => ({
    kg: trimNumber(tier.maxGrams / 1000),
    euro: (tier.priceCents / 100).toFixed(2).replace('.', ','),
  }));
}

/** Righe → fasce in ordine di peso, più gli errori da mostrare. Le righe vuote si ignorano. */
export function parseTierRows(rows: readonly ShippingTierRow[]): { tiers: ShopShippingTier[]; errors: string[] } {
  const errors: string[] = [];
  const tiers: ShopShippingTier[] = [];
  const filled = rows.filter(row => row.kg.trim() !== '' || row.euro.trim() !== '');
  if (filled.length > SHOP_MAX_SHIPPING_TIERS) errors.push(`Puoi inserire al massimo ${SHOP_MAX_SHIPPING_TIERS} fasce.`);
  filled.forEach((row, index) => {
    const label = `Fascia ${index + 1}`;
    const kg = toNumber(row.kg);
    const euro = toNumber(row.euro);
    if (!Number.isFinite(kg) || kg <= 0 || kg > MAX_KG) {
      errors.push(`${label}: il peso massimo deve essere tra 0,001 e ${MAX_KG} kg.`);
      return;
    }
    if (!Number.isFinite(euro) || euro < 0) {
      errors.push(`${label}: inserisci un costo valido.`);
      return;
    }
    tiers.push({ maxGrams: Math.round(kg * 1000), priceCents: Math.round(euro * 100) });
  });
  const seen = new Set<number>();
  for (const tier of tiers) {
    if (seen.has(tier.maxGrams)) {
      errors.push('Due fasce hanno lo stesso peso massimo.');
      break;
    }
    seen.add(tier.maxGrams);
  }
  tiers.sort((left, right) => left.maxGrams - right.maxGrams);
  return { tiers, errors };
}
