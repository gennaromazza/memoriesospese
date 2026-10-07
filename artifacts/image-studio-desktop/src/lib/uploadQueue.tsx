import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useMemo } from 'react';
import { fetchApi } from './api';
import { restoreUploadQueue, serializeUploadQueue, resumeUploadItem } from './uploadQueuePersistence';
import { compressGalleryUpload } from './uploadCompression';

export type UploadStatus = 'pending' | 'compressing' | 'hashing' | 'uploading' | 'paused' | 'success' | 'duplicate' | 'error';
export interface UploadItem {
  id: string; fileName: string; relativePath: string; absolutePath?: string;
  chapterName: string; size: number; hash?: string; status: UploadStatus;
  progress: number; retries: number; error?: string; galleryId: string;
  fileObj?: File; contentType?: string;
  /** Byte size actually sent to Storage (after compression). */
  uploadSize?: number;
  /** Non-blocking note shown to the operator (e.g. compression fallback). */
  warning?: string;
}
interface UploadQueueState {
  items: UploadItem[]; concurrency: number; aggregateProgress: number;
  addItem: (item: Omit<UploadItem, 'id' | 'status' | 'progress' | 'retries'>) => void;
  updateItem: (id: string, updates: Partial<UploadItem>) => void;
  removeItem: (id: string) => void; setConcurrency: (val: number) => void;
  clearCompleted: () => void; pauseItem: (id: string) => void;
  resumeItem: (id: string) => void; retryItem: (id: string) => void;
}
const empty: UploadQueueState = {
  items: [], concurrency: 3, aggregateProgress: 0, addItem: () => {}, updateItem: () => {},
  removeItem: () => {}, setConcurrency: () => {}, clearCompleted: () => {},
  pauseItem: () => {}, resumeItem: () => {}, retryItem: () => {},
};
const UploadQueueContext = createContext<UploadQueueState>(empty);
const mimeFor = (name: string, supplied?: string) => supplied || ({
  png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic',
  heif: 'image/heif',
  jpg: 'image/jpeg', jpeg: 'image/jpeg',
} as Record<string, string>)[name.split('.').pop()?.toLowerCase() || ''];

