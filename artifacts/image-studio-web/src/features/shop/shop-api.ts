import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/basePath';
import type { PrintShopBillingDetails, PrintShopPostalAddress } from '@shared/print-shop-types';
import type {
  ShopAdminOrderDto,
  ShopAdminOrderSummaryDto,
  ShopAdminView,
  ShopAssetDto,
  ShopCatalogDto,
  ShopFulfillmentMethod,
  ShopOrderDto,
  ShopResendableMail,
  ShopSettings,
} from '@shared/shop-types';

const SHOP_API = '/api/shop';

export class ShopApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ShopApiError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fallbackMessage(status: number): string {
  if (status === 401) return 'La sessione è scaduta. Accedi di nuovo.';
  if (status === 403) return 'Non hai il permesso per questa operazione.';
  if (status === 429) return 'Troppi tentativi. Riprova tra qualche minuto.';
  if (status >= 500) return 'Il servizio non è disponibile in questo momento. Riprova tra poco.';
  return 'La richiesta non è riuscita.';
}

export async function shopRequest<T>(
  path: string,
  init: RequestInit & { authenticated?: boolean } = {},
): Promise<T> {
  const { authenticated = true, headers: suppliedHeaders, ...rest } = init;
  const headers = new Headers(suppliedHeaders);
  headers.set('Accept', 'application/json');
  if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const user = auth.currentUser;
    if (!user) throw new ShopApiError('Accedi per continuare.', 401, 'unauthenticated');
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  let response: Response;
  try {
    response = await fetch(createUrl(`${SHOP_API}${path}`), { ...rest, headers, credentials: 'include' });
  } catch {
    throw new ShopApiError('Connessione assente. Controlla la rete e riprova.', 0, 'network');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message = error && typeof error.message === 'string' && error.message ? error.message : fallbackMessage(response.status);
    const code = error && typeof error.code === 'string' ? error.code : undefined;
    throw new ShopApiError(message, response.status, code, error?.details);
  }
  return body as T;
}

/** Foto da un indirizzo che richiede l'accesso: si scarica come file e si mostra con un indirizzo locale. */
export async function shopBlob(path: string): Promise<Blob> {
  const user = auth.currentUser;
  if (!user) throw new ShopApiError('Accedi per continuare.', 401, 'unauthenticated');
  let response: Response;
  try {
    response = await fetch(createUrl(`${SHOP_API}${path}`), {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      credentials: 'include',
    });
  } catch {
    throw new ShopApiError('Connessione assente. Controlla la rete e riprova.', 0, 'network');
  }
  if (!response.ok) throw new ShopApiError(fallbackMessage(response.status), response.status);
  return response.blob();
}

export interface ShopLineInput {
  lineId?: string;
  productId: string;
  quantity: number;
}

export interface ShopOrderUpdate {
  customer?: { name?: string; phone?: string };
  customerNotes?: string;
  fulfillment?: { method: Extract<ShopFulfillmentMethod, 'studio_pickup'> } | { method: Extract<ShopFulfillmentMethod, 'shipping'>; shippingAddress: PrintShopPostalAddress };
  billingDetails?: PrintShopBillingDetails;
}

export interface ShopPreparedUpload {
  assetId: string;
  uploadUrl: string;
  maxFileBytes: number;
}

export interface ShopPayPalConfig {
  enabled: boolean;
  checkoutEnabled: boolean;
  environment: 'sandbox' | 'live';
  clientId: string | null;
}

export interface ShopPaymentConfirmation {
  success: true;
  duplicate: boolean;
  orderId: string;
  paypalOrderId: string;
  captureId: string;
  status: 'paid';
}

const json = (value: unknown) => JSON.stringify(value);
const orderPath = (orderId: string) => `/orders/${encodeURIComponent(orderId)}`;

