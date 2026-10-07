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