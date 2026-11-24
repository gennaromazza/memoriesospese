import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => {
  const matchingCampaigns = { empty: true };
  const campaignWithCodeAsId = { exists: false };
  const transaction = {
    get: vi.fn(async (ref: { kind: string }) =>
      ref.kind === 'query' ? matchingCampaigns : campaignWithCodeAsId),
    create: vi.fn(),
  };
  const collectionRef = {
    doc: vi.fn((id: string) => ({ id, kind: 'doc' })),
    where: vi.fn((field: string, operator: string, value: string) => ({
      kind: 'query', field, operator, value,
    })),
  };

  return {
    matchingCampaigns,
    campaignWithCodeAsId,
    transaction,
    collectionRef,
    db: {
      collection: vi.fn(() => collectionRef),
      runTransaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction)),
    },
  };
});

vi.mock('./firebase-admin.js', () => ({
  db: store.db,
  FieldValue: { serverTimestamp: () => 'server-timestamp' },
  Timestamp: { fromDate: (date: Date) => ({ date }) },
}));

import { CampaignCodeConflictError, createBookingCampaign } from './booking-campaign-service.js';

const campaignInput = {
  nome: 'Campagna test',
  code: 'TEST1234',
  descrizione: '',
  dataInizio: '2026-10-01T00:00:00.000Z',
  dataFine: '2026-10-31T00:00:00.000Z',
  temaStagionale: null,
  orarioApertura: '09:00',
  orarioPausaInizio: '13:00',
  orarioPausaFine: '14:00',
  orarioChiusura: '19:00',
  durataShootingMinuti: 30,
  prodottiDisponibili: [],
  attiva: true,
};

describe('creazione centralizzata campagne', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.matchingCampaigns.empty = true;
    store.campaignWithCodeAsId.exists = false;
  });

  it('controlla in transazione i documenti legacy e crea col codice come ID', async () => {
    await expect(createBookingCampaign(campaignInput)).resolves.toBe('TEST1234');

    expect(store.collectionRef.where).toHaveBeenCalledWith('code', '==', 'TEST1234');
    expect(store.transaction.get).toHaveBeenCalledTimes(2);
    expect(store.transaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'TEST1234', kind: 'doc' }),
      expect.objectContaining({
        code: 'TEST1234',
        richiedeApprovazione: true,
        richiedeAcconto: false,
        createdAt: 'server-timestamp',
        dataInizio: { date: new Date(campaignInput.dataInizio) },
      }),
    );
  });

  it('salva i parametri indipendenti e l’importo fisso in centesimi', async () => {
    await createBookingCampaign({
      ...campaignInput,
      richiedeApprovazione: false,
      richiedeAcconto: true,
      accontoImportoCentesimi: 2500,
    });

    expect(store.transaction.create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        richiedeApprovazione: false,
        richiedeAcconto: true,
        accontoImportoCentesimi: 2500,
      }),
    );
  });
  it('attiva recupero e promemoria di default con acconto, senza accettare date fornite dal client', async () => {
    await createBookingCampaign({ ...campaignInput, richiedeAcconto: true, accontoImportoCentesimi: 500,
      recuperoAccontoAttivatoIl: '2000-01-01' });
    expect(store.transaction.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      emailPromemoriaAcconto: true, emailRecuperoAcconto: true, recuperoAccontoAttivatoIl: 'server-timestamp',
    }));
  });
  it('rispetta le due disattivazioni esplicite', async () => {
    await createBookingCampaign({ ...campaignInput, richiedeAcconto: true, accontoImportoCentesimi: 500,
      emailPromemoriaAcconto: false, emailRecuperoAcconto: false });
    const saved = store.transaction.create.mock.calls[0][1];
    expect(saved).toMatchObject({ emailPromemoriaAcconto: false, emailRecuperoAcconto: false });
    expect(saved).not.toHaveProperty('recuperoAccontoAttivatoIl');
  });
  it('non attiva il recupero senza acconto', async () => {
    await createBookingCampaign({ ...campaignInput, emailRecuperoAcconto: true });
    const saved = store.transaction.create.mock.calls[0][1];
    expect(saved.emailRecuperoAcconto).toBe(false);
    expect(saved).not.toHaveProperty('recuperoAccontoAttivatoIl');
  });

  it.each([
    ['mancante', undefined],
    ['nullo', null],
    ['zero', 0],
    ['negativo', -100],
    ['non intero', 2500.5],
    ['oltre il limite sicuro', Number.MAX_SAFE_INTEGER + 1],
  ])('rifiuta un acconto %s', async (_label, accontoImportoCentesimi) => {
    await expect(createBookingCampaign({
      ...campaignInput,
      richiedeAcconto: true,
      accontoImportoCentesimi,
    })).rejects.toThrow('I dati della campagna non sono validi.');

    expect(store.transaction.create).not.toHaveBeenCalled();
  });

  it('rifiuta il codice presente in una campagna legacy con ID casuale', async () => {
    store.matchingCampaigns.empty = false;

    await expect(createBookingCampaign(campaignInput)).rejects.toBeInstanceOf(CampaignCodeConflictError);
    expect(store.transaction.create).not.toHaveBeenCalled();
  });

  it('rifiuta il codice se esiste già il documento con ID uguale al codice', async () => {
    store.campaignWithCodeAsId.exists = true;

    await expect(createBookingCampaign(campaignInput)).rejects.toBeInstanceOf(CampaignCodeConflictError);
    expect(store.transaction.create).not.toHaveBeenCalled();
  });
});
