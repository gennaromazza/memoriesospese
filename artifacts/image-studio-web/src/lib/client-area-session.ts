/**
 * Sessione dell'Area Cliente.
 *
 * Usa un'istanza Firebase separata ("client-area"): l'accesso del cliente non
 * si mescola con quello dell'admin o con gli account delle gallerie aperti
 * nello stesso browser, e viceversa.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, signInWithCustomToken, signOut,
  type Auth, type User,
} from 'firebase/auth';
import mainApp from '@/lib/firebase';
import { createUrl } from '@/lib/config';
import type { ClientAreaGallery, ClientAreaOverview } from '@shared/client-area';

const APP_NAME = 'client-area';

let cachedAuth: Auth | null = null;
function clientAreaAuth(): Auth {
  if (cachedAuth) return cachedAuth;
  const app = getApps().find(a => a.name === APP_NAME) || initializeApp(mainApp.options, APP_NAME);
  cachedAuth = getAuth(app);
  void setPersistence(cachedAuth, browserLocalPersistence).catch(() => undefined);
  return cachedAuth;
}

export function watchClientAreaUser(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(clientAreaAuth(), callback);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(createUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Si è verificato un errore. Riprova.');
  return data as T;
}

export async function requestLoginCode(email: string): Promise<string> {
  const data = await postJson<{ message?: string }>('/api/client-area/login/request', { email });
  return data.message || 'Controlla la tua email.';
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const { customToken } = await postJson<{ customToken: string }>('/api/client-area/login/verify', { email, code });
  await signInWithCustomToken(clientAreaAuth(), customToken);
}

export async function logoutClientArea(): Promise<void> {
  await signOut(clientAreaAuth());
}

export class ClientAreaSessionError extends Error {}

export async function fetchClientAreaOverview(): Promise<ClientAreaOverview> {
  const user = clientAreaAuth().currentUser;
  if (!user) throw new ClientAreaSessionError('Sessione scaduta');
  const token = await user.getIdToken();
  const res = await fetch(createUrl('/api/client-area/me'), { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401 || res.status === 403) {
    await logoutClientArea();
    throw new ClientAreaSessionError('Sessione scaduta');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error || 'Impossibile caricare i tuoi dati. Riprova tra poco.');
  return data as ClientAreaOverview;
}

/**
 * Apre la galleria come proprietario: il server ha già confermato che la
 * galleria appartiene al cliente, quindi si salta la password come dopo
 * l'inserimento corretto (stesso flag usato da GalleryAccess).
 */
export function openOwnedGallery(
  gallery: Pick<ClientAreaGallery, 'accessKey'>,
  cliente: ClientAreaOverview['cliente'],
): string {
  const key = gallery.accessKey;
  try {
    localStorage.setItem(`gallery_auth_${key}`, 'true');
    const name = [cliente.nome, cliente.cognome].filter(Boolean).join(' ').trim();
    if (cliente.email && !localStorage.getItem(`user_email_${key}`)) localStorage.setItem(`user_email_${key}`, cliente.email);
    if (name && !localStorage.getItem(`user_name_${key}`)) localStorage.setItem(`user_name_${key}`, name);
  } catch {
    // Senza localStorage la galleria chiederà la password come sempre.
  }
  return createUrl(`/view/${encodeURIComponent(key)}`);
}
