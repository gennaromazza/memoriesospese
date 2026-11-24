import type { MockupConfiguration } from '@shared/mockup-types';
import { BOX_MOCKUP_MODEL, IMAGEBOX_MOCKUP_MODEL, MOCKUP_RENDERERS, PLAZA_MOCKUP_MODEL, ROTATING_MOCKUP_MODEL } from '@shared/mockup-catalog';
import type { MockupOption } from '@shared/mockup-workflow';

export interface RendererRecoveryChoice {
  id: string;
  label: string;
  reason: string;
}

export interface RendererRecoveryPlan {
  reusable: string[];
  incompatible: RendererRecoveryChoice[];
  reusablePhotoFields: string[];
}

type ConfigurationRecord = Record<string, unknown>;

function isBoxRenderer(rendererId: string) {
  return rendererId === BOX_MOCKUP_MODEL.id || rendererId === IMAGEBOX_MOCKUP_MODEL.id;
}

function isRotatingRenderer(rendererId: string) {
  return rendererId === ROTATING_MOCKUP_MODEL.id || rendererId === PLAZA_MOCKUP_MODEL.id;
}

function hasValue(configuration: ConfigurationRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(configuration, key)
    && configuration[key] !== undefined
    && configuration[key] !== null
    && configuration[key] !== '';
}

function recoveryCompatibility(source: ConfigurationRecord, targetRendererId: string, option: MockupOption) {
  const sourceRendererId = String(source.modelId || '');
  const sourceIsBox = isBoxRenderer(sourceRendererId);
  const targetIsBox = isBoxRenderer(targetRendererId);
  const sourceIsRotating = isRotatingRenderer(sourceRendererId);
  const targetIsRotating = isRotatingRenderer(targetRendererId);
  const sameProductFamily = sourceRendererId === targetRendererId
    || sourceIsBox && targetIsBox
    || sourceIsRotating && targetIsRotating;
  const targetRenderer = MOCKUP_RENDERERS.find(renderer => renderer.id === targetRendererId);
  const reusable = new Set<string>();
  const incompatible = new Map<string, RendererRecoveryChoice>();

  const addIncompatible = (id: string, label: string, reason: string) => {
    incompatible.set(id, { id, label, reason });
  };

  if (hasValue(source, 'coverLayout')) {
    const layout = String(source.coverLayout);
    const setupAllowsLayout = !option.setup || !('cover' in option.setup)
      || option.setup.cover.mode === 'choice'
      || option.setup.cover.mode === layout;
    if (new Set<string>(targetRenderer?.coverLayouts || []).has(layout) && setupAllowsLayout) {
      reusable.add('cover-layout');
    } else {
      addIncompatible('cover-layout', 'Tipo di copertina', 'Il nuovo renderer non supporta questa disposizione: scegline una tra quelle disponibili.');
    }
  }

  const materialId = typeof source.materialId === 'string' ? source.materialId : '';
  if (materialId) {
    if (sameProductFamily && option.materials.some(material => material.id === materialId)) {
      reusable.add('material');
    } else {
      addIncompatible('material', 'Rivestimento', 'Questa scelta non è disponibile o non ha lo stesso uso nel nuovo modello: scegline uno di nuovo.');
    }
  }

  const albumMaterialId = typeof source.albumMaterialId === 'string' ? source.albumMaterialId : '';
  if (albumMaterialId) {
    if (sourceIsBox && targetIsBox && option.materials.some(material => material.id === albumMaterialId)) {
      reusable.add('album-material');
    } else {
      addIncompatible('album-material', 'Tessuto dell’album', 'Il nuovo modello potrebbe usare un tessuto o una finitura diversa: scegli il tessuto dell’album.');
    }
  }
  const innerMaterialId = typeof source.innerMaterialId === 'string' ? source.innerMaterialId : '';
  if (innerMaterialId) {
    if (sourceRendererId === targetRendererId && option.materials.some(material => material.id === innerMaterialId)) {
      reusable.add('inner-material');
    } else {
      addIncompatible('inner-material', 'Rivestimento interno', 'Il rivestimento interno non è disponibile con la nuova proposta: scegline uno di nuovo.');
    }
  }

  for (const field of ['topText', 'bottomText']) {
    if (!hasValue(source, field)) continue;
    if (!sourceIsBox && !targetIsBox) {
      reusable.add('inscriptions');
    } else {
      addIncompatible('inscriptions', 'Scritte e incisioni', 'Le scritte precedenti non corrispondono ai comandi del nuovo modello: inseriscile di nuovo.');
    }
  }
  if (reusable.has('inscriptions')) reusable.add('inscriptions-label');

  if (hasValue(source, 'engravingNames')) {
    if (sourceIsRotating && targetIsRotating) reusable.add('engraving-names');
    else addIncompatible('engraving-names', 'Nomi incisi', 'Il nuovo renderer non usa lo stesso tipo di incisione: inserisci di nuovo i nomi.');
  }
  for (const field of ['coverEngraving', 'glassEngraving']) {
    if (!hasValue(source, field)) continue;
    const engraving = source[field] as { mode?: string } | undefined;
    if (sourceRendererId === targetRendererId && engraving?.mode !== 'graphic') reusable.add(field);
    else addIncompatible('engravings', 'Grafiche e incisioni', 'Le incisioni del renderer precedente non sono trasferibili: impostale di nuovo nel nuovo visualizzatore.');
  }

  const photoFields = [
    'photoAssetId',
    'backPhotoAssetId',
    'lidPhotoAssetId',
    'coverPhotoAssetId',
  ] as const;
  const transferablePhotoFields = new Set<string>();
  for (const field of photoFields) {
    if (!hasValue(source, field)) continue;
    const canReuse = field === 'photoAssetId'
      ? sourceIsBox === targetIsBox
      : field === 'backPhotoAssetId'
        ? sourceIsRotating && targetIsRotating
        : (field === 'lidPhotoAssetId' || field === 'coverPhotoAssetId')
          ? sourceIsBox && targetIsBox
          : false;
    if (canReuse) {
      transferablePhotoFields.add(field);
      reusable.add(`photo:${field}`);
    } else {
      addIncompatible('photos', 'Foto associate', 'Le foto precedenti occupano spazi diversi nel nuovo modello: associale di nuovo nell’anteprima.');
    }
  }

  if (hasValue(source, 'frameFinish')) {
    if (sourceIsRotating && targetIsRotating) reusable.add('frame-finish');
    else addIncompatible('frame-finish', 'Finitura della struttura', 'La finitura precedente non è disponibile per il nuovo modello: scegline una di nuovo.');
  }
  if (hasValue(source, 'backCover')) {
    if (sourceIsRotating && targetIsRotating) reusable.add('back-cover');
    else addIncompatible('back-cover', 'Plexiglass posteriore', 'La copertura posteriore del nuovo modello ha opzioni diverse: scegline una di nuovo.');
  }
  if (hasValue(source, 'ledEnabled')) {
    if (targetRendererId === PLAZA_MOCKUP_MODEL.id) reusable.add('led');
    else addIncompatible('led', 'Illuminazione LED', 'Il nuovo modello non ha la stessa illuminazione: controlla le sue impostazioni.');
  }
  if (hasValue(source, 'format')) {
    const assignedFormat = option.setup?.format;
    if (targetIsBox && assignedFormat && JSON.stringify(source.format) === JSON.stringify(assignedFormat)) {
      reusable.add('format');
    } else {
      addIncompatible('format', 'Formato', 'Il formato del modello precedente non è applicabile: conferma quello definito per il nuovo modello.');
    }
  }

  return { reusable, incompatible, transferablePhotoFields, targetRenderer };
}

