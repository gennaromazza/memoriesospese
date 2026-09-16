// Esegue i controlli browser WebGL uno alla volta.
// Un processo separato per controllo evita che Chromium e Vite competano
// per le stesse risorse e permette di terminare l'intero albero in timeout.
import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const DEFAULT_TIMEOUT_MS = Number(process.env.MOCKUP_VALIDATION_TIMEOUT_MS || 600000);
const TERMINATION_GRACE_MS = Number(process.env.MOCKUP_VALIDATION_TERMINATION_GRACE_MS || 5000);

const checks = [
  {
    name: 'mockup-touch',
    script: 'e2e/mockup-touch.browser.mjs',
    timeoutEnv: 'MOCKUP_TOUCH_VALIDATION_TIMEOUT_MS',
  },
  {
    name: 'photobook-mockup',
    script: 'e2e/photobook-mockup.browser.mjs',
    timeoutEnv: 'PHOTOBOOK_MOCKUP_VALIDATION_TIMEOUT_MS',
  },
  {
    name: 'photobook-versions',
    script: 'e2e/photobook-versions.browser.mjs',
    timeoutEnv: 'PHOTOBOOK_VERSIONS_VALIDATION_TIMEOUT_MS',
  },
];

let activeChild = null;
let stopping = false;

function timeoutFor(check) {
  const configured = Number(process.env[check.timeoutEnv] || DEFAULT_TIMEOUT_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    throw new Error(`${check.timeoutEnv} deve essere un numero positivo in millisecondi`);
  }
  return configured;
}

function writeOutput(stream, checkName, chunk, pending) {
  const lines = `${pending}${chunk}`.split(/\r?\n/);
  const nextPending = lines.pop() ?? '';
  for (const line of lines) {
    stream.write(`[${checkName}] ${line}\n`);
  }
  return nextPending;
}

function flushOutput(stream, checkName, pending) {
  if (pending) stream.write(`[${checkName}] ${pending}\n`);
}

function killProcessTree(pid, signal) {
  if (!pid) return;

  if (process.platform === 'win32') {
    const taskkill = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    taskkill.on('error', () => {});
    return;
  }

  try {
    // I controlli sono avviati detached: il pid negativo indica il gruppo
    // del controllo e include browser Chromium e processi figli del server.
    process.kill(-pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') {
      console.error(`[mockup-validation] impossibile terminare il gruppo ${pid}: ${error.message}`);
    }
  }
}

async function stopChild(child, reason) {
  if (!child?.pid) return;

  console.error(`[mockup-validation] termino ${child.spawnargs?.[1] || 'controllo'}: ${reason}`);
  killProcessTree(child.pid, 'SIGTERM');

  await Promise.race([
    new Promise(resolve => child.once('close', resolve)),
    new Promise(resolve => {
      const timer = setTimeout(resolve, TERMINATION_GRACE_MS);
      timer.unref();
    }),
  ]);
  // Anche se il processo Node termina subito, il browser può avere ancora
  // figli vivi: il gruppo va chiuso esplicitamente per non sporcare il runner.
  killProcessTree(child.pid, 'SIGKILL');
}

function runCheck(check) {
  return new Promise((resolve) => {
    const timeoutMs = timeoutFor(check);
    const child = spawn(process.execPath, [path.join(root, check.script)], {
      cwd: root,
      detached: process.platform !== 'win32',
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    activeChild = child;

    let stdoutPending = '';
    let stderrPending = '';
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      flushOutput(process.stdout, check.name, stdoutPending);
      flushOutput(process.stderr, check.name, stderrPending);
      if (activeChild === child) activeChild = null;
      resolve(result);
    };

    child.stdout.on('data', chunk => {
      stdoutPending = writeOutput(process.stdout, check.name, chunk.toString(), stdoutPending);
    });
    child.stderr.on('data', chunk => {
      stderrPending = writeOutput(process.stderr, check.name, chunk.toString(), stderrPending);
    });
    child.once('error', error => {
      console.error(`[${check.name}] impossibile avviare il controllo: ${error.message}`);
    });
    // close arriva dopo la chiusura di stdout/stderr, quindi tutti i
    // diagnostici del controllo vengono inoltrati prima del riepilogo.
    child.once('close', (code, signal) => {
      finish({ code, signal, timedOut });
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(`[mockup-validation] timeout di ${timeoutMs} ms durante ${check.name}`);
      void stopChild(child, `timeout di ${timeoutMs} ms`).catch(error => {
        console.error(`[mockup-validation] cleanup fallito per ${check.name}: ${error.message}`);
        killProcessTree(child.pid, 'SIGKILL');
      });
    }, timeoutMs);
    timeout.unref();
  });
}

async function handleSignal(signal) {
  if (stopping) return;
  stopping = true;
  console.error(`[mockup-validation] ricevuto ${signal}; cleanup del controllo attivo`);
  await stopChild(activeChild, signal);
  process.exit(128 + (signal === 'SIGINT' ? 2 : 15));
}

process.once('SIGINT', () => void handleSignal('SIGINT'));
process.once('SIGTERM', () => void handleSignal('SIGTERM'));

let failed = false;
for (const check of checks) {
  const timeoutMs = timeoutFor(check);
  console.log(`[mockup-validation] avvio ${check.name} (timeout ${timeoutMs} ms)`);
  const result = await runCheck(check);

  if (result.timedOut) {
    console.error(`[mockup-validation] FALLITO: ${check.name} ha superato il timeout; i diagnostici precedenti sono stati conservati`);
    failed = true;
    break;
  }
  if (result.code !== 0) {
    const reason = result.signal ? `segnale ${result.signal}` : `exit code ${result.code}`;
    console.error(`[mockup-validation] FALLITO: ${check.name} (${reason}); i diagnostici precedenti sono stati conservati`);
    failed = true;
    break;
  }

  console.log(`[mockup-validation] OK: ${check.name}`);
}

if (failed) process.exitCode = 1;
else console.log('[mockup-validation] tutti i controlli mockup sono terminati in sequenza');