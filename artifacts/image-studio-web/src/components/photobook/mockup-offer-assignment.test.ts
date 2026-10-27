import { describe, expect, it, vi } from 'vitest';
import { assignMockupOffer } from './mockup-offer-assignment';
import { initialMockupSelection, mockupPresentation } from './mockup-presentation';
import type { MockupPayload } from '@shared/mockup-types';

describe('assegnazione modello e aggiornamento anteprima', () => {
  it('propaga l’errore di salvataggio del server senza tentare il refetch', async () => {
    const serverError = new Error('Scegli il formato dell’ImageBox prima di pubblicare');
    const save = vi.fn().mockRejectedValue(serverError);
    const reload = vi.fn();
    await expect(assignMockupOffer(save, reload)).rejects.toBe(serverError);
    expect(save).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('distingue il refetch fallito dopo un salvataggio completato, senza ripetere la scrittura', async () => {
    const save = vi.fn().mockResolvedValue({ revision: 2 });
    const refreshError = new Error('Rete non disponibile');
    const reload = vi.fn().mockRejectedValue(refreshError);
    await expect(assignMockupOffer(save, reload)).resolves.toEqual({ status: 'refresh-failed', error: refreshError });
    expect(save).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(save.mock.invocationCallOrder[0]).toBeLessThan(reload.mock.invocationCallOrder[0]!);
  });

  it('non aggiorna l’anteprima finché l’assegnazione non è riuscita, poi risolve ImageBox', async () => {
    const payload = {
      modelMode: 'fixed',
      offer: { mode: 'fixed', revision: 1, options: [{ labId: 'lab', id: 'imagebox', name: 'ImageBox', rendererId: 'imagebox' }] },
      saved: null,
    } as unknown as MockupPayload;
    let acknowledgeSave!: () => void;
    const save = vi.fn(() => new Promise<void>(resolve => { acknowledgeSave = resolve; }));
    const reload = vi.fn().mockResolvedValue(payload);
    const pending = assignMockupOffer(save, reload);
    expect(reload).not.toHaveBeenCalled();
    expect(mockupPresentation(undefined).rendererId).toBeUndefined();
    acknowledgeSave();
    const result = await pending;
    expect(result.status).toBe('updated');
    if (result.status !== 'updated') throw new Error('Aggiornamento atteso');
    expect(mockupPresentation(result.data, initialMockupSelection(result.data))).toMatchObject({ title: 'ImageBox', rendererId: 'imagebox' });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
