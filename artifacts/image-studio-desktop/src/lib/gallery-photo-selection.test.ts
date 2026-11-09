import { describe, expect, it } from 'vitest';
import { assignPhotoIdsInBatches, mergePhotoSelection, photoSelectionRange } from './gallery-photo-selection';

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

  it('assigns all photos in API-safe batches with continuous chapter positions', async () => {
    const ids = Array.from({ length: 1_001 }, (_, index) => `photo-${index}`);
    const batches: Array<{ photoIds: string[]; chapterId: string | null; positionOffset: number }> = [];

    const assigned = await assignPhotoIdsInBatches(ids, 'chapter', async batch => {
      batches.push(batch);
    });

    expect(assigned).toBe(1_001);
    expect(batches.map(batch => batch.photoIds.length)).toEqual([450, 450, 101]);
    expect(batches.map(batch => batch.positionOffset)).toEqual([0, 450, 900]);
    expect(batches.flatMap(batch => batch.photoIds)).toEqual(ids);
  });

  it('does not continue with later batches after a request fails', async () => {
    const offsets: number[] = [];

    await expect(assignPhotoIdsInBatches(['a', 'b', 'c'], null, async batch => {
      offsets.push(batch.positionOffset);
      if (batch.positionOffset === 1) throw new Error('rete assente');
    }, 1)).rejects.toThrow('rete assente');

    expect(offsets).toEqual([0, 1]);
  });
});