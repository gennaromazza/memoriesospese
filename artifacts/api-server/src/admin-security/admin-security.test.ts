import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { createHash } from 'node:crypto';

// ---- Firestore in memoria -------------------------------------------------
const h = vi.hoisted(() => {
  const docs = new Map<string, Record<string, any>>();
  const claims = new Map<string, Record<string, any>>();
  const tokenAuthTimes = new Map<string, number>();
  const tokenClaims = new Map<string, Record<string, any>>();
  const tokenUids = new Map<string, string>();
  return {
    docs,
    claims,
    tokenAuthTimes,
    tokenClaims,
    tokenUids,
    email: 'gennaro.mazzacane@gmail.com',
    uid: 'admin-uid',
    authTime: 1_700_000_000,
    revoked: 0,
    claimsOnToken: {} as Record<string, any>,
    webauthn: false,
    createdCustomToken: null as { uid: string; claims: Record<string, unknown> } | null,
  };
});

vi.mock('@simplewebauthn/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@simplewebauthn/server')>();
  return {
    ...actual,
    verifyRegistrationResponse: async (...args: Parameters<typeof actual.verifyRegistrationResponse>) =>
      h.webauthn ? {
        verified: true,
        registrationInfo: {
          credential: { id: 'cred-1', publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: [] },
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
        },
      } : actual.verifyRegistrationResponse(...args),
    verifyAuthenticationResponse: async (...args: Parameters<typeof actual.verifyAuthenticationResponse>) =>
      h.webauthn ? { verified: true, authenticationInfo: { newCounter: 1 } } : actual.verifyAuthenticationResponse(...args),
  };
});

function makeDoc(path: string) {
  return {
    id: path.split('/').pop()!,
    get: async () => ({ exists: h.docs.has(path), data: () => h.docs.get(path), id: path.split('/').pop() }),
    set: async (data: any, opts?: { merge?: boolean }) => {
      const prev = opts?.merge ? h.docs.get(path) ?? {} : {};
      h.docs.set(path, { ...prev, ...data });
    },
    delete: async () => { h.docs.delete(path); },
    collection: (name: string) => makeCollection(`${path}/${name}`),
  };
}
function makeCollection(path: string) {
  return {
    doc: (id: string) => makeDoc(`${path}/${id}`),
    add: async (data: any) => { h.docs.set(`${path}/${Math.random()}`, data); },
    get: async () => ({
      docs: [...h.docs.entries()]
        .filter(([k]) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes('/'))
        .map(([k, v]) => ({ id: k.split('/').pop()!, data: () => v })),
    }),
  };
}

vi.mock('../firebase-admin.js', () => ({
  db: {
    collection: (name: string) => makeCollection(name),
    runTransaction: async (fn: (tx: any) => Promise<unknown>) => {
      const writes: Array<() => Promise<void>> = [];
      const tx = {
        get: (ref: any) => ref.get(),
        set: (ref: any, data: any, opts?: any) => { writes.push(() => ref.set(data, opts)); },
      };
      const result = await fn(tx);
      for (const w of writes) await w();
      return result;
    },
  },
  FieldValue: { serverTimestamp: () => 'ts' },
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      if (token === 'bad') throw new Error('invalid');
      return {
        uid: h.tokenUids.get(token) ?? h.uid,
        email: h.email,
        auth_time: h.tokenAuthTimes.get(token) ?? h.authTime,
        ...h.claimsOnToken,
        ...(h.tokenClaims.get(token) ?? {}),
      };
    },
    getUser: async (uid: string) => ({ customClaims: h.claims.get(uid) ?? {} }),
    setCustomUserClaims: async (uid: string, value: Record<string, any>) => { h.claims.set(uid, value); },
    createCustomToken: async (uid: string, claims: Record<string, unknown>) => {
      h.createdCustomToken = { uid, claims };
      return 'minted-custom-token';
    },
    revokeRefreshTokens: async () => { h.revoked += 1; },
  }),
}));

const { default: securityRouter } = await import('./admin-security-routes.js');
const { authenticateFirebase } = await import('../email-routes.js');
const { default: emailRouter } = await import('../email-routes.js');
const { requireAdmin } = await import('./admin-guard.js');
const store = await import('./admin-security-store.js');
const service = await import('./passkey-service.js');

