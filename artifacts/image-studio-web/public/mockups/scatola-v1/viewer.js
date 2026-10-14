import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/*
 * Scatola · Album, quadro e cornice.
 * Un solo prodotto, tre usi: la scatola chiusa contiene l'album; aperta, il fondo diventa
 * un quadro da parete (foto stampata sul fondo) e il tappo diventa una cornice da tavolo.
 * Geometria procedurale in metri; tessuti dal campionario Custodia / Peppe Lab.
 */

const $ = id => document.getElementById(id);
const SRC = new URL('../custodia-v1/', import.meta.url);

// ---- Misure (metri) --------------------------------------------------------
const W = 0.262, H = 0.342;          // ingombro esterno scatola e tappo
const T = 0.007;                     // spessore pareti
const D = 0.052;                     // profondità del fondo (vassoio)
const FLOOR = 0.006;                 // spessore del fondo
const LT = 0.010, LD = 0.010;        // tappo: piastra e bordino interno
const LM = 0.018;                    // margine in tessuto attorno alla foto del tappo
const AW = 0.240, AH = 0.320, AD = 0.034, BOARD = 0.004; // album

// ---- Renderer e scena ------------------------------------------------------
const canvas = $('viewport'), stage = canvas.parentElement;
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  $('status').textContent = 'Anteprima 3D interrotta. Ricarica la pagina.';
  renderer.setAnimationLoop(null);
}, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e8e0);
const camera = new THREE.PerspectiveCamera(36, 1, .01, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = .35; controls.maxDistance = 3.2; controls.autoRotateSpeed = 1.3;
controls.minPolarAngle = .05; controls.maxPolarAngle = Math.PI / 2 + .35;
{
  const env = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, .04).texture; scene.environmentIntensity = .3;
  env.dispose(); pmrem.dispose();
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xc0b7a5, .45));
const key = new THREE.DirectionalLight(0xfff8ee, 1.15);
key.position.set(-.6, 1.2, 1.3); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left: -1.2, right: 1.2, top: 1.1, bottom: -1, near: .05, far: 5});
key.shadow.bias = -.00008; scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({opacity: .13}));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.001; ground.receiveShadow = true; scene.add(ground);

// ---- Tessuti (campionario Custodia / Peppe Lab) -----------------------------
const catalogResponse = await fetch(new URL('peppe-lab-catalog.json', SRC));
if (!catalogResponse.ok) throw new Error('Catalogo materiali non disponibile');
const catalog = await catalogResponse.json();
const currentModel = catalog.models[0];
const laboratory = catalog.laboratories.find(l => l.id === currentModel.laboratoryId);
const allowed = new Set(currentModel.materialPolicy.allowedVariantIds);
const variants = catalog.variants.filter(v => v.laboratoryId === laboratory.id && allowed.has(v.id));
const assetUrl = path => new URL(path, SRC).href;

const boxFabric = new THREE.MeshStandardMaterial({color: 0xcfc6b8, roughness: .9});
const albumFabric = boxFabric.clone();
const fabricOf = {box: boxFabric, album: albumFabric};
const chosen = {box: null, album: null};
let target = 'box', fabricToken = 0;
const loader = new THREE.TextureLoader(), cache = new Map();

function fabricTextures(id) {
  const variant = variants.find(v => v.id === id);
  if (!variant) throw new Error('Rivestimento non consentito per questo modello');
  if (!cache.has(id)) {
    cache.set(id, Promise.all([loader.loadAsync(assetUrl(variant.textureUrl)), loader.loadAsync(assetUrl(variant.heightUrl))]).then(([color, height]) => {
      color.colorSpace = THREE.SRGBColorSpace;
      for (const t of [color, height]) {
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = renderer.capabilities.getMaxAnisotropy();
        // Le UV dei box sono in metri: una ripetizione della trama ogni `estimatedRepeatMeters`.
        t.repeat.setScalar(1 / variant.estimatedRepeatMeters);
      }
      return {color, height, variant};
    }).catch(error => { cache.delete(id); throw error; }));
  }
  return cache.get(id);
}

