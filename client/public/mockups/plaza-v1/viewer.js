import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAlbumReport } from '../custodia-v1/report-template.js';
import { drawMonogram } from '../girevole-v3/monogram.js';
import { installHomeScenes } from '../home-scenes.js';
import { phoneView, fitPhoneProduct, phoneDetailDistance } from '../mobile-view.js';
import { getExportSize, setExportProgress, triggerDownload, yieldToBrowser } from '../export-yield.js';
import { installFabricSampling } from '../fabric-sampling.js';

const $ = id => document.getElementById(id);
const embedded = window.parent !== window;
const notify = (type, payload = {}) => { if (embedded) window.parent.postMessage({ channel: 'memorie-mockup-v1', type, ...payload }, location.origin); };
const modelId = 'plaza-led';
let option, locked = false, applying = false, initialized = !embedded, pending = 0, automatic = false, exporting = false;
let photo = null, photoMap = null, backPhoto = null, backPhotoMap = null, materialRequest = 0;
const configurationRevision = 1;
let monogramEnabled = true;
const catalogUrl = new URL('../custodia-v1/peppe-lab-catalog.json', location.href);
const catalogResponse = await fetch(catalogUrl);
if (!catalogResponse.ok) throw new Error('Campionario non disponibile');
const catalog = await catalogResponse.json();
const variants = catalog.variants;
let selected = variants.find(v => v.legacyId === 'mist-03')?.id || variants[0].id;

const renderer = new THREE.WebGLRenderer({ canvas: $('viewport'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color('#eae8e1');
const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer); const environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture; scene.environmentIntensity = .45; room.dispose(); pmrem.dispose();
scene.add(new THREE.HemisphereLight(0xffffff, 0xb2a68e, .8));
const light = new THREE.DirectionalLight(0xfff6e8, 1.7); light.position.set(-.8, 1.4, 1); light.castShadow = true; light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -.9, right: .9, top: .8, bottom: -.8, near: .01, far: 4 }); light.shadow.bias = -.00008; scene.add(light);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.ShadowMaterial({ opacity: .15 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -.002; ground.receiveShadow = true; scene.add(ground);
const camera = new THREE.PerspectiveCamera(36, 1, .005, 20);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.enablePan = false; controls.minDistance = .45; controls.maxDistance = 3;
if (phoneView) { controls.minDistance = .09; controls.enablePan = true; controls.panSpeed = .8; }
let fatalReported = false;
const reportFatal = (message = 'Anteprima 3D interrotta') => { if (fatalReported) return; fatalReported = true; document.body.dataset.ready = 'false'; $('status').textContent = 'Anteprima 3D interrotta. Riprova a caricare.'; renderer.setAnimationLoop(null); notify('fatal-error', { message }); };
renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); reportFatal('Il contesto WebGL dell’anteprima non è più disponibile'); }, false);
if (embedded) {
  window.addEventListener('error', event => { if (document.body.dataset.ready === 'true') reportFatal(event.error?.message || event.message || 'Errore del renderer 3D'); });
  window.addEventListener('unhandledrejection', event => { if (document.body.dataset.ready === 'true') reportFatal(event.reason?.message || String(event.reason || 'Errore del renderer 3D')); });
}

const product = new THREE.Group(); scene.add(product);
const fixedFrame = new THREE.Group(); fixedFrame.name = 'Cornice fissa posteriore'; fixedFrame.position.x = .08; product.add(fixedFrame);
const mobilePivot = new THREE.Group(); mobilePivot.name = 'Asse verticale laterale sinistro'; mobilePivot.position.set(-.28, .23, .075); product.add(mobilePivot);
const mobileFrame = new THREE.Group(); mobileFrame.name = 'Seconda cornice mobile'; mobilePivot.add(mobileFrame);
const album = new THREE.Group(); album.name = 'Album estraibile verso destra'; album.position.x = .24; mobileFrame.add(album);

