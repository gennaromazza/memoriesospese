import { auth } from './firebase';

const API_ORIGIN =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'https://imagestudiofotografico.com' : '');
const API_BASE = `${API_ORIGIN}/api/desktop`;

export function getApiUrl(endpoint: string): string {
  return endpoint.startsWith('/api/') ? `${API_ORIGIN}${endpoint}` : `${API_BASE}${endpoint}`;
}

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
  retriedAfterPasskey = false,
): Promise<T> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;

  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Endpoints starting with /api/ are shared with the web app (e.g. the
  // centralized email routes); everything else lives under /api/desktop.
  const url = getApiUrl(endpoint);
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 403 && isPasskeyRequired(errorText)) {
      // Lo stato (obbligo attivo/disattivato) è propagato tramite il token
      // Firebase: un refresh forzato recepisce una disattivazione appena fatta
      // dal pannello web senza dover uscire e rientrare.
      if (!retriedAfterPasskey && user) {
        await user.getIdToken(true);
        return fetchApi<T>(endpoint, options, true);
      }
      if (typeof window !== 'undefined' && window.imageStudioDesktop) {
        window.dispatchEvent(new Event('admin-passkey-required'));
      }
      throw new AdminPasskeyRequiredError();
    }
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}

export const ADMIN_PASSKEY_REQUIRED_MESSAGE =
  'Passkey amministratore obbligatoria. Completa la verifica dal browser per continuare a usare l’app Windows.';

export class AdminPasskeyRequiredError extends Error {
  readonly code = 'admin_passkey_required';
  constructor() {
    super(`API Error 403: ${ADMIN_PASSKEY_REQUIRED_MESSAGE}`);
    this.name = 'AdminPasskeyRequiredError';
  }
}

function isPasskeyRequired(errorText: string): boolean {
  try {
    const parsed = JSON.parse(errorText) as { code?: string; error?: { code?: string } };
    return parsed.code === 'admin_passkey_required' || parsed.error?.code === 'admin_passkey_required';
  } catch {
    return errorText.includes('admin_passkey_required');
  }
}
