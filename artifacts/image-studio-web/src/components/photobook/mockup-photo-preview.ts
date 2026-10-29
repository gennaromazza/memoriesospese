export const MAX_MOCKUP_PREVIEW_BYTES = 4 * 1024 * 1024;
const PREVIEW_EDGE_SIZES = [2048, 1600, 1280, 1024, 800];
const JPEG_QUALITIES = [0.82, 0.72, 0.62, 0.52];

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Il browser non è riuscito a preparare l’anteprima.')),
      'image/jpeg',
      quality,
    );
  });
}

/** Create a lightweight, orientation-correct preview; print originals are uploaded separately after confirmation. */
export async function prepareMockupPhotoPreview(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Non riesco a leggere questa foto per preparare l’anteprima. Prova a salvarla come JPEG.');
  }

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
    throw new Error('Il browser non supporta la preparazione dell’anteprima della foto.');
  }

  try {
    for (const maxEdge of PREVIEW_EDGE_SIZES) {
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      for (const quality of JPEG_QUALITIES) {
        const preview = await toJpeg(canvas, quality);
        if (preview.size <= MAX_MOCKUP_PREVIEW_BYTES) {
          const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
          return new File([preview], name, { type: 'image/jpeg', lastModified: file.lastModified });
        }
      }
    }
  } finally {
    bitmap.close();
    canvas.width = 0;
    canvas.height = 0;
  }

  throw new Error('Non riesco a ridurre la foto a un’anteprima abbastanza leggera. Prova a esportare una copia JPEG.');
}
