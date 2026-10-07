/**
 * Read-only release gate for the existing print-shop catalog.
 *
 * pnpm --dir artifacts/api-server exec tsx src/print-shop/check-polaroid-release.ts \
 *   https://<published-domain>
 *
 * The Firestore read uses this workspace's configured Firebase project. If the
 * published service uses a different Firebase project, check that target's
 * catalog separately before applying any migration.
 */
import { db } from '../firebase-admin.js';
import { POLAROID_SKU, LEGACY_POLAROID_PRODUCT } from '../../../../lib/shared-src/print-shop-catalog.js';
import { PRINT_SHOP_CATALOG_VERSION } from '../../../../lib/shared-src/print-shop-types.js';
import { PrintShopService } from './service.js';

type Product = {
  sku?: string;
  nome?: string;
  attivo?: boolean;
  prezzo?: number;
  prezzoFinale?: number;
  salesChannels?: string[];
  printSpec?: {
    widthMm?: number;
    heightMm?: number;
    fitModes?: string[];
    pricing?: { model?: string; tiers?: { minQuantity?: number; unitPriceCents?: number }[] };
  };
};

function checkPolaroid(product: Product | undefined): string[] {
  if (!product) return [`SKU ${POLAROID_SKU} assente`];
  const issues: string[] = [];
  if (product.nome !== 'Stampa Polaroid 10×15 cm') issues.push('nome non corrispondente');
  if (product.attivo !== true) issues.push('prodotto non attivo');
  if (product.prezzo !== 1 || product.prezzoFinale !== 1) issues.push('prezzo diverso da 1 €');
  if (product.printSpec?.widthMm !== 100 || product.printSpec?.heightMm !== 150) issues.push('dimensioni diverse da 100×150 mm');
  if (product.printSpec?.fitModes?.length !== 1 || product.printSpec.fitModes[0] !== 'cover') issues.push('modalità ritaglio non valida');
  const pricing = product.printSpec?.pricing;
  if (pricing?.model !== 'tiered' || pricing.tiers?.length !== 1 ||
      pricing.tiers[0].minQuantity !== 1 || pricing.tiers[0].unitPriceCents !== 100) {
    issues.push('prezzo per copia/scaglioni non valido');
  }
  return issues;
}

