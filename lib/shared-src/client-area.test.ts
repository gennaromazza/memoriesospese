import { describe, expect, it } from 'vitest';
import {
  bankDetailsFromSettings, causaleFor, computeJobSteps, formatIban, invitePath, isJobVisibleToClient, isValidIban,
  openInvitesForJob, toClientAppointment, toClientBooking, toClientGallery, toClientJob, toClientPaymentPlan,
  toClientQuote, bookableTemplatesForJob,
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
      id: 'g1', accessKey: 'ABC', name: 'Matrimonio', photoCount: 400, photobooks: [],
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

describe('consulenze e inviti', () => {
  const link = 'https://www.esempio.it/consulenze/matrimonio/tpl-visione/prenota?jobId=j1&dateFrom=2026-07-01';

  it('accetta solo link di prenotazione consulenze e li rende relativi', () => {
    expect(invitePath(link)).toBe('/consulenze/matrimonio/tpl-visione/prenota?jobId=j1&dateFrom=2026-07-01');
    expect(invitePath('https://altro.it/phishing')).toBeUndefined();
    expect(invitePath(undefined)).toBeUndefined();
  });

  it('mostra l’ultimo invito per modello finché non c’è una consulenza attiva', () => {
    const job = {
      nomeEvento: 'Matrimonio Rossi',
      workflowEvents: [
        { tipo: 'consulenza_inviata', data: ts('2026-07-01T00:00:00Z'), metadata: { templateId: 'tpl-visione', templateNome: 'Visione foto', consultationLink: link } },
        { tipo: 'consulenza_inviata', data: ts('2026-07-10T00:00:00Z'), metadata: { templateId: 'tpl-visione', templateNome: 'Visione foto', consultationLink: `${link}&r=2` } },
        { tipo: 'status_change', data: ts('2026-07-11T00:00:00Z') },
      ],
    };
    const open = openInvitesForJob('j1', job, []);
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ title: 'Visione foto', nomeEvento: 'Matrimonio Rossi', sentAt: '2026-07-10T00:00:00.000Z' });
    expect(open[0].url).toContain('r=2');
    expect(openInvitesForJob('j1', job, [{ templateId: 'tpl-visione', stato: 'in_attesa' }])).toEqual([]);
    expect(openInvitesForJob('j1', job, [{ templateId: 'tpl-visione', stato: 'annullata' }])).toHaveLength(1);
  });

  it('elenca gli appuntamenti attivi senza note o dati del calendario', () => {
    expect(toClientAppointment('c', { stato: 'annullata' }, {})).toBeNull();
    expect(toClientAppointment('c', {
      stato: 'confermata', templateNome: 'Visione foto', dataConsulenza: ts('2026-07-20T09:00:00Z'),
      orarioInizio: '11:00', orarioFine: '12:00', linkedJobId: 'j1', googleCalendarEventId: 'x', note: 'interna',
    }, { j1: 'Matrimonio Rossi' })).toEqual({
      id: 'c', title: 'Visione foto', stato: 'confermata', start: '2026-07-20T09:00:00.000Z',
      orarioInizio: '11:00', orarioFine: '12:00', jobId: 'j1', nomeEvento: 'Matrimonio Rossi',
    });
  });
});

