/** Same size limit as the mockup upload API. Validate before sending any bytes. */
export const MAX_MOCKUP_PHOTO_BYTES = 20 * 1024 * 1024;

export function mockupUploadValidationError(file: Pick<File, 'name' | 'type' | 'size'>): string {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return 'Formato non supportato. Scegli una foto JPEG, PNG o WebP.';
  }
  if (file.size > MAX_MOCKUP_PHOTO_BYTES) {
    const size = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(file.size / (1024 * 1024));
    return `La foto “${file.name}” pesa ${size} MB e non è stata caricata. Il limite è 20 MB per file: scegli una versione più leggera.`;
  }
  return '';
}