async function main() {
  const rawUrl = process.argv[2];
  if (!rawUrl) throw new Error('Indica l’URL pubblicato come unico argomento.');
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Usa soltanto la base URL HTTPS del sito pubblicato.');
  }

  const service = new PrintShopService({ db, storage: null, paypal: null as never });
  const local = await db.collection('products').where('sku', '==', POLAROID_SKU).limit(2).get();
  if (local.size > 1) throw new Error(`Firestore collegato: SKU ${POLAROID_SKU} duplicato.`);
  const localProduct = local.empty ? undefined : { id: local.docs[0].id, ...local.docs[0].data() } as Product;
  const localIssues = checkPolaroid(localProduct);
  if (localProduct && !localProduct.salesChannels?.includes('print_shop')) localIssues.push('canale print_shop assente');
  if (localIssues.length === 0) {
    // The admin list editor uses this exact service method to load the selected SKU.
    await service.adminCatalogProduct(POLAROID_SKU);
    console.log('Firestore collegato: Polaroid presente; caricamento dati dal servizio admin OK.');
  } else {
    console.error(`Firestore collegato: ${localIssues.join('; ')}. Controlla la migrazione in anteprima prima di applicarla.`);
  }

  const response = await fetch(new URL('/api/print-shop/catalog', url), {
    signal: AbortSignal.timeout(15_000),
    headers: { accept: 'application/json', 'cache-control': 'no-cache' },
  });
  if (!response.ok) throw new Error(`Catalogo pubblico HTTP ${response.status}; verifica prima la pubblicazione dell’API.`);
  const body = await response.json() as { catalogBuildVersion?: number; catalogVersion?: number; products?: Product[] };
  if (!Array.isArray(body.products)) throw new Error('Il catalogo pubblico non contiene un elenco prodotti valido.');
  const publicProducts = body.products.filter(product => product.sku === POLAROID_SKU);
  const publicIssues = publicProducts.length === 1
    ? checkPolaroid(publicProducts[0])
    : [`Attesi 1 SKU ${POLAROID_SKU} nel catalogo pubblico; trovati ${publicProducts.length}`];
  if (body.products.some(product => product.sku === LEGACY_POLAROID_PRODUCT.sku)) {
    publicIssues.push(`Vecchio SKU ${LEGACY_POLAROID_PRODUCT.sku} ancora acquistabile`);
  }
  console.log(`API pubblicata: versione codice ${body.catalogBuildVersion ?? 'non dichiarata'}, versione dati ${body.catalogVersion ?? 'assente'}; ${body.products.length} formati.`);
  if (!Number.isInteger(body.catalogBuildVersion) || (body.catalogBuildVersion ?? 0) < PRINT_SHOP_CATALOG_VERSION) {
    publicIssues.push(`codice API pubblicato precedente alla versione ${PRINT_SHOP_CATALOG_VERSION}`);
  }
  if (!Number.isInteger(body.catalogVersion) || (body.catalogVersion ?? 0) < PRINT_SHOP_CATALOG_VERSION) {
    publicIssues.push(`versione dati ${body.catalogVersion ?? 'assente'} inferiore a ${PRINT_SHOP_CATALOG_VERSION}`);
  }
  // The existing shop's format selector is compiled into the public site.
  // Check its shared catalog asset rather than assuming an API-only publish
  // made Polaroid selectable in the customer's and admin's interfaces.
  const htmlResponse = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!htmlResponse.ok) throw new Error(`Frontend pubblicato HTTP ${htmlResponse.status}.`);
  const html = await htmlResponse.text();
  const entryName = html.match(/\/assets\/index-[\w-]+\.js/)?.[0];
  if (!entryName) throw new Error('Impossibile trovare il bundle frontend pubblicato.');
  const entryResponse = await fetch(new URL(entryName, url), { signal: AbortSignal.timeout(15_000) });
  if (!entryResponse.ok) throw new Error(`Bundle frontend HTTP ${entryResponse.status}.`);
  const entry = await entryResponse.text();
  const catalogName = entry.match(/(?:assets\/)?print-shop-catalog-[\w-]+\.js/)?.[0];
  const catalogBundle = catalogName
    ? await fetch(new URL(`/assets/${catalogName.replace(/^assets\//, '')}`, url), { signal: AbortSignal.timeout(15_000) }).then(async result => {
        if (!result.ok) throw new Error(`Bundle catalogo frontend HTTP ${result.status}.`);
        return result.text();
      })
    : '';
  const frontendHasSku = entry.includes(POLAROID_SKU) || catalogBundle.includes(POLAROID_SKU);
  console.log(`Frontend pubblicato: SKU Polaroid ${frontendHasSku ? 'presente' : 'assente'} nel bundle dello shop.`);
  if (!frontendHasSku) publicIssues.push('frontend pubblicato senza SKU Polaroid');
  if (publicIssues.length > 0) {
    console.error(`NON ATTIVO: ${publicIssues.join('; ')}.`);
    if ((body.catalogBuildVersion ?? 0) < PRINT_SHOP_CATALOG_VERSION || !frontendHasSku) {
      console.error('Pubblica insieme frontend e API aggiornati, poi ripeti il controllo. Non modificare il catalogo di produzione prima di verificare il codice pubblicato.');
    } else if (localIssues.length === 0) {
      console.error('Il codice è aggiornato ma lo SKU manca nel catalogo pubblico: verifica il progetto Firebase usato dalla pubblicazione e il piano di migrazione su quel target.');
    } else {
      console.error('Lo SKU manca anche nei dati Firebase collegati al workspace: verifica il target e il piano della migrazione prima di qualsiasi scrittura.');
    }
    process.exitCode = 1;
    return;
  }
  if (localIssues.length > 0) {
    process.exitCode = 1;
    return;
  }
  console.log('Catalogo pubblico OK: un solo formato Polaroid 10×15 attivo a 1 € per copia; vecchio SKU non acquistabile.');
  console.log('Nota: il caricamento autenticato dell’admin pubblicato richiede una verifica con accesso admin reale.');
}

main().catch(error => {
  console.error('Controllo Polaroid non riuscito:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});