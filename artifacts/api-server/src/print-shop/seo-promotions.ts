import { db } from '../firebase-admin';
import { PrintShopService } from './service';

let service: PrintShopService | undefined;

/** Uses the same eligibility rules as the public promotion API and order flow. */
export function loadPublicPrintShopPromotions() {
  service ??= new PrintShopService({
    db,
    storage: null,
    paypal: null as never,
  });
  return service.publicPrintShopPromotions();
}
