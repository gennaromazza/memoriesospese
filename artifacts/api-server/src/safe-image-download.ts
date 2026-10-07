import { promises as dns } from 'node:dns';
import type { IncomingHttpHeaders } from 'node:http';
import https from 'node:https';
import { BlockList } from 'node:net';

const MAX_REDIRECTS = 3;
const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const blockedAddresses = new BlockList();
[
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address as string, prefix as number, 'ipv4'));
[
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
].forEach(([address, prefix]) => blockedAddresses.addSubnet(address as string, prefix as number, 'ipv6'));

const validateUrl = (value: string): URL => {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('Sono consentite solo immagini HTTPS');
  if (url.username || url.password) throw new Error('URL immagine non valido');
  if (url.port && url.port !== '443') throw new Error('Porta URL non consentita');
  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.local')) {
    throw new Error('Host immagine non consentito');
  }
  return url;
};

const resolvePublicAddress = async (hostname: string): Promise<{ address: string; family: 4 | 6 }> => {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error('Host immagine non risolvibile');

  for (const candidate of addresses) {
    const type = candidate.family === 6 ? 'ipv6' : 'ipv4';
    const isIpv4Mapped = candidate.family === 6 &&
      candidate.address.toLowerCase().startsWith('::ffff:');
    if (isIpv4Mapped || blockedAddresses.check(candidate.address, type)) {
      throw new Error('Host immagine non pubblico');
    }
  }

  const selected = addresses[0];
  return { address: selected.address, family: selected.family === 6 ? 6 : 4 };
};

const requestOnce = async (
  url: URL,
  address: string,
  family: 4 | 6,
): Promise<{ statusCode: number; headers: IncomingHttpHeaders; buffer: Buffer }> =>
  new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif',
        'User-Agent': 'ImageStudio-WordPressImporter/1.0',
      },
      lookup: ((_hostname: string, options: { all?: boolean }, callback: Function) => {
        if (options?.all) {
          callback(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      }) as any,
      servername: url.hostname,
    }, response => {
      const statusCode = response.statusCode || 0;
      const contentLength = Number(response.headers['content-length'] || 0);
      if (contentLength > MAX_DOWNLOAD_BYTES) {
        response.resume();
        reject(new Error('Immagine troppo grande'));
        return;
      }

      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', chunk => {
        total += chunk.length;
        if (total > MAX_DOWNLOAD_BYTES) {
          response.destroy(new Error('Immagine troppo grande'));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('error', reject);
      response.on('end', () => {
        resolve({ statusCode, headers: response.headers, buffer: Buffer.concat(chunks) });
      });
    });

    request.setTimeout(REQUEST_TIMEOUT_MS, () => {
      request.destroy(new Error('Timeout durante il download immagine'));
    });
    request.on('error', reject);
  });

export async function downloadPublicImage(
  value: string,
  redirectCount = 0,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (redirectCount > MAX_REDIRECTS) throw new Error('Troppi redirect immagine');
  const url = validateUrl(value);
  const resolved = await resolvePublicAddress(url.hostname);
  const response = await requestOnce(url, resolved.address, resolved.family);

  if (response.statusCode >= 300 && response.statusCode < 400) {
    const location = response.headers.location;
    if (!location) throw new Error('Redirect immagine senza destinazione');
    return downloadPublicImage(new URL(location, url).toString(), redirectCount + 1);
  }
  if (response.statusCode !== 200) {
    throw new Error(`Download immagine fallito (HTTP ${response.statusCode})`);
  }

  const contentType = String(response.headers['content-type'] || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error('Il contenuto remoto non è un formato immagine supportato');
  }
  return { buffer: response.buffer, contentType };
}