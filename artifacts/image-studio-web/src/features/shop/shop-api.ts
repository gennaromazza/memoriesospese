import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/basePath';
import type { ShopCatalogDto, ShopSettings } from '@shared/shop-types';

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

export const shopApi = {
  /** Vetrina pubblica: prodotti attivi delle categorie abilitate. */
  getCatalog: () => shopRequest<ShopCatalogDto>('/catalog', { authenticated: false }),

  /** Impostazioni dello shop (solo studio). */
  getSettings: async () => (await shopRequest<{ settings: ShopSettings }>('/admin/settings')).settings,
  saveSettings: async (settings: ShopSettings) =>
    (await shopRequest<{ settings: ShopSettings }>('/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })).settings,
};
