import { BOX_MOCKUP_MODEL } from '@shared/mockup-catalog';
import type { MockupConfiguration } from '@shared/mockup-types';

export interface RuntimeMockupPhoto {
  id: string;
  name: string;
  source: 'saved';
  blob: Blob;
}

export interface SavedMockupPhotoAssets {
  photo?: RuntimeMockupPhoto;
  backPhoto?: RuntimeMockupPhoto;
  boxPhotos?: {
    base?: RuntimeMockupPhoto;
    lid?: RuntimeMockupPhoto;
    cover?: RuntimeMockupPhoto;
  };
}

export interface SavedMockupPhotoLabels {
  photo?: string;
  backPhoto?: string;
  boxPhoto?: string;
}

export type SavedMockupPhotoSlot = 'front' | 'back' | 'base' | 'lid' | 'cover';

export interface SavedMockupPhotoLoadFailure {
  slot: SavedMockupPhotoSlot;
  id: string;
  error: unknown;
}

export interface PartialSavedMockupPhotoAssets {
  assets: SavedMockupPhotoAssets;
  failures: SavedMockupPhotoLoadFailure[];
}

export type SavedMockupPhotoFailure = {
  kind: 'temporary' | 'unavailable';
  message: string;
};

export async function mockupRequestErrorFromResponse(response: Response): Promise<Error & { status: number }> {
  const data = await response.json().catch(() => ({})) as { error?: string | { message?: string } };
  const message = typeof data.error === 'string'
    ? data.error
    : data.error?.message || 'Operazione non riuscita';
  return Object.assign(new Error(message), { status: response.status });
}

export function savedMockupPhotoFailure(error: unknown): SavedMockupPhotoFailure {
  const status = error && typeof error === 'object' && 'status' in error
    ? Number((error as { status?: unknown }).status)
    : undefined;

  if (status === 401 || status === 403 || status === 404) {
    return {
      kind: 'unavailable',
      message: 'Questa foto salvata non è più disponibile o non è accessibile. Contatta lo studio per ricevere assistenza.',
    };
  }

  return {
    kind: 'temporary',
    message: 'Non è stato possibile caricare una foto salvata. La configurazione è conservata: puoi riprovare.',
  };
}

export function hasSavedMockupPhotos(configuration: MockupConfiguration) {
  if (configuration.modelId === BOX_MOCKUP_MODEL.id) {
    return !!(configuration.photoAssetId || configuration.lidPhotoAssetId || configuration.coverPhotoAssetId);
  }

  return !!(
    configuration.photoAssetId
    || ('backPhotoAssetId' in configuration && configuration.backPhotoAssetId)
  );
}

/**
 * Loads only the saved photo blobs. The injected loader keeps retries testable
 * without issuing real requests or triggering any workflow side effects.
 */
export async function loadSavedMockupPhotos(
  configuration: MockupConfiguration,
  loadPhoto: (id: string) => Promise<Blob>,
  labels: SavedMockupPhotoLabels = {},
): Promise<SavedMockupPhotoAssets> {
  const result = await loadSavedMockupPhotosPartial(configuration, loadPhoto, labels);
  if (result.failures.length) {
    const failure = result.failures[0];
    throw Object.assign(
      failure.error instanceof Error ? failure.error : new Error('Foto salvata non disponibile'),
      { photoSlot: failure.slot, photoAssetId: failure.id },
    );
  }
  return result.assets;
}

export async function loadSavedMockupPhotosPartial(
  configuration: MockupConfiguration,
  loadPhoto: (id: string) => Promise<Blob>,
  labels: SavedMockupPhotoLabels = {},
  skipSlot?: SavedMockupPhotoSlot,
): Promise<PartialSavedMockupPhotoAssets> {
  const photoName = labels.photo || 'Foto salvata';
  const backPhotoName = labels.backPhoto || 'Foto retro salvata';
  const boxPhotoName = labels.boxPhoto || 'Foto salvata';
  const failures: SavedMockupPhotoLoadFailure[] = [];
  const get = async (
    id: string | null | undefined,
    name: string,
    slot: SavedMockupPhotoSlot,
  ): Promise<RuntimeMockupPhoto | undefined> => {
    if (!id || slot === skipSlot) return undefined;
    try {
      return { id, name, source: 'saved', blob: await loadPhoto(id) };
    } catch (error) {
      failures.push({ slot, id, error });
      return undefined;
    }
  };

  if (configuration.modelId === BOX_MOCKUP_MODEL.id) {
    const [base, lid, cover] = await Promise.all([
      get(configuration.photoAssetId, boxPhotoName, 'base'),
      get(configuration.lidPhotoAssetId, boxPhotoName, 'lid'),
      get(configuration.coverPhotoAssetId, boxPhotoName, 'cover'),
    ]);
    return { assets: { boxPhotos: { base, lid, cover } }, failures };
  }

  const backPhotoAssetId = 'backPhotoAssetId' in configuration ? configuration.backPhotoAssetId : null;
  const [photo, backPhoto] = await Promise.all([
    get(configuration.photoAssetId, photoName, 'front'),
    get(backPhotoAssetId, backPhotoName, 'back'),
  ]);
  return { assets: { photo, backPhoto }, failures };
}

/** Replaces exactly one saved asset reference while preserving all other mockup choices. */
export function replaceMockupPhotoReference(
  configuration: MockupConfiguration,
  slot: SavedMockupPhotoSlot,
  photoId: string,
): MockupConfiguration {
  if (configuration.modelId === BOX_MOCKUP_MODEL.id) {
    const field = slot === 'base' ? 'photoAssetId'
      : slot === 'lid' ? 'lidPhotoAssetId'
        : slot === 'cover' ? 'coverPhotoAssetId'
          : null;
    if (!field) throw new Error(`Lo slot ${slot} non appartiene a questo modello`);
    return { ...configuration, [field]: photoId };
  }

  const field = slot === 'front' ? 'photoAssetId'
    : slot === 'back' && 'backPhotoAssetId' in configuration ? 'backPhotoAssetId'
      : null;
  if (!field) throw new Error(`Lo slot ${slot} non appartiene a questo modello`);
  return { ...configuration, [field]: photoId };
}
