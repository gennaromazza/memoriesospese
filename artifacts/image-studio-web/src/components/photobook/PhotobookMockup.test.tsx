import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOX_MOCKUP_MODEL } from '@shared/mockup-catalog';
import type { MockupConfiguration } from '@shared/mockup-types';
import MockupRendererError from './MockupRendererError';
import { beginMockupRendererRetry, configurationForRendererRestore, shouldSkipSavedMockupRestore } from './mockup-renderer-recovery';
import { hasSavedMockupPhotos, loadSavedMockupPhotos } from './mockup-photo-recovery';

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

  it('ritenta il recupero della foto salvata senza alterare le scelte o inviare notifiche', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const configuration = {
      modelId: 'mockup-test',
      photoAssetId: 'saved-photo-42',
      backPhotoAssetId: 'saved-back-84',
      coverLayout: 'full',
      coverText: 'Anna e Luca',
    } as unknown as MockupConfiguration;
    const originalConfiguration = { ...configuration };
    const attemptsById = new Map<string, number>();
    const loadPhoto = vi.fn(async (id: string) => {
      const attempt = (attemptsById.get(id) || 0) + 1;
      attemptsById.set(id, attempt);
      if (id === 'saved-back-84' && attempt === 1) throw new Error('Errore temporaneo');
      return new Blob([id], { type: 'image/jpeg' });
    });

    expect(hasSavedMockupPhotos(configuration)).toBe(true);
    await expect(loadSavedMockupPhotos(configuration, loadPhoto)).rejects.toThrow('Errore temporaneo');
    const recovered = await loadSavedMockupPhotos(configuration, loadPhoto);

    expect(loadPhoto).toHaveBeenCalledTimes(4);
    expect(attemptsById.get('saved-photo-42')).toBe(2);
    expect(attemptsById.get('saved-back-84')).toBe(2);
    expect(recovered.photo?.id).toBe('saved-photo-42');
    expect(recovered.photo?.blob).toBeInstanceOf(Blob);
    expect(recovered.backPhoto?.id).toBe('saved-back-84');
    expect(recovered.backPhoto?.blob).toBeInstanceOf(Blob);
    expect(configuration).toEqual(originalConfiguration);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('recupera tutte le foto salvate del Quadrobook con richieste simulate', async () => {
    const configuration = {
      modelId: BOX_MOCKUP_MODEL.id,
      photoAssetId: 'saved-base-1',
      lidPhotoAssetId: 'saved-lid-2',
      coverPhotoAssetId: 'saved-cover-3',
    } as unknown as MockupConfiguration;
    const loadPhoto = vi.fn(async (id: string) => new Blob([id], { type: 'image/jpeg' }));

    const assets = await loadSavedMockupPhotos(configuration, loadPhoto);

    expect(loadPhoto).toHaveBeenCalledTimes(3);
    expect(assets.boxPhotos?.base?.id).toBe('saved-base-1');
    expect(assets.boxPhotos?.lid?.id).toBe('saved-lid-2');
    expect(assets.boxPhotos?.cover?.id).toBe('saved-cover-3');
  });
});
