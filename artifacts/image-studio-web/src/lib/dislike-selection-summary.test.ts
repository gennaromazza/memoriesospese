import { describe, expect, it } from 'vitest';
import { getDislikeSelectionSummary } from './dislike-selection-summary';

describe('getDislikeSelectionSummary', () => {
  const photos = [
    { id: 'kept', chapterId: 'included' },
    { id: 'disliked', chapterId: 'included' },
    { id: 'out-of-scope', chapterId: 'excluded' },
  ];
  const chapters = [
    { id: 'included' },
    { id: 'excluded', excludeFromSelection: true },
  ];

  it('counts currently unselected photos without counting excluded chapters', () => {
    expect(getDislikeSelectionSummary(
      { selectionMode: 'dislike', selectionStatus: 'completed', chapters },
      photos,
      new Set(['kept']),
    )).toEqual({ excludedCount: 1, isRecorded: false });
  });

  it('counts newly added photos only as currently not included', () => {
    expect(getDislikeSelectionSummary(
      { selectionMode: 'dislike', selectionStatus: 'completed', chapters },
      [...photos, { id: 'new-photo', chapterId: 'included' }],
      new Set(['kept']),
    )).toEqual({ excludedCount: 2, isRecorded: false });
  });

  it('keeps the original zero or positive count despite changes in current photos', () => {
    for (const count of [0, 2]) {
      expect(getDislikeSelectionSummary(
        { selectionMode: 'dislike', selectionStatus: 'completed', chapters, dislikedPhotoCount: count },
        [...photos, { id: 'new-photo', chapterId: 'included' }],
        new Set(['kept']),
      )).toEqual({ excludedCount: count, isRecorded: true });
    }
  });

  it('does not treat an invalid legacy value as a recorded count', () => {
    expect(getDislikeSelectionSummary(
      { selectionMode: 'dislike', selectionStatus: 'completed', dislikedPhotoCount: -1 },
      photos,
      new Set(['kept']),
    )).toEqual({ excludedCount: 2, isRecorded: false });
  });

  it('hides the summary for pending or regular selections', () => {
    expect(getDislikeSelectionSummary(
      { selectionMode: 'dislike', selectionStatus: 'pending' },
      photos,
      new Set(),
    )).toBeNull();
    expect(getDislikeSelectionSummary(
      { selectionMode: 'like', selectionStatus: 'completed' },
      photos,
      new Set(),
    )).toBeNull();
  });
});
