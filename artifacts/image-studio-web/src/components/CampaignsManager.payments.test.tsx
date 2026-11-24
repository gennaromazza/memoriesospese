// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import type { BookingCampaignFE } from '@shared/booking-types';

const mocks = vi.hoisted(() => ({
  campaigns: [] as BookingCampaignFE[],
  create: vi.fn(),
  update: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('@/lib/booking-campaigns', () => ({
  getAllCampaigns: async () => [...mocks.campaigns],
  createCampaign: mocks.create,
  updateCampaign: mocks.update,
  deleteCampaign: vi.fn(),
  generateCampaignCode: () => 'NEW12345',
  isCampaignCodeUnique: async () => true,
  uploadCampaignImage: vi.fn(),
}));
vi.mock('@/lib/products', () => ({ getAllProducts: async () => [] }));
vi.mock('@/lib/product-categories', () => ({ getProductCategories: async () => [] }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }) };
});

import { queryClient } from '@/lib/queryClient';
import CampaignsManager from './CampaignsManager';

function legacy(id = 'legacy'): BookingCampaignFE {
  return {
    id, nome: `Campagna ${id}`, code: 'OLD12345', descrizione: '',
    dataInizio: new Date('2027-12-01T00:00:00Z'), dataFine: new Date('2027-12-31T00:00:00Z'),
    createdAt: new Date(0), temaStagionale: null, orarioApertura: '09:00',
    orarioPausaInizio: '13:00', orarioPausaFine: '14:30', orarioChiusura: '19:00',
    durataShootingMinuti: 30, prodottiDisponibili: [], excludedDays: [], attiva: true,
  };
}
function mount() {
  return render(<QueryClientProvider client={queryClient}><CampaignsManager /></QueryClientProvider>);
}
async function edit(id = 'legacy') {
  fireEvent.click(await screen.findByTestId(`button-edit-${id}`));
  await screen.findByRole('dialog');
}
const approval = () => screen.getByRole('switch', { name: 'Richiedi la mia approvazione' });
const deposit = () => screen.getByRole('switch', { name: 'Richiedi un acconto' });
const reminders = () => screen.getByRole('switch', { name: 'Invia promemoria automatici di pagamento' });
const recovery = () => screen.getByRole('switch', { name: 'Invita a riprenotare se l’acconto scade' });
const amount = () => screen.getByLabelText('Importo acconto (€) *') as HTMLInputElement;
const save = () => fireEvent.click(screen.getByTestId('button-save-campaign'));
async function waitClosed() {
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

beforeEach(() => {
  vi.clearAllMocks();
  queryClient.clear();
  mocks.campaigns = [legacy(), legacy('other')];
  mocks.create.mockImplementation(async (data: Omit<BookingCampaignFE, 'id' | 'createdAt'>) => {
    mocks.campaigns.push({ ...data, id: data.code, createdAt: new Date(0) });
    return data.code;
  });
  mocks.update.mockImplementation(async (id: string, data: Partial<BookingCampaignFE>) => {
    mocks.campaigns = mocks.campaigns.map(campaign => campaign.id === id
      ? { ...campaign, ...data, excludedDays: Array.isArray(data.excludedDays) ? data.excludedDays : [] }
      : campaign);
  });
});

it('permette di attivare, ritrovare e disattivare il recupero nella singola campagna', async () => {
  mocks.campaigns[0] = { ...legacy(), richiedeAcconto: true, accontoImportoCentesimi: 500, emailRecuperoAcconto: true };
  mount(); await edit();
  expect(recovery().getAttribute('aria-checked')).toBe('true');
  fireEvent.click(recovery()); save(); await waitClosed();
  expect(mocks.update).toHaveBeenLastCalledWith('legacy', expect.objectContaining({ emailRecuperoAcconto: false }));
  await edit(); fireEvent.click(recovery()); save(); await waitClosed();
  expect(mocks.update).toHaveBeenLastCalledWith('legacy', expect.objectContaining({ emailRecuperoAcconto: true }));
});

it('mostra i promemoria attivi sulle campagne esistenti con acconto e conserva la disattivazione', async () => {
  mocks.campaigns[0] = { ...legacy(), richiedeAcconto: true, accontoImportoCentesimi: 500 };
  mount(); await edit();
  expect(reminders().getAttribute('aria-checked')).toBe('true');
  fireEvent.click(reminders()); save(); await waitClosed();
  expect(mocks.update).toHaveBeenLastCalledWith('legacy', expect.objectContaining({ emailPromemoriaAcconto: false }));
  await edit();
  expect(reminders().getAttribute('aria-checked')).toBe('false');
  fireEvent.click(approval());
  expect(screen.queryByRole('switch', { name: 'Invia promemoria automatici di pagamento' })).toBeNull();
});

it('non mostra il recupero con acconto disattivato e lo spegne al salvataggio', async () => {
  mocks.campaigns[0] = { ...legacy(), richiedeAcconto: true, accontoImportoCentesimi: 500, emailRecuperoAcconto: true };
  mount(); await edit(); fireEvent.click(deposit());
  expect(screen.queryByRole('switch', { name: 'Invita a riprenotare se l’acconto scade' })).toBeNull();
  save(); await waitClosed();
  expect(mocks.update).toHaveBeenCalledWith('legacy', expect.objectContaining({
    richiedeAcconto: false, emailRecuperoAcconto: false,
  }));
});
afterEach(() => { cleanup(); queryClient.clear(); });

describe('pagamenti nel form campagna', () => {
  it('mostra i default legacy e mantiene indipendenti le opzioni', async () => {
    mount();
    await edit();
    expect(approval().getAttribute('aria-checked')).toBe('true');
    expect(deposit().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Importo acconto (€) *')).toBeNull();
    fireEvent.click(approval());
    expect(deposit().getAttribute('aria-checked')).toBe('false');
    fireEvent.click(deposit());
    expect(approval().getAttribute('aria-checked')).toBe('false');
    expect(amount().required).toBe(true);
    expect(screen.getByText(/Il cliente può sempre decidere i prodotti in studio/)).toBeTruthy();
  });

  it('impedisce il salvataggio di un importo mancante o non valido', async () => {
    mount();
    await edit();
    fireEvent.click(deposit());
    for (const invalid of ['', '0', '-1', '12,345']) {
      fireEvent.change(amount(), { target: { value: invalid } });
      save();
      expect(screen.getByRole('alert').textContent).toContain('maggiore di zero');
      expect(amount().getAttribute('aria-invalid')).toBe('true');
      expect(document.activeElement).toBe(amount());
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('crea con importo in euro e riapre i dati salvati in centesimi', async () => {
    mount();
    fireEvent.click(await screen.findByTestId('button-new-campaign'));
    await waitFor(() => expect((screen.getByTestId('input-campaign-code') as HTMLInputElement).value).toBe('NEW12345'));
    fireEvent.change(screen.getByTestId('input-campaign-name'), { target: { value: 'Nuova campagna' } });
    // Gli input data sono controllati dal form, senza richieste a servizi esterni.
    fireEvent.change(screen.getByLabelText('Data Inizio *'), { target: { value: '2027-12-01' } });
    fireEvent.change(screen.getByLabelText('Data Fine *'), { target: { value: '2027-12-31' } });
    fireEvent.click(approval());
    fireEvent.click(deposit());
    fireEvent.change(amount(), { target: { value: '25,50' } });
    save();
    await waitClosed();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 2550,
    }));
    await edit('NEW12345');
    expect(approval().getAttribute('aria-checked')).toBe('false');
    expect(deposit().getAttribute('aria-checked')).toBe('true');
    expect(amount().value).toBe('25.50');
  });

  it('modifica e riapre solo la campagna scelta, poi rimuove l’acconto', async () => {
    mount();
    await edit();
    fireEvent.click(deposit());
    fireEvent.change(amount(), { target: { value: '12.99' } });
    save();
    await waitClosed();
    expect(mocks.update).toHaveBeenCalledWith('legacy', expect.objectContaining({
      richiedeApprovazione: true, richiedeAcconto: true, accontoImportoCentesimi: 1299,
    }));
    expect(mocks.update.mock.calls[0][1]).not.toHaveProperty('accontoImportoEuro');
    expect(mocks.campaigns.find(c => c.id === 'other')).toEqual(legacy('other'));
    await edit();
    expect(amount().value).toBe('12.99');
    fireEvent.click(deposit());
    save();
    await waitClosed();
    expect(mocks.update).toHaveBeenLastCalledWith('legacy', expect.objectContaining({
      richiedeAcconto: false, accontoImportoCentesimi: null,
    }));
    await edit();
    expect(screen.queryByLabelText('Importo acconto (€) *')).toBeNull();
  });

  it('non eredita i pagamenti della campagna precedente quando ne crea una nuova', async () => {
    mocks.campaigns[0] = { ...legacy(), richiedeApprovazione: false, richiedeAcconto: true, accontoImportoCentesimi: 5000 };
    mount();
    await edit();
    expect(amount().value).toBe('50.00');
    fireEvent.click(screen.getByTestId('button-cancel'));
    await waitClosed();
    fireEvent.click(screen.getByTestId('button-new-campaign'));
    await waitFor(() => expect((screen.getByTestId('input-campaign-code') as HTMLInputElement).value).toBe('NEW12345'));
    expect(approval().getAttribute('aria-checked')).toBe('true');
    expect(deposit().getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Importo acconto (€) *')).toBeNull();
  });
});
