import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from "electron";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashFile, walkFolder } from "./file-operations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activeUploads = new Map();
const rendererRoot = path.resolve(__dirname, "..", "dist", "public");

// A standard, secure origin lets Chromium load Vite's ES modules and gives
// Firebase persistence a stable origin without disabling web security.
protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

ipcMain.handle("desktop:select-folder", async () => {
  const selection = await dialog.showOpenDialog({
    title: "Seleziona la cartella da caricare",
    properties: ["openDirectory"],
  });
  if (selection.canceled || !selection.filePaths[0]) return [];
  return walkFolder(selection.filePaths[0]);
});

ipcMain.handle("desktop:hash-file", async (_event, filePath) => hashFile(filePath));
ipcMain.handle("desktop:upload-file", async (event, { requestId, filePath, uploadUrl, contentType }) => {
  const info = await stat(filePath);
  const controller = new AbortController();
  activeUploads.set(requestId, controller);
  let uploaded = 0;
  const stream = createReadStream(filePath);
  const abortStream = () => stream.destroy(new Error("Upload aborted"));
  controller.signal.addEventListener("abort", abortStream, { once: true });
  stream.on("data", chunk => {
    uploaded += chunk.length;
    event.sender.send(`desktop:upload-progress:${requestId}`, {
      loaded: uploaded,
      total: info.size,
      progress: Math.round((uploaded / info.size) * 100),
    });
  });
  try {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType || "application/octet-stream" },
      body: stream,
      duplex: "half",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Upload non riuscito (${response.status})`);
    return { success: true, size: info.size };
  } finally {
    controller.signal.removeEventListener("abort", abortStream);
    activeUploads.delete(requestId);
  }
});
ipcMain.handle("desktop:cancel-upload", (_event, requestId) => {
  activeUploads.get(requestId)?.abort();
  activeUploads.delete(requestId);
  return { success: true };
});
ipcMain.handle("desktop:open-external", async (_event, url) => {
  const parsed = new URL(url);
  if (!["https:", "mailto:"].includes(parsed.protocol)) throw new Error("Protocollo non consentito");
  await shell.openExternal(url);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: "#f6f5f1",
    title: "Image Studio Gallerie",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });

  const developmentUrl = process.env.ELECTRON_RENDERER_URL;
  if (developmentUrl) {
    void win.loadURL(developmentUrl);
  } else {
    void win.loadURL("app://image-studio/");
  }
}

app.whenReady().then(() => {
  protocol.handle("app", request => {
    const url = new URL(request.url);
    if (url.hostname !== "image-studio") {
      return new Response("Not found", { status: 404 });
    }

    const pathname = decodeURIComponent(url.pathname);
    const resource = pathname.startsWith("/assets/") ||
      pathname === "/favicon.svg" ||
      pathname === "/robots.txt"
      ? path.resolve(rendererRoot, `.${pathname}`)
      : path.join(rendererRoot, "index.html");
    if (resource !== path.join(rendererRoot, "index.html") &&
        !resource.startsWith(`${rendererRoot}${path.sep}`)) {
      return new Response("Not found", { status: 404 });
    }
    return net.fetch(pathToFileURL(resource).toString());
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});