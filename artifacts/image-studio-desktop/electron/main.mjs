import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell, Tray } from "electron";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { hashFile, walkFolder } from "./file-operations.mjs";
import { createUpdateController } from "./update-controller.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const activeUploads = new Map();
const rendererRoot = path.resolve(__dirname, "..", "dist", "public");
const iconPath = path.join(__dirname, "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");
let mainWindow = null;
let tray = null;
let isQuitting = false;
let rendererBusyCount = null;
let updates = null;
let updateStartupError = false;

const updateStatus = () => updates?.getStatus() ?? { phase: updateStartupError ? "error" : "idle" };
const mayInstallUpdate = () => rendererBusyCount === 0 && activeUploads.size === 0;
function installUpdate() {
  return updates?.install() ?? { installed: false, reason: "not-ready" };
}
async function quitFromTray() {
  if (!mayInstallUpdate()) {
    const { response } = await dialog.showMessageBox({
      type: "warning",
      title: "Lavoro ancora in corso",
      message: "La coda potrebbe contenere file in elaborazione o upload.",
      detail: "Uscire adesso interromperà il lavoro in corso. Puoi lasciarla nel tray e terminare più tardi.",
      buttons: ["Continua il lavoro", "Esci comunque"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (response !== 1) return;
  }
  app.quit();
}

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
ipcMain.handle("desktop:update-status", () => updateStatus());
ipcMain.handle("desktop:update-check", () => updates?.check() ?? updateStatus());
ipcMain.handle("desktop:update-work-state", (event, count) => {
  if (event.sender !== mainWindow?.webContents) return;
  rendererBusyCount = Number.isSafeInteger(count) ? Math.max(0, count) : 0;
  updateTrayMenu();
});
ipcMain.handle("desktop:update-install", event => {
  if (event.sender !== mainWindow?.webContents) return { installed: false, reason: "not-ready" };
  return installUpdate();
});

function updateTrayMenu() {
  if (!tray) return;
  const ready = updateStatus().phase === "ready";
  tray.setToolTip(ready ? "Image Studio Gallerie — aggiornamento pronto" : "Image Studio Gallerie");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Apri Image Studio Gallerie", click: () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
      else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    } },
    ...(ready ? [{ label: "Riavvia e aggiorna", enabled: mayInstallUpdate(), click: installUpdate }] : []),
    { type: "separator" },
    { label: "Esci", click: () => { void quitFromTray(); } },
  ]));
}

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
  rendererBusyCount = null;
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
    updateTrayMenu();
    tray.on("double-click", () => {
      if (!mainWindow || mainWindow.isDestroyed()) createWindow();
      else {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
      }
    });
    if (app.isPackaged) {
      void import("electron-updater").then(async module => {
        const updater = module.autoUpdater ?? module.default?.autoUpdater;
        if (!updater) throw new Error("electron-updater unavailable");
        // Public GitHub Releases supply the updater feed. Unsigned NSIS builds
        // intentionally have no Windows publisherName; metadata integrity is
        // checked by electron-updater, but Authenticode identity is unavailable.
        updates = createUpdateController({
          updater,
          getWindow: () => mainWindow,
          canInstall: mayInstallUpdate,
          prepareInstall: () => { isQuitting = true; },
          cancelInstall: () => { isQuitting = false; },
        });
        updater.on("update-downloaded", updateTrayMenu);
        updater.on("error", updateTrayMenu);
      }).catch(error => {
        console.error("Windows updater unavailable:", error);
        updateStartupError = true;
        mainWindow?.webContents.send("desktop:update-status", updateStatus());
      });
    }
  }
  app.on("activate", () => {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.show();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});