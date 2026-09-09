import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAlbumReport } from '../custodia-v1/report-template.js';
import { drawMonogram } from './monogram.js';
import { installHomeScenes } from '../home-scenes.js';

const $ = id => document.getElementById(id);
const embedded = window.parent !== window;
const notify = (type, payload = {}) => { if (embedded) window.parent.postMessage({ channel: 'memorie-mockup-v1', type, ...payload }, location.origin); };
const modelId = 'album-girevole';
let option, locked = false, applying = false, initialized = !embedded, pending = 0, automatic = false;
let photo = null, photoMap = null, materialRequest = 0;
let backPhoto = null, backPhotoMap = null, configurationRevision = 3;
// Le vecchie righe non vengono interpretate come nomi: si passa al monogramma solo inserendo i nomi.
function edited() { if (configurationRevision === 1) configurationRevision = 2; }
const catalogUrl = new URL('../custodia-v1/peppe-lab-catalog.json', location.href);
const response = await fetch(catalogUrl);
if (!response.ok) throw new Error('Campionario non disponibile');
const catalog = await response.json();
const variants = catalog.variants;
let selected = variants.find(v => v.legacyId === 'mist-03').id;
const renderer = new THREE.WebGLRenderer({ canvas: $('viewport'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#eae8e1');
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(room, .04); scene.environment = environment.texture;
scene.environmentIntensity = .45; room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff, 0xb2a68e, .8));
const light = new THREE.DirectionalLight(0xfff6e8, 1.6); light.position.set(-.6, 1.3, 1);
light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -.7, right: .7, top: .7, bottom: -.7, near: .01, far: 4 });
light.shadow.bias = -.00008; scene.add(light);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: .15 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.002; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(36, 1, .005, 20);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = .45; controls.maxDistance = 3;

