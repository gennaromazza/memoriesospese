import { db, storage } from '../firebase-admin.js';
import { getSiteBaseUrl, getStudioContactInfo, sendGmailEmail } from '../email-routes.js';
import { requireVerifiedCustomer } from '../commerce/http.js';
import { authenticatePrintShop } from '../print-shop/auth.js';
import { createMaintenanceOidcMiddleware } from '../print-shop/maintenance-auth.js';
import { PayPalOrdersClient, loadPayPalOrdersConfig } from '../print-shop/paypal-orders.js';
import { ShopAdminService } from './admin.js';
import { ShopMailer } from './mail.js';
import { ShopMaintenance } from './maintenance.js';
import { ShopOrderService } from './orders.js';
import { ShopPaymentService } from './payments.js';
import { createShopRouter } from './router.js';
import { ShopService } from './service.js';
import { ShopUploadService } from './uploads.js';

/**
 * Indirizzo che il processo pianificato (facoltativo) deve usare come
 * destinatario del token. Il giro orario del server non ne ha bisogno.
 */
export const SHOP_MAINTENANCE_AUDIENCE = 'https://imagestudiofotografico.com/api/shop/internal/maintenance';

export const shopService = new ShopService({ db });

// Stesso conto PayPal degli altri negozi, ma con un webhook proprio: ogni
// webhook registrato su PayPal ha il suo ID. Con PayPal "live" senza
// PAYPAL_SHOP_WEBHOOK_ID il pagamento dello shop resta spento.
const paypal = new PayPalOrdersClient({
  ...loadPayPalOrdersConfig(),
  webhookId: (process.env.PAYPAL_SHOP_WEBHOOK_ID || '').trim(),
});

const mailer = new ShopMailer({
  db,
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

const uploadsHolder: { current?: ShopUploadService } = {};
export const shopOrders = new ShopOrderService({
  db,
  shop: shopService,
  removeAssetsForLines: (orderId, lineIds) => uploadsHolder.current!.removeForLines(orderId, lineIds),
});

export const shopUploads = new ShopUploadService({
  db,
  storage,
  orders: shopOrders,
  onPhotosComplete: async orderId => {
    await Promise.allSettled([mailer.send(orderId, 'photos_received'), mailer.send(orderId, 'admin_photos_complete')]);
  },
});
uploadsHolder.current = shopUploads;

export const shopPayments = new ShopPaymentService({
  db,
  paypal,
  orders: shopOrders,
  shop: shopService,
  studio: () => getStudioContactInfo(),
  hooks: {
    async onPaid(orderId, info) {
      if (info.needsReconciliation) {
        await mailer.send(orderId, 'admin_reconcile');
        return;
      }
      await Promise.allSettled([mailer.send(orderId, 'order_confirmed'), mailer.send(orderId, 'admin_new_order')]);
    },
    async onRefunded(orderId, info) {
      if (info.cancelled) await mailer.send(orderId, 'refunded');
      else if (info.full) await mailer.send(orderId, 'admin_refund_after_shipping');
    },
  },
});

export const shopMailer = mailer;
const shopAdmin = new ShopAdminService({ db, mailer, uploads: shopUploads, shop: shopService });
const maintenance = new ShopMaintenance({ db, storage, mailer });

/** Lavori periodici dello shop: da chiamare dal giro orario del server. */
export function runShopMaintenance() {
  return maintenance.run();
}

const shopRoutes = createShopRouter({
  service: shopService,
  orders: shopOrders,
  uploads: shopUploads,
  payments: shopPayments,
  admin: shopAdmin,
  maintenance,
  authenticate: authenticatePrintShop,
  verifiedCustomer: requireVerifiedCustomer,
  maintenanceAuth: createMaintenanceOidcMiddleware({ audience: SHOP_MAINTENANCE_AUDIENCE }),
});

export default shopRoutes;
