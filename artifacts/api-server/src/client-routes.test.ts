import { describe, expect, it } from 'vitest';
import { isKnownClientPath, isPrivateClientPath } from './client-routes';

describe('percorsi delle gift card', () => {
  it('la pagina del regalo è raggiungibile ma mai indicizzata', () => {
    expect(isKnownClientPath('/regalo/K7QM-4XD2-9PTR')).toBe(true);
    expect(isPrivateClientPath('/regalo/K7QM-4XD2-9PTR')).toBe(true);
    expect(isPrivateClientPath('/regalo/K7QM-4XD2-9PTR/')).toBe(true);
  });

  it('la pagina di acquisto /regala è pubblica', () => {
    expect(isKnownClientPath('/regala')).toBe(true);
    expect(isKnownClientPath('/regala/')).toBe(true);
    expect(isPrivateClientPath('/regala')).toBe(false);
    expect(isKnownClientPath('/regala/altro')).toBe(false);
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
