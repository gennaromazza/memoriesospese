import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/basePath';
import type { PrintOrderItemInput, PrintShopQuote } from '@shared/print-shop-types';
import type {
  FinalizedPrintAsset,
  PaypalCaptureResult,
  PaypalClientConfig,
  PaypalCreateResult,
  PrintShopLegalConsents,
  PreparedPrintUpload,
  PrintShopCatalogPayload,
  PrintShopDraftOrder,
  PrintShopDraftPayload,
  PrintShopOrderListItem,
} from './types';
import { normalizePaypalCapture } from './paypal-normalization';
import { buildPaypalCreatePayload } from './paypal-checkout-state';

const PRINT_SHOP_API = '/api/print-shop';

export class PrintShopApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PrintShopApiError';
  }
}

interface RequestOptions extends RequestInit {
  authenticated?: boolean;
  idempotencyKey?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unwrapResponseBody(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if ('data' in value && value.data !== undefined) return value.data;
  if ('result' in value && value.result !== undefined) return value.result;
  return value;
}

function errorMessage(body: unknown, status: number): string {
  if (isRecord(body)) {
    if (isRecord(body.error) && typeof body.error.message === 'string' && body.error.message) {
      return body.error.message;
    }
    for (const key of ['message', 'error', 'detail']) {
      if (typeof body[key] === 'string' && body[key]) return body[key] as string;
    }
    if (Array.isArray(body.issues) && isRecord(body.issues[0]) && typeof body.issues[0].message === 'string') {
      return body.issues[0].message;
    }
  }
  if (status === 401) return 'La sessione è scaduta. Accedi di nuovo con Google.';
  if (status === 403) return 'Non puoi modificare questo ordine.';
  if (status === 413) return 'Una delle fotografie è troppo grande.';
  if (status >= 500) return 'Il servizio non è disponibile in questo momento. Riprova tra poco.';
  return 'La richiesta non è riuscita.';
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const {
    authenticated = true,
    idempotencyKey,
    headers: suppliedHeaders,
    ...requestInit
  } = options;
  const headers = new Headers(suppliedHeaders);
  headers.set('Accept', 'application/json');
  if (requestInit.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  if (authenticated) {
    const user = auth.currentUser;
    if (!user) throw new PrintShopApiError('Accedi con Google per continuare.', 401, 'AUTH_REQUIRED');
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  if (idempotencyKey) headers.set('Idempotency-Key', idempotencyKey);

  const response = await fetch(createUrl(`${PRINT_SHOP_API}${path}`), {
    ...requestInit,
    headers,
    credentials: 'include',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const body: unknown = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text().catch(() => '');

  if (!response.ok) {
    const code = isRecord(body) && typeof body.code === 'string'
      ? body.code
      : isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string'
        ? body.error.code
        : undefined;
    throw new PrintShopApiError(errorMessage(body, response.status), response.status, code, body);
  }
  return unwrapResponseBody(body) as T;
}

function normalizeDraftOrder(raw: unknown): PrintShopDraftOrder {
  const unwrapped = unwrapResponseBody(raw);
  const candidate = isRecord(unwrapped) && isRecord(unwrapped.order) ? unwrapped.order : unwrapped;
  if (!isRecord(candidate)) throw new PrintShopApiError('Risposta ordine non valida.', 502, 'INVALID_RESPONSE');
  const id = typeof candidate.id === 'string'
    ? candidate.id
    : typeof candidate.orderId === 'string'
      ? candidate.orderId
      : '';
  if (!id) throw new PrintShopApiError('Il server non ha restituito il codice dell’ordine.', 502, 'MISSING_ORDER_ID');
  return { ...candidate, id } as unknown as PrintShopDraftOrder;
}

function normalizePreparedUpload(raw: unknown): PreparedPrintUpload {
  const unwrapped = unwrapResponseBody(raw);
  const candidate = isRecord(unwrapped) && isRecord(unwrapped.upload)
    ? unwrapped.upload
    : isRecord(unwrapped) && isRecord(unwrapped.asset) ? unwrapped.asset : unwrapped;
  if (!isRecord(candidate)) throw new PrintShopApiError('Preparazione del caricamento non valida.', 502);
  const assetId = typeof candidate.assetId === 'string'
    ? candidate.assetId
    : typeof candidate.id === 'string' ? candidate.id : '';
  const storagePath = typeof candidate.storagePath === 'string'
    ? candidate.storagePath
    : typeof candidate.path === 'string' ? candidate.path : '';
  const uploadUrl = typeof candidate.uploadUrl === 'string' ? candidate.uploadUrl : '';
  if (!assetId || !storagePath || !uploadUrl.startsWith('https://')) {
    throw new PrintShopApiError('Il server non ha restituito il percorso sicuro della foto.', 502, 'INVALID_UPLOAD_PATH');
  }
  const requiredMetadata = isRecord(candidate.requiredMetadata)
    ? Object.fromEntries(Object.entries(candidate.requiredMetadata).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined;
  return { assetId, storagePath, uploadUrl, requiredMetadata };
}

function normalizeCatalog(raw: unknown): PrintShopCatalogPayload {
  const unwrapped = unwrapResponseBody(raw);
  if (Array.isArray(unwrapped)) {
    return { products: unwrapped as PrintShopCatalogPayload['products'], catalogVersion: 1, currency: 'EUR' };
  }
  if (!isRecord(unwrapped)) throw new PrintShopApiError('Catalogo non disponibile.', 502, 'INVALID_CATALOG');
  const products = Array.isArray(unwrapped.products)
    ? unwrapped.products
    : Array.isArray(unwrapped.catalog) ? unwrapped.catalog : [];
  return {
    products: products as PrintShopCatalogPayload['products'],
    catalogVersion: typeof unwrapped.catalogVersion === 'number' ? unwrapped.catalogVersion : 1,
    currency: 'EUR',
    paypalClientId: typeof unwrapped.paypalClientId === 'string' ? unwrapped.paypalClientId : undefined,
  };
}

export const printShopApi = {
  async getCatalog(signal?: AbortSignal): Promise<PrintShopCatalogPayload> {
    const response = await request<unknown>('/catalog', { authenticated: false, signal });
    return normalizeCatalog(response);
  },

  async createDraft(idempotencyKey: string): Promise<PrintShopDraftOrder> {
    const response = await request<unknown>('/orders', {
      method: 'POST',
      body: JSON.stringify({}),
      idempotencyKey,
    });
    return normalizeDraftOrder(response);
  },

  async getOrder(orderId: string, signal?: AbortSignal): Promise<PrintShopOrderListItem> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}`, { signal });
    return normalizeDraftOrder(response) as PrintShopOrderListItem;
  },

  async deleteDraftOrder(orderId: string): Promise<void> {
    await request<unknown>(`/orders/${encodeURIComponent(orderId)}`, {
      method: 'DELETE',
    });
  },

  async listMyOrders(signal?: AbortSignal): Promise<PrintShopOrderListItem[]> {
    const response = await request<unknown>('/orders', { signal });
    const unwrapped = unwrapResponseBody(response);
    const list = isRecord(unwrapped) && Array.isArray(unwrapped.orders) ? unwrapped.orders : unwrapped;
    return Array.isArray(list) ? list.map((order) => normalizeDraftOrder(order) as PrintShopOrderListItem) : [];
  },

  async updateDraft(orderId: string, payload: PrintShopDraftPayload): Promise<PrintShopDraftOrder> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        customer: {
          name: payload.contact.displayName,
          phone: payload.contact.phone,
        },
        customerNotes: payload.customerNotes ?? payload.contact.customerNotes,
        lowResolutionAccepted: payload.lowResolutionAccepted,
      }),
    });
    return normalizeDraftOrder(response);
  },

  async quoteOrder(
    orderId: string,
    items: PrintOrderItemInput[],
    signal?: AbortSignal,
  ): Promise<PrintShopQuote> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/quote`, {
      method: 'POST',
      body: JSON.stringify({ items }),
      signal,
    });
    const unwrapped = unwrapResponseBody(response);
    if (isRecord(unwrapped) && isRecord(unwrapped.quote)) return unwrapped.quote as unknown as PrintShopQuote;
    return unwrapped as PrintShopQuote;
  },

  async prepareUpload(
    orderId: string,
    file: File,
    idempotencyKey: string,
  ): Promise<PreparedPrintUpload> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/uploads/prepare`, {
      method: 'POST',
      idempotencyKey,
      body: JSON.stringify({
        fileName: file.name,
        contentType: 'image/jpeg',
        sizeBytes: file.size,
      }),
    });
    return normalizePreparedUpload(response);
  },

  async finalizeUpload(
    orderId: string,
    prepared: Pick<PreparedPrintUpload, 'assetId' | 'storagePath'>,
    file: File,
    widthPx: number,
    heightPx: number,
  ): Promise<FinalizedPrintAsset> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/uploads/finalize`, {
      method: 'POST',
      idempotencyKey: `finalize-${prepared.assetId}`,
      body: JSON.stringify({
        assetId: prepared.assetId,
      }),
    });
    const unwrapped = unwrapResponseBody(response);
    const candidate = isRecord(unwrapped) && isRecord(unwrapped.asset) ? unwrapped.asset : unwrapped;
    return {
      assetId: isRecord(candidate) && typeof candidate.assetId === 'string' ? candidate.assetId : prepared.assetId,
      storagePath: isRecord(candidate) && typeof candidate.storagePath === 'string' ? candidate.storagePath : prepared.storagePath,
      fileName: file.name,
      widthPx,
      heightPx,
    };
  },

  async deleteAsset(orderId: string, assetId: string): Promise<void> {
    await request<unknown>(`/orders/${encodeURIComponent(orderId)}/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE',
    });
  },

  async getPaypalConfig(signal?: AbortSignal): Promise<PaypalClientConfig> {
    const response = await request<unknown>('/paypal/config', { authenticated: false, signal });
    const unwrapped = unwrapResponseBody(response);
    if (!isRecord(unwrapped)) return { enabled: false, clientId: null, currency: 'EUR' };
    return {
      enabled: unwrapped.checkoutEnabled === true || (unwrapped.checkoutEnabled === undefined && unwrapped.enabled === true),
      clientId: typeof unwrapped.clientId === 'string' ? unwrapped.clientId : null,
      environment: unwrapped.environment === 'live' ? 'live' : 'sandbox',
      currency: 'EUR',
    };
  },

  async createPaypalOrder(
    orderId: string,
    legalConsents: PrintShopLegalConsents,
    quote: PrintShopQuote,
  ): Promise<PaypalCreateResult> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/paypal/create`, {
      method: 'POST',
      idempotencyKey: `paypal-create-${orderId}`,
      body: JSON.stringify(buildPaypalCreatePayload(legalConsents, quote)),
    });
    const unwrapped = unwrapResponseBody(response);
    if (!isRecord(unwrapped)) throw new PrintShopApiError('PayPal non ha restituito un ordine.', 502);
    const paypalOrderId = typeof unwrapped.paypalOrderId === 'string'
      ? unwrapped.paypalOrderId
      : typeof unwrapped.id === 'string' ? unwrapped.id : '';
    if (!paypalOrderId) throw new PrintShopApiError('PayPal non ha restituito il codice di pagamento.', 502);
    return { paypalOrderId, orderId };
  },

  async capturePaypalOrder(orderId: string, paypalOrderId: string): Promise<PaypalCaptureResult> {
    const response = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/paypal/capture`, {
      method: 'POST',
      idempotencyKey: `paypal-capture-${paypalOrderId}`,
      body: JSON.stringify({ paypalOrderId }),
    });
    const unwrapped = unwrapResponseBody(response);
    try {
      return normalizePaypalCapture(unwrapped, orderId, paypalOrderId);
    } catch (error) {
      throw new PrintShopApiError(
        error instanceof Error ? error.message : 'Conferma del pagamento non valida.',
        502,
        'INVALID_CAPTURE_RESPONSE',
      );
    }
  },
};
