import { describe, expect, it } from 'vitest';
import { mergePhotoSelection, photoSelectionRange } from './gallery-photo-selection';

describe('gallery photo selection', () => {
  const orderedIds = ['photo-a', 'photo-b', 'photo-c', 'photo-d'];

  it('selects every photo between the anchor and target in either direction', () => {
    expect(photoSelectionRange(orderedIds, 'photo-a', 'photo-c'))
      .toEqual(['photo-a', 'photo-b', 'photo-c']);
    expect(photoSelectionRange(orderedIds, 'photo-d', 'photo-b'))
      .toEqual(['photo-b', 'photo-c', 'photo-d']);
  });

  it('adds the range without duplicating existing selections', () => {
    expect(mergePhotoSelection(['photo-a', 'photo-d'], ['photo-a', 'photo-b', 'photo-c']))
      .toEqual(['photo-a', 'photo-d', 'photo-b', 'photo-c']);
  });

  it('does not select a range if the anchor or target is not visible', () => {
    expect(photoSelectionRange(orderedIds, 'photo-missing', 'photo-b')).toEqual(['photo-b']);
    expect(photoSelectionRange(orderedIds, 'photo-a', 'photo-missing')).toEqual([]);
  });
});