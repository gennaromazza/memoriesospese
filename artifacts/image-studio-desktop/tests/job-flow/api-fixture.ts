import type { Gallery } from '../../src/lib/api-hooks';

export const clients = [
  { id: 'manual', nome: 'Cliente', cognome: 'Manuale', email: 'manual@example.invalid' },
  { id: 'alpha', nome: 'Cliente', cognome: 'Alfa', email: 'alpha@example.invalid' },
  { id: 'beta', nome: 'Cliente', cognome: 'Beta', email: 'beta@example.invalid' },
];
export const jobs = [
  { id: 'job-alpha', nomeEvento: 'Job Alfa', clientIds: ['alpha'], jobType: 'matrimonio' },
  { id: 'job-beta', nomeEvento: 'Job Beta', clientiIds: ['beta'], jobType: 'ritratto' },
];
export const jobTypes = [
  { id: 'wedding', slug: 'matrimonio', nome: 'Matrimonio', attivo: true, ordine: 0 },
  { id: 'portrait', slug: 'ritratto', nome: 'Ritratto', attivo: true, ordine: 1 },
  { id: 'manual', slug: 'manuale', nome: 'Categoria manuale', attivo: true, ordine: 2 },
];
type Resource = 'jobs' | 'clients' | 'job-types' | 'create' | 'save';
type Mode = 'ok' | 'error' | 'slow';
const key = 'desktop-job-flow-fixture';
const stored = sessionStorage.getItem(key);
const initial = stored ? JSON.parse(stored) : { galleries: {}, calls: [] };
export const fixture = {
  galleries: initial.galleries as Record<string, Gallery>,
  calls: initial.calls as Array<{ endpoint: string; method: string; body?: unknown; result: string }>,
  modes: {} as Partial<Record<Resource, Mode>>,
  blockedNetwork: [] as string[],
  setMode(resource: Resource, mode: Mode) { this.modes[resource] = mode; },
};
function persist() {
  sessionStorage.setItem(key, JSON.stringify({ galleries: fixture.galleries, calls: fixture.calls }));
}
export function getApiUrl(): never {
  throw new Error('Network URLs are unavailable in the isolated fixture');
}
export async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const method = options.method || 'GET';
  const body = options.body ? JSON.parse(String(options.body)) : undefined;
  const record = { endpoint, method, body, result: 'pending' };
  fixture.calls.push(record);
  const resource: Resource | undefined = endpoint === '/jobs' ? 'jobs'
    : endpoint === '/clients' ? 'clients' : endpoint === '/job-types' ? 'job-types'
    : method === 'POST' && endpoint === '/galleries' ? 'create'
    : method === 'PATCH' && /^\/galleries\/fixture-\d+$/.test(endpoint) ? 'save' : undefined;
  if (resource && fixture.modes[resource] === 'slow') {
    await new Promise(resolve => setTimeout(resolve, 2500));
  }
  if (resource && fixture.modes[resource] === 'error') {
    record.result = 'fixture-error';
    persist();
    throw new Error(`Fixture ${resource}: errore simulato`);
  }
  let result: unknown;
  if (method === 'GET' && endpoint === '/clients') result = { clients };
  else if (method === 'GET' && endpoint === '/jobs') result = { jobs };
  else if (method === 'GET' && endpoint === '/job-types') result = { jobTypes };
  else if (method === 'POST' && endpoint === '/galleries') {
    const id = `fixture-${Object.keys(fixture.galleries).length + 1}`;
    fixture.galleries[id] = {
      id, name: '', status: 'draft', archived: false, photoCount: 0, chapterCount: 0,
      passwordEnabled: false, pinEnabled: false, selectionLocked: false,
      accessMode: 'open', updatedAt: '2026-10-03T12:00:00Z', ...body,
    };
    result = { id };
  } else {
    const match = endpoint.match(/^\/galleries\/(fixture-\d+)(\/photos)?$/);
    if (!match || !fixture.galleries[match[1]] ||
        !(method === 'GET' || (method === 'PATCH' && !match[2]))) {
      record.result = 'denied';
      persist();
      throw new Error(`Fixture denied: ${method} ${endpoint}`);
    }
    if (method === 'PATCH') {
      fixture.galleries[match[1]] = { ...fixture.galleries[match[1]], ...body };
      result = { success: true };
    } else result = match[2] ? { photos: [] } : fixture.galleries[match[1]];
  }
  record.result = 'ok';
  persist();
  return structuredClone(result) as T;
}