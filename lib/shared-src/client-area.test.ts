import { describe, expect, it } from 'vitest';
import {
  bankDetailsFromSettings, causaleFor, computeMilestones, formatIban, isJobVisibleToClient, isValidIban,
  toClientBooking, toClientGallery, toClientJob, toClientPaymentPlan, toClientQuote,
} from './client-area';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('IBAN', () => {
  it('accetta un IBAN italiano valido con o senza spazi', () => {
    expect(isValidIban('IT60 X054 2811 1010 0000 0123 456')).toBe(true);
    expect(isValidIban('it60x0542811101000000123456')).toBe(true);
    expect(formatIban('it60x0542811101000000123456')).toBe('IT60 X054 2811 1010 0000 0123 456');
  });

  it('rifiuta IBAN con controllo errato o lunghezza sbagliata', () => {
    expect(isValidIban('IT61X0542811101000000123456')).toBe(false);
    expect(isValidIban('IT60X054281110100000012345')).toBe(false);
    expect(isValidIban('')).toBe(false);
  });

  it('mostra i dati bancari solo se IBAN e intestatario sono completi', () => {
    expect(bankDetailsFromSettings({ iban: 'IT60X0542811101000000123456' })).toBeNull();
    expect(bankDetailsFromSettings({ iban: 'IT61X0542811101000000123456', intestatario: 'Studio' })).toBeNull();
    expect(bankDetailsFromSettings({ iban: 'IT60X0542811101000000123456', intestatario: ' Studio ', causale: 'Saldo {evento}' }))
      .toEqual({ iban: 'IT60 X054 2811 1010 0000 0123 456', intestatario: 'Studio', causale: 'Saldo {evento}' });
    expect(causaleFor('Acconto {evento}', 'Matrimonio Rossi')).toBe('Acconto Matrimonio Rossi');
  });
});

describe('preventivi', () => {
  it('non mostra bozze né preventivi annullati', () => {
    expect(toClientQuote('q', { status: 'bozza', publicToken: 't' })).toBeNull();
    expect(toClientQuote('q', { status: 'annullato', publicToken: 't' })).toBeNull();
  });

  it('espone solo stato, totale, data firma e link, senza firma o note interne', () => {
    const quote = toClientQuote('q1', {
      status: 'firmato', publicToken: 'abc', totalAfterDiscount: 2500, noteInterne: 'segreto',
      signature: { signedAt: ts('2026-03-12T10:00:00Z'), imageData: 'data:image/png;base64,xxx' },
    });
    expect(quote).toEqual({ id: 'q1', status: 'firmato', total: 2500, signedAt: '2026-03-12T10:00:00.000Z', url: '/quote/abc' });
  });
});

