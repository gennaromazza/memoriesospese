import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const gzipAsync = promisify(gzip);

/** Text assets worth compressing; images and fonts are already compressed. */
const COMPRESSIBLE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.svg', '.json', '.html', '.txt', '.xml', '.webmanifest']);
/** Below this size the HTTP headers outweigh the saving. */
const MIN_BYTES = 1024;

export interface PrecompressStats {
  files: number;
  originalBytes: number;
  brotliBytes: number;
  gzipBytes: number;
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? listFiles(full) : Promise.resolve([full]);
  }));
  return nested.flat();
}

/**
 * Writes `<file>.br` (brotli, maximum quality) and `<file>.gz` (gzip level 9)
 * next to every text asset, so the web server can send them without spending
 * CPU per request. A copy is written only when it is smaller than the original.
 */
export async function precompressAssets(dir: string): Promise<PrecompressStats> {
  const stats: PrecompressStats = { files: 0, originalBytes: 0, brotliBytes: 0, gzipBytes: 0 };
  const files = (await listFiles(dir)).filter(file => COMPRESSIBLE_EXTENSIONS.has(path.extname(file)));

  for (const file of files) {
    if ((await stat(file)).size < MIN_BYTES) continue;
    const original = await readFile(file);
    const [br, gz] = await Promise.all([
      brotli(original, {
        params: {
          [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
          [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: original.length,
        },
      }),
      gzipAsync(original, { level: 9 }),
    ]);
    if (br.length < original.length) await writeFile(`${file}.br`, br);
    if (gz.length < original.length) await writeFile(`${file}.gz`, gz);
    stats.files += 1;
    stats.originalBytes += original.length;
    stats.brotliBytes += Math.min(br.length, original.length);
    stats.gzipBytes += Math.min(gz.length, original.length);
  }
  return stats;
}
