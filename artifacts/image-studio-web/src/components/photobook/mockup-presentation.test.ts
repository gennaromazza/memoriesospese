import { describe, expect, it } from 'vitest';
import { initialMockupSelection, mockupPresentation, needsClientModelChoice } from './mockup-presentation';
import type { MockupPayload } from '@shared/mockup-types';

describe('modello mostrato nel link cliente', () => {
  const plaza = { labId: 'nobili', id: 'plaza', name: 'Plaza LED', rendererId: 'plaza-led' };
  it('mostra solo Plaza LED anche se la vecchia bozza usava Custodia', () => {
    const payload = {
      modelMode: 'fixed', offer: { revision: 2, mode: 'fixed', options: [plaza] },
      saved: { selection: { labId: 'other', modelId: 'custodia' }, configuration: { modelId: 'custodia' }, option: { name: 'Custodia' } },
    } as unknown as MockupPayload;
    expect(mockupPresentation(payload)).toMatchObject({ title: 'Plaza LED', rendererId: 'plaza-led', staleFixedSave: true });
    expect(initialMockupSelection(payload)).toEqual({ labId: 'nobili', modelId: 'plaza' });
  });
  it('sceglie il modello fisso al primo ingresso desktop, senza aprire il selettore mobile', () => {
    const payload = { modelMode: 'fixed', offer: { revision: 1, mode: 'fixed', options: [plaza] }, saved: null } as unknown as MockupPayload;
    expect(initialMockupSelection(payload)).toEqual({ labId: 'nobili', modelId: 'plaza' });
  });
  it('un’offerta fissa non valida non si presenta come Custodia', () => {
    const payload = { modelMode: 'fixed', offer: null, offerError: 'Lo studio deve ripubblicare la proposta.', saved: { option: { name: 'Custodia' } } } as unknown as MockupPayload;
    expect(mockupPresentation(payload).title).toBe('Modello non disponibile');
  });
  it('continua a chiedere al cliente di scegliere quando la bozza è stata preparata dallo studio', () => {
    const custodia = { labId: 'peppe', id: 'custodia', name: 'Custodia', rendererId: 'custodia' };
    const payload = {
      modelMode: 'choice',
      offer: { revision: 3, mode: 'choice', options: [custodia, plaza] },
      saved: {
        updatedBy: 'studio',
        selection: { labId: 'nobili', modelId: 'plaza' },
        configuration: { modelId: 'plaza' },
        option: plaza,
      },
    } as unknown as MockupPayload;

    expect(needsClientModelChoice(payload)).toBe(true);
    expect(initialMockupSelection(payload)).toBeUndefined();
    expect(mockupPresentation(payload)).toMatchObject({ title: 'Custodia', rendererId: 'custodia' });
  });
  it('ripristina la scelta già salvata dal cliente se è ancora inclusa nella proposta', () => {
    const payload = {
      modelMode: 'choice',
      offer: { revision: 3, mode: 'choice', options: [plaza] },
      saved: {
        updatedBy: 'client',
        selection: { labId: 'nobili', modelId: 'plaza' },
        configuration: { modelId: 'plaza' },
      },
    } as unknown as MockupPayload;

    expect(needsClientModelChoice(payload)).toBe(false);
    expect(initialMockupSelection(payload)).toEqual({ labId: 'nobili', modelId: 'plaza' });
  });
});