import { strict as assert } from 'node:assert';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import { createServer } from 'vite';

const RENDERER_TIMEOUT_DEFINE = 'import.meta.env.VITE_MOCKUP_RENDERER_READY_TIMEOUT_MS';

export function createMockupHarnessServer(projectRoot = process.cwd(), { define } = {}) {
  const root = path.resolve(projectRoot);
  const harnessRoot = path.join(root, 'e2e/mockup-harness');

  return createServer({
    configFile: false,
    root: harnessRoot,
    publicDir: path.join(root, 'client/public'),
    plugins: [
      {
        name: 'mockup-test-firebase',
        enforce: 'pre',
        resolveId(source, importer) {
          if (
            source === '@/lib/firebase' ||
            source.replaceAll('\\', '/').endsWith('/client/src/lib/firebase') ||
            (source === './firebase' && importer?.replaceAll('\\', '/').includes('/client/src/lib/'))
          ) {
            return path.join(harnessRoot, 'firebase.ts');
          }
        },
      },
      react(),
    ],
    resolve: { alias: { '@': path.join(root, 'client/src'), '@shared': path.join(root, 'shared') } },
    ...(define ? { define } : {}),
    css: { postcss: path.join(root, 'postcss.config.js') },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } },
  });
}

export function assertMockupHarnessConfig(server, projectRoot = process.cwd(), { rendererTimeoutMs } = {}) {
  const root = path.resolve(projectRoot);
  const harnessRoot = path.join(root, 'e2e/mockup-harness');
  const config = server?.config;

  assert.ok(config, 'Mockup harness config is missing');
  assert.equal(config.root, harnessRoot, 'Mockup harness root changed');

  const aliases = Array.isArray(config.resolve?.alias)
    ? config.resolve.alias
    : Object.entries(config.resolve?.alias ?? {}).map(([find, replacement]) => ({ find, replacement }));
  const aliasFor = find => aliases.find(alias => alias.find === find)?.replacement;
  assert.equal(aliasFor('@'), path.join(root, 'client/src'), 'Mockup harness @ alias changed');
  assert.equal(aliasFor('@shared'), path.join(root, 'shared'), 'Mockup harness @shared alias changed');

  const firebasePlugin = config.plugins?.find(plugin => plugin.name === 'mockup-test-firebase');
  assert.ok(firebasePlugin?.resolveId, 'Mockup harness Firebase replacement plugin is missing');
  const firebaseModule = path.join(harnessRoot, 'firebase.ts');
  const resolvedFirebase = source =>
    firebasePlugin.resolveId(source, path.join(root, 'client/src/lib/queryClient.ts'));
  assert.equal(
    resolvedFirebase('@/lib/firebase'),
    firebaseModule,
    'Mockup harness Firebase replacement for @/lib/firebase changed',
  );
  assert.equal(
    firebasePlugin.resolveId('../../client/src/lib/firebase', path.join(harnessRoot, 'main.tsx')),
    firebaseModule,
    'Mockup harness Firebase replacement for the client path changed',
  );
  assert.equal(
    firebasePlugin.resolveId('./firebase', path.join(root, 'client/src/lib/queryClient.ts')),
    firebaseModule,
    'Mockup harness Firebase replacement for relative client imports changed',
  );

  assert.deepEqual(config.server?.fs?.allow, [root], 'Mockup harness filesystem allowlist changed');

  const define = config.define ?? {};
  if (rendererTimeoutMs === undefined) {
    assert.equal(
      Object.hasOwn(define, RENDERER_TIMEOUT_DEFINE),
      false,
      'Default mockup harness must not override the renderer timeout',
    );
  } else {
    assert.equal(
      define[RENDERER_TIMEOUT_DEFINE],
      JSON.stringify(String(rendererTimeoutMs)),
      `Mockup harness renderer timeout override changed (expected ${rendererTimeoutMs} ms)`,
    );
  }
}