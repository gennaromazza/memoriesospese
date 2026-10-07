const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function createUpdateController({ updater, getWindow, canInstall, prepareInstall, cancelInstall }) {
  let status = { phase: "idle" };
  let checking = false;
  let ready = false;

  const publish = (next) => {
    status = next;
    const win = getWindow();
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send("desktop:update-status", status);
    }
  };

  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;

  updater.on("checking-for-update", () => publish({ phase: "checking" }));
  updater.on("update-available", info => publish({ phase: "available", version: info.version }));
  updater.on("download-progress", progress => publish({
    phase: "downloading",
    percent: Math.max(0, Math.min(100, Math.round(progress.percent))),
  }));
  updater.on("update-downloaded", info => {
    ready = true;
    publish({ phase: "ready", version: info.version });
  });
  updater.on("update-not-available", () => publish({ phase: "idle" }));
  updater.on("error", error => {
    console.error("Windows update failed:", error);
    if (!ready) publish({ phase: "error" });
  });

  async function check() {
    if (checking || ready || status.phase === "available" || status.phase === "downloading") return status;
    checking = true;
    try {
      await updater.checkForUpdates();
    } catch (error) {
      console.error("Windows update check failed:", error);
      publish({ phase: "error" });
    } finally {
      checking = false;
    }
    return status;
  }

  function install() {
    if (!ready) return { installed: false, reason: "not-ready" };
    if (!canInstall()) return { installed: false, reason: "busy" };
    prepareInstall();
    try {
      // autoInstallOnAppQuit is false: only this explicit action installs.
      updater.quitAndInstall(false, true);
      return { installed: true };
    } catch (error) {
      console.error("Windows update installation failed:", error);
      cancelInstall();
      ready = false;
      publish({ phase: "error" });
      return { installed: false, reason: "failed" };
    }
  }

  const timer = setInterval(() => { void check(); }, CHECK_INTERVAL_MS);
  timer.unref?.();
  setTimeout(() => { void check(); }, 10_000).unref?.();
  return { check, install, getStatus: () => status, stop: () => clearInterval(timer) };
}