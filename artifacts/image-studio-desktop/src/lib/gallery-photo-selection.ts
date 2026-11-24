export function photoSelectionRange(photoIds: string[], anchorId: string, targetId: string): string[] {
  const anchorIndex = photoIds.indexOf(anchorId);
  const targetIndex = photoIds.indexOf(targetId);
  if (anchorIndex < 0 || targetIndex < 0) return targetIndex < 0 ? [] : [targetId];

  const start = Math.min(anchorIndex, targetIndex);
  const end = Math.max(anchorIndex, targetIndex);
  return photoIds.slice(start, end + 1);
}

export function mergePhotoSelection(selectedIds: string[], addedIds: string[]): string[] {
  return [...new Set([...selectedIds, ...addedIds])];
}

export async function assignPhotoIdsInBatches(
  photoIds: string[],
  chapterId: string | null,
  assignBatch: (batch: { photoIds: string[]; chapterId: string | null; positionOffset: number }) => Promise<unknown>,
  batchSize = 450,
): Promise<number> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 450) {
    throw new Error('La dimensione del blocco deve essere compresa tra 1 e 450.');
  }

  for (let offset = 0; offset < photoIds.length; offset += batchSize) {
    await assignBatch({
      photoIds: photoIds.slice(offset, offset + batchSize),
      chapterId,
      positionOffset: offset,
    });
  }

  return photoIds.length;
}