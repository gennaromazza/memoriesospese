import { describe, expect, it } from 'vitest';
import {
  CODE_TTL_MS, MAX_ATTEMPTS, MAX_SENDS_PER_WINDOW, SEND_WINDOW_MS,
  clientAreaUid, emailKey, generateCode, prepareSend, verifyCode,
} from './login-code';

const email = 'sposi@example.com';

describe('codici di accesso area cliente', () => {
  it('genera codici di 6 cifre', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^\d{6}$/);
  });

  it('id documento e uid non contengono l’email e sono stabili', () => {
    expect(emailKey(email)).not.toContain('example');
    expect(clientAreaUid(email)).toMatch(/^ca_[0-9a-f]{26}$/);
    expect(clientAreaUid(email)).toBe(clientAreaUid(email));
    expect(clientAreaUid(email)).not.toBe(clientAreaUid('altro@example.com'));
  });

  it('accetta il codice giusto e non salva il codice in chiaro', () => {
    const sent = prepareSend(null, email, '123456', 1000);
    expect(sent.allowed).toBe(true);
    if (!sent.allowed) return;
    expect(JSON.stringify(sent.record)).not.toContain('123456');
    expect(verifyCode(sent.record, email, ' 123456 ', 2000)).toEqual({ ok: true });
  });

  it('rifiuta codici sbagliati, scaduti o dopo troppi tentativi', () => {
    const sent = prepareSend(null, email, '123456', 0);
    if (!sent.allowed) throw new Error('atteso invio consentito');
    expect(verifyCode(sent.record, email, '654321', 1)).toEqual({ ok: false, reason: 'wrong_code', attemptsLeft: MAX_ATTEMPTS - 1 });
    expect(verifyCode(sent.record, 'altro@example.com', '123456', 1)).toMatchObject({ ok: false, reason: 'wrong_code' });
    expect(verifyCode(sent.record, email, '123456', CODE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
    expect(verifyCode({ ...sent.record, attempts: MAX_ATTEMPTS }, email, '123456', 1)).toEqual({ ok: false, reason: 'too_many_attempts' });
    expect(verifyCode(null, email, '123456', 1)).toEqual({ ok: false, reason: 'missing' });
  });

  it('limita gli invii per email nella finestra e riparte dopo', () => {
    let record = null;
    for (let i = 0; i < MAX_SENDS_PER_WINDOW; i++) {
      const sent = prepareSend(record, email, '000000', i);
      expect(sent.allowed).toBe(true);
      if (sent.allowed) record = sent.record;
    }
    expect(prepareSend(record, email, '000000', 10)).toEqual({ allowed: false, reason: 'rate_limited' });
    expect(prepareSend(record, email, '000000', SEND_WINDOW_MS + 1).allowed).toBe(true);
  });
});