async function setFabric(id, which) {
  const token = ++fabricToken;
  try {
    const {color, height, variant} = await fabricTextures(id);
    if (token !== fabricToken) return;
    for (const name of which) {
      const m = fabricOf[name];
      m.map = color; m.color.set(0xffffff); m.roughness = variant.roughness;
      m.bumpMap = height; m.bumpScale = variant.bumpScale * .55; m.needsUpdate = true;
      chosen[name] = variant;
    }
    $('status').textContent = '';
  } catch (error) {
    $('status').textContent = 'Impossibile caricare questo rivestimento. Riprova.';
    console.error(error);
  } finally {
    if (token === fabricToken) { markSwatches(); updateSummary(); }
  }
}

// ---- Geometria -------------------------------------------------------------
/** Box con UV in metri, così la trama del tessuto ha la stessa scala su ogni faccia. */
function metricBox(w, h, d, material) {
  const geometry = new THREE.BoxGeometry(w, h, d), uv = geometry.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let face = 0; face < 6; face++) for (let i = 0; i < 4; i++) {
    const index = face * 4 + i;
    uv.setXY(index, uv.getX(index) * sizes[face][0], uv.getY(index) * sizes[face][1]);
  }
  uv.needsUpdate = true;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}
const at = (mesh, x = 0, y = 0, z = 0) => { mesh.position.set(x, y, z); return mesh; };

// Foto: tre posti, ognuno con la sua immagine di esempio sostituibile.
const photoSlots = {
  base: {label: 'Fondo della scatola (quadro da parete)', aspect: (W - 2 * T) / (H - 2 * T), hue: 205, state: 'esempio'},
  lid: {label: 'Tappo (cornice da tavolo)', aspect: (W - 2 * LM) / (H - 2 * LM), hue: 28, state: 'esempio'},
  album: {label: 'Copertina dell’album', aspect: (AW - .03) / (AH - .03), hue: 150, state: 'esempio'},
};
for (const slot of Object.values(photoSlots)) slot.material = new THREE.MeshStandardMaterial({roughness: .45, metalness: 0});

function sampleCanvas(hue, label) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 1600;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1600);
  g.addColorStop(0, `hsl(${hue},45%,78%)`); g.addColorStop(.6, `hsl(${hue + 20},40%,58%)`); g.addColorStop(1, `hsl(${hue + 30},35%,28%)`);
  x.fillStyle = g; x.fillRect(0, 0, 1200, 1600);
  x.fillStyle = 'rgba(255,248,230,.85)'; x.beginPath(); x.arc(860, 420, 110, 0, Math.PI * 2); x.fill();
  x.fillStyle = `hsla(${hue + 25},30%,22%,.78)`; x.beginPath();
  x.moveTo(0, 1100); x.lineTo(280, 760); x.lineTo(520, 1010); x.lineTo(780, 680); x.lineTo(1200, 1120); x.lineTo(1200, 1600); x.lineTo(0, 1600); x.fill();
  x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center'; x.font = '600 64px system-ui,sans-serif';
  x.fillText(label, 600, 1420);
  return c;
}

/** Ritaglio "cover": la foto riempie il riquadro mantenendo le proporzioni. */
function photoTexture(source, aspect, longSide = 1400) {
  const w = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const h = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const scale = Math.max(w / source.width, h / source.height);
  c.getContext('2d').drawImage(source, (w - source.width * scale) / 2, (h - source.height * scale) / 2, source.width * scale, source.height * scale);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
function setPhoto(name, source, state) {
  const slot = photoSlots[name];
  slot.material.map?.dispose();
  slot.material.map = photoTexture(source, slot.aspect);
  slot.material.needsUpdate = true;
  slot.state = state;
}
const plane = (w, h, name) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoSlots[name].material);
  mesh.receiveShadow = true; return mesh;
};
for (const [name, slot] of Object.entries(photoSlots)) setPhoto(name, sampleCanvas(slot.hue, 'La tua foto'), 'esempio');

