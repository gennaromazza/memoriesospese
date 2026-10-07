import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createUpdateController } from "./update-controller.mjs";

const controllers = [];
afterEach(() => {
  controllers.splice(0).forEach(controller => controller.stop());
  vi.useRealTimers();
});

function harness() {
  vi.useFakeTimers();
  const updater = new EventEmitter();
  updater.checkForUpdates = vi.fn(async () => updater.emit("update-not-available"));
  updater.quitAndInstall = vi.fn();
  const prepareInstall = vi.fn();
  const cancelInstall = vi.fn();
  let busy = null;
  const controller = createUpdateController({
    updater,
    getWindow: () => null,
    canInstall: () => busy === false,
    prepareInstall,
    cancelInstall,
  });
  controllers.push(controller);
  return { updater, controller, prepareInstall, cancelInstall, setBusy: value => { busy = value; } };
}

describe("Windows updater", () => {
  it("checks automatically, ignores equal/older versions through updater policy and retries failures", async () => {
    const { updater, controller } = harness();
    expect(updater.autoDownload).toBe(true);
    expect(updater.allowPrerelease).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(controller.getStatus().phase).toBe("idle");
    updater.checkForUpdates.mockRejectedValueOnce(new Error("offline"));
    await controller.check();
    expect(controller.getStatus().phase).toBe("error");
    await vi.advanceTimersByTimeAsync(6 * 60 * 60 * 1000);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(3);
    expect(controller.getStatus().phase).toBe("idle");
  });

  it("reports download progress and defers installation while work is active", () => {
    const { updater, controller, prepareInstall, setBusy } = harness();
    updater.emit("update-available", { version: "0.0.8" });
    updater.emit("download-progress", { percent: 58.4 });
    expect(controller.getStatus()).toEqual({ phase: "downloading", percent: 58 });
    updater.emit("update-downloaded", { version: "0.0.8" });
    expect(controller.install()).toEqual({ installed: false, reason: "busy" });
    setBusy(true);
    expect(controller.install()).toEqual({ installed: false, reason: "busy" });
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    setBusy(false);
    expect(controller.install()).toEqual({ installed: true });
    expect(prepareInstall).toHaveBeenCalledOnce();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it("does not install incomplete downloads and keeps the app usable after installer errors", () => {
    const { updater, controller, cancelInstall, setBusy } = harness();
    expect(controller.install().reason).toBe("not-ready");
    updater.emit("update-downloaded", { version: "0.0.8" });
    setBusy(false);
    updater.quitAndInstall.mockImplementationOnce(() => { throw new Error("installer unavailable"); });
    expect(controller.install()).toEqual({ installed: false, reason: "failed" });
    expect(cancelInstall).toHaveBeenCalledOnce();
    expect(controller.getStatus().phase).toBe("error");
  });
});