export {};

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
    };
  }
}