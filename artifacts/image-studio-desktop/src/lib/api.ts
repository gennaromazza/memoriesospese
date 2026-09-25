import { auth } from './firebase';

const API_ORIGIN =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'file:' ? 'https://imagestudiofotografico.com' : '');
const API_BASE = `${API_ORIGIN}/api/desktop`;

export function getApiUrl(endpoint: string): string {
  return endpoint.startsWith('/api/') ? `${API_ORIGIN}${endpoint}` : `${API_BASE}${endpoint}`;
}

export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
    throw new Error(`API Error ${response.status}: ${errorText}`);
  }

  return response.json();
}
