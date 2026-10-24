import type { MockupConfiguration, SavedMockup } from '@shared/mockup-types';
import type { MockupSelection } from '@shared/mockup-workflow';

export function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

/** Renderer notifications are not edits unless the persisted configuration or model differs. */
export function hasUnsavedMockupChanges(configuration: MockupConfiguration, saved: SavedMockup | null | undefined, selection: MockupSelection | undefined, initializing = false): boolean {
  if (!saved) return !initializing;
  return stableSerialize(configuration) !== stableSerialize(saved.configuration)
    || stableSerialize(selection ?? null) !== stableSerialize(saved.selection ?? null);
}
