import React, { createContext, useContext, useState, ReactNode, useEffect, useRef, useMemo } from 'react';
import { fetchApi } from './api';
import { restoreUploadQueue, serializeUploadQueue, resumeUploadItem } from './uploadQueuePersistence';

export type UploadStatus = 'pending' | 'hashing' | 'uploading' | 'paused' | 'success' | 'duplicate' | 'error';
export interface UploadItem {
  id: string; fileName: string; relativePath: string; absolutePath?: string;
  chapterName: string; size: number; hash?: string; status: UploadStatus;
  progress: number; retries: number; error?: string; galleryId: string;
  fileObj?: File; contentType?: string;
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
  const resumeItem = (id: string) => setItems(prev => resumeUploadItem(prev, id));
  const retryItem = (id: string) => updateItem(id, { status: 'pending', error: undefined, retries: 0 });

  const processItem = async (item: UploadItem) => {
    const controller = new AbortController(); controllers.current.set(item.id, controller);
    const current = () => itemsRef.current.find(i => i.id === item.id);
    try {
      updateItem(item.id, { status: 'hashing', error: undefined });
      let hash = item.hash;
      if (!hash) {
        if (item.absolutePath && window.imageStudioDesktop?.hashFile) hash = await window.imageStudioDesktop.hashFile(item.absolutePath);
        else if (item.fileObj) hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await item.fileObj.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
        else throw new Error('Browser file unavailable after restart; please select it again');
        if (controller.signal.aborted || current()?.status === 'paused') return;
        updateItem(item.id, { hash });
      }
      const contentType = mimeFor(item.fileName, item.contentType);
      if (!contentType) throw new Error(`Unsupported image format: ${item.fileName}`);
      updateItem(item.id, { status: 'uploading', progress: 0, contentType });
      const session = await fetchApi<any>(`/galleries/${item.galleryId}/upload-sessions`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ fileName: item.fileName, relativePath: item.relativePath,
          chapterName: item.chapterName, size: item.size, contentHash: hash, contentType }),
      });
      if (controller.signal.aborted || current()?.status === 'paused') return;
      if (session.uploadUrl) {
        const progress = (p: number) => updateItem(item.id, { progress: Math.round(p * 0.9) });
        if (item.absolutePath && window.imageStudioDesktop?.uploadFile) {
          await window.imageStudioDesktop.uploadFile({ requestId: item.id, filePath: item.absolutePath, uploadUrl: session.uploadUrl, contentType },
            ({ progress: p }) => progress(p));
        } else if (item.fileObj) await browserUpload(session.uploadUrl, item.fileObj, contentType, controller.signal, progress);
        else throw new Error('No file object or native uploader available');
      }
      if (controller.signal.aborted || current()?.status === 'paused') return;
      if (!session.storagePath) throw new Error('Upload session did not return a storage path');
      updateItem(item.id, { progress: 95 });
      await fetchApi(`/galleries/${item.galleryId}/photos/finalize`, {
        method: 'POST', signal: controller.signal, body: JSON.stringify({ storagePath: session.storagePath, name: item.fileName, originalName: item.fileName,
          contentHash: hash, size: item.size, contentType, chapterName: item.chapterName }),
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
    } finally { controllers.current.delete(item.id); }
  };
  useEffect(() => {
    const active = items.filter(i => i.status === 'hashing' || i.status === 'uploading').length;
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