import { readFile, stat } from 'node:fs/promises';
import assert from 'node:assert/strict';
import asar from '../../../node_modules/.pnpm/@electron+asar@3.4.1/node_modules/@electron/asar/lib/asar.js';

const root = 'artifacts/image-studio-desktop/release/win-unpacked';
const archive = `${root}/resources/app.asar`;
const pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString());
assert.equal(pkg.version, '0.0.8');
const paths = asar.listPackage(archive);
assert.ok(paths.some(path => path.includes('node_modules/electron-updater/package.json')));
const bundlePath = paths.find(path => /^\/dist\/public\/assets\/index-.*\.js$/.test(path));
assert.ok(bundlePath);
const bundle = asar.extractFile(archive, bundlePath.slice(1)).toString();
for (const required of ['monotonicNow', 'performance.now()', 'confirmSession', 'verifiedUntil']) {
  assert.ok(bundle.includes(required), `Packaged fix missing ${required}`);
}
assert.equal(bundle, await readFile(`artifacts/image-studio-desktop${bundlePath}`, 'utf8'));
for (const file of ['Image Studio Gallerie.exe', 'libEGL.dll', 'libGLESv2.dll', 'ffmpeg.dll', 'icudtl.dat', 'resources.pak', 'locales/it.pak']) {
  assert.ok((await stat(`${root}/${file}`)).size > 0);
}
console.log(JSON.stringify({ result: 'PASS', packagedVersion: pkg.version, packagedPasskeyFix: true, rendererMatchesProductionBuild: true }));