function browserUpload(url: string, file: File, contentType: string, signal: AbortSignal,
  onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    signal.addEventListener('abort', abort, { once: true });
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload to storage failed: ${xhr.status}`));
    xhr.onerror = () => reject(new Error('Upload to storage failed'));
    xhr.onabort = () => reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.send(file);
  });
}

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>(() => restoreUploadQueue(localStorage.getItem('uploadQueue')));
  const [concurrency, setConcurrencyState] = useState(() => Math.max(1, Math.min(8, Number(localStorage.getItem('uploadConcurrency')) || 3)));
  const itemsRef = useRef(items); itemsRef.current = items;
  const controllers = useRef(new Map<string, AbortController>());
  useEffect(() => { localStorage.setItem('uploadQueue', serializeUploadQueue(items)); }, [items]);
  const updateItem = (id: string, updates: Partial<UploadItem>) => setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  const setConcurrency = (value: number) => {
    const val = Math.max(1, Math.min(8, Math.round(value) || 1));
    setConcurrencyState(val); localStorage.setItem('uploadConcurrency', String(val));
  };
  const addItem = (item: Omit<UploadItem, 'id' | 'status' | 'progress' | 'retries'>) =>
    setItems(prev => [...prev, { ...item, id: crypto.randomUUID(), status: 'pending', progress: 0, retries: 0 }]);
  const removeItem = (id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems(prev => prev.filter(i => i.id !== id));
  };
  const clearCompleted = () => setItems(prev => prev.filter(i => i.status !== 'success' && i.status !== 'duplicate'));
  const pauseItem = (id: string) => {
    controllers.current.get(id)?.abort();
    // Native abort is a real transfer cancellation; resume starts a new transfer.
    void window.imageStudioDesktop?.cancelUpload(id).catch(() => undefined);
    updateItem(id, { status: 'paused' });
  };
  // Resume waits for the previous run to settle: while its controller is still
  // registered the old read/compression has not exited yet.
  const resumeItem = (id: string) => {
    if (controllers.current.has(id)) return;
    setItems(prev => resumeUploadItem(prev, id));
  };
  const retryItem = (id: string) => updateItem(id, { status: 'pending', error: undefined, retries: 0 });

  // Load the original bytes as a File: browser selections already have one,
  // native folder selections are read through the Electron bridge.
  const loadSourceFile = async (item: UploadItem): Promise<File> => {
    if (item.fileObj) return item.fileObj;
    if (item.absolutePath && window.imageStudioDesktop?.readFile) {
      const { bytes, lastModified } = await window.imageStudioDesktop.readFile(item.absolutePath);
      const type = mimeFor(item.fileName, item.contentType) || 'application/octet-stream';
      return new File([new Blob([bytes as BlobPart])], item.fileName, { type, lastModified });
    }
    if (item.absolutePath) throw new Error('Aggiorna l\'app desktop: la compressione richiede la versione più recente');
    throw new Error('Browser file unavailable after restart; please select it again');
  };

  const processItem = async (item: UploadItem) => {
    const controller = new AbortController(); controllers.current.set(item.id, controller);
    const current = () => itemsRef.current.find(i => i.id === item.id);
    const interrupted = () => controller.signal.aborted || current()?.status === 'paused';
    try {
      if (!mimeFor(item.fileName, item.contentType)) throw new Error(`Unsupported image format: ${item.fileName}`);
      // Same pipeline as the web gallery: compress first, then hash and upload
      // exactly the compressed bytes so the server-side size/hash checks match.
      updateItem(item.id, { status: 'compressing', error: undefined, warning: undefined, progress: 0 });
      const source = await loadSourceFile(item);
      if (interrupted()) return;
      const prepared = await compressGalleryUpload(source, controller.signal);
      if (interrupted()) return;
      const upload = prepared.file;
      const contentType = upload.type || mimeFor(item.fileName, item.contentType);
      updateItem(item.id, { status: 'hashing', uploadSize: upload.size, contentType, warning: prepared.warning });
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await upload.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
      if (interrupted()) return;
      updateItem(item.id, { hash, status: 'uploading', progress: 0 });
      const session = await fetchApi<any>(`/galleries/${item.galleryId}/upload-sessions`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ fileName: item.fileName, relativePath: item.relativePath,
          chapterName: item.chapterName, size: upload.size, contentHash: hash, contentType }),
      });
      if (interrupted()) return;
      if (session.uploadUrl) {
        const progress = (p: number) => updateItem(item.id, { progress: Math.round(p * 0.9) });
        await browserUpload(session.uploadUrl, upload, contentType, controller.signal, progress);
      }
      if (interrupted()) return;
      if (!session.storagePath) throw new Error('Upload session did not return a storage path');
      updateItem(item.id, { progress: 95 });
      await fetchApi(`/galleries/${item.galleryId}/photos/finalize`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ storagePath: session.storagePath, name: item.fileName, originalName: item.fileName,
          contentHash: hash, size: upload.size, contentType, chapterName: item.chapterName }),
      });
      updateItem(item.id, { status: 'success', progress: 100, error: undefined });
    } catch (err: any) {
      if (controller.signal.aborted || err?.name === 'AbortError' || current()?.status === 'paused') return;
      const message = err instanceof Error ? err.message : String(err);
      if (/409|duplicate/i.test(message)) updateItem(item.id, { status: 'duplicate', progress: 100, error: undefined });
      else {
        const retries = (current()?.retries || 0) + 1;
        updateItem(item.id, retries <= 3 ? { status: 'pending', retries, error: message } : { status: 'error', retries, error: message });
      }
    } finally {
      // A paused item may already have been resumed with a fresh controller.
      if (controllers.current.get(item.id) === controller) controllers.current.delete(item.id);
    }
  };
  useEffect(() => {
    const active = items.filter(i => i.status === 'compressing' || i.status === 'hashing' || i.status === 'uploading').length;
    items.filter(i => i.status === 'pending').slice(0, Math.max(0, concurrency - active)).forEach(processItem);
  }, [items, concurrency]);
  const aggregateProgress = useMemo(() => {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.size), 0);
    return total ? Math.round(items.reduce((sum, item) =>
      sum + Math.max(0, item.size) * Math.max(0, Math.min(100, item.progress)), 0) / total) : 0;
  }, [items]);
  return <UploadQueueContext.Provider value={{ items, concurrency, aggregateProgress, addItem, updateItem, removeItem, setConcurrency, clearCompleted, pauseItem, resumeItem, retryItem }}>{children}</UploadQueueContext.Provider>;
}
export function useUploadQueue() { return useContext(UploadQueueContext); }