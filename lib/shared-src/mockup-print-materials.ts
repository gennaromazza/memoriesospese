import type { MockupConfiguration } from './mockup-types';
import type { MockupOption } from './mockup-workflow';
import { boxCoverGraphicId } from './mockup-workflow';

/** Only assets used by the confirmed layout, not abandoned choices in the editor. */
export function mockupPrintMaterials(configuration: MockupConfiguration, option?: MockupOption) {
  const materials: { id: string; label: string; kind: 'photo' | 'graphic' }[] = [];
  const add = (id: string | null | undefined, label: string, kind: 'photo' | 'graphic' = 'photo') => {
    if (id) materials.push({ id, label, kind });
  };
  if (configuration.modelId === 'scatola-cornice') {
    add(configuration.photoAssetId, 'Foto fondo scatola');
    add(configuration.lidPhotoAssetId, 'Foto tappo cornice');
    if (configuration.coverLayout === 'photo') add(configuration.coverPhotoAssetId, 'Foto copertina album');
    else add(boxCoverGraphicId(option?.setup), 'Grafica copertina album', 'graphic');
  } else if (configuration.modelId === 'imagebox') {
    add(configuration.photoAssetId, 'Foto fondo scatola');
    if (configuration.coverLayout !== 'plaque') add(configuration.coverPhotoAssetId, 'Foto copertina album');
    if (['plaque', 'split-photo-fabric'].includes(configuration.coverLayout) && configuration.coverEngraving?.mode === 'graphic') {
      add(configuration.coverEngraving.assetId, 'Grafica incisione copertina', 'graphic');
    }
    if (configuration.glassEngraving?.mode === 'graphic') add(configuration.glassEngraving.assetId, 'Grafica incisione plexiglass', 'graphic');
  } else {
    if (configuration.coverLayout !== 'plaque') add(configuration.photoAssetId, 'Foto copertina album');
    if ('backCover' in configuration && configuration.backCover === 'photo') {
      add(configuration.backPhotoAssetId, 'Foto plexiglass posteriore');
    }
  }
  // One source can be used on several surfaces: export it once, naming every use.
  return [...new Set(materials.map(material => material.id))].map(id => ({
    ...materials.find(material => material.id === id)!,
    label: materials.filter(material => material.id === id).map(material => material.label).join(' e '),
  }));
}
