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

  describe('vetrina shop /online-shop', () => {
    const original = process.env.SHOP_INDEXABLE;
    afterEach(() => {
      if (original === undefined) delete process.env.SHOP_INDEXABLE;
      else process.env.SHOP_INDEXABLE = original;
    });

    it('è raggiungibile ma non indicizzata finché non si decide di aprirla a Google', () => {
      delete process.env.SHOP_INDEXABLE;
      expect(isKnownClientPath('/online-shop')).toBe(true);
      expect(isKnownClientPath('/online-shop/')).toBe(true);
      expect(isPrivateClientPath('/online-shop')).toBe(true);
      expect(isKnownClientPath('/online-shop/altro')).toBe(false);
    });

    it('la pagina con tutti gli shop e raggiungibile ma non indicizzata', () => {
      process.env.SHOP_INDEXABLE = 'true';
      expect(isKnownClientPath('/negozi')).toBe(true);
      expect(isPrivateClientPath('/negozi')).toBe(true);
    });

    it('con SHOP_INDEXABLE=true diventa una pagina pubblica indicizzabile', () => {
      process.env.SHOP_INDEXABLE = 'true';
      expect(isKnownClientPath('/online-shop')).toBe(true);
      expect(isPrivateClientPath('/online-shop')).toBe(false);
    });

    it("le pagine dell'ordine sono raggiungibili ma mai indicizzate, anche con la vetrina aperta a Google", () => {
      process.env.SHOP_INDEXABLE = 'true';
      for (const path of ['/online-shop/condizioni', '/online-shop/ordine', '/online-shop/ordine/conferma', '/online-shop/i-miei-ordini']) {
        expect(isKnownClientPath(path), path).toBe(true);
        expect(isPrivateClientPath(path), path).toBe(true);
      }
      expect(isKnownClientPath('/online-shop/ordine/conferma/')).toBe(true);
      expect(isKnownClientPath('/online-shop/ordini')).toBe(false);
    });

    it('le pagine delle categorie esistono, ma sono nascoste a Google finché lo shop non è indicizzabile', () => {
      delete process.env.SHOP_INDEXABLE;
      expect(isKnownClientPath('/online-shop/categoria/tazze')).toBe(true);
      expect(isPrivateClientPath('/online-shop/categoria/tazze')).toBe(true);
      process.env.SHOP_INDEXABLE = 'true';
      expect(isKnownClientPath('/online-shop/categoria/tazze')).toBe(true);
      expect(isPrivateClientPath('/online-shop/categoria/tazze')).toBe(false);
      expect(isKnownClientPath('/online-shop/categoria')).toBe(false);
      expect(isKnownClientPath('/online-shop/categoria/a/b')).toBe(false);
    });

    it("non dipende dall'interruttore delle gift card", () => {
      process.env.SHOP_INDEXABLE = 'true';
      delete process.env.GIFT_SHOP_INDEXABLE;
      expect(isPrivateClientPath('/online-shop')).toBe(false);
      expect(isPrivateClientPath('/regala')).toBe(true);
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
