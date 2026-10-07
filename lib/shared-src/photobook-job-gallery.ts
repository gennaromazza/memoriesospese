export interface PhotobookGalleryChoice {
  id: string;
}

export interface PhotobookJobGallerySelection {
  galleryIds?: readonly unknown[] | null;
}

/**
 * Sceglie la galleria da usare quando l'admin seleziona un Job nel dialogo
 * di creazione del fotolibro.
 *
 * La galleria già selezionata viene mantenuta solo se appartiene al Job.
 * Se il catalogo gallerie non è ancora arrivato, restituisce una stringa
 * vuota: lo stesso calcolo verrà ripetuto quando i dati saranno disponibili.
 */
export function selectPhotobookGalleryForJob(
  job: PhotobookJobGallerySelection | null | undefined,
  galleries: readonly PhotobookGalleryChoice[],
  currentGalleryId = '',
): string {
  const linkedGalleryIds = new Set(
    (Array.isArray(job?.galleryIds) ? job.galleryIds : []).filter(
      (id): id is string => typeof id === 'string' && Boolean(id),
    ),
  );

  if (currentGalleryId && linkedGalleryIds.has(currentGalleryId)) {
    return currentGalleryId;
  }

  return galleries.find((gallery) => linkedGalleryIds.has(gallery.id))?.id || '';
}

export function photobookJobHasLinkedGalleries(
  job: PhotobookJobGallerySelection | null | undefined,
): boolean {
  return Array.isArray(job?.galleryIds) && job.galleryIds.length > 0;
}