/** Identifies which saved choices can safely survive a renderer change. */
export function planMockupRendererRecovery(
  sourceConfiguration: MockupConfiguration,
  option: MockupOption,
): RendererRecoveryPlan {
  if (!option.rendererId) return { reusable: [], incompatible: [], reusablePhotoFields: [] };
  const source = sourceConfiguration as unknown as ConfigurationRecord;
  const compatibility = recoveryCompatibility(source, option.rendererId, option);
  const { reusable, incompatible } = compatibility;
  const labels: Record<string, string> = {
    inscriptions: 'Scritte e incisioni',
    'engraving-names': 'Nomi incisi',
    'frame-finish': 'Finitura della struttura',
    'back-cover': 'Plexiglass posteriore',
    led: 'Illuminazione LED',
    format: 'Formato',
    coverEngraving: 'Incisione sulla copertina',
    glassEngraving: 'Incisione sul plexiglass',
  };
  const friendlyReusable = [...reusable]
    .filter(id => !id.startsWith('photo:') && id !== 'inscriptions-label')
    .map(id => {
      if (id === 'cover-layout') {
        const renderer = MOCKUP_RENDERERS.find(item => item.id === option.rendererId);
        const layout = String(source.coverLayout);
        return `Copertina: ${renderer?.coverExamples.find(example => example.layout === layout)?.title || layout}`;
      }
      if (id === 'material') return `Rivestimento: ${option.materials.find(material => material.id === source.materialId)?.label || 'scelta precedente'}`;
      if (id === 'album-material') return `Tessuto album: ${option.materials.find(material => material.id === source.albumMaterialId)?.label || 'scelta precedente'}`;
      if (id === 'inner-material') return `Rivestimento interno: ${option.materials.find(material => material.id === source.innerMaterialId)?.label || 'scelta precedente'}`;
      return labels[id] || id;
    });

  if (reusable.has('inscriptions')) friendlyReusable.push(labels.inscriptions);
  for (const key of reusable) {
    if (key.startsWith('photo:')) {
      const field = key.slice('photo:'.length);
      const label = field === 'photoAssetId' ? 'Foto principale'
        : field === 'backPhotoAssetId' ? 'Foto del retro'
          : field === 'lidPhotoAssetId' ? 'Foto del tappo' : 'Foto di copertina';
      friendlyReusable.push(`${label}: già associata`);
    }
  }

  return {
    reusable: [...new Set(friendlyReusable)],
    incompatible: [...incompatible.values()],
    reusablePhotoFields: [...compatibility.transferablePhotoFields],
  };
}

