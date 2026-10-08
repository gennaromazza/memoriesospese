import sharp from 'sharp';
import {
  SHOP_LOW_RESOLUTION_PX,
  SHOP_MAX_PHOTO_BYTES,
  SHOP_MAX_PHOTOS_PER_ORDER,
  shopPhotosMissing,
  type ShopAssetDto,
} from '@shared/shop-types';
import { validateJpegUpload } from '@shared/print-shop-catalog';
import { assertDocumentId } from '../commerce/checkout-input.js';
import { CommerceHttpError } from '../commerce/errors.js';
import { cleanText, timestampMillis } from '../commerce/text.js';
import { SHOP_ASSETS, assertCanUploadPhotos, draftRetention, fulfillmentStatus, isPaid, publicAsset } from './order-model.js';
import type { ShopIdentity, ShopOrderService } from './orders.js';

const PREPARED_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PIXELS = 120_000_000;
const MAX_CONCURRENT_FINALIZATIONS = 3;
const PREVIEW_LONG_SIDE_PX = 900;

let runningFinalizations = 0;

export interface ShopUploadDeps {
  db: any;
  storage: any;
  orders: Pick<ShopOrderService, 'requireOwnerOrder'>;
  now?: () => Date;
  maxBytes?: number;
  /** Chiamata (senza bloccare l'esito) quando l'ultima foto mancante di un ordine pagato arriva. */
  onPhotosComplete?: (orderId: string) => Promise<void>;
}

export interface PreparedUpload {
  assetId: string;
  storagePath: string;
  uploadUrl: string;
  contentType: 'image/jpeg';
  maxFileBytes: number;
  requiredMetadata: { ownerUid: string; orderId: string; assetId: string };
}

/**
 * Caricamento delle foto dei clienti: il browser scrive direttamente su un
 * indirizzo firmato dal server, poi il server controlla il file. Più semplice
 * di quello delle stampe (niente composizioni né controlli di risoluzione per
 * formato), con la stessa idea di sicurezza.
 */
export class ShopUploadService {
  constructor(private readonly deps: ShopUploadDeps) {}

  private now(): Date {
    return this.deps.now ? this.deps.now() : new Date();
  }

  private get maxBytes(): number {
    return this.deps.maxBytes ?? SHOP_MAX_PHOTO_BYTES;
  }

  private bucket() {
    return this.deps.storage.bucket();
  }

  private assetsOf(orderId: string) {
    return this.deps.db.collection('orders').doc(orderId).collection(SHOP_ASSETS);
  }

