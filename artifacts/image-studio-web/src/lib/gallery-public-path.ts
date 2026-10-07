/** Windows-created galleries may have no QR code; the public route also accepts the document ID. */
export function getGalleryPublicPath(galleryId: string, galleryCode?: string | null): string {
  const identifier = galleryCode?.trim() || galleryId;
  if (!identifier) throw new Error("Identificativo della galleria mancante");
  return `/gallery/${encodeURIComponent(identifier)}`;
}