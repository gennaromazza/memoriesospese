type SelectionStatus = "pending" | "completed" | undefined;

export function shouldShowSelectedPhotoReview(
  selectionEnabled: boolean,
  selectionStatus: SelectionStatus,
  selectedPhotoIds: readonly string[],
): boolean {
  return selectionEnabled && selectionStatus === "completed" && selectedPhotoIds.length > 0;
}

export function getMissingSelectionReviewPhotoIds({
  selectionEnabled,
  selectionStatus,
  selectedPhotoIds,
  photoAssignments,
  loadedPhotoIds,
}: {
  selectionEnabled: boolean;
  selectionStatus: SelectionStatus;
  selectedPhotoIds: readonly string[];
  photoAssignments?: Record<string, readonly string[]>;
  loadedPhotoIds: readonly string[];
}): string[] {
  if (!selectionEnabled || selectionStatus !== "completed") return [];

  const requiredIds = new Set(selectedPhotoIds.filter(Boolean));
  for (const [photoId, assignedProducts] of Object.entries(photoAssignments ?? {})) {
    if (photoId && assignedProducts.length > 0) requiredIds.add(photoId);
  }

  const loadedIds = new Set(loadedPhotoIds);
  return [...requiredIds].filter(photoId => !loadedIds.has(photoId));
}
