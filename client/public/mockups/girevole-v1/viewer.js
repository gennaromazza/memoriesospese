import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildAlbumReport } from '../custodia-v1/report-template.js';

const $ = id => document.getElementById(id);
const embedded = window.parent !== window;
const notify = (type, payload = {}) => { if (embedded) window.parent.postMessage({ channel: 'memorie-mockup-v1', type, ...payload }, location.origin); };
const modelId = 'album-girevole';
let option, locked = false, applying = false, initialized = !embedded, pending = 0, automatic = false;
let photo = null, photoMap = null, materialRequest = 0;
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
box(pivot, 'Pagine album', [.39, .29, .042], [.003, 0, 0], new THREE.MeshStandardMaterial({ color: '#eee7d6', roughness: .95 }));
box(pivot, 'Copertina tessuto', [.4, .3, .004], [0, 0, .023], fabric);
box(pivot, 'Retro tessuto', [.4, .3, .004], [0, 0, -.023], fabric);
box(pivot, 'Dorso tessuto', [.01, .3, .05], [-.195, 0, 0], fabric);
// Rigatura leggera del blocco pagine sul taglio laterale.
for (let i = 0; i < 22; i++) box(pivot, 'Taglio pagina', [.0003, .286, .00015], [.1982, 0, -.02 + i * .0019], new THREE.MeshStandardMaterial({ color: '#d7cfbc', roughness: 1 }));
const plex = new THREE.MeshPhysicalMaterial({ color: '#ffffff', transmission: 1, thickness: .002, ior: 1.49, roughness: .025, side: THREE.DoubleSide, depthWrite: false });
// Due lastre aperte lateralmente; incavo semicircolare per la presa a destra.
for (const z of [-.04, .04]) {
  const shape = new THREE.Shape(); shape.moveTo(-.216, -.151); shape.lineTo(.216, -.151); shape.lineTo(.216, -.027);
  shape.absarc(.216, 0, .027, -Math.PI / 2, -3 * Math.PI / 2, true);
  shape.lineTo(.216, .151); shape.lineTo(-.216, .151); shape.closePath();
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape), plex); glass.position.z = z; glass.name = 'Pannello trasparente con presa'; pivot.add(glass);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: '#e5f0ef', transparent: true, opacity: .55 })); edge.position.z = z; pivot.add(edge);
}
const plaque = box(pivot, 'Placchetta in legno', [.195, .137, .003], [0, 0, .027], wood);
const coverCanvas = document.createElement('canvas'); coverCanvas.width = 1600; coverCanvas.height = 1200;
const coverMap = new THREE.CanvasTexture(coverCanvas); coverMap.colorSpace = THREE.SRGBColorSpace;
const cover = new THREE.Mesh(new THREE.PlaneGeometry(.4, .3), new THREE.MeshStandardMaterial({ map: coverMap, roughness: .38 })); cover.position.z = .029; pivot.add(cover);
const inscriptionCanvas = document.createElement('canvas'); inscriptionCanvas.width = 1600; inscriptionCanvas.height = 1100;
const inscriptionMap = new THREE.CanvasTexture(inscriptionCanvas); inscriptionMap.colorSpace = THREE.SRGBColorSpace;
const inscription = new THREE.Mesh(new THREE.PlaneGeometry(.19, .132), new THREE.MeshBasicMaterial({ map: inscriptionMap, transparent: true, depthWrite: false })); inscription.position.z = .029; pivot.add(inscription);
const loader = new THREE.TextureLoader(), textureCache = new Map();
function busy() { $('downloadClient').disabled = pending > 0 || applying; notify('busy', { busy: pending > 0 || applying }); }
function configuration() {
  const variant = variants.find(v => v.id === selected);
  return { modelId, assetRevision: 1, materialId: selected, appearanceRevision: variant.appearanceRevision,
    coverLayout: $('coverLayout').value, frameFinish: $('frameFinish').value, topText: $('topText').value, bottomText: $('bottomText').value,
    photoAssetId: photo?.id || null, crop: { zoom: +$('photoZoom').value, x: +$('photoX').value / 100, y: +$('photoY').value / 100 } };
}
function summary() {
  const material = option?.materials.find(m => m.id === selected) || variants.find(v => v.id === selected);
  const name = option?.name || 'Album girevole'; $('modelTitle').textContent = name;
  $('materialLabel').textContent = material.label;
  $('configurationSummary').textContent = `${name}\nTessuto: ${material.label}\nStruttura: ${$('frameFinish').selectedOptions[0].text}\nCopertina: ${$('coverLayout').selectedOptions[0].text}\n${$('coverLayout').value === 'plaque' ? `Incisione: ${$('topText').value} · ${$('bottomText').value}` : `Foto: ${photo?.name || 'Da scegliere'}`}`;
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
  for (const [id, y, initial] of [['topText', 470, 135], ['bottomText', 660, 65]]) {
    let size = initial; ic.font = `${size}px Georgia`; while (ic.measureText($(id).value).width > 1400 && size > 16) { size--; ic.font = `${size}px Georgia`; }
    ic.fillText($(id).value, 800, y);
  }
  inscriptionMap.needsUpdate = true; document.body.dataset.coverLayout = layout; finishFrame(); summary();
}
async function setPhoto(input) {
  if (!(input.blob instanceof Blob) || input.blob.size > 20 * 1024 * 1024) throw new Error('Foto non valida o superiore a 20 MB');
  pending++; busy(); const url = URL.createObjectURL(input.blob);
  try {
    const candidate = await loader.loadAsync(url);
    if (candidate.image.width * candidate.image.height > 40000000) { candidate.dispose(); throw new Error('Foto superiore a 40 megapixel'); }
    photoMap?.dispose(); photoMap = candidate; photo = { id: input.id, name: input.name, source: input.source };
    $('photoStatus').textContent = input.name; $('photoZoom').value = 1; $('photoX').value = $('photoY').value = 50;
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
    button.append(swatch, document.createTextNode(v.label)); button.onclick = () => finish(v.id).catch(fail); grid.append(button);
  }
  $('materials').append(details);
}
for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => {
  for (const tab of document.querySelectorAll('[data-panel]')) { tab.setAttribute('aria-pressed', String(tab === button)); $(tab.dataset.panel).hidden = tab !== button; }
};
for (const id of ['coverLayout', 'frameFinish']) $(id).onchange = updateCover;
for (const id of ['topText', 'bottomText', 'photoZoom', 'photoX', 'photoY']) $(id).oninput = updateCover;
$('coverUpload').onchange = () => { const file = $('coverUpload').files[0]; if (file && ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) setPhoto({ blob: file, name: file.name, source: 'local' }).catch(fail); };
function setRotation(degrees) { pivot.rotation.y = THREE.MathUtils.degToRad(degrees); $('rotationValue').value = `${Math.round(degrees)}°`; document.body.dataset.rotation = String(degrees); }
$('rotation').oninput = () => { automatic = false; $('rotate').setAttribute('aria-pressed', 'false'); setRotation(+$('rotation').value); };
$('rotate').onclick = () => { automatic = !automatic; $('rotate').setAttribute('aria-pressed', String(automatic)); };
function view(direction = [-.5, .32, 1]) {
  controls.target.set(0, .185, 0); const distance = .3 / Math.sin(Math.min(Math.PI / 10, Math.atan(Math.tan(Math.PI / 10) * camera.aspect)));
  camera.position.copy(controls.target).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance)); controls.update();
}
$('front').onclick = () => view([0, 0, 1]); $('back').onclick = () => view([0, 0, -1]); $('spine').onclick = () => view([-1, 0, .08]);
$('reset').onclick = () => { automatic = false; $('rotate').setAttribute('aria-pressed', 'false'); $('rotation').value = 25; setRotation(25); view(); };
for (const [id, factor] of [['plus', .8], ['minus', 1.25]]) $(id).onclick = () => { const offset = camera.position.clone().sub(controls.target); offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, .45, 3)); camera.position.copy(controls.target).add(offset); controls.update(); };
new ResizeObserver(() => { const stage = $('viewport').parentElement; renderer.setSize(stage.clientWidth, stage.clientHeight, false); camera.aspect = stage.clientWidth / stage.clientHeight; camera.updateProjectionMatrix(); view(); }).observe($('viewport').parentElement);
let last = 0;
renderer.setAnimationLoop(time => { if (automatic) { const angle = ((THREE.MathUtils.radToDeg(pivot.rotation.y) + Math.min(time - last, 100) * .018 + 180) % 360) - 180; $('rotation').value = angle; setRotation(angle); } last = time; controls.update(); renderer.render(scene, camera); });
function previews() {
  const oldSize = renderer.getSize(new THREE.Vector2()), oldRatio = renderer.getPixelRatio(), oldAngle = pivot.rotation.y;
  const exportCamera = new THREE.PerspectiveCamera(36, 4 / 3, .005, 20);
  const views = [['Prospettiva · album ruotato', [-.5, .3, 1], 25], ['Fronte · allineato', [0, 0, 1], 0], ['Retro', [0, 0, -1], 0], ['Dorso · rotazione 90°', [0, .15, 1], 90], ['Lato destro', [1, .2, .1], 0], ['Vista superiore', [0, 1, .01], 30], ['Copertina · cornice aperta', [0, .1, 1], -35], ['Rotazione 180°', [-.4, .2, 1], 180]];
  try {
    renderer.setPixelRatio(1); renderer.setSize(1600, 1200, false); ground.visible = false;
    return views.map(([label, direction, degrees]) => { pivot.rotation.y = THREE.MathUtils.degToRad(degrees); exportCamera.position.set(...direction).normalize().multiplyScalar(1.12).add(new THREE.Vector3(0, .185, 0)); exportCamera.lookAt(0, .185, 0); renderer.render(scene, exportCamera); return { label, image: renderer.domElement.toDataURL('image/jpeg', .82) }; });
  } finally { pivot.rotation.y = oldAngle; ground.visible = true; renderer.setPixelRatio(oldRatio); renderer.setSize(oldSize.x, oldSize.y, false); renderer.render(scene, camera); }
}
$('downloadClient').onclick = () => {
  try {
    const c = configuration(), material = option?.materials.find(m => m.id === selected) || variants.find(v => v.id === selected);
    const report = { model: { name: option?.name || 'Album girevole' }, branding: { name: 'Image Studio' }, material, coverLayout: { label: $('coverLayout').selectedOptions[0].text }, photo: photo || { source: 'none' }, createdAt: new Date().toISOString(), ...{ configuration: c } };
    const rows = [['Rivestimento album', material.label], ['Finitura struttura', $('frameFinish').selectedOptions[0].text], ['Copertina', report.coverLayout.label], ['Incisione nomi', c.coverLayout === 'plaque' ? c.topText : '—'], ['Incisione dedica', c.coverLayout === 'plaque' ? c.bottomText : '—'], ['Formato dichiarato', '30 × 80 cm; proporzioni indicative']];
    const url = URL.createObjectURL(new Blob([buildAlbumReport({ configuration: report, previews: previews(), rows, internal: false })], { type: 'text/html;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'album-girevole-anteprima.html'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { fail(error); }
};
function lock() { for (const control of document.querySelectorAll('#materials button,#detailPanel input,#detailPanel select')) control.disabled = locked; }
if (embedded) {
  $('coverUpload').hidden = true; document.querySelector('label[for="coverUpload"]').hidden = true;
  $('photoStatus').textContent = 'Scegli la foto dai comandi sopra il visualizzatore.';
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
        if (data.option.rendererId !== modelId) throw new Error('Modello non supportato'); option = data.option;
        for (const b of document.querySelectorAll('[data-finish]')) { const m = option.materials.find(m => m.id === b.dataset.finish); b.hidden = !m; if (m) b.lastChild.textContent = m.label; }
        for (const section of document.querySelectorAll('.category')) section.hidden = !section.querySelector('[data-finish]:not([hidden])');
        if (!data.configuration && !option.materials.some(m => m.id === selected)) await finish(option.materials[0].id);
      }
      if (data.photo) await setPhoto(data.photo);
      const c = data.configuration;
      if (c) {
        if (c.modelId !== modelId || c.assetRevision !== 1) throw new Error('Revisione del modello non supportata');
        for (const id of ['coverLayout', 'frameFinish', 'topText', 'bottomText']) $(id).value = c[id];
        $('photoZoom').value = c.crop.zoom; $('photoX').value = c.crop.x * 100; $('photoY').value = c.crop.y * 100;
        await finish(c.materialId);
      }
      updateCover(); lock(); notify('applied');
    } catch (error) { fail(error); }
    finally { applying = false; initialized = true; busy(); summary(); }
  });
}
try { setRotation(25); view(); await finish(selected); updateCover(); document.body.dataset.ready = 'true'; busy(); notify('ready'); }
catch (error) { fail(error); }
