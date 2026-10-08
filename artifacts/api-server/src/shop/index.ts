import { db } from '../firebase-admin.js';
import { authenticatePrintShop } from '../print-shop/auth.js';
import { createShopRouter } from './router.js';
import { ShopService } from './service.js';

export const shopService = new ShopService({ db });

const shopRoutes = createShopRouter({
  service: shopService,
  authenticate: authenticatePrintShop,
});

export default shopRoutes;
