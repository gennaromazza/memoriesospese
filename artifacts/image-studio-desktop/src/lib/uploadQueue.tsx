import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { fetchApi } from './api';

export type UploadStatus = 'pending' | 'hashing' | 'uploading' | 'paused' | 'success' | 'duplicate' | 'error';

export interface UploadItem {
  id: string;
  fileName: string;
  relativePath: string;
  absolutePath?: string;
  chapterName: string;
  size: number;
  hash?: string;
  status: UploadStatus;
  progress: number;
  retries: number;
  error?: string;
  galleryId: string;
  fileObj?: File;
  contentType?: string;
}

interface UploadQueueState {
  items: UploadItem[];
  concurrency: number;
  addItem: (item: Omit<UploadItem, 'id' | 'status' | 'progress' | 'retries'>) => void;
  updateItem: (id: string, updates: Partial<UploadItem>) => void;
  removeItem: (id: string) => void;
  setConcurrency: (val: number) => void;
  clearCompleted: () => void;
  pauseItem: (id: string) => void;
  resumeItem: (id: string) => void;
  retryItem: (id: string) => void;
}

const UploadQueueContext = createContext<UploadQueueState>({
  items: [],
  concurrency: 3,
  addItem: () => {},
  updateItem: () => {},
  removeItem: () => {},
  setConcurrency: () => {},
  clearCompleted: () => {},
  pauseItem: () => {},
  resumeItem: () => {},
  retryItem: () => {},
});

export function UploadQueueProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>(() => {
    const stored = localStorage.getItem('uploadQueue');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as UploadItem[];
        return parsed.map(i => ({
          ...i,
          status: (i.status === 'hashing' || i.status === 'uploading') ? 'paused' : i.status,
        }));
      } catch (e) {}
    }
    return [];
  });

  const [concurrency, setConcurrencyState] = useState(() => {
    const stored = localStorage.getItem('uploadConcurrency');
    return stored ? parseInt(stored, 10) || 3 : 3;
  });

  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const toSave = items.map(({ fileObj, ...rest }) => rest);
    localStorage.setItem('uploadQueue', JSON.stringify(toSave));
  }, [items]);

  const setConcurrency = (val: number) => {
    setConcurrencyState(val);
    localStorage.setItem('uploadConcurrency', val.toString());
  };

  const addItem = (item: Omit<UploadItem, 'id' | 'status' | 'progress' | 'retries'>) => {
    setItems(prev => [...prev, { ...item, id: Math.random().toString(36).substring(7), status: 'pending', progress: 0, retries: 0 }]);
  };

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...updates } : i));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const clearCompleted = () => {
    setItems(prev => prev.filter(i => i.status !== 'success' && i.status !== 'duplicate'));
  };

  const pauseItem = (id: string) => updateItem(id, { status: 'paused' });
  const resumeItem = (id: string) => {
    const it = itemsRef.current.find(i => i.id === id);
    if (it && (it.status === 'paused' || it.status === 'error')) {
      updateItem(id, { status: 'pending', error: undefined });
    }
  };
  const retryItem = (id: string) => {
    updateItem(id, { status: 'pending', error: undefined, retries: 0 });
  };

  const processItem = async (item: UploadItem) => {
    updateItem(item.id, { status: 'hashing' });
    try {
      let hash = item.hash;
      if (!hash) {
        if (window.imageStudioDesktop && window.imageStudioDesktop.hashFile && item.absolutePath) {
          hash = await window.imageStudioDesktop.hashFile(item.absolutePath);
        } else if (item.fileObj) {
          const buffer = await item.fileObj.arrayBuffer();
          const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
          hash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        } else {
          throw new Error('Cannot hash file');
        }
        
        if (itemsRef.current.find(i => i.id === item.id)?.status === 'paused') return;
        updateItem(item.id, { hash });
      }

      updateItem(item.id, { status: 'uploading', progress: 10 });
      
      const sessionRes = await fetchApi<any>(`/galleries/${item.galleryId}/upload-sessions`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: item.fileName,
          relativePath: item.relativePath,
          chapterName: item.chapterName,
          size: item.size,
          contentHash: hash,
          contentType: item.contentType || item.fileObj?.type || 'image/jpeg'
        })
      });

      if (itemsRef.current.find(i => i.id === item.id)?.status === 'paused') return;
      
      const signedUrl = sessionRes.uploadUrl;
      const storagePath = sessionRes.storagePath;
      
      if (signedUrl) {
        updateItem(item.id, { progress: 50 });
        if (window.imageStudioDesktop && window.imageStudioDesktop.uploadFile && item.absolutePath) {
          await window.imageStudioDesktop.uploadFile(
            {
              requestId: item.id,
              filePath: item.absolutePath,
              uploadUrl: signedUrl,
              contentType: item.contentType || 'image/jpeg',
            },
            ({ progress }) => updateItem(item.id, { progress }),
          );
        } else if (item.fileObj) {
          const res = await fetch(signedUrl, {
            method: 'PUT',
            body: item.fileObj
          });
          if (!res.ok) throw new Error(`Upload to storage failed: ${res.status}`);
        } else {
          throw new Error('No file object or native uploader available');
        }
      }

      if (itemsRef.current.find(i => i.id === item.id)?.status === 'paused') return;

      updateItem(item.id, { progress: 90 });
      await fetchApi(`/galleries/${item.galleryId}/photos/finalize`, {
        method: 'POST',
        body: JSON.stringify({
          storagePath,
          name: item.fileName,
          originalName: item.fileName,
          contentHash: hash,
          size: item.size,
          contentType: item.contentType || item.fileObj?.type || 'image/jpeg',
          chapterName: item.chapterName,
        })
      });

      updateItem(item.id, { status: 'success', progress: 100 });
    } catch (err: any) {
      if (err.message.includes('409')) {
        updateItem(item.id, { status: 'duplicate', progress: 100 });
      } else {
        const currentItem = itemsRef.current.find(i => i.id === item.id);
        if (currentItem && currentItem.status !== 'paused') {
          if (currentItem.retries < 3) {
            updateItem(item.id, { status: 'pending', retries: currentItem.retries + 1, error: err.message });
          } else {
            updateItem(item.id, { status: 'error', error: err.message });
          }
        }
      }
    }
  };

  useEffect(() => {
    const activeCount = items.filter(i => i.status === 'hashing' || i.status === 'uploading').length;
    const pendingItems = items.filter(i => i.status === 'pending');

    if (activeCount < concurrency && pendingItems.length > 0) {
      const toStart = pendingItems.slice(0, concurrency - activeCount);
      toStart.forEach(item => {
        processItem(item);
      });
    }
  }, [items, concurrency]);

  return (
    <UploadQueueContext.Provider value={{ items, concurrency, addItem, updateItem, removeItem, setConcurrency, clearCompleted, pauseItem, resumeItem, retryItem }}>
      {children}
    </UploadQueueContext.Provider>
  );
}

export function useUploadQueue() {
  return useContext(UploadQueueContext);
}
