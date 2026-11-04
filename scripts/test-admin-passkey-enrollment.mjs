import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const emulatorPorts = [9099, 8089];
const reservedPorts = [...emulatorPorts, 4179, 4400, 4500, 9150];

function isPortOpen(port) {
  return new Promise((resolveOpen) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolveOpen(true);
    });
    socket.once("error", () => resolveOpen(false));
  });
}

function wait(milliseconds) {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds));
}

function run(command, args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", rejectRun);
    child.once("exit", (code, signal) => {
      resolveRun(code ?? (signal ? 1 : 0));
    });
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const stopped = new Promise((resolveStop) => child.once("exit", resolveStop));
  child.kill("SIGTERM");
  const didStop = await Promise.race([
    stopped.then(() => true),
    wait(8_000).then(() => false),
  ]);
  if (!didStop && child.exitCode === null) child.kill("SIGKILL");
}

for (const port of reservedPorts) {
  if (await isPortOpen(port)) {
    throw new Error(
      `Porta ${port} già occupata. Ferma il servizio locale prima di avviare il test passkey.`,
    );
  }
}

const emulator = spawn(
  "firebase",
  [
    "emulators:start",
    "--project",
    "wedding-gallery-397b6",
    "--config",
    "firebase.admin-passkey-e2e.json",
    "--only",
    "auth,firestore",
  ],
  { cwd: root, stdio: "inherit" },
);
emulator.on("error", (error) => {
  console.error("Avvio emulatori Firebase non riuscito:", error.message);
});
let vite;

try {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (emulator.exitCode !== null) {
      throw new Error(`Firebase Emulator è terminato con codice ${emulator.exitCode}.`);
    }
    const portsReady = await Promise.all(emulatorPorts.map(isPortOpen));
    if (portsReady.every(Boolean)) break;
    await wait(300);
  }

  const portsReady = await Promise.all(emulatorPorts.map(isPortOpen));
  if (!portsReady.every(Boolean)) {
    throw new Error("Gli emulatori Auth e Firestore non sono pronti entro il limite di attesa.");
  }

  const viteEnv = { ...process.env, PORT: "4179", BASE_PATH: "/" };
  delete viteEnv.REPL_ID;
  delete viteEnv.VITE_API_PROXY_TARGET;
  viteEnv.VITE_FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
  viteEnv.VITE_FIRESTORE_EMULATOR_HOST = "127.0.0.1:8089";
  vite = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "--config",
      "vite.config.ts",
      "--host",
      "127.0.0.1",
      "--port",
      "4179",
      "--strictPort",
    ],
    {
      cwd: resolve(root, "artifacts/image-studio-web"),
      env: viteEnv,
      stdio: "inherit",
    },
  );
  const viteDeadline = Date.now() + 60_000;
  while (Date.now() < viteDeadline) {
    if (vite.exitCode !== null) {
      throw new Error(`Vite è terminato con codice ${vite.exitCode}.`);
    }
    if (await isPortOpen(4179)) break;
    await wait(250);
  }
  if (!(await isPortOpen(4179))) {
    throw new Error("Il server web per il test passkey non si è avviato.");
  }

  const testExitCode = await run(
    "pnpm",
    [
      "exec",
      "playwright",
      "test",
      "--config",
      "artifacts/image-studio-web/playwright.admin-passkey-enrollment.config.ts",
    ],
    root,
  );
  process.exitCode = testExitCode;
} finally {
  await stopProcess(vite);
  await stopProcess(emulator);
}
