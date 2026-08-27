/**
 * Template email per la copia della selezione fotografica richiesta dal cliente.
 * Palette October Mist: sage #8b9a7d, terracotta #c4724a, cream #f5f0e8.
 */

export interface GallerySelectionCopyPhoto {
  url: string;
  name?: string;
}

export interface GallerySelectionCopyParams {
  galleryName: string;
  galleryUrl: string;
  selectedPhotos: GallerySelectionCopyPhoto[];
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function generateGallerySelectionCopyEmail(
  params: GallerySelectionCopyParams,
): string {
  const { galleryName, galleryUrl, selectedPhotos } = params;
  const photoCount = selectedPhotos.length;
  const maxPhotos = Math.min(photoCount, 30);
  const photosToShow = selectedPhotos.slice(0, maxPhotos);

  const thumbnailsHtml = photosToShow
    .map((photo, index) => {
      const photoName = photo.name?.trim() || `Foto ${index + 1}`;

      return `
        <div style="display:inline-block;vertical-align:middle;margin:6px;padding:6px;background:#ffffff;border:1px solid #e8e0d4;border-radius:8px;line-height:0;">
          <img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photoName)}" style="display:block;width:auto;height:auto;max-width:140px;max-height:140px;margin:0 auto;border-radius:6px;object-fit:contain;" />
        </div>
      `;
    })
    .join("");

  const morePhotosText =
    photoCount > maxPhotos
      ? `<p style="text-align:center;color:#6b7d8a;font-size:13px;margin-top:15px;">...e altre ${photoCount - maxPhotos} foto</p>`
      : "";

  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background-color:#faf8f5;">
      <div style="background:linear-gradient(135deg,#8b9a7d 0%,#a8c5b5 100%);color:white;padding:30px;text-align:center;border-radius:12px 12px 0 0;">
        <h1 style="margin:0;font-size:24px;font-weight:600;">Le tue Foto Selezionate</h1>
        <p style="margin:8px 0 0 0;font-size:14px;opacity:0.9;">Galleria: ${escapeHtml(galleryName)}</p>
      </div>

      <div style="background:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 6px rgba(0,0,0,0.08);">
        <p style="font-size:16px;color:#333;margin-bottom:15px;">
          Ecco il riepilogo delle foto che hai selezionato:
        </p>

        <div style="background:#f5f0e8;padding:20px;border-radius:8px;margin:20px 0;text-align:center;border:1px solid #e8e0d4;">
          <p style="font-size:14px;color:#6b7d8a;margin-bottom:8px;">Foto selezionate</p>
          <p style="font-size:42px;font-weight:bold;color:#c4724a;margin:10px 0;">${photoCount}</p>
        </div>

        <div style="background:#f5f0e8;padding:20px;border-radius:8px;margin:25px 0;border:1px solid #e8e0d4;">
          <p style="font-size:14px;color:#6b7d5a;margin-bottom:15px;font-weight:600;">Anteprima foto:</p>
          <div style="text-align:center;">
            ${thumbnailsHtml}
          </div>
          ${morePhotosText}
        </div>

        <div style="text-align:center;margin:30px 0;">
          <a href="${escapeHtml(galleryUrl)}"
             style="background:linear-gradient(135deg,#8b9a7d 0%,#6b7d5a 100%);color:white;padding:14px 35px;text-decoration:none;border-radius:8px;font-weight:600;display:inline-block;font-size:15px;box-shadow:0 4px 12px rgba(139,154,125,0.3);">
            Visualizza la Galleria
          </a>
        </div>

        <div style="background:#f5f0e8;padding:15px 20px;border-radius:8px;margin:25px 0;">
          <p style="margin:0;font-size:13px;color:#6b7d8a;line-height:1.5;">
            <strong>Nota:</strong> Questa email è una copia di conferma della tua selezione.
            Le foto in alta risoluzione sono disponibili nella galleria online.
          </p>
        </div>
      </div>

      <div style="text-align:center;color:#6b7d8a;font-size:12px;margin-top:25px;padding-top:20px;">
        <p style="margin:5px 0;font-weight:600;color:#8b9a7d;">Image Studio Fotografico</p>
        <p style="margin:5px 0;">Email: image.studio.fotografico@gmail.com</p>
      </div>
    </div>
  `;
}
