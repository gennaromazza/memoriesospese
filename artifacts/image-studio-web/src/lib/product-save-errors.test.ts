import { describe, expect, it } from 'vitest';
import { getProductSaveErrorMessage, isAdminPasskeyRefreshRequired, isProductWritePermissionDenied } from './product-save-errors';

describe('errore salvataggio prodotto', () => {
  it('spiega la passkey scaduta anche quando il rifiuto arriva dall’API', () => {
    const expired = { code: 'admin_passkey_required' };
    expect(isAdminPasskeyRefreshRequired(expired)).toBe(true);
    expect(getProductSaveErrorMessage(expired)).toMatch(/dati inseriti restano nel modulo/i);
    expect(isAdminPasskeyRefreshRequired({ code: 'admin_only' })).toBe(false);
  });
  it('riconosce il rifiuto Firestore e segnala il rinnovo della passkey quando serve', () => {
    const error = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
    expect(isProductWritePermissionDenied(error)).toBe(true);
    expect(getProductSaveErrorMessage(error, { passkeyRequired: true, verified: false }))
      .toMatch(/verifica passkey.*scaduta|non è attiva/i);
    expect(getProductSaveErrorMessage(error, undefined, Object.assign(new Error('Passkey richiesta'), {
      status: 403,
      code: 'admin_passkey_required',
    }))).toMatch(/verifica passkey/i);
    expect(getProductSaveErrorMessage(error, { passkeyRequired: true, verified: true }))
      .toMatch(/rinnovala da Sicurezza/i);
  });

  it('spiega quando è scaduta la sessione e preserva gli errori del percorso shop', () => {
    const permissionError = Object.assign(new Error('Denied'), { code: 'permission-denied' });
    const expiredSession = Object.assign(new Error('Login richiesto'), { status: 401, code: 'unauthenticated' });
    expect(getProductSaveErrorMessage(permissionError, undefined, expiredSession))
      .toMatch(/sessione amministratore è scaduta/i);

    const shopError = Object.assign(new Error('Apri editor shop'), { code: 'print_shop_route_required' });
    expect(getProductSaveErrorMessage(shopError)).toBe('Apri editor shop');
  });

  it('mostra il codice e il dettaglio degli errori non ancora classificati', () => {
    const error = Object.assign(new Error('Invalid field value.'), { code: 'invalid-argument' });
    expect(getProductSaveErrorMessage(error))
      .toBe('Impossibile salvare il prodotto. Dettaglio: codice invalid-argument — Invalid field value.');
  });
});
