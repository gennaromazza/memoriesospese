import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { precompressAssets } from './precompress-assets';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'precompress-'));
  roots.push(root);
  await mkdir(path.join(root, 'nested'), { recursive: true });
  const bigJs = 'export const gallery = "foto";\n'.repeat(2000);
  await Promise.all([
    writeFile(path.join(root, 'index-abc.js'), bigJs),
    writeFile(path.join(root, 'nested', 'chunk-def.css'), '.photo { display: block; }\n'.repeat(400)),
    writeFile(path.join(root, 'tiny-123.js'), 'export {};'),
    writeFile(path.join(root, 'cover-456.jpg'), Buffer.alloc(8192, 7)),
  ]);
  return { root, bigJs };
}

describe('precompressAssets', () => {
  it('writes brotli and gzip copies that decode to the original text assets', async () => {
    const { root, bigJs } = await fixture();

    const stats = await precompressAssets(root);

    const br = await readFile(path.join(root, 'index-abc.js.br'));
    const gz = await readFile(path.join(root, 'index-abc.js.gz'));
    expect(brotliDecompressSync(br).toString('utf8')).toBe(bigJs);
    expect(gunzipSync(gz).toString('utf8')).toBe(bigJs);
    expect(br.length).toBeLessThan(Buffer.byteLength(bigJs));
    expect(await readFile(path.join(root, 'nested', 'chunk-def.css.br'))).toBeTruthy();
    expect(stats.files).toBe(2);
    expect(stats.brotliBytes).toBeLessThan(stats.originalBytes);
  });

  it('skips tiny files and images, and does not compress its own output again', async () => {
    const { root } = await fixture();

    await precompressAssets(root);
    const second = await precompressAssets(root);

    const names = await readdir(root);
    expect(names).not.toContain('tiny-123.js.br');
    expect(names).not.toContain('cover-456.jpg.br');
    expect(names.some(name => name.endsWith('.br.br') || name.endsWith('.gz.gz') || name.endsWith('.br.gz'))).toBe(false);
    expect(second.files).toBe(2);
  });

  it('does nothing when the folder does not exist', async () => {
    const stats = await precompressAssets(path.join(tmpdir(), 'precompress-missing-folder'));
    expect(stats.files).toBe(0);
  });
});
