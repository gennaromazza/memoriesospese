import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import MockupClientApproval from './MockupClientApproval';

describe('Approvazione cliente del mockup', () => {
  it('richiede una conferma esplicita e non permette modifiche o stampa', () => {
    const html = renderToStaticMarkup(<MockupClientApproval disabled={false} onApprove={async () => undefined} />);
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('button-approve-mockup');
    expect(html).toMatch(/<button[^>]*disabled=""/);
    expect(html).toContain('Non avvia automaticamente la stampa');
    expect(html).not.toContain('Personalizza');
  });
  it('mostra l’approvazione già registrata senza chiedere di ripeterla', () => {
    const html = renderToStaticMarkup(<MockupClientApproval approvedAt="2026-10-24T10:00:00Z" disabled={false} onApprove={async () => undefined} />);
    expect(html).toContain('mockup-client-approved');
    expect(html).not.toContain('button-approve-mockup');
  });
});
