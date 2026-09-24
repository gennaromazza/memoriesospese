const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("imageStudioDesktop", {
  platform: process.platform,
  selectFolder: () => ipcRenderer.invoke("desktop:select-folder"),
  hashFile: filePath => ipcRenderer.invoke("desktop:hash-file", filePath),
  readFile: filePath => ipcRenderer.invoke("desktop:read-file", filePath),
  uploadFile: (request, onProgress) => {
    const channel = `desktop:upload-progress:${request.requestId}`;
    const listener = (_event, progress) => onProgress(progress);
    ipcRenderer.on(channel, listener);
    return ipcRenderer.invoke("desktop:upload-file", request)
      .finally(() => ipcRenderer.removeListener(channel, listener));
  },
  cancelUpload: requestId => ipcRenderer.invoke("desktop:cancel-upload", requestId),
  openExternal: url => ipcRenderer.invoke("desktop:open-external", url),
});