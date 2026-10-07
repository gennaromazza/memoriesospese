import { optionFor, type MockupSelection } from '@shared/mockup-workflow';
import type { MockupPayload } from '@shared/mockup-types';

export function needsClientModelChoice(payload: MockupPayload | undefined): boolean {
  const offer = payload?.offer;
  if (!offer?.options.length) return false;

  const mode = payload?.modelMode ?? offer.mode ?? (offer.options.length === 1 ? 'fixed' : 'choice');
  if (mode !== 'choice') return false;

  const saved = payload?.saved;
  return !saved || saved.updatedBy === 'studio' || !optionFor(offer, saved.selection);
}

/** La proposta corrente prevale sulle bozze di un modello ritirato. */
export function mockupPresentation(payload: MockupPayload | undefined, selection?: MockupSelection, override?: string | null) {
  const saved = payload?.saved;
  const fixed = payload?.modelMode === 'fixed';
  const staleFixedSave = fixed && !!saved && !!payload?.offer && !optionFor(payload.offer, saved.selection);
  const option = optionFor(payload?.offer || null, selection);
  const awaitingClientChoice = needsClientModelChoice(payload) && !option;
  const displayOption = option || (staleFixedSave || awaitingClientChoice ? payload?.offer?.options[0] : undefined);
  return {
    staleFixedSave,
    title: payload?.offerError ? 'Modello non disponibile' : displayOption?.name || payload?.offer?.options[0]?.name || saved?.option?.name || 'Custodia',
    rendererId: override || (staleFixedSave || awaitingClientChoice ? displayOption?.rendererId : undefined) || option?.rendererId || saved?.configuration?.modelId || displayOption?.rendererId,
  };
}

/** An unambiguous fixed offer is already selected, on both desktop and mobile. */
export function initialMockupSelection(payload: MockupPayload | undefined): MockupSelection | undefined {
  const offer = payload?.offer;
  const mode = payload?.modelMode ?? offer?.mode ?? (offer?.options.length === 1 ? 'fixed' : offer?.options.length ? 'choice' : undefined);
  if (mode === 'fixed') {
    const option = offer?.options[0];
    return option ? { labId: option.labId, modelId: option.id } : undefined;
  }
  if (needsClientModelChoice(payload)) return undefined;

  const savedSelection = payload?.saved?.selection;
  return savedSelection && (!offer || optionFor(offer, savedSelection)) ? savedSelection : undefined;
}