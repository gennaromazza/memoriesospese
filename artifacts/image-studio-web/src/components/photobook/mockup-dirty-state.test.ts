import { describe, expect, it } from 'vitest';
import { MOCKUP_MODEL } from '@shared/mockup-catalog';
import type { SavedMockup } from '@shared/mockup-types';
import { hasUnsavedMockupChanges } from './mockup-dirty-state';

const material = MOCKUP_MODEL.variants[0];
const configuration = {
  modelId: MOCKUP_MODEL.id, assetRevision: MOCKUP_MODEL.assetRevision,
  materialId: material.id, appearanceRevision: material.appearanceRevision,
  coverLayout: 'oblique' as const, topText: 'Alice', bottomText: '',
  photoAssetId: '11111111-1111-4111-8111-111111111111', crop: { zoom: 1, x: .5, y: .5 },
};
const selection = { labId: 'lab', modelId: 'album' };
const saved: SavedMockup = { version: 1, revision: 1, configuration, selection, updatedAt: '2026-10-24T10:00:00Z' };

describe('Modifiche reali del mockup', () => {
  it('non considera modifiche i messaggi ripetuti del renderer durante o dopo il caricamento', () => {
    expect(hasUnsavedMockupChanges({ ...configuration }, saved, selection, true)).toBe(false);
    for (let i = 0; i < 5; i++) expect(hasUnsavedMockupChanges(structuredClone(configuration), saved, selection)).toBe(false);
  });
  it('ignora l’ordine delle proprietà e riconosce salvataggio e ripristino', () => {
    const changed = { ...configuration, topText: 'Nome aggiornato' };
    expect(hasUnsavedMockupChanges(changed, saved, selection)).toBe(true);
    expect(hasUnsavedMockupChanges(changed, { ...saved, configuration: changed, revision: 2 }, selection)).toBe(false);
    expect(hasUnsavedMockupChanges({ ...configuration, crop: { y: .5, x: .5, zoom: 1 } }, saved, selection)).toBe(false);
  });
  it('rileva anche un cambio modello con configurazione identica', () => {
    expect(hasUnsavedMockupChanges(configuration, saved, { ...selection, modelId: 'altro-album' })).toBe(true);
  });
  it('non perde la segnalazione quando la bozza non è ancora stata salvata', () => {
    expect(hasUnsavedMockupChanges(configuration, null, undefined, true)).toBe(false);
    expect(hasUnsavedMockupChanges(configuration, null, undefined)).toBe(true);
  });
});
