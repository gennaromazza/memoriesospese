import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MockupClientApproval from './MockupClientApproval';

describe('Approvazione cliente del mockup', () => {
  it('richiede una conferma esplicita e non permette modifiche o stampa', () => {
    const html = renderToStaticMarkup(<MockupClientApproval disabled={false} onApprove={async () => undefined} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('button-approve-mockup');
    expect(html.match(/button-approve-mockup/g)).toHaveLength(1);
    expect(html).toContain('min-h-10 w-full');
    expect(html).toContain('min-[390px]:w-auto');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('L’approvazione non avvia la stampa');
    expect(html).not.toContain('Personalizza');
    expect(html).not.toContain('La vostra risposta');
    expect(html).not.toContain('shadow-[0_18px_48px');
  });
  it('mostra l’approvazione già registrata senza chiedere di ripeterla', () => {
    const html = renderToStaticMarkup(<MockupClientApproval approvedAt="2026-10-24T10:00:00Z" disabled={false} onApprove={async () => undefined} />);
    expect(html).toContain('mockup-client-approved');
    expect(html).not.toContain('button-approve-mockup');
  });
  it('mantiene la conferma compatta e accessibile per il mockup mobile', () => {
    const html = renderToStaticMarkup(<MockupClientApproval compact disabled={false} onApprove={async () => undefined} />);
    expect(html).toContain('Approvo questa revisione');
    expect(html).toContain('min-h-9 px-2.5 text-xs');
    expect(html).toContain('Non avvia la stampa');
    expect(html).toContain('button-approve-mockup');
  });
});
