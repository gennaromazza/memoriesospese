/** Unit/integration tests may use local fixture servers, never live providers.
 * Keep this independent of vi.restoreAllMocks/unstubAllGlobals: restoring a
 * per-test mock must restore this guard, not unrestricted network access.
 */
import http from 'node:http';
import https from 'node:https';
import http2 from 'node:http2';
import { syncBuiltinESMExports } from 'node:module';

const marker = Symbol.for('image-studio.test.network-guard');
function assertLocal(input: any, override?: any) {
  let host: string;
  if (override && typeof override === 'object' && (override.hostname || override.host)) {
    host = override.hostname || override.host;
  } else if (typeof input === 'string' || input instanceof URL) {
    host = new URL(input).hostname;
  } else {
    host = input?.hostname || input?.host || 'localhost';
  }
  const hostname = new URL(`http://${host}`).hostname.toLowerCase();
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error(`External network blocked in tests: ${hostname}. Mock this provider explicitly.`);
  }
}
function protect(module: any, method: string) {
  const original = module[method];
  if (original[marker]) return;
  const guarded = function (this: unknown, ...args: any[]) {
    assertLocal(args[0], args[1]);
    return Reflect.apply(original, this, args);
  };
  (guarded as any)[marker] = true;
  module[method] = guarded;
}
protect(http, 'request'); protect(http, 'get');
protect(https, 'request'); protect(https, 'get');
protect(http2, 'connect');
syncBuiltinESMExports();

const originalFetch = globalThis.fetch;
if (!(originalFetch as any)[marker]) {
  const guardedFetch: typeof fetch = async (input, init) => {
    assertLocal(input instanceof Request ? input.url : input);
    return originalFetch(input, init);
  };
  (guardedFetch as any)[marker] = true;
  globalThis.fetch = guardedFetch;
}