/** Merges only settings with matching meaning into the new renderer's initial configuration. */
export function reuseCompatibleMockupChoices(
  targetConfiguration: Record<string, unknown>,
  sourceConfiguration: MockupConfiguration,
  option: MockupOption,
): Record<string, unknown> {
  const source = sourceConfiguration as unknown as ConfigurationRecord;
  const result: ConfigurationRecord = { ...targetConfiguration };
  if (!option.rendererId) return result;
  const targetRendererId = option.rendererId;
  const sourceRendererId = String(source.modelId || '');
  const sourceIsBox = isBoxRenderer(sourceRendererId);
  const targetIsBox = isBoxRenderer(targetRendererId);
  const sourceIsRotating = isRotatingRenderer(sourceRendererId);
  const targetIsRotating = isRotatingRenderer(targetRendererId);
  const compatibility = recoveryCompatibility(source, targetRendererId, option);
  const copy = (field: string) => {
    if (hasValue(source, field) && Object.prototype.hasOwnProperty.call(result, field)) result[field] = source[field];
  };

  if (compatibility.reusable.has('cover-layout')) copy('coverLayout');
  if (compatibility.reusable.has('material')) {
    copy('materialId');
    const variant = MOCKUP_RENDERERS.find(renderer => renderer.id === targetRendererId)?.variants.find(item => item.id === source.materialId);
    if (variant && Object.prototype.hasOwnProperty.call(result, 'appearanceRevision')) result.appearanceRevision = variant.appearanceRevision;
  }
  if (compatibility.reusable.has('album-material')) {
    copy('albumMaterialId');
    const variant = MOCKUP_RENDERERS.find(renderer => renderer.id === targetRendererId)?.variants.find(item => item.id === source.albumMaterialId);
    if (variant && Object.prototype.hasOwnProperty.call(result, 'albumAppearanceRevision')) result.albumAppearanceRevision = variant.appearanceRevision;
  }
  if (compatibility.reusable.has('inner-material')) {
    copy('innerMaterialId');
    const variant = MOCKUP_RENDERERS.find(renderer => renderer.id === targetRendererId)?.variants.find(item => item.id === source.innerMaterialId);
    if (variant && Object.prototype.hasOwnProperty.call(result, 'innerAppearanceRevision')) result.innerAppearanceRevision = variant.appearanceRevision;
  }
  if (compatibility.reusable.has('inscriptions')) {
    copy('topText');
    copy('bottomText');
  }
  if (compatibility.reusable.has('engraving-names')) copy('engravingNames');
  if (compatibility.reusable.has('coverEngraving')) copy('coverEngraving');
  if (compatibility.reusable.has('glassEngraving')) copy('glassEngraving');
  if (compatibility.reusable.has('frame-finish')) copy('frameFinish');
  if (compatibility.reusable.has('back-cover')) copy('backCover');
  if (compatibility.reusable.has('led')) copy('ledEnabled');

  for (const field of compatibility.transferablePhotoFields) copy(field);
  if (compatibility.transferablePhotoFields.has('photoAssetId')) copy('crop');
  if (compatibility.transferablePhotoFields.has('backPhotoAssetId')) copy('backCrop');

  // Box format and studio-defined setup always come from the newly assigned option.
  return result;
}

export function beginMockupRendererRetry(generation: number) {
  return {
    generation: generation + 1,
    skipRestoreRevision: null,
  };
}

export function shouldSkipSavedMockupRestore(
  savedRevision: number | undefined,
  skippedRevision: number | null,
  hasPendingConfiguration: boolean,
) {
  return savedRevision !== undefined && savedRevision === skippedRevision && !hasPendingConfiguration;
}

export function configurationForRendererRestore(
  savedConfiguration: MockupConfiguration | undefined,
  pendingConfiguration: MockupConfiguration | undefined,
  hasPendingOption: boolean,
  staleFixedSave: boolean,
) {
  return pendingConfiguration || (hasPendingOption || staleFixedSave ? undefined : savedConfiguration);
}
