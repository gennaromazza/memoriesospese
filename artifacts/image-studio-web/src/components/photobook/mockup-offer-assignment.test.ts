import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { assignMockupOffer } from './mockup-offer-assignment';
import MockupOfferEditor, { MockupOfferPublishError } from './MockupOfferEditor';
import { initialMockupSelection, mockupPresentation } from './mockup-presentation';
import type { MockupPayload } from '@shared/mockup-types';

describe('assegnazione modello e aggiornamento anteprima', () => {
  it('spiega che qui si decide chi sceglie il modello, non chi prepara la bozza', () => {
    const client = new QueryClient();
    const html = renderToStaticMarkup(createElement(
      QueryClientProvider,
      { client },
      createElement(MockupOfferEditor, {
        disabled: false,
        alwaysOpen: true,
        reloadOffer: async () => undefined,
        publish: async () => true,
      }),
    ));

    expect(html).toContain('Chi sceglie il modello dell’album?');
    expect(html).toContain('Un solo modello: lo scelgo io');
    expect(html).toContain('Il cliente sceglie tra i modelli pubblicati');
    expect(html).toContain('non sceglie tra modelli diversi');
  });

  it('propaga l’errore di salvataggio del server senza tentare il refetch', async () => {
    const serverError = Object.assign(new Error('Proposta modificata: ricarica prima di proseguire'), { status: 409 });
    const save = vi.fn().mockRejectedValue(serverError);
    const reload = vi.fn();
    await expect(assignMockupOffer(save, reload)).rejects.toBe(serverError);
    expect(save).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it('mostra il messaggio server di conflitto e offre un aggiornamento esplicito', () => {
    const reload = vi.fn();
    const html = renderToStaticMarkup(
      createElement(MockupOfferPublishError, {
        message: 'Proposta modificata: ricarica prima di proseguire',
        conflict: true,
        refreshing: false,
        onReload: reload,
      }),
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Proposta modificata: ricarica prima di proseguire');
    expect(html).toContain('Ricarica il modello aggiornato');
    const errorElement = MockupOfferPublishError({
      message: 'Proposta modificata: ricarica prima di proseguire',
      conflict: true,
      refreshing: false,
      onReload: reload,
    });
    const children = errorElement.props.children as Array<{ props?: { onClick?: () => void } }>;
    children[1]?.props?.onClick?.();
    expect(reload).toHaveBeenCalledTimes(1);
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
