import { apiRequest } from "./queryClient";

export interface ThumbnailRunResult {
  success: boolean;
  totalMissing: number;
  processed: number;
  generated: number;
  failed: number;
  remaining: number;
}

export interface ThumbnailProgress {
  generated: number;
  remaining: number;
  failed: number;
}

/**
 * Genera le miniature mancanti di una galleria chiamando ripetutamente
 * l'endpoint admin finché non resta nulla da fare (o non si fanno più progressi).
 *
 * @param galleryId id della galleria
 * @param onProgress callback chiamato dopo ogni batch con i totali cumulativi
 * @param limit numero di foto per chiamata (default lato server: 120)
 */
export async function generateGalleryThumbnails(
  galleryId: string,
  onProgress?: (p: ThumbnailProgress) => void,
  limit?: number,
): Promise<ThumbnailProgress> {
  let totalGenerated = 0;
  let totalFailed = 0;
  let remaining = 0;

  // Massimo numero di iterazioni di sicurezza per evitare loop infiniti
  const MAX_ITERATIONS = 1000;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const res = await apiRequest(
      "POST",
      `/api/admin/galleries/${galleryId}/generate-thumbnails`,
      limit ? { limit } : {},
    );
    const data: ThumbnailRunResult = await res.json();

    totalGenerated += data.generated;
    totalFailed += data.failed;
    remaining = data.remaining;

    onProgress?.({ generated: totalGenerated, remaining, failed: totalFailed });

    // Stop se non resta nulla, oppure se in questo batch non si è generato nulla
    // (le restanti foto falliscono ripetutamente: evita loop infinito).
    if (remaining === 0 || data.generated === 0) break;
  }

  return { generated: totalGenerated, remaining, failed: totalFailed };
}