  async prepare(
    identity: ShopIdentity,
    orderId: string,
    lineId: string,
    candidate: { fileName: string; contentType: string; sizeBytes: number },
    uploadOrigin?: string,
  ): Promise<PreparedUpload> {
    assertDocumentId(lineId, 'lineId');
    const order = await this.deps.orders.requireOwnerOrder(identity, orderId);
    const now = this.now();
    assertCanUploadPhotos(order, now.getTime());
    const line = (order.lines || []).find((item: any) => item.lineId === lineId);
    if (!line) throw new CommerceHttpError(404, 'line_not_found', 'Prodotto non trovato nell’ordine');
    if (!(line.photosRequired > 0)) {
      throw new CommerceHttpError(409, 'photos_not_required', 'Questo prodotto non richiede foto');
    }
    const validation = validateJpegUpload(candidate, this.maxBytes);
    if (!validation.valid) {
      throw new CommerceHttpError(400, 'invalid_jpeg', validation.issues.map(issue => issue.message).join(' '), validation.issues);
    }

    const assetRef = this.assetsOf(orderId).doc();
    const storagePath = `shop-orders/${identity.uid}/${orderId}/${lineId}/${assetRef.id}.jpg`;
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    await this.deps.db.runTransaction(async (transaction: any) => {
      const [freshOrder, assets] = await Promise.all([transaction.get(orderRef), transaction.get(this.assetsOf(orderId))]);
      const data = freshOrder.exists ? freshOrder.data() : undefined;
      if (!data || data.ownerUid !== identity.uid) throw new CommerceHttpError(404, 'order_not_found', 'Ordine non trovato');
      assertCanUploadPhotos(data, now.getTime());
      const live = assets.docs
        .map((doc: any) => doc.data())
        // Le foto preparate ma mai concluse e scadute non occupano posto.
        .filter((asset: any) => asset.status === 'ready' || (asset.status === 'prepared' && timestampMillis(asset.expiresAt) > now.getTime()));
      if (live.length + 1 > SHOP_MAX_PHOTOS_PER_ORDER) {
        throw new CommerceHttpError(409, 'upload_quota_exceeded', 'Hai raggiunto il limite di fotografie per questo ordine');
      }
      if (live.filter((asset: any) => asset.lineId === lineId).length + 1 > line.photosRequired) {
        throw new CommerceHttpError(409, 'line_photos_complete', 'Hai già caricato tutte le foto di questo prodotto');
      }
      transaction.set(assetRef, {
        ownerUid: identity.uid,
        orderId,
        lineId,
        status: 'prepared',
        originalName: cleanText(candidate.fileName, 255) || 'foto.jpg',
        declaredContentType: 'image/jpeg',
        declaredSizeBytes: candidate.sizeBytes,
        storagePath,
        expiresAt: new Date(now.getTime() + PREPARED_TTL_MS),
        createdAt: now,
        updatedAt: now,
      });
      // Finché l'ordine è una bozza, ogni foto sposta avanti la sua scadenza.
      if (!isPaid(data)) transaction.update(orderRef, { retention: draftRetention(now), updatedAt: now });
    });

    const [uploadUrl] = await this.bucket().file(storagePath).createResumableUpload({
      origin: uploadOrigin,
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'private,max-age=0,no-store',
        metadata: { ownerUid: identity.uid, orderId, assetId: assetRef.id, lineId },
      },
      preconditionOpts: { ifGenerationMatch: 0 },
    });
    return {
      assetId: assetRef.id,
      storagePath,
      uploadUrl,
      contentType: 'image/jpeg',
      maxFileBytes: this.maxBytes,
      requiredMetadata: { ownerUid: identity.uid, orderId, assetId: assetRef.id },
    };
  }

  /** Controlla il file arrivato su storage e, se è un JPEG valido, lo rende utilizzabile. */
  async finalize(identity: ShopIdentity, orderId: string, assetId: string): Promise<ShopAssetDto> {
    assertDocumentId(assetId, 'assetId');
    const order = await this.deps.orders.requireOwnerOrder(identity, orderId);
    assertCanUploadPhotos(order, this.now().getTime());
    const assetRef = this.assetsOf(orderId).doc(assetId);
    const snapshot = await assetRef.get();
    const asset = snapshot.exists ? snapshot.data() : undefined;
    if (!asset || asset.ownerUid !== identity.uid) throw new CommerceHttpError(404, 'asset_not_found', 'Fotografia non trovata');
    if (asset.status === 'ready') return publicAsset(assetId, asset);
    if (asset.status !== 'prepared') throw new CommerceHttpError(409, 'asset_not_prepared', 'Il file non è più finalizzabile');
    if (timestampMillis(asset.expiresAt) <= this.now().getTime()) {
      throw new CommerceHttpError(409, 'upload_expired', 'Il tempo per completare il file è scaduto');
    }

    if (runningFinalizations >= MAX_CONCURRENT_FINALIZATIONS) {
      throw new CommerceHttpError(429, 'finalize_busy', 'Troppe fotografie in verifica: attendi qualche secondo');
    }
    runningFinalizations++;
    let verified: { widthPx: number; heightPx: number; sizeBytes: number };
    try {
      verified = await this.verifyFile(asset);
    } finally {
      runningFinalizations--;
    }

    const now = this.now();
    const orderRef = this.deps.db.collection('orders').doc(orderId);
    let result: ShopAssetDto = publicAsset(assetId, asset);
    let photosComplete = false;
    await this.deps.db.runTransaction(async (transaction: any) => {
      photosComplete = false;
      const [freshOrder, freshAsset, assets] = await Promise.all([
        transaction.get(orderRef),
        transaction.get(assetRef),
        transaction.get(this.assetsOf(orderId)),
      ]);
      const data = freshOrder.exists ? freshOrder.data() : undefined;
      const current = freshAsset.exists ? freshAsset.data() : undefined;
      if (!data || data.ownerUid !== identity.uid || !current) throw new CommerceHttpError(404, 'asset_not_found', 'Fotografia non trovata');
      assertCanUploadPhotos(data, now.getTime());
      if (current.status === 'ready') {
        result = publicAsset(assetId, current);
        return;
      }
      if (current.status !== 'prepared') throw new CommerceHttpError(409, 'asset_not_prepared', 'Il file non è più finalizzabile');
      const ready = {
        ...current,
        status: 'ready',
        widthPx: verified.widthPx,
        heightPx: verified.heightPx,
        sizeBytes: verified.sizeBytes,
        lowResolution: Math.max(verified.widthPx, verified.heightPx) < SHOP_LOW_RESOLUTION_PX,
        finalizedAt: now,
        expiresAt: null,
      };
      transaction.update(assetRef, {
        status: 'ready',
        widthPx: ready.widthPx,
        heightPx: ready.heightPx,
        sizeBytes: ready.sizeBytes,
        lowResolution: ready.lowResolution,
        finalizedAt: now,
        expiresAt: null,
        updatedAt: now,
      });
      result = publicAsset(assetId, ready);

      const others = assets.docs
        .filter((doc: any) => doc.id !== assetId)
        .map((doc: any) => ({ id: doc.id, ...doc.data() }));
      const missing = shopPhotosMissing(data.lines || [], [...others, { id: assetId, ...ready }]);
      if (isPaid(data) && fulfillmentStatus(data) === 'awaiting_photos' && missing === 0) {
        photosComplete = true;
        transaction.update(orderRef, {
          fulfillment: { ...data.fulfillment, status: 'photos_received' },
          shop: { ...(data.shop || {}), photosCompleteAt: now, photoOverdue: false },
          updatedAt: now,
        });
      } else if (!isPaid(data)) {
        transaction.update(orderRef, { retention: draftRetention(now), updatedAt: now });
      }
    });
    if (photosComplete) {
      await this.deps.onPhotosComplete?.(orderId).catch(error => {
        console.error('⚠️ [Shop] notifica "foto complete" non inviata (non bloccante):', error);
      });
    }
    return result;
  }

  async remove(identity: ShopIdentity, orderId: string, assetId: string): Promise<{ removed: true }> {
    assertDocumentId(assetId, 'assetId');
    const order = await this.deps.orders.requireOwnerOrder(identity, orderId);
    assertCanUploadPhotos(order, this.now().getTime());
    const assetRef = this.assetsOf(orderId).doc(assetId);
    const snapshot = await assetRef.get();
    const asset = snapshot.exists ? snapshot.data() : undefined;
    if (!asset || asset.ownerUid !== identity.uid) throw new CommerceHttpError(404, 'asset_not_found', 'Fotografia non trovata');
    await this.deleteFile(asset.storagePath);
    await assetRef.delete();
    return { removed: true };
  }

  /** Anteprima ridotta per il proprietario dell'ordine. */
  async ownerPreview(identity: ShopIdentity, orderId: string, assetId: string) {
    await this.deps.orders.requireOwnerOrder(identity, orderId);
    return this.preview(orderId, assetId);
  }

  /** Anteprima ridotta per lo studio. */
  async adminPreview(orderId: string, assetId: string) {
    assertDocumentId(orderId, 'orderId');
    return this.preview(orderId, assetId);
  }

  /** File originale, per lo studio che deve lavorare il prodotto. */
  async adminOriginal(orderId: string, assetId: string): Promise<{ body: Buffer; contentType: string; fileName: string }> {
    assertDocumentId(orderId, 'orderId');
    assertDocumentId(assetId, 'assetId');
    const snapshot = await this.assetsOf(orderId).doc(assetId).get();
    const asset = snapshot.exists ? snapshot.data() : undefined;
    if (!asset || asset.status !== 'ready' || !asset.storagePath) throw new CommerceHttpError(404, 'asset_not_found', 'Fotografia non trovata');
    const [body] = await this.bucket().file(asset.storagePath).download();
    return { body, contentType: 'image/jpeg', fileName: cleanText(asset.originalName, 255) || `${assetId}.jpg` };
  }

  /** Toglie file e documenti delle foto di alcune righe (righe tolte dal carrello). */
  async removeForLines(orderId: string, lineIds: readonly string[]): Promise<void> {
    if (lineIds.length === 0) return;
    const snapshot = await this.assetsOf(orderId).get();
    for (const doc of snapshot.docs) {
      const asset = doc.data();
      if (!lineIds.includes(asset.lineId)) continue;
      await this.deleteFile(asset.storagePath);
      await doc.ref.delete();
    }
  }

  private async deleteFile(path: unknown): Promise<void> {
    if (typeof path !== 'string' || !path) return;
    try {
      await this.bucket().file(path).delete({ ignoreNotFound: true });
    } catch (error) {
      // Il file resta orfano ma l'ordine non si blocca: lo toglie la pulizia periodica.
      console.error('⚠️ [Shop] eliminazione foto non riuscita:', error);
    }
  }

  private async verifyFile(asset: any): Promise<{ widthPx: number; heightPx: number; sizeBytes: number }> {
    const file = this.bucket().file(asset.storagePath);
    if (!(await file.exists())[0]) {
      throw new CommerceHttpError(409, 'file_missing', 'La fotografia non è stata caricata: riprova');
    }
    const [metadata] = await file.getMetadata();
    const declared = Number(asset.declaredSizeBytes);
    const size = Number(metadata?.size);
    if (!Number.isSafeInteger(size) || size <= 0 || size > this.maxBytes || size > declared) {
      throw new CommerceHttpError(400, 'invalid_jpeg', 'La dimensione del file non corrisponde a quella dichiarata');
    }
    const [buffer] = await file.download();
    const signature = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    if (!signature) {
      await this.deleteFile(asset.storagePath);
      throw new CommerceHttpError(400, 'invalid_jpeg', 'Il file non è un JPEG valido');
    }
    let info: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
    try {
      info = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata();
    } catch {
      await this.deleteFile(asset.storagePath);
      throw new CommerceHttpError(400, 'invalid_jpeg', 'Il file non è un JPEG valido');
    }
    if (info.format !== 'jpeg' || !info.width || !info.height) {
      await this.deleteFile(asset.storagePath);
      throw new CommerceHttpError(400, 'invalid_jpeg', 'Il file non è un JPEG valido');
    }
    // Le foto scattate in verticale spesso salvano la rotazione nei metadati.
    const rotated = info.orientation !== undefined && info.orientation >= 5;
    return {
      widthPx: rotated ? info.height : info.width,
      heightPx: rotated ? info.width : info.height,
      sizeBytes: size,
    };
  }

  private async preview(orderId: string, assetId: string): Promise<{ body: Buffer; contentType: string }> {
    assertDocumentId(assetId, 'assetId');
    const snapshot = await this.assetsOf(orderId).doc(assetId).get();
    const asset = snapshot.exists ? snapshot.data() : undefined;
    if (!asset || asset.status !== 'ready' || !asset.storagePath) throw new CommerceHttpError(404, 'asset_not_found', 'Fotografia non trovata');
    const [source] = await this.bucket().file(asset.storagePath).download();
    const body = await sharp(source, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: PREVIEW_LONG_SIDE_PX, height: PREVIEW_LONG_SIDE_PX, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 78 })
      .toBuffer();
    return { body, contentType: 'image/jpeg' };
  }
}
