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
  const photoName = labels.photo || 'Foto salvata';
  const backPhotoName = labels.backPhoto || 'Foto retro salvata';
  const boxPhotoName = labels.boxPhoto || 'Foto salvata';
  const get = async (id: string | null | undefined, name: string): Promise<RuntimeMockupPhoto | undefined> =>
    id ? { id, name, source: 'saved', blob: await loadPhoto(id) } : undefined;

  if (configuration.modelId === BOX_MOCKUP_MODEL.id) {
    const [base, lid, cover] = await Promise.all([
      get(configuration.photoAssetId, boxPhotoName),
      get(configuration.lidPhotoAssetId, boxPhotoName),
      get(configuration.coverPhotoAssetId, boxPhotoName),
    ]);
    return { boxPhotos: { base, lid, cover } };
  }

  const backPhotoAssetId = 'backPhotoAssetId' in configuration ? configuration.backPhotoAssetId : null;
  const [photo, backPhoto] = await Promise.all([
    get(configuration.photoAssetId, photoName),
    get(backPhotoAssetId, backPhotoName),
  ]);
  return { photo, backPhoto };
}
