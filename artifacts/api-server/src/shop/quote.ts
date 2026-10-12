import { randomBytes } from 'node:crypto';
import {
  SHOP_CURRENCY,
  SHOP_MAX_LINES,
  SHOP_MAX_QUANTITY,
  type ShopFulfillmentMethod,
  type ShopOrderLineDto,
  type ShopOrderLineInput,
  type ShopProductDto,
  type ShopQuoteDto,
} from '@shared/shop-types';
import { isShopShippingFree, shopShippingQuote, shopShippingUnavailableMessage } from '@shared/shop-shipping';
import type { ShopShippingConfig } from '@shared/shop-types';
import { CommerceHttpError } from '../commerce/errors.js';
import { hashId, stableStringify } from '../commerce/text.js';

const LINE_ID = /^l_[a-f0-9]{8}$/;

export function newLineId(): string {
  return `l_${randomBytes(4).toString('hex')}`;
}

/**
 * Righe del carrello dal corpo di una richiesta. Controlla solo la forma:
 * esistenza e prezzo dei prodotti li decide `priceLines` con il catalogo.
 */
export function parseLineInputs(raw: unknown): ShopOrderLineInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new CommerceHttpError(400, 'empty_cart', 'Aggiungi almeno un prodotto');
  }
  if (raw.length > SHOP_MAX_LINES) {
    throw new CommerceHttpError(400, 'too_many_lines', `Puoi ordinare al massimo ${SHOP_MAX_LINES} prodotti alla volta`);
  }
  return raw.map(item => {
    const value = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const productId = typeof value.productId === 'string' ? value.productId.trim() : '';
    if (!productId || productId.length > 200 || productId.includes('/')) {
      throw new CommerceHttpError(400, 'invalid_product', 'Prodotto non valido');
    }
    const quantity = value.quantity;
    if (!Number.isSafeInteger(quantity) || (quantity as number) < 1 || (quantity as number) > SHOP_MAX_QUANTITY) {
      throw new CommerceHttpError(400, 'invalid_quantity', `La quantità deve essere tra 1 e ${SHOP_MAX_QUANTITY}`);
    }
    const lineId = value.lineId;
    if (lineId !== undefined && (typeof lineId !== 'string' || !LINE_ID.test(lineId))) {
      throw new CommerceHttpError(400, 'invalid_line', 'Riga non valida');
    }
    return { productId, quantity: quantity as number, ...(lineId ? { lineId: lineId as string } : {}) };
  });
}

/**
 * Righe con prezzi presi dal catalogo di adesso. Un prodotto personalizzato
 * (che richiede foto) è sempre una riga con quantità 1, così ogni esemplare ha
 * le sue foto; se ne vuoi due, aggiungi due righe. Le righe già presenti
 * mantengono il loro id, per non staccare le foto già caricate.
 */
export function priceLines(
  inputs: readonly ShopOrderLineInput[],
  catalog: ReadonlyMap<string, ShopProductDto>,
  existingLineIds: ReadonlySet<string> = new Set(),
): ShopOrderLineDto[] {
  const seen = new Set<string>();
  return inputs.map(input => {
    const product = catalog.get(input.productId);
    if (!product) {
      throw new CommerceHttpError(409, 'product_unavailable', 'Un prodotto del carrello non è più disponibile', {
        productId: input.productId,
      });
    }
    if (product.photosRequired > 0 && input.quantity !== 1) {
      throw new CommerceHttpError(
        400,
        'invalid_quantity',
        'I prodotti con foto si ordinano uno alla volta: aggiungi una riga per ogni esemplare',
        { productId: input.productId },
      );
    }
    let lineId = input.lineId && existingLineIds.has(input.lineId) ? input.lineId : newLineId();
    while (seen.has(lineId)) lineId = newLineId();
    seen.add(lineId);
    return {
      lineId,
      productId: product.id,
      productName: product.nome,
      categoria: product.categoria,
      unitPriceCents: product.priceCents,
      listPriceCents: product.listPriceCents,
      discountPercent: product.discountPercent,
      quantity: input.quantity,
      photosRequired: product.photosRequired,
      lineTotalCents: product.priceCents * input.quantity,
      weightGrams: product.weightGrams ?? null,
    };
  });
}

/** Totali dell'ordine; la spedizione si può scegliere solo se è attiva nelle impostazioni, ed è gratuita sopra la soglia. */
export function computeTotals(
  lines: readonly ShopOrderLineDto[],
  method: ShopFulfillmentMethod,
  shipping: ShopShippingConfig,
): ShopQuoteDto['totals'] {
  const subtotalCents = lines.reduce((total, line) => total + line.lineTotalCents, 0);
  let shippingCents = 0;
  if (method === 'shipping') {
    const priced = shopShippingQuote(shipping, lines);
    if (!priced.available) {
      const code = priced.reason === 'disabled' ? 'shipping_disabled' : priced.reason === 'too_heavy' ? 'shipping_too_heavy' : 'shipping_weight_missing';
      throw new CommerceHttpError(409, code, shopShippingUnavailableMessage(priced));
    }
    // Sopra la soglia indicata nelle impostazioni la spedizione è gratuita; resta valido il controllo di peso e disponibilità.
    shippingCents = isShopShippingFree(shipping, subtotalCents) ? 0 : priced.cents;
  }
  return { subtotalCents, shippingCents, totalCents: subtotalCents + shippingCents };
}

/** Impronta di ciò che il cliente vede: righe, prezzi, spedizione e totale. */
export function quoteFingerprint(
  lines: readonly ShopOrderLineDto[],
  totals: ShopQuoteDto['totals'],
  method: ShopFulfillmentMethod,
): string {
  return hashId(
    stableStringify({
      lines: lines.map(line => ({
        lineId: line.lineId,
        productId: line.productId,
        unitPriceCents: line.unitPriceCents,
        quantity: line.quantity,
      })),
      shippingCents: totals.shippingCents,
      totalCents: totals.totalCents,
      method,
    }),
  );
}

export function buildQuote(
  lines: readonly ShopOrderLineDto[],
  method: ShopFulfillmentMethod,
  shipping: ShopShippingConfig,
): ShopQuoteDto {
  const totals = computeTotals(lines, method, shipping);
  return {
    currency: SHOP_CURRENCY,
    lines: [...lines],
    totals,
    fulfillmentMethod: method,
    fingerprint: quoteFingerprint(lines, totals, method),
  };
}
