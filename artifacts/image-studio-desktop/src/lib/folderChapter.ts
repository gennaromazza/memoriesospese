export function browserFolderChapter(relativePath: string): string {
  const parts = relativePath.split('/').filter(Boolean);
  return parts.length >= 3 ? parts[1] : 'Senza capitolo';
}

export function supportedUploadImage(name: string): boolean {
  return /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name);
}