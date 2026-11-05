import { z } from 'zod/v4';
import { CommerceHttpError } from '../commerce/errors.js';

const bundleItem = z.object({
  prodottoId: z.string().min(1).max(200),
  prodottoNome: z.string().max(500),
  prodottoCategoria: z.string().max(200).optional(),
  quantita: z.number().int().min(1).max(10000),
  numeroFoto: z.number().int().min(0).max(100000),
}).strict();

export const catalogProductInput = z.object({
  nome: z.string().trim().min(1).max(500),
  descrizione: z.string().max(50000),
  prezzo: z.number().finite().min(0).max(1000000),
  sconto: z.number().finite().min(0).max(100),
  numeroFoto: z.number().int().min(0).max(100000),
  categoria: z.string().min(1).max(200),
  attivo: z.boolean(),
  immagini: z.array(z.string().max(2000000)).max(5).optional(),
  costoUnitario: z.number().finite().min(0).max(1000000).nullable().optional(),
  pesoGrammi: z.number().int().min(0).max(1000000).optional(),
  isBundle: z.boolean().optional(),
  bundleItems: z.array(bundleItem).max(100).optional(),
  fotoCondivise: z.boolean().optional(),
  prodottoSorgenteFotoId: z.string().max(200).optional(),
}).strict();

const catalogProductIdSchema = z.string().trim().min(1).max(200).refine(id => !id.includes('/'));
const reorderCatalogProductsInput = z.object({
  ids: z.array(catalogProductIdSchema).max(500),
}).strict().superRefine(({ ids }, context) => {
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: 'custom', path: ['ids'], message: 'Gli identificativi prodotto devono essere univoci' });
  }
});

/** Il costo non entra mai nel documento pubblico; commit unico anche con regole client obsolete. */
export async function saveCatalogProduct(db: any, input: unknown, id?: string): Promise<string> {
  if (id !== undefined && (!id || id.includes('/') || id.length > 200)) {
    throw new CommerceHttpError(400, 'invalid_product_id', 'Identificativo prodotto non valido');
  }
  const data = id ? catalogProductInput.partial().parse(input) : catalogProductInput.parse(input);
  const { costoUnitario, ...fields } = data;
  const ref = id ? db.collection('products').doc(id) : db.collection('products').doc();
  await db.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(ref);
    if (id && !snapshot.exists) throw new CommerceHttpError(404, 'product_not_found', 'Prodotto non trovato');
    const current = snapshot.exists ? snapshot.data() : {};
    if (Array.isArray(current.salesChannels) && current.salesChannels.includes('print_shop')) {
      throw new CommerceHttpError(409, 'print_shop_route_required', 'Gestisci questo formato dall’editor del catalogo stampe.');
    }
    const prezzo = data.prezzo ?? current.prezzo ?? 0;
    const sconto = data.sconto ?? current.sconto ?? 0;
    tx.set(ref, {
      ...fields,
      prezzoFinale: prezzo - prezzo * sconto / 100,
      updatedAt: new Date(),
      ...(!id ? { createdAt: new Date(), immagini: data.immagini ?? [] } : {}),
    }, { merge: Boolean(id) });
    if (Object.prototype.hasOwnProperty.call(data, 'costoUnitario')) {
      const costRef = db.collection('shopProductCosts').doc(ref.id);
      if (costoUnitario === null) tx.delete(costRef);
      else tx.set(costRef, { costoUnitario, updatedAt: new Date() });
    }
  });
  return ref.id;
}

/** Rimuove prodotto e costo riservato nella stessa transazione. */
export async function deleteCatalogProduct(db: any, rawId: unknown): Promise<void> {
  const id = catalogProductIdSchema.parse(rawId);
  const productRef = db.collection('products').doc(id);
  const costRef = db.collection('shopProductCosts').doc(id);
  await db.runTransaction(async (tx: any) => {
    const snapshot = await tx.get(productRef);
    if (!snapshot.exists) {
      throw new CommerceHttpError(404, 'product_not_found', 'Prodotto non trovato');
    }
    const product = snapshot.data();
    if (Array.isArray(product?.salesChannels) && product.salesChannels.includes('print_shop')) {
      throw new CommerceHttpError(409, 'print_shop_route_required', 'Gestisci questo formato dall’editor del catalogo stampe.');
    }
    tx.delete(productRef);
    tx.delete(costRef);
  });
}

/** Riordina solo prodotti ordinari; tutte le letture precedono le scritture atomiche. */
export async function reorderCatalogProducts(db: any, input: unknown, now = new Date()): Promise<number> {
  const { ids } = reorderCatalogProductsInput.parse(input);
  const refs = ids.map(id => db.collection('products').doc(id));
  await db.runTransaction(async (tx: any) => {
    const snapshots = await Promise.all(refs.map(ref => tx.get(ref)));
    for (let index = 0; index < snapshots.length; index += 1) {
      const snapshot = snapshots[index];
      if (!snapshot.exists) {
        throw new CommerceHttpError(404, 'product_not_found', 'Uno o più prodotti non sono stati trovati');
      }
      const product = snapshot.data();
      if (Array.isArray(product?.salesChannels) && product.salesChannels.includes('print_shop')) {
        throw new CommerceHttpError(409, 'print_shop_route_required', 'Gestisci questo formato dall’editor del catalogo stampe.');
      }
    }
    refs.forEach((ref, index) => {
      tx.update(ref, { displayOrder: index + 1, updatedAt: now });
    });
  });
  return ids.length;
}
