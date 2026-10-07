interface DislikeSelectionGallery {
  selectionMode?: 'like' | 'dislike';
  selectionStatus?: 'pending' | 'completed';
  dislikedPhotoCount?: number;
  chapters?: ReadonlyArray<{ id: string; excludeFromSelection?: boolean }>;
}

interface SelectionPhoto {
  id: string;
  chapterId?: string | null;
}

export function getDislikeSelectionSummary(
  gallery: DislikeSelectionGallery,
  photos: readonly SelectionPhoto[],
  selectedIds: ReadonlySet<string>,
): { excludedCount: number; isRecorded: boolean } | null {
  if (gallery.selectionMode !== 'dislike' || gallery.selectionStatus !== 'completed') {
    return null;
  }

  if (Number.isSafeInteger(gallery.dislikedPhotoCount) && gallery.dislikedPhotoCount! >= 0) {
    return { excludedCount: gallery.dislikedPhotoCount!, isRecorded: true };
  }

  // Per le selezioni storiche la differenza sulle foto presenti oggi è solo una stima.
  const excludedChapters = new Set(
    (gallery.chapters || []).filter(chapter => chapter.excludeFromSelection).map(chapter => chapter.id),
  );
  const excludedCount = photos.filter(
    photo => !excludedChapters.has(photo.chapterId || '') && !selectedIds.has(photo.id),
  ).length;
  return { excludedCount, isRecorded: false };
}
