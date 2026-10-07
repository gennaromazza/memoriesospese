import { db } from '../firebase-admin.js';
import { authenticateFirebase } from '../email-routes.js';
import { createGiftCardRouter } from './router.js';
import { GiftCardService } from './service.js';

const ADMIN_EMAILS = ['gennaro.mazzacane@gmail.com'];

export const giftCardService = new GiftCardService({ db });

const giftCardRoutes = createGiftCardRouter({
  service: giftCardService,
  authenticate: authenticateFirebase as any,
  adminEmails: ADMIN_EMAILS,
});

export default giftCardRoutes;
