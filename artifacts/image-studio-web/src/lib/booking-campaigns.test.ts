import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingCampaignFE } from '@shared/booking-types';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  doc: vi.fn((_db: unknown, collectionName: string, id: string) => ({
    id,
    path: `${collectionName}/${id}`,
  })),
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn((source: unknown, ...constraints: unknown[]) => ({ source, constraints })),
  where: vi.fn((...args: unknown[]) => ({ where: args })),
  orderBy: vi.fn((...args: unknown[]) => ({ orderBy: args })),
  Timestamp: { fromDate: vi.fn((date: Date) => ({ toDate: () => date })) },
  serverTimestamp: vi.fn(() => ({ serverTimestamp: true })),
  runTransaction: vi.fn(),
  deleteField: vi.fn(() => ({ deleteField: true })),
}));

vi.mock('firebase/firestore', () => firestoreMock);
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null }, db: {} }));

import {
  createCampaign,
  getAllCampaigns,
  getCampaignByCode,
  updateCampaign,
} from './booking-campaigns';

const asTimestamp = (isoDate: string) => ({ toDate: () => new Date(isoDate) });

const campaignInput = (code: string): Omit<BookingCampaignFE, 'id' | 'createdAt'> => ({
  nome: 'Campagna test',
  code,
  descrizione: '',
  dataInizio: new Date('2026-10-01T00:00:00.000Z'),
  dataFine: new Date('2026-10-31T00:00:00.000Z'),
  temaStagionale: null,
  orarioApertura: '09:00',
  orarioPausaInizio: '13:00',
  orarioPausaFine: '14:00',
  orarioChiusura: '19:00',
  durataShootingMinuti: 30,
  prodottiDisponibili: [],
  attiva: true,
});

function configureTransaction(
  result: { exists: () => boolean; data?: () => Record<string, unknown> },
) {
  const transaction = {
    get: vi.fn().mockResolvedValue(result),
    set: vi.fn(),
    update: vi.fn(),
  };
  (firestoreMock.runTransaction as any).mockImplementation(
    async (_db: unknown, callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  return transaction;
}

describe('booking-campaigns Firestore service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scarta le campagne con date non valide e normalizza i campi legacy', async () => {
    firestoreMock.getDocs.mockResolvedValue({
      docs: [
        {
          id: 'valid-campaign',
          data: () => ({
            dataInizio: asTimestamp('2026-10-01T00:00:00.000Z'),
            dataFine: asTimestamp('2026-10-31T00:00:00.000Z'),
          }),
        },
        {
          id: 'invalid-campaign',
          data: () => ({ dataInizio: 'non-una-data', dataFine: '2026-10-31' }),
        },
      ],
    });

    const campaigns = await getAllCampaigns();

    expect(campaigns).toHaveLength(1);
    expect(campaigns[0].temaStagionale).toBeNull();
    expect(campaigns[0].createdAt.getTime()).toBe(0);
    expect(campaigns[0].dataInizio).toEqual(new Date('2026-10-01T00:00:00.000Z'));
  });

  it('mantiene raggiungibili i link legacy basati sul campo code', async () => {
    firestoreMock.getDoc.mockResolvedValue({ exists: () => false });
    firestoreMock.getDocs.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [{
        id: 'legacy-random-id',
        data: () => ({
          code: 'OLD12345',
          dataInizio: asTimestamp('2026-10-01T00:00:00.000Z'),
          dataFine: asTimestamp('2026-10-31T00:00:00.000Z'),
        }),
      }],
    });

    const campaign = await getCampaignByCode('OLD12345');

    expect(campaign?.id).toBe('legacy-random-id');
    expect(firestoreMock.where).toHaveBeenCalledWith('code', '==', 'OLD12345');
  });

  it('rifiuta un codice già presente in un documento legacy', async () => {
    firestoreMock.getDocs.mockResolvedValue({
      empty: false,
      size: 1,
      docs: [{ id: 'legacy-random-id' }],
    });

    await expect(createCampaign(campaignInput('OLD12345')))
      .rejects.toThrow('Il codice campagna è già in uso');
    expect(firestoreMock.runTransaction).not.toHaveBeenCalled();
  });

  it('crea i nuovi documenti con il codice come ID', async () => {
    firestoreMock.getDocs.mockResolvedValue({ empty: true, size: 0, docs: [] });
    const transaction = configureTransaction({ exists: () => false });

    const id = await createCampaign(campaignInput('NEW12345'));

    expect(id).toBe('NEW12345');
    expect(firestoreMock.doc).toHaveBeenLastCalledWith({}, 'booking_campaigns', 'NEW12345');
    expect(transaction.set).toHaveBeenCalledOnce();
  });

  it('rifiuta una creazione concorrente quando il documento con quel codice esiste già', async () => {
    firestoreMock.getDocs.mockResolvedValue({ empty: true, size: 0, docs: [] });
    const transaction = configureTransaction({ exists: () => true });

    await expect(createCampaign(campaignInput('NEW12345')))
      .rejects.toThrow('Il codice campagna è già in uso');

    expect(transaction.set).not.toHaveBeenCalled();
  });

  it('valida le date unite a quelle salvate anche quando l’aggiornamento è parziale', async () => {
    const transaction = configureTransaction({
      exists: () => true,
      data: () => ({
        dataInizio: asTimestamp('2026-10-10T00:00:00.000Z'),
        dataFine: asTimestamp('2026-10-31T00:00:00.000Z'),
      }),
    });

    await expect(updateCampaign('campaign-id', {
      dataFine: new Date('2026-10-09T00:00:00.000Z'),
    })).rejects.toThrow('La data di fine deve essere successiva alla data di inizio.');

    expect(transaction.update).not.toHaveBeenCalled();
  });
});
