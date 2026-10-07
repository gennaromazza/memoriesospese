type GalleryPageState = "loading" | "ready" | "not-found" | "error";

export function getGalleryPageState({
  lookupStatus,
  fetchStatus,
  hasGallery,
  isLoadingPhotos,
}: {
  lookupStatus: "pending" | "success" | "error";
  fetchStatus: "fetching" | "paused" | "idle";
  hasGallery: boolean;
  isLoadingPhotos: boolean;
}): GalleryPageState {
  // A disabled photo query is not loading while the gallery lookup is pending.
  // Cached absence must also wait for an in-flight or paused revalidation.
  if (lookupStatus === "pending" || (!hasGallery && fetchStatus !== "idle") ||
      (hasGallery && isLoadingPhotos)) return "loading";
  if (hasGallery) return "ready";
  return lookupStatus === "error" ? "error" : "not-found";
}