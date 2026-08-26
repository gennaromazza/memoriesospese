import type { Gallery } from "@/lib/galleries";

export type GalleryTypeFilter = "all" | "generic" | "special";
export type SelectionFilter = "all" | "approved";

export interface AdminGalleryFilters {
  searchQuery: string;
  galleryTypeFilter: GalleryTypeFilter;
  selectionFilter: SelectionFilter;
  galleryJobTypeFilter: string;
}

/** Applica i filtri già disponibili nella sezione Gallerie dell'admin. */
export function filterAdminGalleries(
  galleries: readonly Gallery[],
  {
    searchQuery,
    galleryTypeFilter,
    selectionFilter,
    galleryJobTypeFilter,
  }: AdminGalleryFilters,
): Gallery[] {
  return galleries.filter((gallery) => {
    // Escludi gallerie senza dati essenziali (documenti vuoti in Firebase).
    if (!gallery.name && !gallery.code) return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        (gallery.name?.toLowerCase() || "").includes(query) ||
        (gallery.code?.toLowerCase() || "").includes(query) ||
        (gallery.date?.toLowerCase() || "").includes(query);
      if (!matchesSearch) return false;
    }

    if (
      selectionFilter === "approved" &&
      gallery.selectionStatus !== "completed"
    ) {
      return false;
    }

    if (galleryTypeFilter === "generic" && !!gallery.specialTheme) {
      return false;
    }

    if (galleryTypeFilter === "special" && !gallery.specialTheme) {
      return false;
    }

    if (galleryJobTypeFilter !== "all") {
      const galleryJobType = gallery.jobType;
      if (galleryJobTypeFilter === "none") {
        if (galleryJobType) return false;
      } else if (galleryJobType !== galleryJobTypeFilter) {
        return false;
      }
    }

    return true;
  });
}