function buildBase() {
  const g = new THREE.Group(), wallDepth = D - FLOOR, wallZ = FLOOR / 2;
  g.add(at(metricBox(W, H, FLOOR, boxFabric), 0, 0, -D / 2 + FLOOR / 2));
  g.add(at(metricBox(T, H, wallDepth, boxFabric), -(W / 2 - T / 2), 0, wallZ));
  g.add(at(metricBox(T, H, wallDepth, boxFabric), W / 2 - T / 2, 0, wallZ));
  g.add(at(metricBox(W - 2 * T, T, wallDepth, boxFabric), 0, H / 2 - T / 2, wallZ));
  g.add(at(metricBox(W - 2 * T, T, wallDepth, boxFabric), 0, -(H / 2 - T / 2), wallZ));
  g.add(at(plane(W - 2 * T, H - 2 * T, 'base'), 0, 0, -D / 2 + FLOOR + .0004)); // foto stampata sul fondo
  return g;
}
function buildLid() {
  const g = new THREE.Group(), Wi = W - 2 * T - .001, Hi = H - 2 * T - .001, lipZ = -(LT / 2 + LD / 2);
  g.add(metricBox(W, H, LT, boxFabric));
  g.add(at(plane(W - 2 * LM, H - 2 * LM, 'lid'), 0, 0, LT / 2 + .0004));
  g.add(at(metricBox(.004, Hi, LD, boxFabric), -(Wi / 2 - .002), 0, lipZ));
  g.add(at(metricBox(.004, Hi, LD, boxFabric), Wi / 2 - .002, 0, lipZ));
  g.add(at(metricBox(Wi - .008, .004, LD, boxFabric), 0, Hi / 2 - .002, lipZ));
  g.add(at(metricBox(Wi - .008, .004, LD, boxFabric), 0, -(Hi / 2 - .002), lipZ));
  return g;
}
const paper = new THREE.MeshStandardMaterial({color: 0xf1ead9, roughness: .95});
function buildAlbum() {
  const g = new THREE.Group();
  g.add(at(metricBox(AW, AH, BOARD, albumFabric), 0, 0, AD / 2 - BOARD / 2));
  g.add(at(metricBox(AW, AH, BOARD, albumFabric), 0, 0, -AD / 2 + BOARD / 2));
  g.add(at(metricBox(BOARD, AH, AD - 2 * BOARD, albumFabric), -AW / 2 + BOARD / 2, 0, 0));
  g.add(at(metricBox(AW - 2 * BOARD, AH - .008, AD - 2 * BOARD - .002, paper), 0, 0, 0));
  g.add(at(plane(AW - .03, AH - .03, 'album'), 0, 0, AD / 2 + .0004));
  return g;
}

// ---- Ambiente "tre usi" (parete, tavolo, piedistallo) ------------------------
const envMat = color => new THREE.MeshStandardMaterial({color, roughness: .85, transparent: true, opacity: 0});
const wallMat = envMat(0xe6ddd0), tableMat = envMat(0xcdb59a), standMat = envMat(0xd9cdb8);
tableMat.roughness = .65;
const wall = at(metricBox(1.7, 1.3, .01, wallMat), .15, .55, -.31);
const table = at(metricBox(1.1, .02, .85, tableMat), .3, -.01, .12);

const LID_TILT = -.15, LID_X = .58, LID_Z = -.05;
const LID_Y = .012 + (H / 2) * Math.cos(LID_TILT) + .003;
const stand = new THREE.Group();
stand.add(at(metricBox(.30, .012, .09, standMat), LID_X, .006, LID_Z + .012));
stand.add(at(metricBox(.285, .016, .010, standMat), LID_X, .020, LID_Z + .0355));
{ // puntello dietro al tappo: appoggia sul piedistallo e tocca il retro del tappo
  const up = new THREE.Vector3(0, Math.cos(LID_TILT), Math.sin(LID_TILT));
  const normal = new THREE.Vector3(0, -Math.sin(LID_TILT), Math.cos(LID_TILT));
  const contact = new THREE.Vector3(LID_X, LID_Y, LID_Z).addScaledVector(up, -H / 2 + .16).addScaledVector(normal, -(LT / 2 + LD));
  const foot = new THREE.Vector3(LID_X, .012, contact.z - .09);
  const direction = contact.clone().sub(foot), length = direction.length();
  const prop = metricBox(.12, length, .008, standMat);
  prop.position.copy(foot).addScaledVector(direction, .5);
  prop.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  stand.add(prop);
}
const envGroup = new THREE.Group(); envGroup.add(wall, table, stand); envGroup.visible = false; scene.add(envGroup);
let envOpacity = 0, envTarget = 0;

// ---- Pezzi e pose ------------------------------------------------------------
const pieces = {base: buildBase(), lid: buildLid(), album: buildAlbum()};
for (const piece of Object.values(pieces)) { piece.rotation.order = 'YXZ'; scene.add(piece); }

