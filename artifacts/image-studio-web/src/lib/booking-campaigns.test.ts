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
const clientMock = vi.hoisted(() => ({
  currentUser: { getIdToken: vi.fn().mockResolvedValue('test-id-token') },
}));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('firebase/firestore', () => firestoreMock);
vi.mock('@/lib/firebase', () => ({ auth: clientMock, db: {} }));

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
    vi.stubGlobal('fetch', fetchMock);
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
    expect(campaigns[0].richiedeApprovazione).toBe(true);
    expect(campaigns[0].richiedeAcconto).toBe(false);
    expect(campaigns[0].accontoImportoCentesimi).toBeNull();
  });

  it('normalizza i parametri di pagamento salvati', async () => {
    firestoreMock.getDocs.mockResolvedValue({
      docs: [{
        id: 'deposit-campaign',
        data: () => ({
          richiedeApprovazione: false,
          richiedeAcconto: true,
          accontoImportoCentesimi: 3500,
          dataInizio: asTimestamp('2026-10-01T00:00:00.000Z'),
          dataFine: asTimestamp('2026-10-31T00:00:00.000Z'),
        }),
      }],
    });

    const [campaign] = await getAllCampaigns();

    expect(campaign.richiedeApprovazione).toBe(false);
    expect(campaign.richiedeAcconto).toBe(true);
    expect(campaign.accontoImportoCentesimi).toBe(3500);
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

  it('propaga il conflitto del server per un codice presente in un documento legacy', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Il codice campagna è già in uso. Generane uno nuovo.' }),
    });

    await expect(createCampaign(campaignInput('OLD12345')))
      .rejects.toThrow('Il codice campagna è già in uso');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/admin/campaigns');
  });

  it('richiede al server la creazione e invia le date in formato ISO', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'NEW12345' }),
    });

    const id = await createCampaign(campaignInput('NEW12345'));

    expect(id).toBe('NEW12345');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/campaigns'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-id-token' }),
      }),
    );
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.dataInizio).toBe('2026-10-01T00:00:00.000Z');
    expect(payload.dataFine).toBe('2026-10-31T00:00:00.000Z');
  });

  it('invia i parametri di acconto al server senza trasformare i centesimi', async () => {
    fetchMock.mockResolvedValue({
      ok: true, json: async () => ({ id: 'NEW12345' }),
    });
    await createCampaign({
      ...campaignInput('NEW12345'),
      richiedeApprovazione: false,
      richiedeAcconto: true,
      accontoImportoCentesimi: 2550,
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2550,
    });
  });

  it('salva, rilegge e cancella l’importo di una singola campagna', async () => {
    const saved: Record<string, unknown> = {
      ...campaignInput('OLD12345'),
      dataInizio: asTimestamp('2026-10-01T00:00:00.000Z'),
      dataFine: asTimestamp('2026-10-31T00:00:00.000Z'),
    };
    const transaction = configureTransaction({ exists: () => true, data: () => saved });
    transaction.update.mockImplementation((_ref, patch) => {
      for (const [key, value] of Object.entries(patch)) {
        if (value && typeof value === 'object' && 'deleteField' in value) delete saved[key];
        else saved[key] = value;
      }
    });
    firestoreMock.getDocs.mockResolvedValue({
      docs: [{ id: 'one-campaign', data: () => saved }],
    });

    await updateCampaign('one-campaign', {
      richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2550,
    });
    expect(transaction.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'one-campaign' }),
      { richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2550 },
    );
    expect((await getAllCampaigns())[0]).toMatchObject({
      richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2550,
    });

    await updateCampaign('one-campaign', { richiedeAcconto: false, accontoImportoCentesimi: null });
    expect((await getAllCampaigns())[0]).toMatchObject({
      richiedeApprovazione: false, richiedeAcconto: false, accontoImportoCentesimi: null,
    });
    expect(saved).not.toHaveProperty('accontoImportoCentesimi');
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

  it('registra l’attivazione con l’orologio del server, la conserva e la elimina quando il recupero viene spento', async () => {
    const saved: Record<string, any> = { ...campaignInput('FIRST'), dataInizio: asTimestamp('2026-10-01T00:00:00Z'),
      dataFine: asTimestamp('2026-10-31T00:00:00Z') };
    const tx = configureTransaction({ exists: () => true, data: () => saved });
    tx.update.mockImplementation((_ref: unknown, patch: Record<string, unknown>) => Object.assign(saved, patch));
    await updateCampaign('one', { emailRecuperoAcconto: true });
    expect(tx.update).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      emailRecuperoAcconto: true, recuperoAccontoAttivatoIl: { serverTimestamp: true },
    }));
    tx.update.mockClear();
    await updateCampaign('one', { emailRecuperoAcconto: true });
    expect(tx.update).toHaveBeenLastCalledWith(expect.anything(), { emailRecuperoAcconto: true });
    await updateCampaign('one', { emailRecuperoAcconto: false });
    expect(tx.update).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({
      emailRecuperoAcconto: false, recuperoAccontoAttivatoIl: { deleteField: true },
    }));
  });
});
