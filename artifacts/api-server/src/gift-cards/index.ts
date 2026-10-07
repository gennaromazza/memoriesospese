import { db } from '../firebase-admin.js';
import {
  authenticateFirebase,
  getSiteBaseUrl,
  getStudioContactInfo,
  sendGmailEmail,
} from '../email-routes.js';
import { PayPalOrdersClient, loadPayPalOrdersConfig } from '../print-shop/paypal-orders.js';
import { GiftCardOnlineService } from './online.js';
import { createGiftCardRouter } from './router.js';
import { GiftCardService } from './service.js';

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

export const giftCardService = new GiftCardService({ db });

// Stesse credenziali PayPal dello shop stampe: i pagamenti finiscono nello stesso conto.
const paypalConfig = loadPayPalOrdersConfig();
const paypal = new PayPalOrdersClient(paypalConfig);

// Il webhook delle gift card è facoltativo: senza, la card si attiva comunque alla
// conferma del browser e dal pulsante "Verifica pagamento" del pannello.
const giftWebhookId = (process.env.PAYPAL_GIFT_CARD_WEBHOOK_ID || '').trim();
const webhook = giftWebhookId
  ? new PayPalOrdersClient({ ...paypalConfig, webhookId: giftWebhookId })
  : undefined;

export const giftCardOnlineService = new GiftCardOnlineService({
  db,
  service: giftCardService,
  paypal,
  webhook,
  siteUrl: () => getSiteBaseUrl(),
  mail: {
    async send(to, subject, html, log) {
      await sendGmailEmail(to, subject, html, undefined, log);
    },
    async studio() {
      return getStudioContactInfo();
    },
  },
});

/** Invia le email dovute, comprese le consegne programmate (per esempio il 25 dicembre). */
export function runGiftCardDeliveries() {
  return giftCardOnlineService.processDueDeliveries();
}

const giftCardRoutes = createGiftCardRouter({
  service: giftCardService,
  online: giftCardOnlineService,
  authenticate: authenticateFirebase as any,
  adminEmails: ADMIN_EMAILS,
});

export default giftCardRoutes;
