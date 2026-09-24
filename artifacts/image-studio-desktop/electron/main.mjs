import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, Tray } from "electron";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashFile, walkFolder } from "./file-operations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activeUploads = new Map();
const rendererRoot = path.resolve(__dirname, "..", "dist", "public");
const iconPath = path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");
let mainWindow = null;
let tray = null;
let isQuitting = false;

// Avoid opening a second copy when the user clicks the Windows shortcut while
// the first copy is hidden in the notification area.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on("second-instance", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});
app.on("before-quit", () => { isQuitting = true; });

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
// The renderer compresses photos with the same algorithm as the web app, so it
// needs the original bytes rather than a stream straight to Storage.
ipcMain.handle("desktop:read-file", async (_event, filePath) => {
  const info = await stat(filePath);
  // The whole file is held in memory by the renderer while it is decoded and
  // compressed (same as the web app); keep the per-file ceiling conservative.
  if (info.size > 200 * 1024 * 1024) throw new Error("File troppo grande per la compressione (max 200 MB)");
  const bytes = await readFile(filePath);
  return { bytes, size: info.size, lastModified: Math.round(info.mtimeMs) };
});
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
    icon: iconPath,
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
  mainWindow = win;
  win.on("close", event => {
    if (process.platform === "win32" && tray && !isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
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
  if (!hasInstanceLock) return;
  if (process.platform === "win32") app.setAppUserModelId("com.imagestudio.gallerie");
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
  if (process.platform === "win32") {
    tray = new Tray(iconPath);
    tray.setToolTip("Image Studio Gallerie");
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: "Apri Image Studio Gallerie", click: () => {
        if (!mainWindow || mainWindow.isDestroyed()) createWindow();
        else {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        }
      } },
      { type: "separator" },
      { label: "Esci", click: () => app.quit() },
    ]));
    tray.on("double-click", () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
      else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});