import { isValidCodiceFiscale } from '@shared/fiscal-validation';
import type { PrintShopPostalAddress } from '@shared/print-shop-types';
import { postalAddressComplete } from './ShopAddressFields';
import type { ShopOrderUpdate } from './shop-api';

export interface CheckoutForm {
  name: string;
  phone: string;
  notes: string;
  method: 'studio_pickup' | 'shipping';
  shippingAddress: PrintShopPostalAddress;
  fiscalCode: string;
  residenceSame: boolean;
  residenceAddress: PrintShopPostalAddress;
}

export interface CheckoutAcceptance {
  terms: boolean;
  privacy: boolean;
  personalized: boolean;
}

/** Che cosa manca prima di poter pagare, in parole semplici. Vuoto se si può procedere. */
export function checkoutProblems(input: CheckoutForm & CheckoutAcceptance & { orderingOpen: boolean; hasPhotoLines: boolean }): string[] {
  const shipping = input.method === 'shipping';
  const list: string[] = [];
  if (!input.orderingOpen) list.push('gli ordini non sono aperti');
  if (!input.name.trim()) list.push('il tuo nome');
  if (shipping && !postalAddressComplete(input.shippingAddress)) list.push('l\u2019indirizzo di consegna');
  if (shipping && !isValidCodiceFiscale(input.fiscalCode.trim().toUpperCase())) list.push('il codice fiscale');
  if (shipping && !input.residenceSame && !postalAddressComplete(input.residenceAddress)) list.push('l\u2019indirizzo di residenza');
  if (!input.terms) list.push('le condizioni di vendita');
  if (!input.privacy) list.push('la privacy');
  if (input.hasPhotoLines && !input.personalized) list.push('l\u2019accettazione del prodotto personalizzato');
  return list;
}

/** Dati del modulo come li vuole il server: ritiro senza dati fiscali, spedizione con indirizzo e residenza. */
export function buildOrderPatch(form: CheckoutForm): ShopOrderUpdate {
  const shipping = form.method === 'shipping';
  return {
    customer: { name: form.name.trim(), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) },
    customerNotes: form.notes.trim(),
    fulfillment: shipping ? { method: 'shipping', shippingAddress: form.shippingAddress } : { method: 'studio_pickup' },
    ...(shipping
      ? {
          billingDetails: {
            fiscalCode: form.fiscalCode.trim().toUpperCase(),
            residenceAddress: form.residenceSame ? form.shippingAddress : form.residenceAddress,
          },
        }
      : {}),
  };
}