describe('pagamenti', () => {
  it('ordina le rate per scadenza e non espone collegamenti di cassa', () => {
    const plan = toClientPaymentPlan('s1', {
      totale: 3000, totalePagato: 1000, saldoResiduo: 2000, clienteId: 'c', createdBy: 'admin',
      payments: [
        { id: 'p2', tipo: 'saldo', importo: 2000, stato: 'atteso', dataScadenza: ts('2026-09-01T00:00:00Z'), cashMovementId: 'x' },
        { id: 'p1', tipo: 'acconto', importo: 1000, stato: 'pagato', importoPagato: 1000, dataScadenza: ts('2026-03-01T00:00:00Z'), metodoPagamento: 'bonifico', note: 'interna' },
      ],
    });
    expect(plan.payments.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(plan.payments[1]).not.toHaveProperty('cashMovementId');
    expect(plan.payments[0]).not.toHaveProperty('note');
    expect(plan).toMatchObject({ totale: 3000, totalePagato: 1000, saldoResiduo: 2000 });
  });
});

describe('gallerie', () => {
  it('riporta lo stato della selezione e le note del cliente, mai le credenziali', () => {
    const gallery = toClientGallery('g1', {
      code: 'ABC', name: 'Matrimonio', photoCount: 400, password: 'segreta', securityAnswer: 'x',
      selectionEnabled: true, selectionStatus: 'completed', requiredPhotoCount: 80,
      selectedPhotoIds: ['a', 'b'], selectionNotes: 'Più foto in bianco e nero',
      photoNotes: { a: 'ritaglia', b: ' ' },
      selectionSnapshots: [{ timestamp: '2026-06-01T10:00:00Z' }, { timestamp: '2026-06-03T10:00:00Z' }],
    });
    expect(gallery).toEqual({
      id: 'g1', accessKey: 'ABC', name: 'Matrimonio', photoCount: 400,
      selection: {
        status: 'completed', unlimited: false, selectedCount: 2, photoNotesCount: 1,
        requiredPhotoCount: 80, completedAt: '2026-06-03T10:00:00.000Z', notes: 'Più foto in bianco e nero',
      },
    });
  });

  it('usa l’id documento quando la galleria non ha codice', () => {
    expect(toClientGallery('doc-1', { name: 'Vecchia' }).accessKey).toBe('doc-1');
  });
});

describe('prenotazioni', () => {
  it('nasconde le annullate e riporta il nome della campagna', () => {
    expect(toClientBooking('b', { stato: 'annullata' }, {})).toBeNull();
    expect(toClientBooking('b', { stato: 'confermata', campaignId: 'c1', acconto: 50, saldo: 100, noteAdmin: 'x' }, { c1: 'Natale' }))
      .toEqual({ id: 'b', stato: 'confermata', campaignName: 'Natale', acconto: 50, saldo: 100 });
  });
});

describe('tappe automatiche', () => {
  const now = new Date('2026-07-01T00:00:00Z');
  const signedQuote = { id: 'q', status: 'firmato' as const, total: 1, signedAt: '2026-02-10T00:00:00.000Z', url: '/quote/x' };

  it('calcola le tappe dai dati esistenti', () => {
    const milestones = computeMilestones({
      job: { createdAt: ts('2026-01-05T00:00:00Z'), eventDate: ts('2026-06-20T00:00:00Z'), status: 'produzione' },
      quotes: [signedQuote],
      galleries: [{ createdAt: ts('2026-06-25T00:00:00Z'), selectionEnabled: true, selectionStatus: 'pending' }],
      photobooks: [],
      now,
    });
    expect(milestones.map(m => [m.id, m.done])).toEqual([
      ['creato', true], ['contratto', true], ['servizio', true], ['galleria', true], ['selezione', false], ['consegnato', false],
    ]);
    expect(milestones[1].date).toBe('2026-02-10T00:00:00.000Z');
  });

  it('non mostra servizio, galleria e fotolibro quando non esistono', () => {
    const milestones = computeMilestones({ job: { dataNonDefinita: true, eventDate: ts('2026-06-20T00:00:00Z') }, quotes: [], galleries: [{ status: 'draft' }], photobooks: [], now });
    expect(milestones.map(m => m.id)).toEqual(['creato', 'contratto', 'consegnato']);
  });

  it('segna il fotolibro approvato solo se è approvata la versione corrente', () => {
    const job = { status: 'consegnato' };
    const pending = computeMilestones({ job, quotes: [], galleries: [], photobooks: [{ currentVersion: 2, approval: { version: 1 } }], now });
    expect(pending.find(m => m.id === 'fotolibro')?.done).toBe(false);
    const approved = computeMilestones({ job, quotes: [], galleries: [], photobooks: [{ currentVersion: 2, approval: { version: 2, approvedAt: '2026-06-30T00:00:00Z' } }], now });
    expect(approved.find(m => m.id === 'fotolibro')).toMatchObject({ done: true, date: '2026-06-30T00:00:00.000Z' });
    expect(approved.at(-1)).toMatchObject({ id: 'consegnato', done: true });
  });

  it('nasconde lavori eliminati e contatti senza preventivo inviato', () => {
    expect(isJobVisibleToClient({ deletedAt: new Date() }, [])).toBe(false);
    expect(isJobVisibleToClient({ status: 'lead' }, [])).toBe(false);
    expect(isJobVisibleToClient({ status: 'lead' }, [signedQuote])).toBe(true);
  });

  it('il lavoro esposto non contiene costi, note interne o collaboratori', () => {
    const job = toClientJob('j', {
      nomeEvento: 'Matrimonio Rossi', costi: [{ importo: 300 }], noteInterne: 'x', financials: { totale: 1 },
      collaboratori: ['a'], galleryIds: ['g1'], eventLocation: 'Villa',
    }, { quotes: [], paymentPlans: [], galleries: [], photobooks: [], now });
    expect(Object.keys(job).sort()).toEqual(
      ['eventLocation', 'galleryIds', 'id', 'milestones', 'nomeEvento', 'paymentPlans', 'photobooks', 'quotes'].sort(),
    );
  });
});
