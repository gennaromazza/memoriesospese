import type { MockupConfiguration } from '@shared/mockup-types';

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
