// Temporary browser test output: never shipped or committed.
import { chromium } from '../../../node_modules/.pnpm/playwright@1.63.0/node_modules/playwright/index.mjs';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const source = await readFile('artifacts/image-studio-desktop/src/lib/firebase.ts', 'utf8');
const apiKey = source.match(/apiKey:.*?"([^"]+)"/)[1];
const projectId = source.match(/projectId:.*?"([^"]+)"/)[1];
const root = 'http://127.0.0.1:80/desktop/';
const serverNow = Date.now();
const clientNow = serverNow + 24 * 60 * 60_000;
const uid = 'isolated-passkey-browser-admin';
const email = 'passkey-test@example.test';
const claim = { req: true, at: serverNow, sat: Math.floor(serverNow / 1000), exp: serverNow + 12 * 60 * 60_000 };
const id = 'B'.repeat(43);
function jwt(verified) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [encode({ alg: 'RS256', typ: 'JWT' }), encode({
    iss: `https://securetoken.google.com/${projectId}`, aud: projectId,
    sub: uid, user_id: uid, auth_time: claim.sat, iat: claim.sat,
    exp: claim.sat + 3 * 24 * 3600, email, email_verified: true, admin: true,
    firebase: { identities: {}, sign_in_provider: 'custom' },
    ...(verified ? { apk: claim } : {}),
  }), 'isolated-test-signature'].join('.');
}

const browser = await chromium.launch({ executablePath: '/repl/tools/bin/chromium', args: ['--no-sandbox'], headless: true });
try {
  for (const accepted of [true, false]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    let finalized = false;
    let polls = 0;
    const calls = [];
    const pageErrors = [];
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      const json = body => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      if (url.hostname === 'identitytoolkit.googleapis.com') {
        if (url.pathname.endsWith('accounts:signInWithCustomToken')) {
          calls.push('custom-token-sign-in');
          return json({ localId: uid, email, idToken: jwt(false), refreshToken: 'isolated-refresh', expiresIn: '3600', isNewUser: false });
        }
        if (url.pathname.endsWith('accounts:lookup')) {
          return json({ users: [{ localId: uid, email, emailVerified: true, providerUserInfo: [] }] });
        }
        return route.abort();
      }
      if (url.hostname === 'securetoken.googleapis.com') {
        calls.push(finalized ? 'verified-token-refresh' : 'initial-token-refresh');
        return json({ access_token: jwt(finalized), id_token: jwt(finalized), expires_in: '3600', token_type: 'Bearer', refresh_token: 'isolated-refresh', user_id: uid, project_id: projectId });
      }
      if (url.pathname.includes('/api/')) {
        const path = url.pathname.slice(url.pathname.indexOf('/api/'));
        calls.push(path);
        const base = '/api/admin/security/desktop-handoff';
        if (path === `${base}/start`) return json({
          handoffId: id, expiresAt: serverNow + 600_000,
          verificationUrl: `https://imagestudiofotografico.com/admin/sicurezza?desktopHandoff=${id}`,
        });
        if (path === `${base}/${id}/status`) return json({ status: ++polls > 1 ? 'verified' : 'pending' });
        if (path === `${base}/${id}/redeem`) return json({ customToken: 'isolated-custom-token' });
        if (path === `${base}/finalize`) { finalized = true; return json({ expectedClaim: claim, verifiedUntil: claim.exp }); }
        if (path === '/api/admin/security/status') return json({ passkeyRequired: true, verified: accepted, verifiedUntil: claim.exp });
        if (route.request().method() !== 'GET') return route.abort();
        if (path === '/api/desktop/galleries') return json({ galleries: [] });
        if (path === '/api/desktop/clients') return json({ clients: [] });
        if (path === '/api/desktop/jobs') return json({ jobs: [] });
        return json([]);
      }
      if (url.origin === new URL(root).origin && url.pathname.startsWith('/desktop/')) return route.continue();
      // No real Firebase, Firestore, production API or external website requests.
      return route.abort();
    });
    await context.addInitScript(({ apiKey, uid, email, token, clientNow }) => {
      Date.now = () => clientNow;
      localStorage.setItem(`firebase:authUser:${apiKey}:[DEFAULT]`, JSON.stringify({
        uid, email, emailVerified: true, isAnonymous: false, providerData: [],
        stsTokenManager: { refreshToken: 'isolated-refresh', accessToken: token, expirationTime: clientNow + 3600_000 },
        createdAt: String(clientNow - 3600_000), lastLoginAt: String(clientNow), apiKey, appName: '[DEFAULT]',
      }));
      window.__openedVerificationUrls = [];
      window.imageStudioDesktop = {
        platform: 'win32', version: '0.0.8',
        openExternal: async url => { window.__openedVerificationUrls.push(url); },
        onUpdateStatus: () => () => {},
        getUpdateStatus: async () => ({ phase: 'idle' }),
        setUpdateWorkCount: async () => ({ ok: true }),
      };
    }, { apiKey, uid, email, token: jwt(false), clientNow });
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(root, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !location.pathname.endsWith('/login'), { timeout: 10_000 });
    await page.evaluate(() => window.dispatchEvent(new Event('admin-passkey-required')));
    await page.getByRole('button', { name: 'Apri il browser e verifica' }).click();
    await page.getByRole('button', { name: 'In attesa della verifica…' }).waitFor();
    if (accepted) {
      await page.getByText('Passkey verificata', { exact: true }).waitFor({ timeout: 15_000 });
      await page.getByText('Nessuna galleria trovata.', { exact: true }).waitFor({ timeout: 10_000 });
      assert.equal(await page.getByText('Errore nel caricamento delle gallerie.', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('alertdialog').count(), 0);
      assert.equal(await page.getByText(/richiesta.*scaduta/i).count(), 0);
    } else {
      await page.getByText('Sessione Windows da aggiornare', { exact: true }).waitFor({ timeout: 15_000 });
      await page.getByRole('button', { name: 'Riprova aggiornamento' }).waitFor();
      assert.equal(await page.getByText('Passkey verificata', { exact: true }).count(), 0);
    }
    assert.equal(await page.evaluate(() => window.__openedVerificationUrls.length), 1);
    assert.ok(polls >= 2);
    for (const required of ['custom-token-sign-in', '/api/admin/security/desktop-handoff/finalize', 'verified-token-refresh', '/api/admin/security/status']) {
      assert.ok(calls.includes(required), `Missing ${required}`);
    }
    assert.deepEqual(pageErrors, []);
    await page.screenshot({ path: `artifacts/image-studio-desktop/release/passkey-browser-${accepted ? 'success' : 'rejected'}.png` });
    console.log(JSON.stringify({ result: 'PASS', scenario: accepted ? 'clock-ahead-24h-success' : 'server-rejects-proof', polls, browserOpens: 1, realServiceWrites: 0 }));
    await context.close();
  }
} finally {
  await browser.close();
}
