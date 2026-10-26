import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MockupConfiguration } from '@shared/mockup-types';
import MockupRendererError from './MockupRendererError';
import { beginMockupRendererRetry, configurationForRendererRestore, shouldSkipSavedMockupRestore } from './mockup-renderer-recovery';

describe('recupero del mockup fotolibro', () => {
  it('spiega l’errore temporaneo e offre un comando per riprovare', () => {
    const html = renderToStaticMarkup(
      <MockupRendererError
        message="L’anteprima 3D si è interrotta. Riprova a caricarla."
        onRetry={() => undefined}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('Anteprima non disponibile');
    expect(html).toContain('Le tue scelte salvate sono al sicuro.');
    expect(html).toContain('Riprova a caricare l’anteprima');
    expect(html).toContain('data-testid="button-retry-mockup-renderer"');
  });

  it('consente a una nuova iframe di ricaricare la configurazione salvata senza ripetere azioni', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const savedConfiguration = {
      modelId: 'album-girevole',
      coverLayout: 'photo',
      coverText: 'Anna e Luca',
      photoAssetId: 'saved-photo-42',
    };
    const savedRevision = 7;
    const skippedRevision = savedRevision;

    expect(shouldSkipSavedMockupRestore(savedRevision, skippedRevision, false)).toBe(true);

    const retry = beginMockupRendererRetry(3);
    expect(retry.generation).toBe(4);
    expect(retry.skipRestoreRevision).toBeNull();
    expect(shouldSkipSavedMockupRestore(savedRevision, retry.skipRestoreRevision, false)).toBe(false);
    expect(configurationForRendererRestore(savedConfiguration as unknown as MockupConfiguration, undefined, false, false)).toBe(savedConfiguration);
    expect(configurationForRendererRestore(savedConfiguration as unknown as MockupConfiguration, undefined, true, false)).toBeUndefined();
    expect(savedConfiguration).toEqual({
      modelId: 'album-girevole',
      coverLayout: 'photo',
      coverText: 'Anna e Luca',
      photoAssetId: 'saved-photo-42',
    });

    // La riprova è solo un reset del renderer: non effettua chiamate di invio o conferma.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