const albumInBoxZ = -D / 2 + FLOOR + .0005 + AD / 2;
const POSES = {
  closed: {
    base: {p: [0, H / 2, 0], r: [0, 0, 0]},
    lid: {p: [0, H / 2, D / 2 + LT / 2], r: [0, 0, 0]},
    album: {p: [0, H / 2, albumInBoxZ], r: [0, 0, 0]},
    cam: {p: [.5, .36, 1], t: [0, .17, 0]}, env: 0,
    text: 'Scatola chiusa: l’album è custodito all’interno, sotto il tappo con la foto.',
  },
  open: {
    base: {p: [0, H / 2, -.17], r: [0, 0, 0]},
    lid: {p: [0, H / 2, .27], r: [0, 0, 0]},
    album: {p: [0, H / 2, .05], r: [0, 0, 0]},
    cam: {p: [.95, .46, 1.1], t: [0, .17, .05]}, env: 0,
    text: 'Scatola aperta: togli il tappo ed estrai l’album. Restano il fondo e il tappo.',
  },
  uses: {
    base: {p: [.05, .62, -.30 + D / 2], r: [0, 0, 0]},
    lid: {p: [LID_X, LID_Y, LID_Z], r: [LID_TILT, 0, 0]},
    album: {p: [.28, AD / 2 + .0002, .30], r: [-Math.PI / 2, .25, 0]},
    cam: {p: [.35, .62, 1.75], t: [.3, .3, .05]}, env: 1,
    text: 'Tre usi: il fondo è il quadro da parete, il tappo diventa cornice da tavolo, l’album si sfoglia.',
  },
};
let mode = 'closed';
const apply = (poses, instant) => {
  for (const name of Object.keys(pieces)) {
    pieces[name].userData.goal = poses[name];
    if (instant) { pieces[name].position.set(...poses[name].p); pieces[name].rotation.set(...poses[name].r); }
  }
};
let camGoal = null;
function setMode(next, instant = false) {
  mode = next;
  const pose = POSES[next];
  apply(pose, instant);
  envTarget = pose.env;
  if (instant) {
    envOpacity = envTarget; camera.position.set(...pose.cam.p); controls.target.set(...pose.cam.t); camGoal = null;
  } else camGoal = {p: new THREE.Vector3(...pose.cam.p), t: new THREE.Vector3(...pose.cam.t)};
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === next));
  $('modeText').textContent = pose.text;
  updateSummary();
}
controls.addEventListener('start', () => { camGoal = null; });

// ---- Interfaccia -------------------------------------------------------------
function markSwatches() {
  const current = chosen[target]?.id;
  for (const b of document.querySelectorAll('[data-finish]')) b.setAttribute('aria-pressed', String(b.dataset.finish === current));
}
function updateSummary() {
  const same = $('sameFabric').checked;
  const lines = [
    `Scatola e tappo: ${chosen.box ? chosen.box.label : '—'}`,
    `Album: ${same ? 'stesso tessuto della scatola' : chosen.album ? chosen.album.label : '—'}`,
    ...Object.values(photoSlots).map(s => `${s.label}: ${s.state === 'esempio' ? 'foto di esempio' : s.state}`),
    `Vista: ${{closed: 'scatola chiusa', open: 'scatola aperta', uses: 'i tre usi'}[mode]}`,
  ];
  $('configurationSummary').textContent = lines.join('\n');
  $('materialLabel').textContent = chosen.box ? `${laboratory.name} · ${chosen.box.internalCode}` : 'Caricamento rivestimento…';
}

$('materials').className = 'material-categories';
const initial = variants.find(v => v.legacyId === 'mist-03') || variants[0];
for (const family of catalog.families.filter(f => f.laboratoryId === laboratory.id)) {
  const samples = variants.filter(v => v.familyId === family.id);
  if (!samples.length) continue;
  const section = document.createElement('details'); section.className = 'material-category';
  if (samples.some(v => v.id === initial.id)) section.open = true;
  const title = document.createElement('summary'); title.textContent = `${family.name} · ${samples.length} rivestimenti`;
  const grid = document.createElement('div'); grid.className = 'materials';
  for (const variant of samples) {
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.finish = variant.id; button.title = variant.internalCode;
    const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundImage = `url('${assetUrl(variant.textureUrl)}')`;
    button.append(swatch, document.createTextNode(variant.label));
    button.onclick = () => setFabric(variant.id, $('sameFabric').checked ? ['box', 'album'] : [target]);
    button.setAttribute('aria-pressed', 'false');
    grid.append(button);
  }
  section.append(title, grid); $('materials').append(section);
}
document.querySelector('#fabricPanel h2').textContent = `${laboratory.name} · ${variants.length} rivestimenti`;

