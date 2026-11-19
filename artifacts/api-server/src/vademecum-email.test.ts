import { describe, expect, it, vi } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';

// Evita di caricare il collegamento Gmail/Replit reale quando si importano i modelli di email.
vi.mock('@replit/connectors-sdk', () => ({ ReplitConnectors: class {} }));
vi.mock('./firebase-admin.js', () => ({ db: {}, FieldValue: {}, Timestamp: {}, storage: {} }));

const LINK = 'https://imagestudiofotografico.com/vademecum-natale-2026';
const studio = { name: 'Image Studio', email: 'studio@example.test', phone: '+39 000', address: 'Via Prova 1' };

describe('link al vademecum nelle email ai clienti', () => {
  it('helper: blocco con il link solo per le campagne di Natale 2026', async () => {
    const { vademecumEmailBlock } = await import('./vademecum-email.js');
    const block = vademecumEmailBlock('Natale 2026');
    expect(block).toContain(LINK);
    expect(block).toContain('vademecum');
    expect(vademecumEmailBlock('Matrimoni')).toBe('');
    expect(vademecumEmailBlock('Natale 2025')).toBe('');
    expect(vademecumEmailBlock('')).toBe('');
  });

  it('email "richiesta ricevuta": link per Natale 2026, nulla per le altre campagne', async () => {
    const { createBookingReceivedEmailHTML } = await import('./email-routes.js');
    const natale = createBookingReceivedEmailHTML('Anna Rossi', 'Natale 2026', '10 dicembre 2026', '10:00 - 10:45', 45, undefined, studio);
    const altra = createBookingReceivedEmailHTML('Anna Rossi', 'Ritratti', '10 dicembre 2026', '10:00 - 10:45', 45, undefined, studio);
    expect(natale).toContain(LINK);
    expect(altra).not.toContain('vademecum');
  });

  it('email "conferma": link per Natale 2026, nulla per le altre campagne', async () => {
    const { createBookingConfirmedEmailHTML } = await import('./email-routes.js');
    const natale = createBookingConfirmedEmailHTML('Anna Rossi', 'Natale 2026', '10 dicembre 2026', '10:00 - 10:45', 45, undefined, undefined, studio);
    const altra = createBookingConfirmedEmailHTML('Anna Rossi', 'Ritratti', '10 dicembre 2026', '10:00 - 10:45', 45, undefined, undefined, studio);
    expect(natale).toContain(LINK);
    expect(altra).not.toContain('vademecum');
  });

  it('email "richiesta acconto": contiene il link per Natale 2026 e conserva il link di pagamento', async () => {
    const { approvedDepositEmail } = await import('./booking/approved-deposit-request.js');
    const hold = { bookingId: 'b1', depositAmountCents: 2000, expiresAt: Timestamp.fromMillis(Date.now() + 3_600_000),
      dataShootingInizio: Timestamp.fromMillis(Date.now() + 86_400_000), draft: { cliente: { nome: 'Anna' } } };
    const natale = approvedDepositEmail(hold, 'Natale 2026', studio, 'TOKEN');
    const altra = approvedDepositEmail(hold, 'Ritratti', studio, 'TOKEN');
    expect(natale).toContain(LINK);
    expect(natale).toContain('/prenota/acconto/b1#TOKEN');
    expect(altra).not.toContain('vademecum');
  });
});
