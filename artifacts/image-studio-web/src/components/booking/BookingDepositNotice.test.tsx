import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookingDepositNotice } from './BookingDepositNotice';

describe('avviso acconto prima della scelta dello slot', () => {
  it.each([undefined, false])('non compare se la campagna non richiede acconto (%s)', enabled => {
    expect(renderToStaticMarkup(<BookingDepositNotice enabled={enabled} amountCents={500} />)).toBe('');
  });
  it('mostra importo admin, motivazione, detrazione dal totale e logo PayPal ufficiale', () => {
    const html = renderToStaticMarkup(<BookingDepositNotice enabled amountCents={500} requiresApproval={false} />);
    expect(html).toContain('5,00');
    expect(html).toContain('limitare le assenze');
    expect(html).toContain('scalato dal totale del servizio');
    expect(html).toContain('non è un costo aggiuntivo');
    expect(html).toContain('dando a tutti la possibilità');
  });
  it('descrive il pagamento immediato senza promettere un link via email', () => {
    const html = renderToStaticMarkup(<BookingDepositNotice enabled amountCents={1500} requiresApproval={false} />);
    expect(html).toContain('15,00');
    expect(html).toContain('Dopo aver scelto giorno e orario');
    expect(html).not.toContain('riceverai via email il link');
    expect(html).toContain('www.paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg');
    expect(html).toContain('alt="PayPal"');
  });
  it('spiega che il link arriva dopo l’approvazione quando richiesta', () => {
    const html = renderToStaticMarkup(<BookingDepositNotice enabled amountCents={500} />);
    expect(html).toContain('approvazione dello studio');
    expect(html).toContain('riceverai via email il link');
  });
  it('non inventa importi quando la configurazione non è valida', () => {
    const html = renderToStaticMarkup(<BookingDepositNotice enabled amountCents={0} />);
    expect(html).toContain('da verificare con lo studio');
    expect(html).not.toContain('0,00');
  });
  it('mantiene breve il richiamo prima del pulsante di invio', () => {
    const html = renderToStaticMarkup(<BookingDepositNotice enabled amountCents={500} requiresApproval={false} compact />);
    expect(html).toContain('booking-deposit-notice');
    expect(html).toContain('5,00');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('limitare le assenze');
  });
});
