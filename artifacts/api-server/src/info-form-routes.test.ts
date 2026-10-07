import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createInfoFormPlacesRateLimiter } from './info-form-places-rate-limit.js';

const h = vi.hoisted(() => ({
  submission: null as any,
  updates: [] as any[],
  notifications: [] as any[],
  submissionReads: 0,
}));

vi.mock('./firebase-admin.js', () => ({
  db: {
    collection: (name: string) => {
      if (name === 'infoFormSubmissions') {
        return {
          where: (_field: string, _operator: string, token: string) => ({
            limit: () => ({
              get: async () => {
                h.submissionReads += 1;
                const matches = h.submission && h.submission.data().token === token;
                return { empty: !matches, docs: matches ? [h.submission] : [] };
              },
            }),
          }),
        };
      }
      if (name === 'infoFormNotifications') return { add: async (data: any) => h.notifications.push(data) };
      throw new Error(`collezione inattesa: ${name}`);
    },
  },
  FieldValue: { serverTimestamp: () => ({ __serverTimestamp: true }) },
}));

vi.mock('./email-routes.js', () => ({
  sendGmailEmail: vi.fn(async () => {}),
  authenticateFirebase: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { default: router } = await import('./info-form-routes.js');
const app = express();
app.use(express.json());
app.use('/api/info-forms', router);
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const httpRequest = globalThis.fetch.bind(globalThis);
afterAll(() => server.close());

beforeEach(() => {
  h.updates = [];
  h.notifications = [];
  h.submissionReads = 0;
  h.submission = {
    id: 'submission-1',
    ref: { update: async (data: any) => h.updates.push(data) },
    data: () => ({
      token: '12345678-token',
      jobId: 'job-1', clientName: 'Mario Rossi', clientEmail: 'mario@example.com', templateName: 'Logistica',
      status: 'pending',
      templateFields: [
        { id: 'telefono', label: 'Telefono', type: 'text', required: true },
        { id: 'menu', label: 'Menu', type: 'select', required: false, options: ['Carne', 'Pesce'] },
        { id: 'fornitori', label: 'Fornitori', type: 'vendor', required: false },
      ],
    }),
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function submit(answers: unknown) {
  const response = await httpRequest(`${base}/api/info-forms/by-token/12345678-token/submit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }),
  });
  return { status: response.status, body: await response.json() as any };
}

async function requestPlaces(path: string, body: unknown) {
  const response = await httpRequest(`${base}/api/info-forms/places/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    retryAfter: response.headers.get('retry-after'),
    body: await response.json() as any,
  };
}

function addPostalAddressField(status = 'pending') {
  const original = h.submission.data();
  h.submission.data = () => ({
    ...original,
    status,
    templateFields: [
      ...original.templateFields,
      { id: 'indirizzo', label: 'Indirizzo', type: 'address', required: false },
    ],
  });
}

describe('POST /api/info-forms/by-token/:token/submit', () => {
  it('accetta le risposte previste, completa il modulo e crea una sola notifica', async () => {
    const result = await submit({ telefono: '3331234567', menu: 'Pesce' });
    expect(result.status).toBe(200);
    expect(h.updates[0]).toMatchObject({ status: 'completed', answers: { telefono: '3331234567', menu: 'Pesce' } });
    expect(h.notifications).toHaveLength(1);
  });

  it('rifiuta campi estranei e non modifica Firestore', async () => {
    const result = await submit({ telefono: '3331234567', ruolo: 'admin' });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/campo non valido/);
    expect(h.updates).toHaveLength(0);
  });

  it('rifiuta un campo obbligatorio mancante', async () => {
    const result = await submit({ menu: 'Carne' });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/obbligatorio/);
    expect(h.updates).toHaveLength(0);
  });

  it('normalizza e salva più fornitori come dati strutturati', async () => {
    const result = await submit({
      telefono: '3331234567',
      fornitori: [
        { name: 'Atelier Aurora', category: 'Atelier sposa', location: 'Aversa (CE)' },
        { name: 'Fiori Bianchi', category: 'Floral designer', location: 'Caserta' },
      ],
    });

    expect(result.status).toBe(200);
    expect(h.updates[0].answers.fornitori).toEqual([
      { name: 'Atelier Aurora', category: 'Atelier sposa', location: 'Aversa (CE)' },
      { name: 'Fiori Bianchi', category: 'Floral designer', location: 'Caserta' },
    ]);
  });

  it('non accetta URL o campi arbitrari nei fornitori', async () => {
    const result = await submit({
      telefono: '3331234567',
      fornitori: [{ name: 'Atelier Aurora', category: 'Atelier', location: 'Aversa', url: 'https://example.com' }],
    });

    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/dati non consentiti/);
    expect(h.updates).toHaveLength(0);
  });

  it('valida e salva un indirizzo postale strutturato', async () => {
    addPostalAddressField();
    const address = {
      street: 'Via Roma',
      houseNumber: '12',
      postalCode: '81031',
      city: 'Aversa',
      province: 'CE',
      country: 'IT',
    };
    const result = await submit({ telefono: '3331234567', indirizzo: address });
    expect(result.status).toBe(200);
    expect(h.updates[0].answers.indirizzo).toEqual(address);
  });

  it('rifiuta campi arbitrari dentro un indirizzo postale', async () => {
    addPostalAddressField();
    const result = await submit({
      telefono: '3331234567',
      indirizzo: {
        street: 'Via Roma',
        houseNumber: '12',
        postalCode: '81031',
        city: 'Aversa',
        province: 'CE',
        country: 'IT',
        placeId: 'unexpected',
      },
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toMatch(/dati non consentiti/);
    expect(h.updates).toHaveLength(0);
  });
});

describe('Places pubblici per moduli informativi', () => {
  it('condivide il limite tra endpoint e riapre la finestra alla scadenza', () => {
    const limiter = createInfoFormPlacesRateLimiter({ maxRequests: 2, windowMs: 10_000 });

    expect(limiter.consume('token-1', 1_000)).toEqual({ allowed: true });
    expect(limiter.consume('token-1', 2_000)).toEqual({ allowed: true });
    expect(limiter.check('token-1', 3_000)).toEqual({ allowed: false, retryAfterSeconds: 8 });
    expect(limiter.consume('token-2', 3_000)).toEqual({ allowed: true });
    expect(limiter.consume('token-1', 11_000)).toEqual({ allowed: true });
  });

  it('consente autocomplete solo a un token in attesa con un campo indirizzo esplicito', async () => {
    addPostalAddressField();
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'server-only-test-key');
    const upstream = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        suggestions: [{ placePrediction: { placeId: 'place-1', text: { text: 'Via Roma, Aversa' } } }],
      }),
    }));
    vi.stubGlobal('fetch', upstream);

    const result = await requestPlaces('autocomplete', {
      token: '12345678-token',
      fieldId: 'indirizzo',
      input: 'Via Roma',
      sessionToken: '12345678-1234-1234-1234-123456789abc',
    });

    expect(result.status).toBe(200);
    expect(result.body).toEqual({
      available: true,
      suggestions: [{ placeId: 'place-1', text: 'Via Roma, Aversa' }],
    });
    expect(upstream).toHaveBeenCalledOnce();
    expect(JSON.stringify(result.body)).not.toContain('server-only-test-key');
  });

  it('nega token errati e campi che non sono indirizzi prima di chiamare Google', async () => {
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const wrongToken = await requestPlaces('autocomplete', {
      token: '87654321-token',
      fieldId: 'indirizzo',
      input: 'Via Roma',
    });
    const wrongField = await requestPlaces('autocomplete', {
      token: '12345678-token',
      fieldId: 'telefono',
      input: 'Via Roma',
    });

    expect(wrongToken.status).toBe(404);
    expect(wrongField.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('nega l’uso del token dopo il completamento del modulo', async () => {
    addPostalAddressField('completed');
    const result = await requestPlaces('autocomplete', {
      token: '12345678-token',
      fieldId: 'indirizzo',
      input: 'Via Roma',
    });
    expect(result.status).toBe(404);
  });

  it('restituisce dettagli solo per un indirizzo italiano e non espone la chiave', async () => {
    addPostalAddressField();
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'server-only-test-key');
    const upstream = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        formattedAddress: 'Via Roma, 12, 81031 Aversa CE, Italia',
        addressComponents: [
          { types: ['route'], longText: 'Via Roma' },
          { types: ['street_number'], longText: '12' },
          { types: ['locality'], longText: 'Aversa' },
          { types: ['postal_code'], longText: '81031' },
          { types: ['administrative_area_level_2'], shortText: 'CE' },
          { types: ['country'], shortText: 'IT' },
        ],
      }),
    }));
    vi.stubGlobal('fetch', upstream);

    const result = await requestPlaces('details', {
      token: '12345678-token',
      fieldId: 'indirizzo',
      placeId: 'place-1',
    });

    expect(result.status).toBe(200);
    expect(result.body.address).toMatchObject({
      via: 'Via Roma, 12',
      citta: 'Aversa',
      cap: '81031',
      provincia: 'CE',
    });
    expect(JSON.stringify(result.body)).not.toContain('server-only-test-key');
  });

  it('limita le chiamate autorizzate per token e blocca ulteriori richieste prima di Google', async () => {
    addPostalAddressField();
    const rateLimitToken = 'rate-limit-test-token-1234';
    const original = h.submission.data();
    h.submission.data = () => ({ ...original, token: rateLimitToken });
    vi.stubEnv('GOOGLE_PLACES_API_KEY', 'server-only-test-key');
    const upstream = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        suggestions: [{ placePrediction: { placeId: 'place-1', text: { text: 'Via Roma, Aversa' } } }],
      }),
    }));
    vi.stubGlobal('fetch', upstream);

    let lastAllowed: Awaited<ReturnType<typeof requestPlaces>> | undefined;
    for (let call = 0; call < 120; call += 1) {
      lastAllowed = await requestPlaces('autocomplete', {
        token: rateLimitToken,
        fieldId: 'indirizzo',
        input: 'Via Roma',
      });
    }
    const blocked = await requestPlaces('details', {
      token: rateLimitToken,
      fieldId: 'indirizzo',
      placeId: 'place-1',
    });

    expect(lastAllowed?.status).toBe(200);
    expect(blocked.status).toBe(429);
    expect(blocked.retryAfter).toBeTruthy();
    expect(blocked.body.error.code).toBe('rate_limited');
    expect(JSON.stringify(blocked.body)).not.toContain('server-only-test-key');
    expect(h.submissionReads).toBe(120);
    expect(upstream).toHaveBeenCalledTimes(120);
  });
});
