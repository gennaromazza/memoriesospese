import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('blocks outgoing fetch, HTTP and gRPC-style sockets in the runtime preload', () => {
  const preload = fileURLToPath(new URL('./runtime-network-guard.cjs', import.meta.url));
  const result = spawnSync(process.execPath, ['--require', preload, '-e', `
    const net = require('node:net');
    const http = require('node:http');
    const dgram = require('node:dgram');
    const assert = require('node:assert/strict');
    (async () => {
      const denied = error => assert.match(error.message, /outbound network disabled/);
      await new Promise(resolve => net.connect(1, '127.0.0.1').on('error', error => { denied(error); resolve(); }));
      await new Promise(resolve => http.get('http://127.0.0.1:1/').on('error', error => { denied(error); resolve(); }));
      await fetch('http://127.0.0.1:1/').then(() => assert.fail('fetch escaped'), denied);
      const socket = dgram.createSocket('udp4');
      assert.throws(() => socket.send('fixture', 1, '127.0.0.1'), /outbound network disabled/);
      socket.close();
      // The guard must not prevent the managed application from listening.
      const server = http.createServer((_req, res) => res.end('fixture'));
      server.listen(0, '127.0.0.1', () => server.close());
    })().catch(error => { console.error(error); process.exitCode = 1; });
  `], { encoding: 'utf8', timeout: 10_000 });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
});
