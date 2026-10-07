/**
 * One-time catalog migration. Dry-run by default:
 *   pnpm --dir artifacts/api-server exec tsx src/print-shop/seed-polaroid.ts
 * Add --apply after reviewing the two targeted operations.
 */
import { db } from '../firebase-admin.js';
import { LEGACY_POLAROID_PRODUCT, POLAROID_SKU } from '../../../../lib/shared-src/print-shop-catalog.js';
import { buildPrintShopSeedPlan } from '../../../../lib/shared-src/print-shop-seed.js';

async function main() {
  const snapshot = await db.collection('products').get();
  const existing = snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() }));
  const plan = buildPrintShopSeedPlan(existing, []);
  const targeted = plan.operations.filter((operation) =>
    operation.collection === 'products' &&
    (operation.data.sku === POLAROID_SKU || operation.id === LEGACY_POLAROID_PRODUCT.id ||
      existing.some((doc) => doc.id === operation.id && doc.data.sku === LEGACY_POLAROID_PRODUCT.sku)),
  ).filter((operation) => operation.action !== 'unchanged');

  for (const operation of targeted) {
    console.log(`${operation.action}: products/${operation.id} (${operation.data.sku || LEGACY_POLAROID_PRODUCT.sku}): ${operation.changedFields.join(', ')}`);
  }
  if (targeted.length === 0) {
    console.log('Nessuna modifica necessaria.');
    return;
  }
  if (!process.argv.includes('--apply')) {
    console.log('Solo anteprima; usare --apply per applicare.');
    return;
  }
  const batch = db.batch();
  for (const operation of targeted) {
    batch.set(db.collection('products').doc(operation.id), operation.data, { merge: true });
  }
  await batch.commit();
  console.log('Catalogo Polaroid aggiornato.');
}

main().catch((error) => {
  console.error('Migrazione catalogo Polaroid non riuscita:', error);
  process.exitCode = 1;
});