const fabric = new THREE.MeshStandardMaterial({ color: '#a49c90', roughness: .95 });
const frameMaterial = new THREE.MeshStandardMaterial({ roughness: .68 });
const plex = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: .002, ior: 1.49, roughness: .025, side: THREE.DoubleSide, depthWrite: false });
const ledMaterial = new THREE.MeshStandardMaterial({ color: '#ffd28a', emissive: '#ffb342', emissiveIntensity: 0, roughness: .3 });
const metal = new THREE.MeshStandardMaterial({ color: '#777c7d', metalness: .9, roughness: .25 });
installFabricSampling(fabric, THREE); installFabricSampling(frameMaterial, THREE);
const woodCanvas = document.createElement('canvas'); woodCanvas.width = 512; woodCanvas.height = 1024; const wc = woodCanvas.getContext('2d');
wc.fillStyle = '#c7a879'; wc.fillRect(0, 0, 512, 1024);
for (let i = 0; i < 500; i++) { const x = (i * 73.37) % 512; wc.strokeStyle = `rgba(94,64,31,${.025 + (i % 9) * .007})`; wc.lineWidth = .4 + (i % 4) * .35; wc.beginPath(); wc.moveTo(x, 0); wc.bezierCurveTo(x + Math.sin(i) * 12, 330, x + Math.cos(i) * 8, 680, x + Math.sin(i * 2) * 9, 1024); wc.stroke(); }
const woodMap = new THREE.CanvasTexture(woodCanvas); woodMap.colorSpace = THREE.SRGBColorSpace;
const wood = new THREE.MeshStandardMaterial({ map: woodMap, roughness: .7 });
function box(parent, name, size, position, material) { const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.name = name; mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; }

// Telaio grande fisso: il LED occupa tre lati dell’apertura, come nella reference.
for (const [name, size, position] of [
  ['Montante fisso sinistro', [.032, .58, .11], [-.36, .23, 0]],
  ['Montante fisso destro', [.032, .58, .11], [.36, .23, 0]],
  ['Traversa fissa superiore', [.752, .032, .11], [0, .504, 0]],
  ['Base fissa', [.752, .032, .11], [0, -.044, 0]],
]) box(fixedFrame, name, size, position, frameMaterial);
const ledBars = [
  box(fixedFrame, 'LED superiore', [.62, .009, .018], [-.02, .458, .063], ledMaterial),
  box(fixedFrame, 'LED laterale sinistro', [.009, .51, .018], [-.315, .205, .063], ledMaterial),
  box(fixedFrame, 'LED inferiore', [.62, .009, .018], [-.02, -.048, .063], ledMaterial),
];
const ledLights = [new THREE.PointLight('#ffd18b', 0, .7, 2), new THREE.PointLight('#ffd18b', 0, .7, 2), new THREE.PointLight('#ffd18b', 0, .7, 2)];
ledLights[0].position.set(-.02, .44, .12); ledLights[1].position.set(-.30, .2, .12); ledLights[2].position.set(-.02, -.03, .12); ledLights.forEach(light => { light.castShadow = false; fixedFrame.add(light); });
const rearCanvas = document.createElement('canvas'); rearCanvas.width = 1600; rearCanvas.height = 1200; const rearMap = new THREE.CanvasTexture(rearCanvas); rearMap.colorSpace = THREE.SRGBColorSpace;
const rearPhoto = new THREE.Mesh(new THREE.PlaneGeometry(.62, .51), new THREE.MeshPhysicalMaterial({ map: rearMap, roughness: .25, clearcoat: 1, clearcoatRoughness: .035 })); rearPhoto.name = 'Foto telaio fisso'; rearPhoto.position.set(-.02, .205, -.059); rearPhoto.rotation.y = Math.PI; fixedFrame.add(rearPhoto);
const rearPlex = box(fixedFrame, 'Plexiglass telaio fisso', [.62, .51, .002], [-.02, .205, -.062], plex); rearPlex.castShadow = false;

