import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_SITE_URL, getSiteBaseUrl } from './site-url.js';

const request = (host: string, proto = 'https') => ({
  protocol: proto, get: (name: string) => ({ host, 'x-forwarded-proto': proto } as Record<string, string>)[name.toLowerCase()],
}) as never;

beforeEach(() => { vi.stubEnv('SITE_URL', ''); vi.stubEnv('NODE_ENV', 'production'); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('getSiteBaseUrl (link nelle email ai clienti)', () => {
  it('senza configurazione né richiesta usa il dominio ufficiale, mai un indirizzo replit.app', () => {
    expect(OFFICIAL_SITE_URL).toBe('https://imagestudiofotografico.com');
    expect(getSiteBaseUrl()).toBe('https://imagestudiofotografico.com');
  });

  it('usa SITE_URL quando è un dominio pubblico e toglie la barra finale', () => {
    vi.stubEnv('SITE_URL', 'https://www.imagestudiofotografico.com/');
    expect(getSiteBaseUrl()).toBe('https://www.imagestudiofotografico.com');
  });

  it.each(['https://imagestudiofotografico.replit.app', 'https://abc.picard.replit.dev', 'http://localhost:5000', 'non-un-indirizzo'])(
    'in produzione scarta un SITE_URL interno o non valido (%s) e usa il dominio ufficiale', value => {
      vi.stubEnv('SITE_URL', value);
      expect(getSiteBaseUrl()).toBe('https://imagestudiofotografico.com');
    });

  it("in produzione l'host della richiesta non entra mai in un link per i clienti (né interno né falsificato)", () => {
    expect(getSiteBaseUrl(request('imagestudiofotografico.com'))).toBe('https://imagestudiofotografico.com');
    expect(getSiteBaseUrl(request('imagestudiofotografico.replit.app'))).toBe('https://imagestudiofotografico.com');
    expect(getSiteBaseUrl(request('localhost:5000', 'http'))).toBe('https://imagestudiofotografico.com');
    expect(getSiteBaseUrl(request('evil-host.example'))).toBe('https://imagestudiofotografico.com');
  });

  it('fuori dalla produzione resta possibile provare con l\'host di anteprima', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(getSiteBaseUrl(request('abc.picard.replit.dev'))).toBe('https://abc.picard.replit.dev');
    expect(getSiteBaseUrl()).toBe('https://imagestudiofotografico.com');
  });
});
