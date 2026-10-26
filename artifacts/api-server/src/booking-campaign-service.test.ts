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
        createdAt: 'server-timestamp',
        dataInizio: { date: new Date(campaignInput.dataInizio) },
      }),
    );
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
