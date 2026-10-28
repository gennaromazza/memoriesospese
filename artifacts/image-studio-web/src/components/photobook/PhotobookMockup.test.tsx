import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BOX_MOCKUP_MODEL, MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from '@shared/mockup-catalog';
import type { MockupConfiguration } from '@shared/mockup-types';
import MockupRendererError from './MockupRendererError';
import SavedMockupPhotoRecoveryError from './SavedMockupPhotoRecoveryError';
import { beginMockupRendererRetry, configurationForRendererRestore, planMockupRendererRecovery, reuseCompatibleMockupChoices, shouldSkipSavedMockupRestore } from './mockup-renderer-recovery';
import { hasSavedMockupPhotos, loadSavedMockupPhotos, loadSavedMockupPhotosPartial, mockupRequestErrorFromResponse, replaceMockupPhotoReference, resolveMockupPhotoTarget, savedMockupPhotoFailure } from './mockup-photo-recovery';

describe('recupero del mockup fotolibro', () => {
  it('rispetta il lato scelto dall’admin anche su smartphone', () => {
    expect(resolveMockupPhotoTarget({
      mobile: true,
      clientWizard: false,
      step: 2,
      rendererId: 'plaza-led',
      selectedSide: 'back',
    })).toBe('back');
  });

  it.each(['album-girevole', 'plaza-led'])(
    'mantiene il lato posteriore selezionato dall’admin nel renderer %s, indipendentemente dal dispositivo',
    rendererId => {
      for (const mobile of [false, true]) {
        expect(resolveMockupPhotoTarget({
          mobile,
          clientWizard: false,
          step: 2,
          rendererId,
          selectedSide: 'back',
        })).toBe('back');
      }
    },
  );

  it('mantiene il routing per passo del wizard cliente su smartphone', () => {
    expect(resolveMockupPhotoTarget({
      mobile: true,
      clientWizard: true,
      step: 7,
      rendererId: 'plaza-led',
      selectedSide: 'front',
    })).toBe('back');
    expect(resolveMockupPhotoTarget({
      mobile: true,
      clientWizard: true,
      step: 6,
      rendererId: 'plaza-led',
      selectedSide: 'back',
    })).toBe('front');
  });

  it('riusa foto, layout e scritte compatibili e richiede una nuova scelta per il rivestimento non condiviso', () => {
    const source = {
      modelId: MOCKUP_MODEL.id,
      assetRevision: MOCKUP_MODEL.assetRevision,
      materialId: MOCKUP_MODEL.variants[0].id,
      appearanceRevision: MOCKUP_MODEL.variants[0].appearanceRevision,
      coverLayout: 'full',
      topText: 'Anna',
      bottomText: 'Luca',
      photoAssetId: '11111111-1111-4111-8111-111111111111',
      crop: { zoom: 1.4, x: 0.3, y: 0.6 },
    } as unknown as MockupConfiguration;
    const targetOption = {
      id: 'target-model',
      name: 'Album girevole',
      rendererId: ROTATING_MOCKUP_MODEL.id,
      active: true,
      materialIds: [MOCKUP_MODEL.variants[0].id],
      materials: [{ id: MOCKUP_MODEL.variants[0].id, label: 'Tessuto condiviso', supplierCode: 'T-01' }],
      labId: 'lab',
      labName: 'Laboratorio',
    } as unknown as import('@shared/mockup-workflow').MockupOption;
    const targetDefaults = {
      modelId: ROTATING_MOCKUP_MODEL.id,
      assetRevision: ROTATING_MOCKUP_MODEL.assetRevision,
      materialId: ROTATING_MOCKUP_MODEL.variants[1].id,
      appearanceRevision: ROTATING_MOCKUP_MODEL.variants[1].appearanceRevision,
      coverLayout: 'plaque',
      frameFinish: 'fabric',
      topText: '',
      bottomText: '',
      photoAssetId: null,
      crop: { zoom: 1, x: 0.5, y: 0.5 },
      backCover: 'fabric',
      backPhotoAssetId: null,
      backCrop: { zoom: 1, x: 0.5, y: 0.5 },
    };

    const plan = planMockupRendererRecovery(source, targetOption);
    const migrated = reuseCompatibleMockupChoices(targetDefaults, source, targetOption);

    expect(plan.reusable).toEqual(expect.arrayContaining([
      'Copertina: Foto grande',
      'Foto principale: già associata',
      'Scritte e incisioni',
    ]));
    expect(plan.incompatible).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'material', label: 'Rivestimento' }),
    ]));
    expect(plan.reusablePhotoFields).toContain('photoAssetId');
    expect(migrated).toMatchObject({
      modelId: ROTATING_MOCKUP_MODEL.id,
      assetRevision: ROTATING_MOCKUP_MODEL.assetRevision,
      materialId: targetDefaults.materialId,
      coverLayout: 'full',
      topText: 'Anna',
      bottomText: 'Luca',
      photoAssetId: source.photoAssetId,
      crop: { zoom: 1.4, x: 0.3, y: 0.6 },
    });
  });

  it('spiega quando il nuovo renderer usa le foto in ruoli diversi', () => {
    const source = {
      modelId: BOX_MOCKUP_MODEL.id,
      assetRevision: 1,
      materialId: MOCKUP_MODEL.variants[0].id,
      appearanceRevision: MOCKUP_MODEL.variants[0].appearanceRevision,
      albumMaterialId: MOCKUP_MODEL.variants[0].id,
      albumAppearanceRevision: MOCKUP_MODEL.variants[0].appearanceRevision,
      format: { w: 30, h: 20 },
      coverLayout: 'photo',
      photoAssetId: '11111111-1111-4111-8111-111111111111',
      lidPhotoAssetId: '22222222-2222-4222-8222-222222222222',
      coverPhotoAssetId: null,
    } as unknown as MockupConfiguration;
    const targetOption = {
      id: 'target-model',
      name: 'Custodia',
      rendererId: MOCKUP_MODEL.id,
      active: true,
      materialIds: [MOCKUP_MODEL.variants[0].id],
      materials: [{ id: MOCKUP_MODEL.variants[0].id, label: 'Tessuto', supplierCode: 'T-01' }],
      labId: 'lab',
      labName: 'Laboratorio',
    } as unknown as import('@shared/mockup-workflow').MockupOption;

    const plan = planMockupRendererRecovery(source, targetOption);

    expect(plan.incompatible).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cover-layout', reason: expect.stringContaining('non supporta') }),
      expect.objectContaining({ id: 'photos', reason: expect.stringContaining('spazi diversi') }),
      expect.objectContaining({ id: 'format', reason: expect.stringContaining('non è applicabile') }),
    ]));
    expect(plan.reusablePhotoFields).toEqual([]);
  });

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

  it('identifica lo slot mancante e mantiene disponibili le altre foto caricate', async () => {
    const configuration = {
      modelId: 'mockup-test',
      photoAssetId: 'saved-front',
      backPhotoAssetId: 'saved-back',
      backCover: 'photo',
      coverText: 'Anna e Luca',
    } as unknown as MockupConfiguration;
    const loadPhoto = vi.fn(async (id: string) => {
      if (id === 'saved-back') throw Object.assign(new Error('Foto non trovata'), { status: 404 });
      return new Blob([id], { type: 'image/jpeg' });
    });

    const result = await loadSavedMockupPhotosPartial(configuration, loadPhoto);

    expect(result.assets.photo?.id).toBe('saved-front');
    expect(result.assets.backPhoto).toBeUndefined();
    expect(result.failures).toMatchObject([{ slot: 'back', id: 'saved-back' }]);
    expect(configuration).toMatchObject({ photoAssetId: 'saved-front', backPhotoAssetId: 'saved-back' });
  });

  it('sostituisce solo la foto indicata e conserva modello, testi, materiali e altre foto', () => {
    const rawConfiguration = {
      modelId: 'mockup-test',
      photoAssetId: 'saved-front',
      backPhotoAssetId: 'saved-back',
      materialId: 'linen',
      topText: 'Anna',
      bottomText: 'Luca',
      crop: { zoom: 1.5, x: 0.4, y: 0.6 },
      backCrop: { zoom: 1.2, x: 0.3, y: 0.7 },
    };
    const configuration = rawConfiguration as unknown as MockupConfiguration;
    const original = { ...rawConfiguration };

    const replacement = replaceMockupPhotoReference(configuration, 'back', 'replacement-photo') as unknown as typeof rawConfiguration;

    expect(replacement).toEqual({ ...original, backPhotoAssetId: 'replacement-photo' });
    expect(replacement.photoAssetId).toBe(configuration.photoAssetId);
    expect(replacement.modelId).toBe(configuration.modelId);
    expect(replacement.materialId).toBe(configuration.materialId);
    expect(replacement.topText).toBe(rawConfiguration.topText);
    expect(replacement.bottomText).toBe(rawConfiguration.bottomText);
    expect(replacement.crop).toEqual(rawConfiguration.crop);
    expect(replacement.backCrop).toEqual(rawConfiguration.backCrop);
    expect(configuration).toEqual(original);
  });

  it('consente il retry per errori HTTP temporanei', async () => {
    const response = new Response(JSON.stringify({ error: 'Servizio temporaneamente non disponibile' }), { status: 503 });
    const error = await mockupRequestErrorFromResponse(response);
    const failure = savedMockupPhotoFailure(error);
    const html = renderToStaticMarkup(
      <SavedMockupPhotoRecoveryError failure={failure} retryBusy={false} onRetry={() => undefined} />,
    );

    expect(failure.kind).toBe('temporary');
    expect(failure.message).toContain('puoi riprovare');
    expect(html).toContain('button-retry-mockup-saved-photo');
    expect(html).toContain('Riprova a caricare la foto');
  });

  it.each([401, 403, 404])('indica di contattare lo studio per una foto HTTP %s non accessibile', async status => {
    const response = new Response(JSON.stringify({ error: 'Foto non trovata' }), { status });
    const error = await mockupRequestErrorFromResponse(response);
    const failure = savedMockupPhotoFailure(error);
    const html = renderToStaticMarkup(
      <SavedMockupPhotoRecoveryError failure={failure} retryBusy={false} onRetry={() => undefined} />,
    );

    expect(failure.kind).toBe('unavailable');
    expect(failure.message).toContain('Contatta lo studio');
    expect(failure.message).not.toContain('riprovare');
    expect(html).toContain('Contatta lo studio');
    expect(html).not.toContain('button-retry-mockup-saved-photo');
  });

  it('offre allo studio la sostituzione della foto non disponibile da galleria o upload', () => {
    const html = renderToStaticMarkup(
      <SavedMockupPhotoRecoveryError
        failure={{ kind: 'unavailable', message: 'Foto non disponibile' }}
        retryBusy={false}
        onRetry={() => undefined}
        studioRepair={{
          slotLabel: 'del plexiglass posteriore',
          disabled: false,
          onChooseFromGallery: () => undefined,
          onUpload: () => undefined,
        }}
      />,
    );

    expect(html).toContain('La foto del plexiglass posteriore non è più disponibile');
    expect(html).toContain('Scegli dalla galleria');
    expect(html).toContain('Carica una foto');
    expect(html).toContain('le altre scelte del mockup resteranno invariate');
    expect(html).not.toContain('Contatta lo studio');
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