// Metri: album provvisorio 40 × 30 chiuso. Cornice 48 × 37; asse verticale centrale.
// Luce interna .444 m > diagonale del supporto sqrt(.432² + .08²): rotazione libera.
const product = new THREE.Group(); scene.add(product);
const frame = new THREE.Group(); frame.name = 'Cornice esterna fissa'; product.add(frame);
const pivot = new THREE.Group(); pivot.name = 'Supporto interno girevole'; pivot.position.y = .185; product.add(pivot);
const album = new THREE.Group(); album.name = 'Album estraibile'; pivot.add(album);
const fabric = new THREE.MeshStandardMaterial({ color: '#a49c90', roughness: .95 });
const frameMaterial = new THREE.MeshStandardMaterial({ roughness: .68 });
const woodCanvas = document.createElement('canvas'); woodCanvas.width = 512; woodCanvas.height = 1024;
const wc = woodCanvas.getContext('2d'); wc.fillStyle = '#c7a879'; wc.fillRect(0, 0, 512, 1024);
for (let i = 0; i < 500; i++) {
  const x = (i * 73.37) % 512; wc.strokeStyle = `rgba(94,64,31,${.025 + (i % 9) * .007})`; wc.lineWidth = .4 + (i % 4) * .35;
  wc.beginPath(); wc.moveTo(x, 0); wc.bezierCurveTo(x + Math.sin(i) * 12, 330, x + Math.cos(i) * 8, 680, x + Math.sin(i * 2) * 9, 1024); wc.stroke();
}
const woodMap = new THREE.CanvasTexture(woodCanvas); woodMap.colorSpace = THREE.SRGBColorSpace;
const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: .7 });
const metal = new THREE.MeshStandardMaterial({ color: '#777c7d', metalness: .9, roughness: .25 });
function box(parent, name, size, position, material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.name = name;
  mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
box(frame, 'Traversa superiore', [.48, .018, .09], [0, .361, 0], frameMaterial);
box(frame, 'Base cornice', [.48, .018, .09], [0, .009, 0], frameMaterial);
box(frame, 'Montante sinistro', [.018, .334, .09], [-.231, .185, 0], frameMaterial);
box(frame, 'Montante destro', [.018, .334, .09], [.231, .185, 0], frameMaterial);
box(pivot, 'Supporto superiore rotante', [.432, .014, .076], [0, .159, 0], frameMaterial);
box(pivot, 'Supporto inferiore rotante', [.432, .014, .076], [0, -.159, 0], frameMaterial);
for (const y of [.022, .348]) {
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, .014, 24), metal); pin.position.y = y; frame.add(pin);
}
box(album, 'Pagine album', [.39, .29, .042], [.003, 0, 0], new THREE.MeshStandardMaterial({ color: '#eee7d6', roughness: .95 }));
box(album, 'Copertina tessuto', [.4, .3, .004], [0, 0, .023], fabric);
box(album, 'Retro tessuto', [.4, .3, .004], [0, 0, -.023], fabric);
box(album, 'Dorso tessuto', [.01, .3, .05], [-.195, 0, 0], fabric);
// Rigatura leggera del blocco pagine sul taglio laterale.
for (let i = 0; i < 22; i++) box(album, 'Taglio pagina', [.0003, .286, .00015], [.1982, 0, -.02 + i * .0019], new THREE.MeshStandardMaterial({ color: '#d7cfbc', roughness: 1 }));
const plex = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: .002, ior: 1.49, roughness: .025, side: THREE.DoubleSide, depthWrite: false });
// Due lastre aperte lateralmente; incavo semicircolare per la presa a destra.
for (const z of [-.04, .04]) {
  const shape = new THREE.Shape(); shape.moveTo(-.216, -.151); shape.lineTo(.216, -.151); shape.lineTo(.216, -.027);
  shape.absarc(.216, 0, .027, -Math.PI / 2, -3 * Math.PI / 2, true);
  shape.lineTo(.216, .151); shape.lineTo(-.216, .151); shape.closePath();
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape), plex); glass.position.z = z; glass.name = 'Pannello trasparente con presa'; pivot.add(glass);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: '#e5f0ef', transparent: true, opacity: .55 })); edge.position.z = z; pivot.add(edge);
}
const plaque = box(album, 'Placchetta in legno', [.195, .137, .003], [0, 0, .027], wood);
const coverCanvas = document.createElement('canvas'); coverCanvas.width = 1600; coverCanvas.height = 1200;
const coverMap = new THREE.CanvasTexture(coverCanvas); coverMap.colorSpace = THREE.SRGBColorSpace;
const cover = new THREE.Mesh(new THREE.PlaneGeometry(.4, .3), new THREE.MeshStandardMaterial({ map: coverMap, roughness: .38 })); cover.position.z = .029; album.add(cover);
const inscriptionCanvas = document.createElement('canvas'); inscriptionCanvas.width = 1600; inscriptionCanvas.height = 1100;
const inscriptionMap = new THREE.CanvasTexture(inscriptionCanvas); inscriptionMap.colorSpace = THREE.SRGBColorSpace;
const inscription = new THREE.Mesh(new THREE.PlaneGeometry(.19, .132), new THREE.MeshBasicMaterial({ map: inscriptionMap, transparent: true, depthWrite: false })); inscription.position.z = .029; album.add(inscription);
const backCanvas = document.createElement('canvas'); backCanvas.width = 1600; backCanvas.height = 1200;
const backMap = new THREE.CanvasTexture(backCanvas); backMap.colorSpace = THREE.SRGBColorSpace;
const rearPhoto = new THREE.Mesh(new THREE.PlaneGeometry(.4, .3), new THREE.MeshPhysicalMaterial({ map: backMap, roughness: .25, clearcoat: 1, clearcoatRoughness: .035 }));
rearPhoto.name = 'Foto retro su plexiglass'; rearPhoto.position.z = -.026; rearPhoto.rotation.y = Math.PI; album.add(rearPhoto);
const rearPlex = box(album, 'Spessore plexiglass retro', [.4, .3, .002], [0, 0, -.0272], plex); rearPlex.castShadow = false;
const loader = new THREE.TextureLoader(), textureCache = new Map();
function busy() { $('downloadClient').disabled = pending > 0 || applying; notify('busy', { busy: pending > 0 || applying }); }
function configuration() {
  const variant = variants.find(v => v.id === selected);
  const c = { modelId, assetRevision: configurationRevision, materialId: selected, appearanceRevision: variant.appearanceRevision,
    coverLayout: $('coverLayout').value, frameFinish: $('frameFinish').value, topText: $('topText').value, bottomText: $('bottomText').value,
    photoAssetId: photo?.id || null, crop: { zoom: +$('photoZoom').value, x: +$('photoX').value / 100, y: +$('photoY').value / 100 } };
  if (configurationRevision >= 2) Object.assign(c, { backCover: $('backCover').value, backPhotoAssetId: backPhoto?.id || null, backCrop: { zoom: +$('backZoom').value, x: +$('backX').value / 100, y: +$('backY').value / 100 } });
  if (configurationRevision === 3) c.engravingNames = { first: $('firstName').value.trim(), second: $('secondName').value.trim() };
  return c;
}
function summary() {
  const material = option?.materials.find(m => m.id === selected) || variants.find(v => v.id === selected);
  const name = option?.name || 'Album girevole'; $('modelTitle').textContent = name;
  $('materialLabel').textContent = material.label;
  const engraving = configurationRevision === 3 ? `Monogramma botanico: ${$('firstName').value.trim()} · ${$('secondName').value.trim()}` : `Incisione: ${$('topText').value} · ${$('bottomText').value}`;
  $('configurationSummary').textContent = `${name}\nTessuto: ${material.label}\nStruttura: ${$('frameFinish').selectedOptions[0].text}\nCopertina: ${$('coverLayout').selectedOptions[0].text}\n${$('coverLayout').value === 'plaque' ? engraving : `Foto: ${photo?.name || 'Da scegliere'}`}`;
  $('configurationSummary').textContent += `\nRetro: ${$('backCover').value === 'photo' ? `Foto su plexiglass · ${backPhoto?.name || 'Da scegliere'}` : 'Tessuto coordinato'}`;
  if (initialized && !applying) notify('change', { configuration: configuration() });
}
function finishFrame() {
  const finish = $('frameFinish').value;
  frameMaterial.map = finish === 'fabric' ? fabric.map : finish === 'wood' ? woodMap : null;
  frameMaterial.bumpMap = finish === 'fabric' ? fabric.bumpMap : null;
  frameMaterial.bumpScale = fabric.bumpScale;
  frameMaterial.color.set(finish === 'white' ? '#f3f1e9' : '#ffffff');
  frameMaterial.roughness = finish === 'fabric' ? fabric.roughness : .68; frameMaterial.needsUpdate = true;
}
async function finish(id) {
  const v = variants.find(v => v.id === id); if (!v || (option && !option.materials.some(m => m.id === id))) throw new Error('Rivestimento non disponibile');
  const token = ++materialRequest; pending++; busy();
  try {
    if (!textureCache.has(id)) textureCache.set(id, Promise.all([loader.loadAsync(new URL(v.textureUrl, catalogUrl).href), loader.loadAsync(new URL(v.heightUrl, catalogUrl).href)]).catch(error => { textureCache.delete(id); throw error; }));
    const [color, height] = await textureCache.get(id); if (token !== materialRequest) return;
    color.colorSpace = THREE.SRGBColorSpace;
    for (const t of [color, height]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(.4 / v.estimatedRepeatMeters, .3 / v.estimatedRepeatMeters); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    selected = id; fabric.map = color; fabric.bumpMap = height; fabric.bumpScale = v.bumpScale; fabric.roughness = v.roughness; fabric.color.set('#ffffff'); fabric.needsUpdate = true;
    document.querySelectorAll('[data-finish]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finish === id)));
    finishFrame(); $('status').textContent = '';
  } finally { pending--; busy(); summary(); }
}
function updateCover() {
  const layout = $('coverLayout').value, isPlaque = layout === 'plaque';
  plaque.visible = isPlaque; inscription.visible = isPlaque; cover.visible = !isPlaque;
  $('photoControls').hidden = isPlaque; $('engravingControls').hidden = !isPlaque;
  cover.scale.set(layout === 'photo-plaque' ? .195 / .4 : 1, layout === 'photo-plaque' ? .137 / .3 : 1, 1);
  const ctx = coverCanvas.getContext('2d'); ctx.fillStyle = '#e6dfd3'; ctx.fillRect(0, 0, 1600, 1200);
  if (photoMap) {
    const image = photoMap.image, areaAspect = layout === 'photo-plaque' ? .195 / .137 : 4 / 3;
    const imageAspect = image.width / image.height, zoom = +$('photoZoom').value;
    const sw = image.width * Math.min(1, areaAspect / imageAspect) / zoom, sh = image.height * Math.min(1, imageAspect / areaAspect) / zoom;
    ctx.drawImage(image, (image.width - sw) * +$('photoX').value / 100, (image.height - sh) * +$('photoY').value / 100, sw, sh, 0, 0, 1600, 1200);
  } else { ctx.fillStyle = '#867a68'; ctx.font = '55px Georgia'; ctx.textAlign = 'center'; ctx.fillText('La tua fotografia', 800, 620); }
  coverMap.needsUpdate = true;
  const ic = inscriptionCanvas.getContext('2d'); ic.clearRect(0, 0, 1600, 1100); ic.fillStyle = '#634120'; ic.textAlign = 'center'; ic.textBaseline = 'middle';
  $('legacyEngraving').hidden = configurationRevision === 3;
  if (configurationRevision === 3) drawMonogram(inscriptionCanvas, $('firstName').value, $('secondName').value);
  else for (const [id, y, initial] of [['topText', 470, 135], ['bottomText', 660, 65]]) {
    let size = initial; ic.font = `${size}px Georgia`; while (ic.measureText($(id).value).width > 1400 && size > 16) { size--; ic.font = `${size}px Georgia`; }
    ic.fillText($(id).value, 800, y);
  }
  const preview = $('engravingPreview'); const previewCtx = preview.getContext('2d');
  previewCtx.clearRect(0, 0, preview.width, preview.height); previewCtx.drawImage(inscriptionCanvas, 0, 0, preview.width, preview.height);
  inscriptionMap.needsUpdate = true; document.body.dataset.coverLayout = layout; updateBack(); finishFrame(); summary();
}
function updateBack() {
  const active = $('backCover').value === 'photo';
  rearPhoto.visible = rearPlex.visible = active; $('backPhotoControls').hidden = !active;
  document.body.dataset.backCover = $('backCover').value;
  const ctx = backCanvas.getContext('2d'); ctx.fillStyle = '#e6dfd3'; ctx.fillRect(0, 0, 1600, 1200);
  if (backPhotoMap) {
    const image = backPhotoMap.image, aspect = image.width / image.height, zoom = +$('backZoom').value;
    const sw = image.width * Math.min(1, (4 / 3) / aspect) / zoom, sh = image.height * Math.min(1, aspect / (4 / 3)) / zoom;
    ctx.drawImage(image, (image.width - sw) * +$('backX').value / 100, (image.height - sh) * +$('backY').value / 100, sw, sh, 0, 0, 1600, 1200);
  } else { ctx.fillStyle = '#867a68'; ctx.font = '55px Georgia'; ctx.textAlign = 'center'; ctx.fillText('La fotografia del retro', 800, 620); }
  backMap.needsUpdate = true;
}
async function setPhoto(input, side = 'front') {
  if (!(input.blob instanceof Blob) || input.blob.size > 20 * 1024 * 1024) throw new Error('Foto non valida o superiore a 20 MB');
  pending++; busy(); const url = URL.createObjectURL(input.blob);
  try {
    const candidate = await loader.loadAsync(url);
    if (candidate.image.width * candidate.image.height > 40000000) { candidate.dispose(); throw new Error('Foto superiore a 40 megapixel'); }
    edited();
    if (side === 'back') {
      backPhotoMap?.dispose(); backPhotoMap = candidate; backPhoto = { id: input.id, name: input.name, source: input.source };
      $('backPhotoStatus').textContent = input.name; $('backZoom').value = 1; $('backX').value = $('backY').value = 50; $('backCover').value = 'photo';
    } else {
      photoMap?.dispose(); photoMap = candidate; photo = { id: input.id, name: input.name, source: input.source };
      $('photoStatus').textContent = input.name; $('photoZoom').value = 1; $('photoX').value = $('photoY').value = 50;
    }
    updateCover();
  } finally { URL.revokeObjectURL(url); pending--; busy(); }
}
function fail(error) { $('status').textContent = error.message || 'Operazione non riuscita'; notify('error', { message: $('status').textContent }); }
for (const family of catalog.families) {
  const items = variants.filter(v => v.familyId === family.id); if (!items.length) continue;
  const details = document.createElement('details'); details.className = 'category';
  const title = document.createElement('summary'); title.textContent = family.name; details.append(title);
  const grid = document.createElement('div'); grid.className = 'materials'; details.append(grid);
  for (const v of items) {
    const button = document.createElement('button'); button.dataset.finish = v.id;
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundImage = `url('${new URL(v.textureUrl, catalogUrl).href}')`;
    button.append(swatch, document.createTextNode(v.label)); button.onclick = () => { edited(); finish(v.id).catch(fail); }; grid.append(button);
  }
  $('materials').append(details);
}
for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => {
  for (const tab of document.querySelectorAll('[data-panel]')) { tab.setAttribute('aria-pressed', String(tab === button)); $(tab.dataset.panel).hidden = tab !== button; }
};
for (const id of ['coverLayout', 'frameFinish', 'backCover']) $(id).onchange = () => { edited(); updateCover(); if (id === 'backCover') view([0, .1, -1]); };
for (const id of ['topText', 'bottomText', 'photoZoom', 'photoX', 'photoY', 'backZoom', 'backX', 'backY']) $(id).oninput = () => { edited(); updateCover(); };
for (const id of ['firstName', 'secondName']) $(id).oninput = () => { configurationRevision = 3; updateCover(); };
$('coverUpload').onchange = () => { const file = $('coverUpload').files[0]; if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) setPhoto({ blob: file, name: file.name, source: 'local' }).catch(fail); };
$('backUpload').onchange = () => { const file = $('backUpload').files[0]; if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) setPhoto({ blob: file, name: file.name, source: 'local' }, 'back').then(() => view([0, .1, -1])).catch(fail); };
function setRotation(degrees) { pivot.rotation.y = THREE.MathUtils.degToRad(degrees); $('rotationValue').value = `${Math.round(degrees)}°`; document.body.dataset.rotation = String(degrees); }
$('rotation').oninput = () => { automatic = false; $('rotate').setAttribute('aria-pressed', 'false'); setRotation(+$('rotation').value); };
$('rotate').onclick = () => { automatic = !automatic; $('rotate').setAttribute('aria-pressed', String(automatic)); };
function view(direction = [-.5, .32, 1]) {
  const sphere = new THREE.Box3().setFromObject(product).getBoundingSphere(new THREE.Sphere());
  controls.target.copy(sphere.center); const distance = Math.max(.3, sphere.radius * 1.1) / Math.sin(Math.min(Math.PI / 10, Math.atan(Math.tan(Math.PI / 10) * camera.aspect)));
  camera.position.copy(controls.target).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance)); controls.update();
}
$('front').onclick = () => view([0, 0, 1]); $('back').onclick = () => view([0, 0, -1]); $('spine').onclick = () => view([-1, 0, .08]);
function extract(percent) {
  const starting = album.position.x === 0 && percent > 0;
  automatic = false; $('rotate').setAttribute('aria-pressed', 'false');
  $('rotation').disabled = $('rotate').disabled = percent > 0;
  if (percent > 0) { $('rotation').value = -90; setRotation(-90); }
  album.position.x = .48 * percent / 100;
  $('extractValue').value = `${percent}%`; document.body.dataset.extraction = String(percent);
  const direction = starting ? [-1, .3, 1] : camera.position.clone().sub(controls.target).toArray(); view(direction);
}
$('extract').oninput = () => extract(+$('extract').value);
$('reset').onclick = () => { $('extract').value = 0; extract(0); $('rotation').value = 25; setRotation(25); view(); };
for (const [id, factor] of [['plus', .8], ['minus', 1.25]]) $(id).onclick = () => { const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, .45, 3)); camera.position.copy(controls.target).add(offset); controls.update(); };
let homePose;
const home = installHomeScenes({ scene, camera, controls, ground, product, album,
  beforeEnter() { homePose = { x: album.position.x, angle: pivot.rotation.y, automatic }; album.position.x = 0; pivot.rotation.y = 0; automatic = false; },
  afterLeave() { album.position.x = homePose.x; pivot.rotation.y = homePose.angle; automatic = homePose.automatic; }
});
new ResizeObserver(() => { const stage = $('viewport').parentElement; renderer.setSize(stage.clientWidth, stage.clientHeight, false); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); view(); }).observe($('viewport').parentElement);
let last = 0;
renderer.setAnimationLoop(time => { if (automatic) { const angle = ((THREE.MathUtils.radToDeg(pivot.rotation.y) + Math.min(time - last, 100) * .018 + 180) % 360) - 180; $('rotation').value = angle; setRotation(angle); } last = time; controls.update(); home.update(); renderer.render(scene, camera); });
function previews() {
  const resumeHome = home.suspend();
  const oldSize = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio(), oldAngle = pivot.rotation.y, oldX = album.position.x;
  const exportCamera = new THREE.PerspectiveCamera(36, 4 / 3, .005, 20);
  const views = [['Prospettiva · album ruotato', [-.5, .3, 1], 25, 0], ['Fronte · allineato', [0, 0, 1], 0, 0], ['Retro · finitura selezionata', [0, 0, -1], 0, 0], ['Dorso · rotazione 90°', [0, .15, 1], 90, 0], ['Lato destro', [1, .2, .1], 0, 0], ['Vista superiore', [0, 1, .01], 30, 0], ['Album estratto · copertina', [-1, .3, 1], -90, .48], ['Album estratto · retro', [1, .3, 1], -90, .48]];
  try {
    renderer.setPixelRatio(1); renderer.setSize(1600, 1200, false); ground.visible = false;
    return views.map(([label, direction, degrees, x]) => {
      pivot.rotation.y = THREE.MathUtils.degToRad(degrees); album.position.x = x;
      const sphere = new THREE.Box3().setFromObject(product).getBoundingSphere(new THREE.Sphere());
      exportCamera.position.set(...direction).normalize().multiplyScalar(sphere.radius / Math.sin(Math.PI / 10) * 1.1).add(sphere.center); exportCamera.lookAt(sphere.center);
      renderer.render(scene, exportCamera); return { label, image: renderer.domElement.toDataURL('image/jpeg', .82) };
    });
  } finally { album.position.x = oldX; pivot.rotation.y = oldAngle; ground.visible = true; renderer.setPixelRatio(oldRatio); renderer.setSize(oldSize.x, oldSize.y, false); resumeHome(); renderer.render(scene, camera); }
}
$('downloadClient').onclick = () => {
  try {
    const c = configuration(), material = option?.materials.find(m => m.id === selected) || variants.find(v => v.id === selected);
    const report = { model: { name: option?.name || 'Album girevole' }, branding: { name: 'Image Studio' }, material, coverLayout: { label: $('coverLayout').selectedOptions[0].text }, photo: photo || { source: 'none' }, createdAt: new Date().toISOString(), ...{ configuration: c } };
    const rows = [['Rivestimento album', material.label], ['Finitura struttura', $('frameFinish').selectedOptions[0].text], ['Copertina', report.coverLayout.label], ['Incisione nomi', c.coverLayout === 'plaque' ? c.topText : '—'], ['Incisione dedica', c.coverLayout === 'plaque' ? c.bottomText : '—'], ['Formato dichiarato', '30 × 80 cm; proporzioni indicative']];
    rows.push(['Retro album', $('backCover').value === 'photo' ? 'Foto a tutta superficie su plexiglass' : 'Tessuto coordinato'], ['Foto retro', $('backCover').value === 'photo' ? backPhoto?.name || 'Da scegliere' : '—']);
    if (c.engravingNames && c.coverLayout === 'plaque') { rows[3] = ['Primo nome inciso', c.engravingNames.first]; rows[4] = ['Secondo nome inciso', c.engravingNames.second]; rows.push(['Grafica incisione', 'Monogramma botanico con iniziali automatiche']); }
    const url = URL.createObjectURL(new Blob([buildAlbumReport({ configuration: report, previews: previews(), rows, internal: false })], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'album-girevole-anteprima.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { fail(error); }
};
function lock() { for (const control of document.querySelectorAll('#materials button,#detailPanel input,#detailPanel select')) control.disabled = locked; }
if (embedded) {
  $('coverUpload').hidden = true; document.querySelector('label[for="coverUpload"]').hidden = true;
  $('photoStatus').textContent = 'Scegli la foto dai comandi sopra il visualizzatore.';
  $('backUpload').hidden = true; document.querySelector('label[for="backUpload"]').hidden = true;
  $('backPhotoStatus').textContent = 'Seleziona “Retro in plexiglass” nei comandi foto sopra il visualizzatore.';
  window.addEventListener('message', async event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== 'memorie-mockup-v1') return;
    const data = event.data;
    if (data.type === 'lock') { locked = !!data.readOnly; lock(); return; }
    if (data.type === 'export') {
      try { if (pending || applying) throw new Error('Attendi il caricamento'); notify('exported', { requestId: data.requestId, previews: previews(), configuration: configuration() }); }
      catch { notify('export-error', { requestId: data.requestId }); } return;
    }
    if (data.type !== 'apply' || applying) return;
    applying = true; busy();
    try {
      locked = !!data.readOnly;
      if (data.option) {
        if (!data.configuration) edited();
        if (data.option.rendererId !== modelId) throw new Error('Modello non supportato'); option = data.option;
        for (const b of document.querySelectorAll('[data-finish]')) { const m = option.materials.find(m => m.id === b.dataset.finish); b.hidden = !m; if (m) b.lastChild.textContent = m.label; }
        for (const section of document.querySelectorAll('.category')) section.hidden = !section.querySelector('[data-finish]:not([hidden])');
        if (!data.configuration && !option.materials.some(m => m.id === selected)) await finish(option.materials[0].id);
      }
      if (data.photo) await setPhoto(data.photo);
      if (data.backPhoto) await setPhoto(data.backPhoto, 'back');
      const c = data.configuration;
      if (c) {
        if (c.modelId !== modelId || ![1, 2, 3].includes(c.assetRevision)) throw new Error('Revisione del modello non supportata');
        configurationRevision = c.assetRevision;
        $('firstName').value = c.engravingNames?.first || ''; $('secondName').value = c.engravingNames?.second || '';
        $('backCover').value = c.backCover || 'fabric';
        $('backZoom').value = c.backCrop?.zoom ?? 1; $('backX').value = (c.backCrop?.x ?? .5) * 100; $('backY').value = (c.backCrop?.y ?? .5) * 100;
        for (const id of ['coverLayout', 'frameFinish', 'topText', 'bottomText']) $(id).value = c[id];
        $('photoZoom').value = c.crop.zoom; $('photoX').value = c.crop.x * 100; $('photoY').value = c.crop.y * 100;
        await finish(c.materialId);
      }
      updateCover(); if (data.backPhoto && !c) view([0, .1, -1]); lock(); notify('applied');
    } catch (error) { fail(error); }
    finally { applying = false; initialized = true; busy(); summary(); }
  });
}
try { setRotation(25); view(); await finish(selected); updateCover(); document.body.dataset.ready = 'true'; busy(); notify('ready'); }
catch (error) { fail(error); }
