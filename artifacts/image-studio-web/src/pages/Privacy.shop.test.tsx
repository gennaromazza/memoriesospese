import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SHOP_LEGAL_TERMS } from '@shared/shop-legal';
import Privacy from './Privacy';

vi.mock('../context/StudioContext', () => ({
  useStudio: () => ({
    studioSettings: { name: 'Studio di prova', phone: '081 1234567', email: 'info@studio.test', partitaIVA: '01234567890' },
  }),
}));
vi.mock('wouter', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ href, to, children, ...props }: any) => createElement('a', { ...props, href: href ?? to }, children),
  };
});
vi.mock('../hooks/useSEO', () => ({ useSEO: () => undefined }));

describe('informativa privacy e shop di Natale', () => {
  const html = renderToStaticMarkup(<Privacy />);

  it('descrive il trattamento dei dati degli ordini dello shop e rimanda alle condizioni', () => {
    expect(html).toContain('Shopping online Natale: ordini, foto e consegna');
    expect(html).toContain('href="/shop-natale/condizioni"');
    expect(html).toContain('codice fiscale');
    expect(html).toContain('10 ottobre 2026');
  });

  it('indica la conservazione delle foto con gli stessi giorni del server', () => {
    expect(html).toContain('Foto degli ordini dello shop di Natale');
    expect(html).toContain(`dopo ${SHOP_LEGAL_TERMS.deliveredPhotoRetentionDays} giorni dalla consegna`);
    expect(html).toContain(`dopo ${SHOP_LEGAL_TERMS.cancelledPhotoRetentionDays} giorni da un annullamento`);
    expect(html).toContain(`dopo ${SHOP_LEGAL_TERMS.draftPhotoRetentionDays} giorni se l&#x27;ordine non viene mai pagato`);
  });

  it('non toglie i contenuti già presenti per le stampe', () => {
    expect(html).toContain('Ordini di stampa, pagamento e consegna');
    expect(html).toContain('Originali degli ordini di stampa');
    expect(html).toContain('PayPal');
  });
});