const app = express();
app.use(express.json());
app.use('/api/admin/security', securityRouter);
app.use('/api/email', emailRouter);
app.get('/api/protected', authenticateFirebase, (_req, res) => res.json({ ok: true }));
app.get('/api/admin-only', authenticateFirebase, requireAdmin, (_req, res) => res.json({ ok: true }));
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const ORIGIN = 'https://imagestudiofotografico.com';

const json = (r: Response) => r.json() as Promise<any>;
const call = (path: string, init: RequestInit = {}) =>
  fetch(`${base}${path}`, {
    ...init,
    headers: { Authorization: 'Bearer ok', Origin: ORIGIN, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

beforeEach(() => {
  h.docs.clear();
  h.claims.clear();
  h.claimsOnToken = {};
  h.tokenAuthTimes.clear();
  h.tokenClaims.clear();
  h.tokenUids.clear();
  h.createdCustomToken = null;
  h.revoked = 0;
  h.webauthn = false;
  h.authTime = 1_700_000_000;
  h.email = 'gennaro.mazzacane@gmail.com';
});

describe('gate centrale passkey', () => {
  it('lascia invariato l’accesso finché la passkey non è obbligatoria', async () => {
    expect((await call('/api/protected')).status).toBe(200);
    expect((await call('/api/admin-only')).status).toBe(200);
  });

  it('blocca ogni API autenticata dell’admin senza verifica quando è obbligatoria', async () => {
    h.docs.set(`adminSecurity/${h.uid}`, { passkeyRequired: true });
    const res = await call('/api/protected');
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('admin_passkey_required');
    expect((await call('/api/admin-only')).status).toBe(403);
    // Le route di sicurezza restano raggiungibili per ottenere la verifica.
    expect((await call('/api/admin/security/status')).status).toBe(200);
  });

  it('accetta una verifica valida e rifiuta una scaduta o precedente a una revoca', async () => {
    h.docs.set(`adminSecurity/${h.uid}`, { passkeyRequired: true, verificationsValidAfter: 1000 });
    h.claimsOnToken = { apk: { req: true, exp: Date.now() + 60_000, at: 2000, sat: h.authTime } };
    expect((await call('/api/admin-only')).status).toBe(200);

    // Stessa verifica presentata da un'altra sessione di login → rifiutata.
    h.claimsOnToken = { apk: { req: true, exp: Date.now() + 60_000, at: 2000, sat: h.authTime + 5 } };
    expect((await call('/api/admin-only')).status).toBe(403);

    h.claimsOnToken = { apk: { req: true, exp: Date.now() - 1, at: 2000, sat: h.authTime } };
    expect((await call('/api/admin-only')).status).toBe(403);

    h.claimsOnToken = { apk: { req: true, exp: Date.now() + 60_000, at: 500, sat: h.authTime } };
    expect((await call('/api/admin-only')).status).toBe(403);

    h.claimsOnToken = { apk: { req: false, exp: Date.now() + 60_000, at: 2000, sat: h.authTime } };
    expect((await call('/api/admin-only')).status).toBe(403);

    // Una revoca con timestamp uguale alla verifica deve chiudere il confine,
    // non trattare i due eventi come ordinati in favore del token.
    h.claimsOnToken = { apk: { req: true, exp: Date.now() + 60_000, at: 1000, sat: h.authTime } };
    h.docs.set(`adminSecurity/${h.uid}`, { passkeyRequired: true, verificationsValidAfter: 1000 });
    expect((await call('/api/admin-only')).status).toBe(403);
  });

  it('non riguarda i clienti e non promuove chi non è admin', async () => {
    h.email = 'cliente@example.com';
    h.claimsOnToken = { apk: { req: true, exp: Date.now() + 60_000, at: 1 } };
    expect((await call('/api/protected')).status).toBe(200);
    const res = await call('/api/admin-only');
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('admin_only');
    expect((await call('/api/admin/security/status')).status).toBe(403);
  });

  it('rifiuta il token di un cliente anche negli endpoint email riservati agli admin', async () => {
    h.email = 'cliente@example.com';
    const res = await call('/api/email/review-status?email=cliente@example.com');
    expect(res.status).toBe(403);
    expect((await json(res)).code).toBe('admin_only');
  });

  it('fallisce chiuso se lo stato di sicurezza non è leggibile', async () => {
    const spy = vi.spyOn(store, 'loadGuardSnapshot').mockRejectedValueOnce(new Error('firestore down'));
    const res = await call('/api/admin-only');
    expect(res.status).toBe(503);
    spy.mockRestore();
  });
});

describe('route di sicurezza', () => {
  it('crea una richiesta di verifica passkey per la Preview sul dominio di produzione', async () => {
    await store.savePasskey(h.uid, {
      id: 'cred-1',
      publicKey: 'AQID',
      counter: 0,
      transports: ['internal'],
      rpId: 'imagestudiofotografico.com',
      label: 'Telefono',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: 1,
      lastUsedAt: null,
    });
    await store.updateState(h.uid, { passkeyRequired: true });

    const verifier = 'V'.repeat(43);
    const verifierHash = createHash('sha256').update(verifier).digest('base64url');
    const response = await call('/api/admin/security/desktop-handoff/start', {
      method: 'POST',
      body: JSON.stringify({ verifierHash, target: 'preview' }),
    });

    expect(response.status).toBe(200);
    const started = await json(response);
    const verificationUrl = new URL(started.verificationUrl);
    expect(verificationUrl.origin).toBe(ORIGIN);
    expect(verificationUrl.pathname).toBe('/admin/sicurezza');
    expect(verificationUrl.searchParams.get('desktopHandoff')).toBe(started.handoffId);
    expect(verificationUrl.searchParams.get('handoffTarget')).toBe('preview');
  });

  it('completa un handoff Windows con challenge HTTPS dedicata e claim legato alla nuova sessione', async () => {
    h.webauthn = true;
    await store.savePasskey(h.uid, {
      id: 'cred-1',
      publicKey: 'AQID',
      counter: 0,
      transports: ['internal'],
      rpId: 'imagestudiofotografico.com',
      label: 'Telefono',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: 1,
      lastUsedAt: null,
    });
    await store.updateState(h.uid, { passkeyRequired: true });

    const verifier = 'V'.repeat(43);
    const verifierHash = createHash('sha256').update(verifier).digest('base64url');
    const start = await call('/api/admin/security/desktop-handoff/start', {
      method: 'POST',
      body: JSON.stringify({ verifierHash }),
    });
    expect(start.status).toBe(200);
    const started = await json(start);
    expect(new URL(started.verificationUrl)).toMatchObject({
      origin: ORIGIN,
      pathname: '/admin/sicurezza',
    });

    const browserAuthTime = h.authTime + 15;
    h.tokenAuthTimes.set('browser', browserAuthTime);
    const previewOptions = await call(
      `/api/admin/security/desktop-handoff/${started.handoffId}/authentication/options`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer browser',
          Origin: 'https://preview.replit.dev',
        },
      },
    );
    expect(previewOptions.status).toBe(400);
    expect((await json(previewOptions)).code).toBe('origin_not_allowed');

    const optionsResponse = await call(
      `/api/admin/security/desktop-handoff/${started.handoffId}/authentication/options`,
      { method: 'POST', headers: { Authorization: 'Bearer browser' } },
    );
    expect(optionsResponse.status).toBe(200);
    const options = await json(optionsResponse);
    const handoffPath = `adminSecurity/${h.uid}/desktopHandoffs/${started.handoffId}`;
    expect(h.docs.get(handoffPath)?.challenge).toMatchObject({
      value: options.challenge,
      origin: ORIGIN,
      authTime: browserAuthTime,
    });

    const verified = await call(
      `/api/admin/security/desktop-handoff/${started.handoffId}/authentication/verify`,
      {
        method: 'POST',
        headers: { Authorization: 'Bearer browser' },
        body: JSON.stringify({ response: { id: 'cred-1' } }),
      },
    );
    expect(verified.status).toBe(200);
    expect((await json(verified)).verifiedAt).toBeGreaterThan(0);
    expect(h.docs.get(handoffPath)?.status).toBe('verified');
    // The browser session itself did not receive the admin verification claim.
    expect(h.claims.get(h.uid)?.apk).toBeUndefined();

    const badVerifier = await call(
      `/api/admin/security/desktop-handoff/${started.handoffId}/status`,
      {
        method: 'POST',
        body: JSON.stringify({ verifier: 'X'.repeat(43) }),
      },
    );
    expect(badVerifier.status).toBe(404);

    const status = await call(`/api/admin/security/desktop-handoff/${started.handoffId}/status`, {
      method: 'POST',
      body: JSON.stringify({ verifier }),
    });
    expect(await json(status)).toEqual({ status: 'verified' });

    const redeemed = await call(`/api/admin/security/desktop-handoff/${started.handoffId}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ verifier }),
    });
    expect(redeemed.status).toBe(200);
    expect(await json(redeemed)).toEqual({ customToken: 'minted-custom-token' });
    const customClaim = h.createdCustomToken?.claims.adminDesktopHandoff as { id: string; nonce: string };
    expect(customClaim.id).toBe(started.handoffId);

    const replayedRedeem = await call(`/api/admin/security/desktop-handoff/${started.handoffId}/redeem`, {
      method: 'POST',
      body: JSON.stringify({ verifier }),
    });
    expect(replayedRedeem.status).toBe(400);

    const windowsAuthTime = h.authTime + 30;
    h.tokenAuthTimes.set('windows-session', windowsAuthTime);
    h.tokenClaims.set('windows-session', { adminDesktopHandoff: customClaim });
    const finalized = await call('/api/admin/security/desktop-handoff/finalize', {
      method: 'POST',
      headers: { Authorization: 'Bearer windows-session' },
      body: JSON.stringify({}),
    });
    expect(finalized.status).toBe(200);
    const result = await json(finalized);
    expect(result.expectedClaim).toMatchObject({ req: true, sat: windowsAuthTime });
    expect(h.docs.get(handoffPath)?.status).toBe('finalized');

    const issuedClaim = h.claims.get(h.uid)?.apk;
    h.tokenClaims.set('windows-session', {
      adminDesktopHandoff: customClaim,
      apk: issuedClaim,
    });
    expect((await call('/api/admin-only')).status).toBe(403); // Original desktop login is still unverified.
    expect((await call('/api/admin-only', {
      headers: { Authorization: 'Bearer windows-session' },
    })).status).toBe(200);
    expect((await call('/api/admin-only', {
      headers: { Authorization: 'Bearer browser' },
    })).status).toBe(403); // The browser verification was not copied to its session.

    const replayedFinalize = await call('/api/admin/security/desktop-handoff/finalize', {
      method: 'POST',
      headers: { Authorization: 'Bearer windows-session' },
      body: JSON.stringify({}),
    });
    expect(replayedFinalize.status).toBe(200);
    expect((await json(replayedFinalize)).expectedClaim).toEqual(result.expectedClaim);

    h.tokenAuthTimes.set('other-windows-session', windowsAuthTime + 1);
    h.tokenClaims.set('other-windows-session', { adminDesktopHandoff: customClaim });
    const otherSessionRetry = await call('/api/admin/security/desktop-handoff/finalize', {
      method: 'POST',
      headers: { Authorization: 'Bearer other-windows-session' },
      body: JSON.stringify({}),
    });
    expect(otherSessionRetry.status).toBe(409);

    await store.updateState(h.uid, { verificationsValidAfter: result.expectedClaim.at });
    const revokedRetry = await call('/api/admin/security/desktop-handoff/finalize', {
      method: 'POST',
      headers: { Authorization: 'Bearer windows-session' },
      body: JSON.stringify({}),
    });
    expect(revokedRetry.status).toBe(409);
  });

  it('rifiuta origini non consentite e challenge assenti', async () => {
    const res = await call('/api/admin/security/registration/options', {
      method: 'POST', headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(400);
    expect((await json(res)).code).toBe('origin_not_allowed');

    const verify = await call('/api/admin/security/registration/verify', {
      method: 'POST', body: JSON.stringify({ response: { id: 'abc' } }),
    });
    expect(verify.status).toBe(400);
    expect((await json(verify)).code).toBe('challenge_expired');
  });

  it('genera opzioni WebAuthn con RP corretto e challenge monouso salvata lato server', async () => {
    const res = await call('/api/admin/security/registration/options', { method: 'POST' });
    expect(res.status).toBe(200);
    const options = await json(res);
    expect(options.rp.id).toBe('imagestudiofotografico.com');
    expect(options.authenticatorSelection.userVerification).toBe('required');
    const state = h.docs.get(`adminSecurity/${h.uid}`);
    expect(state?.challenge).toMatchObject({ kind: 'registration', value: options.challenge, origin: ORIGIN });
  });

  it('offre il trasporto ibrido per usare dal desktop una passkey registrata sul telefono', async () => {
    await store.savePasskey(h.uid, {
      id: 'phone-credential',
      publicKey: 'AQID',
      counter: 0,
      transports: ['internal'],
      rpId: 'imagestudiofotografico.com',
      label: 'Telefono',
      deviceType: 'multiDevice',
      backedUp: true,
      createdAt: Date.now(),
      lastUsedAt: null,
    });
    await store.savePasskey(h.uid, {
      id: 'usb-credential',
      publicKey: 'AQID',
      counter: 0,
      transports: ['usb'],
      rpId: 'imagestudiofotografico.com',
      label: 'Chiave',
      deviceType: 'singleDevice',
      backedUp: false,
      createdAt: Date.now(),
      lastUsedAt: null,
    });

    const res = await call('/api/admin/security/authentication/options', { method: 'POST' });
    expect(res.status).toBe(200);
    const options = await json(res);
    expect(options.allowCredentials.find((entry: any) => entry.id === 'phone-credential')?.transports)
      .toEqual(['internal', 'hybrid']);
    expect(options.allowCredentials.find((entry: any) => entry.id === 'usb-credential')?.transports)
      .toEqual(['usb']);
  });

  it('richiede autenticazione reale in produzione: registrazione, preview, altra sessione e recovery non bastano', async () => {
    let res = await call('/api/admin/security/enforcement', { method: 'POST', body: JSON.stringify({ required: true }) });
    expect(res.status).toBe(403); // nessuna verifica corrente

    h.webauthn = true;
    await call('/api/admin/security/registration/options', { method: 'POST' });
    res = await call('/api/admin/security/registration/verify', {
      method: 'POST', body: JSON.stringify({ response: { id: 'cred-1' }, label: 'Telefono' }),
    });
    expect(res.status).toBe(200);
    expect(h.claims.get(h.uid)?.apk).toBeUndefined();
    expect((await json(await call('/api/admin/security/status'))).activationReady).toBe(false);

    const codesRes = await call('/api/admin/security/recovery-codes', { method: 'POST' });
    const { codes } = await json(codesRes);
    expect(codes).toHaveLength(8);
    expect(h.docs.get(`adminSecurity/${h.uid}`)?.recoveryCodes[0].hash).not.toContain(codes[0]);

    // Anche una verifica da recovery produce un claim valido per il gate,
    // ma non la prova WebAuthn necessaria all'attivazione.
    res = await call('/api/admin/security/recovery/verify', { method: 'POST', body: JSON.stringify({ code: codes[0] }) });
    expect(res.status).toBe(200);
    const recovery = await json(res);
    expect(recovery.expectedClaim).toMatchObject({ req: false, sat: h.authTime });
    h.claimsOnToken = { ...h.claims.get(h.uid) };
    res = await call('/api/admin/security/enforcement', { method: 'POST', body: JSON.stringify({ required: true }) });
    expect((await json(res)).code).toBe('authentication_required_for_enforcement');

    await call('/api/admin/security/authentication/options', { method: 'POST' });
    res = await call('/api/admin/security/authentication/verify', {
      method: 'POST', body: JSON.stringify({ response: { id: 'cred-1' } }),
    });
    expect(res.status).toBe(200);
    expect((await json(res)).expectedClaim).toMatchObject({ req: false, sat: h.authTime });
    h.claimsOnToken = { ...h.claims.get(h.uid) };
    expect((await json(await call('/api/admin/security/status'))).activationReady).toBe(true);
    const sameOriginGet = await call('/api/admin/security/status', {
      headers: { Origin: '', Referer: `${ORIGIN}/admin/security` },
    });
    expect((await json(sameOriginGet)).activationReady).toBe(true);
    const proof = h.docs.get(`adminSecurity/${h.uid}`)?.activationProof;
    expect(service.activationProofIsValid(proof, {
      uid: h.uid, email: h.email, authTime: h.authTime,
    }, h.claimsOnToken.apk, ORIGIN, proof.verifiedAt + 5 * 60 * 1000)).toBe(false);

    res = await call('/api/admin/security/enforcement', {
      method: 'POST', headers: { Origin: 'https://preview.replit.dev' },
      body: JSON.stringify({ required: true }),
    });
    expect((await json(res)).code).toBe('authentication_required_for_enforcement');
    h.authTime += 10;
    res = await call('/api/admin/security/enforcement', { method: 'POST', body: JSON.stringify({ required: true }) });
    expect(res.status).toBe(403);
    h.authTime -= 10;

    res = await call('/api/admin/security/enforcement', { method: 'POST', body: JSON.stringify({ required: true }) });
    expect(res.status).toBe(200);
    const enforcement = await json(res);
    expect(enforcement.expectedClaim).toMatchObject({ req: true, sat: h.authTime });
    expect(h.claims.get(h.uid)?.apk).toMatchObject(enforcement.expectedClaim);
    const status = await call('/api/admin/security/status');
    expect((await json(status)).expectedClaim).toMatchObject(enforcement.expectedClaim);
    // L'attivazione invalida le verifiche precedenti delle altre sessioni.
    expect(h.docs.get(`adminSecurity/${h.uid}`)?.verificationsValidAfter).toBeGreaterThan(0);

    // Ora le modifiche richiedono la verifica corrente: senza claim valido → 403.
    h.claimsOnToken = {};
    res = await call('/api/admin/security/recovery-codes', { method: 'POST' });
    expect(res.status).toBe(403);

    // Il codice di recupero concede una verifica breve e vale una sola volta.
    res = await call('/api/admin/security/recovery/verify', { method: 'POST', body: JSON.stringify({ code: codes[0] }) });
    expect(res.status).toBe(400);
    res = await call('/api/admin/security/recovery/verify', { method: 'POST', body: JSON.stringify({ code: codes[1] }) });
    expect(res.status).toBe(200);
    expect((await json(res)).expectedClaim).toMatchObject({ req: true, sat: h.authTime });
  });

  it('blocca i tentativi dopo cinque codici errati', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await call('/api/admin/security/recovery/verify', { method: 'POST', body: JSON.stringify({ code: 'AAAA-BBBB-CCCC' }) });
      expect(res.status).toBe(400);
    }
    const locked = await call('/api/admin/security/recovery/verify', { method: 'POST', body: JSON.stringify({ code: 'AAAA-BBBB-CCCC' }) });
    expect(locked.status).toBe(429);
  });

  it('la revoca invalida le verifiche precedenti e protegge l’ultima passkey obbligatoria', async () => {
    await store.savePasskey(h.uid, {
      id: 'cred-1', publicKey: 'AA', counter: 0, transports: [], rpId: 'imagestudiofotografico.com',
      label: 'Telefono', deviceType: 'multiDevice', backedUp: true, createdAt: 1, lastUsedAt: null,
    });
    await store.updateState(h.uid, { passkeyRequired: true });
    h.claimsOnToken = { apk: { req: true, exp: Date.now() + 60_000, at: Date.now(), sat: h.authTime } };
    let res = await call('/api/admin/security/passkeys/cred-1', { method: 'DELETE' });
    expect(res.status).toBe(409);

    await store.savePasskey(h.uid, {
      id: 'cred-2', publicKey: 'BB', counter: 0, transports: [], rpId: 'imagestudiofotografico.com',
      label: 'Laptop', deviceType: 'singleDevice', backedUp: false, createdAt: 2, lastUsedAt: null,
    });
    res = await call('/api/admin/security/passkeys/cred-1', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await store.getPasskey(h.uid, 'cred-1')).toBeNull();
    // La stessa verifica non è più accettata dal server.
    res = await call('/api/admin-only');
    expect(res.status).toBe(403);
  });

  it('consuma la challenge una sola volta anche con richieste concorrenti', async () => {
    await call('/api/admin/security/registration/options', { method: 'POST' });
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        call('/api/admin/security/registration/verify', { method: 'POST', body: JSON.stringify({ response: { id: 'x' } }) })
          .then(async (r) => (await json(r)).code as string),
      ),
    );
    // La prima risposta trova la challenge ma fallisce la verifica WebAuthn;
    // le altre non trovano più la challenge.
    expect(results.filter((c) => c === 'challenge_expired').length).toBeGreaterThanOrEqual(2);
    expect(h.docs.get(`adminSecurity/${h.uid}`)?.challenge).toBeNull();
  });
});

describe('PasskeyError e claim', () => {
  it('espone lo stato nella status route', async () => {
    const res = await call('/api/admin/security/status');
    expect(await json(res)).toMatchObject({ passkeyRequired: false, passkeys: [], verified: false, recoveryCodesRemaining: 0 });
  });

  it('non lascia in chiaro i codici di recupero', async () => {
    const codes = await service.regenerateRecoveryCodes({ uid: h.uid, email: h.email, authTime: h.authTime });
    const stored = h.docs.get(`adminSecurity/${h.uid}`)?.recoveryCodes as { hash: string }[];
    expect(stored.map((c) => c.hash)).not.toContain(codes[0]);
    expect(stored[0].hash).toBe(store.hashRecoveryCode(codes[0].toLowerCase()));
  });
});
