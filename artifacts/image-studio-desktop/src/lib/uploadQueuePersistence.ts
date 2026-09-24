import type { UploadItem } from './uploadQueue';

export function restoreUploadQueue(raw: string | null): UploadItem[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is UploadItem =>
      item && typeof item === 'object' && typeof item.id === 'string' &&
      typeof item.galleryId === 'string' && typeof item.fileName === 'string' &&
      typeof item.relativePath === 'string' && typeof item.status === 'string'
    ).map(item => ({
      ...item,
      fileObj: undefined,
      // File objects cannot survive a browser restart. Native files remain
      // resumable through absolutePath; browser files need to be re-selected.
      error: !item.absolutePath && item.status !== 'success' && item.status !== 'duplicate'
        ? 'Browser file unavailable after restart; please select it again'
        : item.error,
      status: item.status === 'hashing' || item.status === 'uploading' || item.status === 'pending'
        ? 'paused' as const : item.status,
    }));
  } catch {
    return [];
  }
}

export function serializeUploadQueue(items: UploadItem[]): string {
  return JSON.stringify(items.map(({ fileObj: _fileObj, ...rest }) => rest));
}

export function resumeUploadItem(items: UploadItem[], id: string): UploadItem[] {
  return items.map(item => {
    if (item.id !== id || (item.status !== 'paused' && item.status !== 'error')) return item;
    if (!item.absolutePath && !item.fileObj) {
      return { ...item, status: 'error' as const, error: 'Browser file unavailable after restart; please select it again' };
    }
    return { ...item, status: 'pending' as const, error: undefined };
  });
}