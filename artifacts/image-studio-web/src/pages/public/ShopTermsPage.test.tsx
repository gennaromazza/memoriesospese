import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SHOP_LEGAL_MANIFEST, SHOP_LEGAL_TERMS, SHOP_TERMS_PATH } from '@shared/shop-legal';
import ShopTermsPage from './ShopTermsPage';

const studio = vi.hoisted(() => ({
  settings: {
    name: 'Studio di prova',
    phone: '081 1234567',
    email: 'info@studio.test',
    partitaIVA: '01234567890',
    fiscalVia: 'Via Roma 1',
    fiscalCap: '81031',
    fiscalComune: 'Aversa',
    fiscalProvincia: 'ce',
    logo: '',
  } as Record<string, string>,
}));

vi.mock('@/context/StudioContext', () => ({ useStudio: () => ({ studioSettings: studio.settings }) }));
vi.mock('wouter', async () => {
  const { createElement } = await import('react');
  return {
    Link: ({ href, to, children, ...props }: any) => createElement('a', { ...props, href: href ?? to }, children),
  };
});
const seo = vi.hoisted(() => vi.fn());
vi.mock('@/hooks/useSEO', () => ({ useSEO: seo }));
vi.mock('@/features/shop/ShopShell', async () => {
  const { createElement } = await import('react');
  return {
    ShopShell: ({ title, children }: any) => createElement('main', null, createElement('h1', null, title), children),
  };
});

function render() {
  return renderToStaticMarkup(<ShopTermsPage />);
}

describe('condizioni di vendita dello shop', () => {
  it("l'indirizzo è quello a cui rimanda il checkout", () => {
    expect(SHOP_TERMS_PATH).toBe('/shop-natale/condizioni');
  });

  it('mostra la versione del manifesto e i dati del professionista', () => {
    const html = render();
    expect(html).toContain(`Versione ${SHOP_LEGAL_MANIFEST.termsVersion}`);
    expect(html).toContain('Studio di prova');
    expect(html).toContain('P. IVA: 01234567890');
    expect(html).toContain('Via Roma 1, 81031 Aversa (CE)');
    expect(html).toContain('mailto:info@studio.test');
    expect(html).toContain('tel:0811234567');
  });

  it('distingue il recesso dei prodotti senza foto da quelli personalizzati', () => {
    const html = render();
    expect(html).toContain(`${SHOP_LEGAL_TERMS.withdrawalDays} giorni da quando ricevi il prodotto`);
    expect(html).toContain('Prodotti senza foto.');
    expect(html).toContain('Prodotti personalizzati con le tue foto.');
    expect(html).toContain('art. 59, comma 1, lett. c');
    expect(html).toContain('il recesso vale solo per quelli senza foto');
    expect(html).toContain('Modello per esercitare il recesso');
  });

  it('riporta i giorni di conservazione che il server applica davvero', () => {
    const html = render();
    expect(html).toContain(`dopo ${SHOP_LEGAL_TERMS.deliveredPhotoRetentionDays} giorni dalla consegna`);
    expect(html).toContain(`dopo ${SHOP_LEGAL_TERMS.cancelledPhotoRetentionDays} giorni da un annullamento`);
    expect(html).toContain(`${SHOP_LEGAL_TERMS.draftPhotoRetentionDays} giorni se l&#x27;ordine non viene mai pagato`);
  });

  it('spiega pagamento, spedizione solo in Italia e foto mancanti', () => {
    const html = render();
    expect(html).toContain('pagamento al ritiro');
    expect(html).toContain('solo in Italia');
    expect(html).toContain('Il costo può dipendere dal peso');
    expect(html).toContain('supera il peso massimo che');
    expect(html).toContain('Foto non ancora caricate');
    expect(html).toContain("l&#x27;intero importo pagato");
    expect(html).toContain('solo file JPG, fino a 30 MB');
  });

  it('dà tempi indicativi senza promettere la consegna per una data o per Natale', () => {
    const html = render();
    expect(html).toContain(`circa ${SHOP_LEGAL_TERMS.typicalDeliveryDays} giorni`);
    expect(html).toContain('Sono indicativi.');
    expect(html).toContain('Non possiamo garantire la consegna entro una');
    expect(html).toContain(`comunque entro ${SHOP_LEGAL_TERMS.deliveryMaxDays} giorni dal pagamento`);
    expect(html).not.toMatch(/consegna garantita|garantiamo la consegna/i);
  });

  it('rimanda alle condizioni delle stampe e alla privacy, e non si lascia indicizzare', () => {
    const html = render();
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
    expect(seo).toHaveBeenCalledWith(expect.objectContaining({ canonical: '/shop-natale/condizioni', noindex: true }));
  });

  it('senza dati dello studio non inventa nulla', () => {
    studio.settings = { name: '', phone: '', email: '', partitaIVA: '', logo: '' };
    const html = render();
    expect(html).not.toContain('mailto:');
    expect(html).not.toContain('P. IVA');
    expect(html).toContain('il professionista');
  });
});