describe('tappe del lavoro: contratto, visione, ritiro', () => {
  const quote = (status: string, extra = {}) => ({ id: 'q', status: status as any, total: 1, url: '/quote/x', ...extra });
  const invite = { id: 'i', templateId: 't', title: 'Visione foto', jobId: 'j', nomeEvento: 'M', url: '/consulenze/m/t/prenota?jobId=j' };
  const steps = (input: Partial<Parameters<typeof computeJobSteps>[0]>) =>
    computeJobSteps({ job: {}, quotes: [], consultations: [], invites: [], ...input });

  it('ha sempre e solo tre tappe', () => {
    expect(steps({}).map(s => s.id)).toEqual(['contratto', 'visione', 'ritiro']);
    expect(steps({}).map(s => s.state)).toEqual(['todo', 'todo', 'todo']);
  });

  it('contratto: da firmare con link, poi firmato con data', () => {
    expect(steps({ quotes: [quote('visionato')] })[0]).toMatchObject({ state: 'action', status: 'Da firmare', actionUrl: '/quote/x' });
    expect(steps({ quotes: [quote('firmato', { signedAt: '2026-02-10T00:00:00.000Z' })] })[0])
      .toMatchObject({ state: 'done', status: 'Firmato', date: '2026-02-10T00:00:00.000Z' });
    expect(steps({ quotes: [quote('rifiutato')] })[0]).toMatchObject({ state: 'closed', status: 'Rifiutato' });
  });

  it('visione: da prenotare, richiesta, programmata, svolta', () => {
    expect(steps({ invites: [invite] })[1]).toMatchObject({ state: 'action', actionUrl: invite.url, actionLabel: 'Prenota la visione' });
    expect(steps({ invites: [invite], consultations: [{ stato: 'in_attesa', dataConsulenza: ts('2026-07-20T09:00:00Z') }] })[1])
      .toMatchObject({ state: 'waiting', status: 'Richiesta inviata, in attesa di conferma' });
    expect(steps({ consultations: [{ stato: 'confermata', dataConsulenza: ts('2026-07-20T09:00:00Z') }] })[1])
      .toMatchObject({ state: 'waiting', status: 'Programmata', date: '2026-07-20T09:00:00.000Z' });
    expect(steps({ consultations: [{ stato: 'confermata' }, { stato: 'completata', dataConsulenza: ts('2026-07-20T09:00:00Z') }] })[1])
      .toMatchObject({ state: 'done', status: 'Svolta' });
    expect(steps({ consultations: [{ stato: 'annullata' }] })[1].state).toBe('todo');
    const bookable = [{ templateId: 'v', title: 'Visione foto', url: '/consulenze/m/v/prenota?jobId=j' }];
    expect(steps({ bookable })[1]).toMatchObject({ state: 'todo', actionUrl: bookable[0].url, actionLabel: 'Prenota la visione' });
    expect(steps({ bookable: [{ templateId: 'a', title: 'Scelta album', url: '/x' }] })[1].actionUrl).toBeUndefined();
  });

  it('ritiro: fatto quando il lavoro è consegnato, con la data del cambio stato', () => {
    expect(steps({ job: { status: 'produzione' } })[2]).toMatchObject({ state: 'todo' });
    expect(steps({ job: { status: 'consegnato', workflowEvents: [
      { tipo: 'status_change', descrizione: 'Stato cambiato in: consegnato', data: ts('2026-09-01T00:00:00Z') },
    ] } })[2]).toMatchObject({ state: 'done', status: 'Ritirato', date: '2026-09-01T00:00:00.000Z' });
  });

  it('mostra i lavori anche prima della firma, nasconde solo gli eliminati', () => {
    expect(isJobVisibleToClient({ deletedAt: new Date() }, [])).toBe(false);
    expect(isJobVisibleToClient({ status: 'lead' }, [])).toBe(true);
    expect(isJobVisibleToClient({ status: 'lead' }, [quote('inviato')])).toBe(true);
  });

  it('il lavoro esposto non contiene costi, note interne, collaboratori o gallerie', () => {
    const job = toClientJob('j', {
      nomeEvento: 'Matrimonio Rossi', costi: [{ importo: 300 }], noteInterne: 'x', financials: { totale: 1 },
      collaboratori: ['a'], galleryIds: ['g1'], eventLocation: 'Villa', workflowEvents: [{ tipo: 'nota_aggiunta' }],
    }, { quotes: [], paymentPlans: [], consultations: [], invites: [] });
    expect(Object.keys(job).sort()).toEqual(['bookable', 'eventLocation', 'id', 'nomeEvento', 'paymentPlans', 'quotes', 'steps'].sort());
  });
});

describe('prenotazione autonoma per lavoro', () => {
  const templates = [
    { id: 'visione', data: { attiva: true, jobType: 'matrimonio', nome: 'Visione foto', durataMinuti: 90, ordine: 2 } },
    { id: 'album', data: { attiva: true, jobType: 'matrimonio', nome: 'Scelta album', ordine: 1 } },
    { id: 'spenta', data: { attiva: false, jobType: 'matrimonio', nome: 'Vecchia' } },
    { id: 'battesimo', data: { attiva: true, jobType: 'battesimo', nome: 'Altro tipo' } },
  ];

  it('propone i modelli attivi dello stesso tipo di lavoro, con il link collegato al job', () => {
    const list = bookableTemplatesForJob('j 1', { jobType: 'matrimonio' }, templates, []);
    expect(list.map(t => t.templateId)).toEqual(['album', 'visione']);
    expect(list[1]).toEqual({ templateId: 'visione', title: 'Visione foto', durataMinuti: 90, url: '/consulenze/matrimonio/visione/prenota?jobId=j%201' });
  });

  it('nasconde i modelli già prenotati e in attesa o confermati per quel lavoro', () => {
    const list = bookableTemplatesForJob('j', { jobType: 'matrimonio' }, templates, [
      { templateId: 'visione', stato: 'confermata' }, { templateId: 'album', stato: 'annullata' },
    ]);
    expect(list.map(t => t.templateId)).toEqual(['album']);
  });

  it('non propone nulla per lavori archiviati o senza tipo', () => {
    expect(bookableTemplatesForJob('j', { jobType: 'matrimonio', status: 'archiviato' }, templates, [])).toEqual([]);
    expect(bookableTemplatesForJob('j', {}, templates, [])).toEqual([]);
  });
});
