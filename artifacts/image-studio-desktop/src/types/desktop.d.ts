export {};

export type DesktopUpdateStatus = {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
};

declare global {
  interface DesktopSelectedFile {
    absolutePath: string;
    relativePath: string;
    fileName: string;
    chapterName: string | null;
    size: number;
    lastModified: number;
  }

  interface Window {
    imageStudioDesktop?: {
      platform: string;
      selectFolder(): Promise<DesktopSelectedFile[]>;
      hashFile(filePath: string): Promise<string>;
      readFile?(filePath: string): Promise<{ bytes: Uint8Array; size: number; lastModified: number }>;
      uploadFile(
        request: {
          requestId: string;
          filePath: string;
          uploadUrl: string;
          contentType: string;
        },
        onProgress: (progress: { loaded: number; total: number; progress: number }) => void,
      ): Promise<{ success: boolean; size: number }>;
       cancelUpload(requestId: string): Promise<{ success: boolean }>;
      openExternal(url: string): Promise<void>;
      getUpdateStatus(): Promise<DesktopUpdateStatus>;
      checkForUpdates(): Promise<DesktopUpdateStatus>;
      setUpdateWorkCount(count: number): Promise<void>;
      installUpdate(): Promise<{ installed: boolean; reason?: 'not-ready' | 'busy' | 'failed' }>;
      onUpdateStatus(listener: (status: DesktopUpdateStatus) => void): () => void;
    };
  }
}