// Seconda cornice mobile: il perno è a sinistra e l’album scorre verso destra.
for (const [name, size, position] of [
  ['Cornice mobile superiore', [.5, .024, .065], [.24, .19, .01]],
  ['Cornice mobile inferiore', [.5, .024, .065], [.24, -.19, .01]],
  ['Cornice mobile sinistra', [.024, .4, .065], [0, 0, .01]],
  ['Cornice mobile destra', [.024, .4, .065], [.48, 0, .01]],
]) box(mobileFrame, name, size, position, frameMaterial);
box(mobileFrame, 'Perno verticale superiore', [.018, .018, .09], [0, .21, .02], metal);
box(mobileFrame, 'Perno verticale inferiore', [.018, .018, .09], [0, -.21, .02], metal);
box(album, 'Blocco pagine album', [.44, .35, .045], [.24, 0, 0], new THREE.MeshStandardMaterial({ color: '#eee7d6', roughness: .95 }));
box(album, 'Retro tessuto album', [.45, .36, .004], [.24, 0, -.028], fabric);
const coverCanvas = document.createElement('canvas'); coverCanvas.width = 1600; coverCanvas.height = 1200; const coverMap = new THREE.CanvasTexture(coverCanvas); coverMap.colorSpace = THREE.SRGBColorSpace;
const cover = new THREE.Mesh(new THREE.PlaneGeometry(.45, .36), new THREE.MeshStandardMaterial({ map: coverMap, roughness: .38 })); cover.position.set(.24, 0, .029); album.add(cover);
const splitFabricPanel = new THREE.Mesh(new THREE.PlaneGeometry(.225, .36), fabric); splitFabricPanel.name = 'Metà copertina in tessuto'; splitFabricPanel.position.set(.1275, 0, .029); album.add(splitFabricPanel);
const inscriptionCanvas = document.createElement('canvas'); inscriptionCanvas.width = 1600; inscriptionCanvas.height = 1100; const inscriptionMap = new THREE.CanvasTexture(inscriptionCanvas); inscriptionMap.colorSpace = THREE.SRGBColorSpace;
const inscription = new THREE.Mesh(new THREE.PlaneGeometry(.21, .15), new THREE.MeshBasicMaterial({ map: inscriptionMap, transparent: true, depthWrite: false })); inscription.position.set(.24, 0, .032); album.add(inscription);
const plaque = box(album, 'Placchetta centrale', [.21, .15, .004], [.24, 0, .027], wood);
const loader = new THREE.TextureLoader(), textureCache = new Map();
function busy() { $('downloadClient').disabled = pending > 0 || applying || exporting; notify('busy', { busy: pending > 0 || applying || exporting }); }
function edited() { updateBack(); }
function configuration() {
  const variant = variants.find(v => v.id === selected);
  const c = { modelId, assetRevision: configurationRevision, materialId: selected, appearanceRevision: variant.appearanceRevision, coverLayout: $('coverLayout').value, frameFinish: $('frameFinish').value, topText: $('topText').value, bottomText: $('bottomText').value, photoAssetId: photo?.id || null, crop: { zoom: +$('photoZoom').value, x: +$('photoX').value / 100, y: +$('photoY').value / 100 }, backCover: $('backCover').value, backPhotoAssetId: backPhoto?.id || null, backCrop: { zoom: +$('backZoom').value, x: +$('backX').value / 100, y: +$('backY').value / 100 }, ledEnabled: $('ledEnabled').checked };
  if (monogramEnabled) c.engravingNames = { first: $('firstName').value.trim(), second: $('secondName').value.trim() };
  return c;
}
function summary() {
  const material = option?.materials.find(m => m.id === selected) || variants.find(v => v.id === selected); $('modelTitle').textContent = option?.name || 'Plaza LED'; $('materialLabel').textContent = material.label;
  const c = configuration(); const engraved = ['plaque', 'split-photo-fabric'].includes(c.coverLayout);
  $('configurationSummary').textContent = `${option?.name || 'Plaza LED'}\nTessuto: ${material.label}\nDoppia cornice: ${$('frameFinish').selectedOptions[0].text}\nLED: ${c.ledEnabled ? 'Acceso' : 'Spento'}\nCopertina album: ${$('coverLayout').selectedOptions[0].text}\n${engraved ? `Nomi: ${c.engravingNames?.first || ''} · ${c.engravingNames?.second || ''}` : `Foto: ${photo?.name || 'Da scegliere'}`}\nTelaio fisso: ${c.backCover === 'photo' ? `Foto stampata · ${backPhoto?.name || 'Da scegliere'}` : 'Trasparente, senza stampa'}`;
  if (initialized && !applying) notify('change', { configuration: c });
}
function finishFrame() {
  const finish = $('frameFinish').value; frameMaterial.map = finish === 'fabric' ? fabric.map : finish === 'wood' ? woodMap : null; frameMaterial.bumpMap = finish === 'fabric' ? fabric.bumpMap : null; frameMaterial.bumpScale = fabric.bumpScale; frameMaterial.color.set(finish === 'white' ? '#f3f1e9' : '#ffffff'); frameMaterial.roughness = finish === 'fabric' ? fabric.roughness : .68; frameMaterial.needsUpdate = true;
}
async function finish(id) {
  const v = variants.find(v => v.id === id); if (!v || (option && !option.materials.some(m => m.id === id))) throw new Error('Rivestimento non disponibile');
  const token = ++materialRequest; pending++; busy();
  try {
    if (!textureCache.has(id)) textureCache.set(id, Promise.all([loader.loadAsync(new URL(v.textureUrl, catalogUrl).href), loader.loadAsync(new URL(v.heightUrl, catalogUrl).href)]).catch(error => { textureCache.delete(id); throw error; }));
    const [color, height] = await textureCache.get(id); if (token !== materialRequest) return; color.colorSpace = THREE.SRGBColorSpace;
    for (const t of [color, height]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(.45 / v.estimatedRepeatMeters, .36 / v.estimatedRepeatMeters); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    selected = id; fabric.map = color; fabric.bumpMap = height; fabric.bumpScale = v.bumpScale * .55; fabric.roughness = v.roughness; fabric.color.set('#ffffff'); fabric.needsUpdate = true; document.querySelectorAll('[data-finish]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.finish === id))); finishFrame(); $('status').textContent = '';
  } finally { pending--; busy(); summary(); }
}
function updateLed() {
  const enabled = $('ledEnabled').checked; ledBars.forEach(bar => { bar.visible = true; }); ledMaterial.emissiveIntensity = enabled ? 3.4 : 0; ledLights.forEach(item => { item.intensity = enabled ? .55 : 0; }); document.body.dataset.led = String(enabled); summary();
}
function updateCover() {
  const layout = $('coverLayout').value, isPlaque = layout === 'plaque', isSplit = layout === 'split-photo-fabric', hasEngraving = isPlaque || isSplit;
  plaque.visible = isPlaque; splitFabricPanel.visible = isSplit; inscription.visible = hasEngraving; cover.visible = !isPlaque; cover.scale.set(isSplit ? .5 : 1, 1, 1); inscription.scale.set(isSplit ? .92 : 1, isSplit ? .92 : 1, 1);
  $('photoControls').hidden = isPlaque; $('engravingControls').hidden = !hasEngraving; $('legacyEngraving').hidden = monogramEnabled;
  const ctx = coverCanvas.getContext('2d'); ctx.fillStyle = '#e6dfd3'; ctx.fillRect(0, 0, 1600, 1200);
  if (photoMap) { const image = photoMap.image, areaAspect = isSplit ? .225 / .36 : 1.25, imageAspect = image.width / image.height, zoom = +$('photoZoom').value; const sw = image.width * Math.min(1, areaAspect / imageAspect) / zoom, sh = image.height * Math.min(1, imageAspect / areaAspect) / zoom; ctx.drawImage(image, (image.width - sw) * +$('photoX').value / 100, (image.height - sh) * +$('photoY').value / 100, sw, sh, 0, 0, 1600, 1200); }
  else { ctx.fillStyle = '#867a68'; ctx.font = '55px Georgia'; ctx.textAlign = 'center'; ctx.fillText('La tua fotografia', 800, 620); } coverMap.needsUpdate = true;
  const ic = inscriptionCanvas.getContext('2d'); ic.clearRect(0, 0, 1600, 1100); ic.fillStyle = '#634120'; ic.textAlign = 'center'; ic.textBaseline = 'middle'; if (monogramEnabled) drawMonogram(inscriptionCanvas, $('firstName').value, $('secondName').value); else { ic.font = '110px Georgia'; ic.fillText($('topText').value, 800, 470); ic.font = '70px Georgia'; ic.fillText($('bottomText').value, 800, 660); } const preview = $('engravingPreview'); preview.getContext('2d').clearRect(0, 0, preview.width, preview.height); preview.getContext('2d').drawImage(inscriptionCanvas, 0, 0, preview.width, preview.height); inscriptionMap.needsUpdate = true; document.body.dataset.coverLayout = layout; finishFrame(); summary();
}
function updateBack() {
  const active = $('backCover').value === 'photo'; rearPhoto.visible = rearPlex.visible = active; $('backPhotoControls').hidden = !active; document.body.dataset.backCover = $('backCover').value;
  const ctx = rearCanvas.getContext('2d'); ctx.fillStyle = '#e6dfd3'; ctx.fillRect(0, 0, 1600, 1200);
  if (backPhotoMap) { const image = backPhotoMap.image, aspect = image.width / image.height, zoom = +$('backZoom').value, areaAspect = .62 / .51; const sw = image.width * Math.min(1, areaAspect / aspect) / zoom, sh = image.height * Math.min(1, aspect / areaAspect) / zoom; ctx.drawImage(image, (image.width - sw) * +$('backX').value / 100, (image.height - sh) * +$('backY').value / 100, sw, sh, 0, 0, 1600, 1200); } else { ctx.fillStyle = '#867a68'; ctx.font = '55px Georgia'; ctx.textAlign = 'center'; ctx.fillText('La fotografia del telaio', 800, 620); } rearMap.needsUpdate = true; summary();
}
async function setPhoto(input, side = 'front') {
  if (!(input.blob instanceof Blob) || input.blob.size > 20 * 1024 * 1024) throw new Error('Foto non valida o superiore a 20 MB'); pending++; busy(); const url = URL.createObjectURL(input.blob);
  try { const candidate = await loader.loadAsync(url); if (candidate.image.width * candidate.image.height > 40000000) { candidate.dispose(); throw new Error('Foto superiore a 40 megapixel'); } if (side === 'back') { backPhotoMap?.dispose(); backPhotoMap = candidate; backPhoto = { id: input.id, name: input.name, source: input.source }; $('backPhotoStatus').textContent = input.name; $('backZoom').value = 1; $('backX').value = $('backY').value = 50; $('backCover').value = 'photo'; updateBack(); } else { photoMap?.dispose(); photoMap = candidate; photo = { id: input.id, name: input.name, source: input.source }; $('photoStatus').textContent = input.name; $('photoZoom').value = 1; $('photoX').value = $('photoY').value = 50; updateCover(); } } finally { URL.revokeObjectURL(url); pending--; busy(); }
}
function fail(error) { $('status').textContent = error.message || 'Operazione non riuscita'; notify('error', { message: $('status').textContent }); }
for (const family of catalog.families) { const items = variants.filter(v => v.familyId === family.id); if (!items.length) continue; const details = document.createElement('details'); details.className = 'category'; const title = document.createElement('summary'); title.textContent = family.name; details.append(title); const grid = document.createElement('div'); grid.className = 'materials'; details.append(grid); for (const v of items) { const button = document.createElement('button'); button.dataset.finish = v.id; const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundImage = `url('${new URL(v.textureUrl, catalogUrl).href}')`; button.append(swatch, document.createTextNode(v.label)); button.onclick = () => { edited(); finish(v.id).catch(fail); }; grid.append(button); } $('materials').append(details); }
for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => { for (const tab of document.querySelectorAll('[data-panel]')) { tab.setAttribute('aria-pressed', String(tab === button)); $(tab.dataset.panel).hidden = tab !== button; } };
const detailTabs = [...document.querySelectorAll('[data-detail-tab]')], detailSections = [...document.querySelectorAll('[data-detail-panel-section]')]; function selectDetailPanel(panelId) { detailTabs.forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.detailTab === panelId))); detailSections.forEach(section => { section.hidden = section.id !== panelId; }); } detailTabs.forEach(tab => tab.onclick = () => selectDetailPanel(tab.dataset.detailTab)); selectDetailPanel('structurePanel');
for (const id of ['coverLayout', 'frameFinish', 'backCover']) $(id).onchange = () => { edited(); updateCover(); if (id === 'backCover') view([0, .1, -1]); }; $('ledEnabled').onchange = () => { edited(); updateLed(); };
for (const id of ['topText', 'bottomText', 'photoZoom', 'photoX', 'photoY', 'backZoom', 'backX', 'backY']) $(id).oninput = () => { edited(); updateCover(); updateBack(); }; for (const id of ['firstName', 'secondName']) $(id).oninput = () => { edited(); monogramEnabled = true; updateCover(); };
$('coverUpload').onchange = () => { const file = $('coverUpload').files[0]; if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) setPhoto({ blob: file, name: file.name, source: 'local' }).catch(fail); }; $('backUpload').onchange = () => { const file = $('backUpload').files[0]; if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) setPhoto({ blob: file, name: file.name, source: 'local' }, 'back').then(() => view([0, .1, -1])).catch(fail); };
function setRotation(degrees) { mobilePivot.rotation.y = THREE.MathUtils.degToRad(degrees); $('rotationValue').value = `${Math.round(degrees)}°`; document.body.dataset.rotation = String(degrees); }
$('rotation').oninput = () => { automatic = false; $('rotate').setAttribute('aria-pressed', 'false'); setRotation(+$('rotation').value); }; $('rotate').onclick = () => { automatic = !automatic; $('rotate').setAttribute('aria-pressed', String(automatic)); };
function view(direction = [-.6, .32, 1]) { if (phoneView) { camera.position.copy(controls.target).add(new THREE.Vector3(...direction)); controls.minDistance = .09; if (fitPhoneProduct(product, camera, controls)) return; } const sphere = new THREE.Box3().setFromObject(product).getBoundingSphere(new THREE.Sphere()); controls.target.copy(sphere.center); const distance = Math.max(.3, sphere.radius * 1.1) / Math.sin(Math.min(Math.PI / 10, Math.atan(Math.tan(Math.PI / 10) * camera.aspect))); camera.position.copy(controls.target).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance)); controls.update(); }
$('front').onclick = () => view([0, .05, 1]); $('back').onclick = () => view([0, .08, -1]); $('spine').onclick = () => view([-1, .1, .15]);
function extract(percent) { automatic = false; $('rotate').setAttribute('aria-pressed', 'false'); $('rotation').disabled = $('rotate').disabled = percent > 0; if (percent > 0 && +$('rotation').value === 0) { $('rotation').value = 18; setRotation(18); } album.position.x = .24 + .28 * percent / 100; $('extractValue').value = `${percent}%`; document.body.dataset.extraction = String(percent); view([-.6, .3, 1]); }
$('extract').oninput = () => extract(+$('extract').value); $('reset').onclick = () => { $('extract').value = 0; extract(0); $('rotation').value = 18; setRotation(18); view(); };
for (const [id, factor] of [['plus', .8], ['minus', 1.25]]) $(id).onclick = () => { if (phoneView) controls.minDistance = phoneDetailDistance(product, camera, controls); const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance)); camera.position.copy(controls.target).add(offset); controls.update(); }; if (phoneView) controls.addEventListener('change', () => { controls.minDistance = phoneDetailDistance(product, camera, controls); });
let homePose; const home = installHomeScenes({ scene, camera, controls, ground, product, album, beforeEnter() { homePose = { x: album.position.x, angle: mobilePivot.rotation.y, automatic }; album.position.x = .24; mobilePivot.rotation.y = 0; automatic = false; }, afterLeave() { album.position.x = homePose.x; mobilePivot.rotation.y = homePose.angle; automatic = homePose.automatic; } });
new ResizeObserver(() => { if (exporting) return; const stage = $('viewport').parentElement; renderer.setSize(stage.clientWidth, stage.clientHeight, false); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); view(); }).observe($('viewport').parentElement);
let last = 0; const renderLoop = time => { if (automatic) { const angle = ((THREE.MathUtils.radToDeg(mobilePivot.rotation.y) + Math.min(time - last, 100) * .018 + 180) % 360) - 180; $('rotation').value = angle; setRotation(angle); } last = time; controls.update(); home.update(); renderer.render(scene, camera); }; renderer.setAnimationLoop(renderLoop);
async function previews(onProgress) {
  renderer.setAnimationLoop(null); const resumeHome = home.suspend(); const oldSize = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio(), oldAngle = mobilePivot.rotation.y, oldX = album.position.x; const exportCamera = new THREE.PerspectiveCamera(36, 4 / 3, .005, 20);
  const views = [['Prospettiva · Plaza LED', [-.6, .3, 1], 18, .24], ['Fronte · album inserito', [0, .05, 1], 0, .24], ['Retro · telaio fisso', [0, .08, -1], 0, .24], ['Asse laterale', [-1, .1, .15], 90, .24], ['LED spento · struttura', [.4, .25, 1], 18, .24], ['LED acceso · struttura', [.4, .25, 1], 18, .50], ['Album estratto · fronte', [.6, .25, 1], -18, .52], ['Album estratto · retro', [.6, .25, -1], -18, .52]];
  try { const { width, height } = getExportSize(renderer); renderer.setPixelRatio(1); renderer.setSize(width, height, false); ground.visible = false; const output = []; for (let index = 0; index < views.length; index += 1) { const [label, direction, degrees, x] = views[index]; onProgress?.(index + 1, views.length); await yieldToBrowser(); mobilePivot.rotation.y = THREE.MathUtils.degToRad(degrees); album.position.x = x; const ledBefore = $('ledEnabled').checked; $('ledEnabled').checked = label.includes('LED acceso') ? true : label.includes('LED spento') ? false : ledBefore; updateLed(); const sphere = new THREE.Box3().setFromObject(product).getBoundingSphere(new THREE.Sphere()); exportCamera.position.set(...direction).normalize().multiplyScalar(sphere.radius / Math.sin(Math.PI / 10) * 1.1).add(sphere.center); exportCamera.lookAt(sphere.center); renderer.render(scene, exportCamera); output.push({ label, image: renderer.domElement.toDataURL('image/jpeg', .82) }); } $('ledEnabled').checked = configuration().ledEnabled; updateLed(); return output; } finally { album.position.x = oldX; mobilePivot.rotation.y = oldAngle; ground.visible = true; renderer.setPixelRatio(oldRatio); renderer.setSize(oldSize.x, oldSize.y, false); resumeHome(); last = 0; renderer.setAnimationLoop(renderLoop); }
}
async function downloadClient() { if (pending > 0 || applying || exporting) return; exporting = true; busy(); $('downloadStatus').textContent = 'Preparazione del file…'; try { const c = configuration(), material = option?.materials.find(m => m.id === selected) || variants.find(v => v.id === selected); const report = { model: { name: option?.name || 'Plaza LED' }, branding: { name: 'Image Studio' }, material, coverLayout: { label: $('coverLayout').selectedOptions[0].text }, photo: photo || { source: 'none' }, createdAt: new Date().toISOString(), configuration: c }; const rows = [['Rivestimento album', material.label], ['Finitura doppia cornice', $('frameFinish').selectedOptions[0].text], ['Illuminazione LED', c.ledEnabled ? 'Accesa · percorso a U' : 'Spenta'], ['Copertina album', report.coverLayout.label], ['Direzione estrazione', 'Verso destra, asse verticale laterale sinistro'], ['Telaio fisso', $('backCover').value === 'photo' ? 'Foto stampata a tutta superficie' : 'Trasparente, senza stampa']]; const url = URL.createObjectURL(new Blob([buildAlbumReport({ configuration: report, previews: await previews((current, total) => setExportProgress($('downloadStatus'), current, total)), rows, internal: false })], { type: 'text/html;charset=utf-8' })); triggerDownload(url, 'plaza-led-anteprima.html'); setTimeout(() => URL.revokeObjectURL(url), 10000); $('downloadStatus').textContent = 'File preparato: controlla i download del browser.'; } catch (error) { fail(error); $('downloadStatus').textContent = 'Download non riuscito. Riprova.'; } finally { exporting = false; busy(); } }
$('downloadClient').onclick = () => { void downloadClient(); };
function lock() { for (const control of document.querySelectorAll('#materials button,#detailPanel input,#detailPanel select')) control.disabled = locked; }
if (embedded) {
  $('coverUpload').hidden = true; document.querySelector('label[for="coverUpload"]').hidden = true; $('photoStatus').textContent = 'Scegli la foto dai comandi sopra il visualizzatore.';
  $('backUpload').hidden = true; document.querySelector('label[for="backUpload"]').hidden = true; $('backPhotoStatus').textContent = 'Scegli la foto per il telaio fisso. La stampa non segue l’album estratto.';
  window.addEventListener('message', async event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== 'memorie-mockup-v1') return; const data = event.data;
    if (data.type === 'lock') { locked = !!data.readOnly; lock(); return; }
    if (data.type === 'export') { try { if (pending || applying) throw new Error('Attendi il caricamento'); notify('exported', { requestId: data.requestId, previews: await previews(), configuration: configuration() }); } catch { notify('export-error', { requestId: data.requestId }); } return; }
    if (data.type !== 'apply' || applying) return; applying = true; busy();
    try {
      locked = !!data.readOnly;
      if (data.option) { if (!data.configuration) edited(); if (data.option.rendererId !== modelId) throw new Error('Modello non supportato'); option = data.option; for (const b of document.querySelectorAll('[data-finish]')) { const m = option.materials.find(m => m.id === b.dataset.finish); b.hidden = !m; if (m) b.lastChild.textContent = m.label; } for (const section of document.querySelectorAll('.category')) section.hidden = !section.querySelector('[data-finish]:not([hidden])'); if (!data.configuration && option.materials.length && !option.materials.some(m => m.id === selected)) await finish(option.materials[0].id); }
      if (data.photo) await setPhoto(data.photo); if (data.backPhoto) await setPhoto(data.backPhoto, 'back'); const c = data.configuration;
      if (c) { if (c.modelId !== modelId || c.assetRevision !== 1) throw new Error('Revisione del modello non supportata'); monogramEnabled = !!c.engravingNames; $('firstName').value = c.engravingNames?.first || ''; $('secondName').value = c.engravingNames?.second || ''; $('ledEnabled').checked = c.ledEnabled !== false; $('backCover').value = c.backCover || 'fabric'; $('backZoom').value = c.backCrop?.zoom ?? 1; $('backX').value = (c.backCrop?.x ?? .5) * 100; $('backY').value = (c.backCrop?.y ?? .5) * 100; for (const id of ['coverLayout', 'frameFinish', 'topText', 'bottomText']) $(id).value = c[id] || $(id).value; $('photoZoom').value = c.crop?.zoom ?? 1; $('photoX').value = (c.crop?.x ?? .5) * 100; $('photoY').value = (c.crop?.y ?? .5) * 100; await finish(c.materialId); updateLed(); updateBack(); }
      updateCover(); lock(); notify('applied');
    } catch (error) { fail(error); } finally { applying = false; initialized = true; busy(); summary(); }
  });
}
try { $('ledEnabled').checked = true; setRotation(18); extract(0); view(); await finish(selected); updateLed(); updateCover(); updateBack(); document.body.dataset.ready = 'true'; busy(); notify('ready'); } catch (error) { fail(error); }