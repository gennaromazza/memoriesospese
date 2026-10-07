import { afterEach, describe, expect, it } from 'vitest';
import { isKnownClientPath, isPrivateClientPath } from './client-routes';

describe('percorsi delle gift card', () => {
  it('la pagina del regalo è raggiungibile ma mai indicizzata', () => {
    expect(isKnownClientPath('/regalo/K7QM-4XD2-9PTR')).toBe(true);
    expect(isPrivateClientPath('/regalo/K7QM-4XD2-9PTR')).toBe(true);
    expect(isPrivateClientPath('/regalo/K7QM-4XD2-9PTR/')).toBe(true);
  });

  describe('pagina di acquisto /regala', () => {
    const original = process.env.GIFT_SHOP_INDEXABLE;
    afterEach(() => {
      if (original === undefined) delete process.env.GIFT_SHOP_INDEXABLE;
      else process.env.GIFT_SHOP_INDEXABLE = original;
    });

    it('è raggiungibile ma non indicizzata finché non si decide di aprirla a Google', () => {
      delete process.env.GIFT_SHOP_INDEXABLE;
      expect(isKnownClientPath('/regala')).toBe(true);
      expect(isKnownClientPath('/regala/')).toBe(true);
      expect(isPrivateClientPath('/regala')).toBe(true);
      expect(isKnownClientPath('/regala/come-funziona')).toBe(true);
      expect(isPrivateClientPath('/regala/come-funziona')).toBe(true);
      expect(isKnownClientPath('/regala/altro')).toBe(false);
    });

    it('con GIFT_SHOP_INDEXABLE=true diventa una pagina pubblica indicizzabile', () => {
      process.env.GIFT_SHOP_INDEXABLE = 'true';
      expect(isKnownClientPath('/regala')).toBe(true);
      expect(isPrivateClientPath('/regala')).toBe(false);
      expect(isKnownClientPath('/regala/come-funziona')).toBe(true);
      expect(isPrivateClientPath('/regala/come-funziona')).toBe(false);
    });
  });

  it('non apre percorsi inventati sotto /regalo', () => {
    expect(isKnownClientPath('/regalo')).toBe(false);
    expect(isKnownClientPath('/regalo/a/b')).toBe(false);
  });

  it('le pagine amministrative delle gift card restano private', () => {
    expect(isPrivateClientPath('/admin/gift-card')).toBe(true);
    expect(isPrivateClientPath('/admin/gift-card/stampa/K7QM-4XD2-9PTR')).toBe(true);
  });
});
