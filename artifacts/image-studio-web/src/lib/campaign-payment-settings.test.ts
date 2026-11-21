import { describe, expect, it } from 'vitest';
import { campaignPaymentFields, campaignPaymentForm } from './campaign-payment-settings';

describe('conversione acconto campagna', () => {
  it('usa i default legacy e conserva le due opzioni indipendenti', () => {
    expect(campaignPaymentForm()).toEqual({
      richiedeApprovazione: true, richiedeAcconto: false, accontoImportoEuro: '', emailRecuperoAcconto: false,
    });
    for (const richiedeApprovazione of [true, false]) {
      for (const richiedeAcconto of [true, false]) {
        const fields = { richiedeApprovazione, richiedeAcconto, accontoImportoCentesimi: 2501 };
        expect(campaignPaymentFields(campaignPaymentForm(fields))).toEqual({
          ...fields, accontoImportoCentesimi: richiedeAcconto ? 2501 : null, emailRecuperoAcconto: false,
        });
      }
    }
  });

  it.each([['25,50', 2550], ['25.50', 2550], ['25', 2500], [' 0,01 ', 1]])(
    'converte %s senza arrotondamenti in centesimi', (value, cents) => {
      expect(campaignPaymentFields({
        richiedeApprovazione: false, richiedeAcconto: true, accontoImportoEuro: value,
      }).accontoImportoCentesimi).toBe(cents);
    },
  );

  it.each(['', '0', '-10', '1e3', '25,123', 'NaN', 'Infinity', '90071992547409.92'])(
    'rifiuta %s quando l’acconto è attivo', value => {
      expect(() => campaignPaymentFields({
        richiedeApprovazione: true, richiedeAcconto: true, accontoImportoEuro: value,
      })).toThrow('Inserisci un acconto maggiore di zero');
    },
  );

  it('non richiede un importo quando l’acconto è disattivato', () => {
    expect(campaignPaymentFields({
      richiedeApprovazione: true, richiedeAcconto: false, accontoImportoEuro: '',
    }).accontoImportoCentesimi).toBeNull();
  });
  it('conserva il recupero solo se l’acconto è attivo e l’opzione è stata scelta', () => {
    const form = campaignPaymentForm({ richiedeAcconto: true, emailRecuperoAcconto: true, accontoImportoCentesimi: 500 });
    expect(campaignPaymentFields(form).emailRecuperoAcconto).toBe(true);
    expect(campaignPaymentFields({ ...form, richiedeAcconto: false }).emailRecuperoAcconto).toBe(false);
  });
});
