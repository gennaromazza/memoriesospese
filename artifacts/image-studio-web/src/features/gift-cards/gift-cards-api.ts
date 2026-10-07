import { auth } from '@/lib/firebase';
import { createUrl } from '@/lib/basePath';
import type {
  GiftCardDto,
  GiftCardPublicDto,
  GiftCardSellInput,
  GiftCardStatus,
  GiftCardTypeDto,
  GiftCardTypeInput,
} from '@shared/gift-card-types';

const GIFT_CARDS_API = '/api/gift-cards';

export class GiftCardApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'GiftCardApiError';
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

async function request<T>(path: string, init: RequestInit & { authenticated?: boolean } = {}): Promise<T> {
  const { authenticated = true, headers: suppliedHeaders, ...rest } = init;
  const headers = new Headers(suppliedHeaders);
  headers.set('Accept', 'application/json');
  if (rest.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (authenticated) {
    const user = auth.currentUser;
    if (!user) throw new GiftCardApiError('Accedi per continuare.', 401, 'unauthenticated');
    headers.set('Authorization', `Bearer ${await user.getIdToken()}`);
  }
  let response: Response;
  try {
    response = await fetch(createUrl(`${GIFT_CARDS_API}${path}`), { ...rest, headers, credentials: 'include' });
  } catch {
    throw new GiftCardApiError('Connessione assente. Controlla la rete e riprova.', 0, 'network');
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = isRecord(body) && isRecord(body.error) ? body.error : null;
    const message = error && typeof error.message === 'string' && error.message ? error.message : fallbackMessage(response.status);
    const code = error && typeof error.code === 'string' ? error.code : undefined;
    throw new GiftCardApiError(message, response.status, code, error?.details);
  }
  return body as T;
}

const json = (value: unknown) => JSON.stringify(value);

export const giftCardsApi = {
  /** Lettura pubblica: serve a chi scansiona il QR, senza accesso. */
  getPublic: (code: string) =>
    request<GiftCardPublicDto>(`/public/${encodeURIComponent(code)}`, { authenticated: false }),

  listTypes: async () => (await request<{ types: GiftCardTypeDto[] }>('/types')).types,
  createType: (input: GiftCardTypeInput) => request<GiftCardTypeDto>('/types', { method: 'POST', body: json(input) }),
  updateType: (id: string, input: GiftCardTypeInput) =>
    request<GiftCardTypeDto>(`/types/${encodeURIComponent(id)}`, { method: 'PUT', body: json(input) }),

  sell: (input: GiftCardSellInput) => request<GiftCardDto>('/sell', { method: 'POST', body: json(input) }),
  listCards: async (status?: GiftCardStatus) =>
    (await request<{ cards: GiftCardDto[] }>(status ? `/?status=${status}` : '/')).cards,
  getCard: (code: string) => request<GiftCardDto>(`/${encodeURIComponent(code)}`),
  confirmPayment: (code: string) =>
    request<GiftCardDto>(`/${encodeURIComponent(code)}/confirm-payment`, { method: 'POST', body: '{}' }),
  cancel: (code: string, reason: string) =>
    request<GiftCardDto>(`/${encodeURIComponent(code)}/cancel`, { method: 'POST', body: json({ reason }) }),
  setExpiry: (code: string, expiresOn: string | null) =>
    request<GiftCardDto>(`/${encodeURIComponent(code)}/expiry`, { method: 'PATCH', body: json({ expiresOn }) }),
};
