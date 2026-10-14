import { readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import asar from '../../../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/lib/asar.js';

const root = 'artifacts/image-studio-desktop/release';
const name = 'Image-Studio-Gallerie-0.0.8-x64.exe';
const exe = await readFile(`${root}/${name}`);
assert.ok(exe.length > 10 * 1024 * 1024, 'Refuse an incomplete installer stub');
assert.equal(exe.subarray(0, 2).toString(), 'MZ');
const metadata = await readFile(`${root}/latest.yml`, 'utf8');
assert.match(metadata, /^version: 0\.0\.8$/m);
assert.ok(metadata.includes(name));
const sha512 = createHash('sha512').update(exe).digest('base64');
assert.ok(metadata.includes(`sha512: ${sha512}`), 'Installer checksum differs from updater metadata');
assert.ok((await stat(`${root}/${name}.blockmap`)).size > 100);

const archive = `${root}/win-unpacked/resources/app.asar`;
const pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(pkg.version, '0.0.8');
const paths = asar.listPackage(archive);
assert.ok(paths.some(path => path.includes('node_modules/electron-updater/package.json')));
const bundlePath = paths.find(path => /^\/dist\/public\/assets\/index-.*\.js$/.test(path));
assert.ok(bundlePath, 'Packaged renderer is missing');
const bundle = asar.extractFile(archive, bundlePath.slice(1)).toString();
for (const required of ['monotonicNow', 'performance.now()', 'confirmSession', 'verifiedUntil']) {
  assert.ok(bundle.includes(required), `Packaged renderer does not contain ${required}`);
}
const sha256 = createHash('sha256').update(exe).digest('hex');
await writeFile(`${root}/SHA256SUMS.txt`, `${sha256}  ${name}\n`);
console.log(JSON.stringify({ result: 'PASS', version: pkg.version, bytes: exe.length, updaterChecksum: 'matched', packagedPasskeyFix: true }));
