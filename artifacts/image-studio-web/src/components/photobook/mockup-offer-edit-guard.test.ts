import { describe, expect, it } from 'vitest';
import { isMockupOfferEditorDisabled, shouldConfirmMockupOfferEdit } from './mockup-offer-edit-guard';

describe('cambio modello mockup', () => {
  it('permette di cambiare il modello quando non ci sono modifiche locali in sospeso', () => {
    expect(isMockupOfferEditorDisabled({
      readOnly: false,
      busy: false,
      dirty: false,
      dirtyChangeConfirmed: false,
      assignmentRefreshError: false,
    })).toBe(false);
  });

  it('chiede conferma prima di abbandonare una bozza locale non salvata', () => {
    expect(shouldConfirmMockupOfferEdit(true, false)).toBe(true);
    expect(isMockupOfferEditorDisabled({
      readOnly: false,
      busy: false,
      dirty: true,
      dirtyChangeConfirmed: false,
      assignmentRefreshError: false,
    })).toBe(true);
  });

  it('sblocca la selezione dopo la conferma e mantiene i blocchi di sicurezza', () => {
    expect(shouldConfirmMockupOfferEdit(true, true)).toBe(false);
    expect(isMockupOfferEditorDisabled({
      readOnly: false,
      busy: false,
      dirty: true,
      dirtyChangeConfirmed: true,
      assignmentRefreshError: false,
    })).toBe(false);
    expect(isMockupOfferEditorDisabled({
      readOnly: true,
      busy: false,
      dirty: false,
      dirtyChangeConfirmed: false,
      assignmentRefreshError: false,
    })).toBe(true);
  });
});
