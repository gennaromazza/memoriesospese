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
  getUpdateStatus: () => ipcRenderer.invoke("desktop:update-status"),
  checkForUpdates: () => ipcRenderer.invoke("desktop:update-check"),
  setUpdateWorkCount: count => ipcRenderer.invoke("desktop:update-work-state", count),
  installUpdate: () => ipcRenderer.invoke("desktop:update-install"),
  onUpdateStatus: listener => {
    const handler = (_event, status) => listener(status);
    ipcRenderer.on("desktop:update-status", handler);
    return () => ipcRenderer.removeListener("desktop:update-status", handler);
  },
});