export const shopApi = {
  /** Vetrina pubblica: prodotti attivi delle categorie abilitate. */
  getCatalog: () => shopRequest<ShopCatalogDto>('/catalog', { authenticated: false }),
  getPayPalConfig: () => shopRequest<ShopPayPalConfig>('/paypal/config', { authenticated: false }),

  /** Impostazioni dello shop (solo studio). */
  getSettings: async () => (await shopRequest<{ settings: ShopSettings }>('/admin/settings')).settings,
  saveSettings: async (settings: ShopSettings) =>
    (await shopRequest<{ settings: ShopSettings }>('/admin/settings', { method: 'PUT', body: json(settings) })).settings,

  // Ordini del cliente
  listOrders: async () => (await shopRequest<{ orders: ShopOrderDto[] }>('/orders')).orders,
  getOrder: async (orderId: string) => (await shopRequest<{ order: ShopOrderDto }>(orderPath(orderId))).order,
  createOrder: async (input: { lines: ShopLineInput[]; customer?: { name?: string; phone?: string } }) =>
    (await shopRequest<{ order: ShopOrderDto }>('/orders', { method: 'POST', body: json(input) })).order,
  replaceLines: async (orderId: string, lines: ShopLineInput[]) =>
    (await shopRequest<{ order: ShopOrderDto }>(`${orderPath(orderId)}/lines`, { method: 'PUT', body: json({ lines }) })).order,
  updateOrder: async (orderId: string, patch: ShopOrderUpdate) =>
    (await shopRequest<{ order: ShopOrderDto }>(orderPath(orderId), { method: 'PATCH', body: json(patch) })).order,
  cancelOrder: (orderId: string) => shopRequest<{ cancelled: true }>(orderPath(orderId), { method: 'DELETE' }),

  // Foto
  prepareUpload: async (orderId: string, lineId: string, file: { fileName: string; contentType: string; sizeBytes: number }) =>
    (await shopRequest<{ upload: ShopPreparedUpload }>(`${orderPath(orderId)}/lines/${encodeURIComponent(lineId)}/uploads/prepare`, { method: 'POST', body: json(file) })).upload,
  finalizeUpload: async (orderId: string, assetId: string) =>
    (await shopRequest<{ asset: ShopAssetDto }>(`${orderPath(orderId)}/uploads/finalize`, { method: 'POST', body: json({ assetId }) })).asset,
  removeAsset: (orderId: string, assetId: string) =>
    shopRequest<{ removed: true }>(`${orderPath(orderId)}/assets/${encodeURIComponent(assetId)}`, { method: 'DELETE' }),
  assetPreview: (orderId: string, assetId: string) => shopBlob(`${orderPath(orderId)}/assets/${encodeURIComponent(assetId)}/preview`),

  // Pagamento
  createPayPalOrder: (
    orderId: string,
    input: { termsAccepted: true; privacyAccepted: true; personalizedProductionAccepted: boolean; expectedQuoteFingerprint: string; expectedTotalCents: number },
  ) => shopRequest<{ paypalOrderId: string; status: string; reused: boolean }>(`${orderPath(orderId)}/paypal/create`, { method: 'POST', body: json(input) }),
  capturePayPalOrder: (orderId: string, paypalOrderId: string) =>
    shopRequest<ShopPaymentConfirmation>(`${orderPath(orderId)}/paypal/capture`, { method: 'POST', body: json({ paypalOrderId }) }),

  // Gestione ordini (studio)
  adminOrders: async (view: ShopAdminView, q?: string) => {
    const query = new URLSearchParams({ view });
    if (q?.trim()) query.set('q', q.trim());
    return (await shopRequest<{ orders: ShopAdminOrderSummaryDto[] }>(`/admin/orders?${query.toString()}`)).orders;
  },
  adminOrder: async (orderId: string) => (await shopRequest<{ order: ShopAdminOrderDto }>(`/admin/orders/${encodeURIComponent(orderId)}`)).order,
  adminUpdateStatus: async (
    orderId: string,
    input: { status: 'in_production' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'cancelled'; note?: string; tracking?: { carrier?: string; code: string } },
  ) => (await shopRequest<{ order: ShopAdminOrderDto }>(`/admin/orders/${encodeURIComponent(orderId)}/status`, { method: 'PATCH', body: json(input) })).order,
  adminSaveNotes: async (orderId: string, note: string) =>
    (await shopRequest<{ order: ShopAdminOrderDto }>(`/admin/orders/${encodeURIComponent(orderId)}/notes`, { method: 'PUT', body: json({ note }) })).order,
  adminResend: async (orderId: string, kind: ShopResendableMail) =>
    (await shopRequest<{ order: ShopAdminOrderDto }>(`/admin/orders/${encodeURIComponent(orderId)}/notifications/resend`, { method: 'POST', body: json({ kind }) })).order,
  adminRejectPhoto: async (orderId: string, assetId: string, reason: string) =>
    (await shopRequest<{ order: ShopAdminOrderDto }>(`/admin/orders/${encodeURIComponent(orderId)}/assets/${encodeURIComponent(assetId)}/reject`, { method: 'POST', body: json({ reason }) })).order,
  adminReactivate: async (orderId: string) =>
    (await shopRequest<{ order: ShopAdminOrderDto }>(`/admin/orders/${encodeURIComponent(orderId)}/reactivate`, { method: 'POST', body: json({}) })).order,
  adminPreview: (orderId: string, assetId: string) => shopBlob(`/admin/orders/${encodeURIComponent(orderId)}/assets/${encodeURIComponent(assetId)}/preview`),
  adminOriginal: (orderId: string, assetId: string) => shopBlob(`/admin/orders/${encodeURIComponent(orderId)}/assets/${encodeURIComponent(assetId)}/original`),
  adminPhotosZip: (orderId: string) => shopBlob(`/admin/orders/${encodeURIComponent(orderId)}/photos.zip`),
};