function syncTargetButtons() {
  const same = $('sameFabric').checked;
  for (const b of document.querySelectorAll('[data-target]')) {
    b.disabled = same; b.setAttribute('aria-pressed', String(!same && b.dataset.target === target));
  }
  markSwatches(); updateSummary();
}
for (const b of document.querySelectorAll('[data-target]')) b.onclick = () => { target = b.dataset.target; syncTargetButtons(); };
$('sameFabric').onchange = () => {
  if ($('sameFabric').checked && chosen.box) setFabric(chosen.box.id, ['box', 'album']);
  if (!$('sameFabric').checked) target = 'box';
  syncTargetButtons();
};
for (const b of document.querySelectorAll('[data-panel]')) b.onclick = () => {
  for (const tab of document.querySelectorAll('[data-panel]')) {
    const active = tab === b; tab.setAttribute('aria-pressed', String(active)); $(tab.dataset.panel).hidden = !active;
  }
};
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);
$('reset').onclick = () => setMode(mode);
$('rotate').onclick = () => {
  controls.autoRotate = !controls.autoRotate; camGoal = null;
  $('rotate').setAttribute('aria-pressed', String(controls.autoRotate));
};
const zoom = factor => { camGoal = null; camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); };
$('plus').onclick = () => zoom(.85); $('minus').onclick = () => zoom(1.18);

const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
async function readImage(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, {imageOrientation: 'from-image'}); } catch { /* ripiega su <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode(); return img;
  } finally { URL.revokeObjectURL(url); }
}
for (const name of Object.keys(photoSlots)) {
  const input = $(`${name}Upload`), status = $(`${name}Status`);
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { status.textContent = 'Formato non supportato: usa JPG, PNG o WebP.'; input.value = ''; return; }
    if (file.size > MAX_PHOTO_BYTES) { status.textContent = 'La foto supera i 20 MB.'; input.value = ''; return; }
    try {
      const image = await readImage(file);
      setPhoto(name, image, file.name);
      status.textContent = `Caricata: ${file.name}`;
      updateSummary();
    } catch (error) { status.textContent = 'Impossibile leggere questa foto.'; console.error(error); }
  };
  $(`${name}Restore`).onclick = () => {
    setPhoto(name, sampleCanvas(photoSlots[name].hue, 'La tua foto'), 'esempio');
    input.value = ''; status.textContent = 'Foto di esempio ripristinata.'; updateSummary();
  };
}

// ---- Ciclo di rendering ------------------------------------------------------
function resize() {
  const {clientWidth: w, clientHeight: h} = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), k = 1 - Math.exp(-dt * 5.5);
  for (const piece of Object.values(pieces)) {
    const goal = piece.userData.goal; if (!goal) continue;
    piece.position.x += (goal.p[0] - piece.position.x) * k;
    piece.position.y += (goal.p[1] - piece.position.y) * k;
    piece.position.z += (goal.p[2] - piece.position.z) * k;
    piece.rotation.x += (goal.r[0] - piece.rotation.x) * k;
    piece.rotation.y += (goal.r[1] - piece.rotation.y) * k;
    piece.rotation.z += (goal.r[2] - piece.rotation.z) * k;
  }
  envOpacity += (envTarget - envOpacity) * k;
  if (Math.abs(envTarget - envOpacity) < .004) envOpacity = envTarget;
  for (const m of [wallMat, tableMat, standMat]) m.opacity = envOpacity;
  envGroup.visible = envOpacity > .01;
  if (camGoal) {
    camera.position.lerp(camGoal.p, k); controls.target.lerp(camGoal.t, k);
    if (camera.position.distanceTo(camGoal.p) < .003 && controls.target.distanceTo(camGoal.t) < .003) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
});

await setFabric(initial.id, ['box', 'album']);
syncTargetButtons();
setMode('closed', true);
$('status').textContent = '';
document.body.dataset.ready = 'true';
