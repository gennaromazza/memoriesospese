import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/*
 * Scatola · Album, quadro e cornice.
 * Un solo prodotto, tre usi: la scatola chiusa contiene l'album; aperta, il fondo diventa
 * un quadro da parete (foto stampata sul fondo) e il tappo diventa una cornice da tavolo.
 * Geometria procedurale in metri; tessuti dal campionario Custodia / Peppe Lab.
 * Il formato (verticale, orizzontale o quadrato) si imposta con la misura dell'album in cm.
 */

const $ = id => document.getElementById(id);
const SRC = new URL('../custodia-v1/', import.meta.url);

// ---- Misure (metri) --------------------------------------------------------
const T = 0.007;                     // spessore pareti
const D = 0.052;                     // profondità del fondo (vassoio)
const FLOOR = 0.006;                 // spessore del fondo
const LT = 0.010, LD = 0.010;        // tappo: piastra e bordino interno
const LM = 0.018;                    // margine in tessuto attorno alla foto del tappo
const AD = 0.034, BOARD = 0.004;     // album: spessore e cartoni
const MARGIN = 0.022;                // la scatola è più grande dell'album di 2,2 cm per lato
const MIN_CM = 15, MAX_CM = 50;
let AW = 0.25, AH = 0.35;            // album (larghezza × altezza)
let W = AW + MARGIN, H = AH + MARGIN; // ingombro esterno scatola e tappo
const setDims = (w, h) => { AW = w; AH = h; W = w + MARGIN; H = h + MARGIN; };

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
controls.minDistance = .35; controls.maxDistance = 4.5; controls.autoRotateSpeed = 1.3;
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
Object.assign(key.shadow.camera, {left: -1.6, right: 1.6, top: 1.4, bottom: -1.2, near: .05, far: 6});
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
// Il piedistallo è rivestito con lo stesso tessuto di scatola e tappo; compare con la scena "tre usi".
const standFabric = boxFabric.clone(); standFabric.transparent = true; standFabric.opacity = 0;
const fabricOf = {box: [boxFabric, standFabric], album: [albumFabric]};
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
      for (const m of fabricOf[name]) {
        m.map = color; m.color.set(0xffffff); m.roughness = variant.roughness;
        m.bumpMap = height; m.bumpScale = variant.bumpScale * .55; m.needsUpdate = true;
      }
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
function disposeGroup(group) {
  group.traverse(o => o.geometry?.dispose());
  group.parent?.remove(group);
}

// Foto: tre posti, ognuno con la sua immagine di esempio sostituibile.
const photoSlots = {
  base: {label: 'Fondo della scatola (quadro da parete)', aspect: () => (W - 2 * T) / (H - 2 * T), hue: 205, state: 'esempio'},
  lid: {label: 'Tappo (cornice da tavolo)', aspect: () => (W - 2 * LM) / (H - 2 * LM), hue: 28, state: 'esempio'},
  album: {label: 'Copertina dell’album', aspect: () => (AW - .03) / (AH - .03), hue: 150, state: 'esempio'},
};
for (const slot of Object.values(photoSlots)) slot.material = new THREE.MeshStandardMaterial({roughness: .45, metalness: 0});

/** Foto di esempio disegnata già nelle proporzioni del riquadro. */
function sampleCanvas(hue, label, aspect) {
  const w = aspect >= 1 ? 1600 : Math.round(1600 * aspect), h = aspect >= 1 ? Math.round(1600 / aspect) : 1600;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), u = Math.min(w, h);
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, `hsl(${hue},45%,78%)`); g.addColorStop(.6, `hsl(${hue + 20},40%,58%)`); g.addColorStop(1, `hsl(${hue + 30},35%,28%)`);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,248,230,.85)'; x.beginPath(); x.arc(w * .72, h * .26, u * .09, 0, Math.PI * 2); x.fill();
  x.fillStyle = `hsla(${hue + 25},30%,22%,.78)`; x.beginPath();
  x.moveTo(0, h * .69); x.lineTo(w * .23, h * .475); x.lineTo(w * .43, h * .63); x.lineTo(w * .65, h * .425); x.lineTo(w, h * .7); x.lineTo(w, h); x.lineTo(0, h); x.fill();
  x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center'; x.font = `600 ${Math.round(u * .05)}px system-ui,sans-serif`;
  x.fillText(label, w / 2, h * .89);
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
  slot.source = source; slot.state = state;
  slot.material.map = photoTexture(source, slot.aspect());
  slot.material.needsUpdate = true;
}
/** Dopo un cambio di formato: le foto di esempio si ridisegnano, quelle caricate si ritagliano di nuovo. */
function refreshPhotos() {
  for (const [name, slot] of Object.entries(photoSlots)) {
    setPhoto(name, slot.state === 'esempio' ? sampleCanvas(slot.hue, 'La tua foto', slot.aspect()) : slot.source, slot.state);
  }
}
const plane = (w, h, name) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), photoSlots[name].material);
  mesh.receiveShadow = true; return mesh;
};

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
const wallMat = envMat(0xe6ddd0), tableMat = envMat(0xcdb59a);
tableMat.roughness = .65;
const envMats = [wallMat, tableMat, standFabric];
const envGroup = new THREE.Group(); envGroup.visible = false; scene.add(envGroup);
let envOpacity = 0, envTarget = 0;

/** Posizioni della scena "tre usi": dipendono dal formato scelto. */
function computeLayout() {
  const lidTilt = -.15, lidX = W / 2 + .45, lidZ = -.05;
  const lidY = .012 + (H / 2) * Math.cos(lidTilt) + .003;
  const wallX = .05, wallY = .45 + H / 2, top = wallY + H / 2;
  const albumX = (wallX + lidX) / 2, albumZ = .16 + AH / 2;
  const tableMinX = Math.min(-.25, wallX - W / 2 - .1), tableMaxX = lidX + W / 2 + .15;
  const tableMaxZ = Math.max(.545, albumZ + AH / 2 + .08);
  return {lidTilt, lidX, lidZ, lidY, wallX, wallY, top, albumX, albumZ, tableMinX, tableMaxX, tableMaxZ};
}

function buildEnv(L) {
  for (const child of [...envGroup.children]) disposeGroup(child);
  const wallW = L.tableMaxX - L.tableMinX + .9, wallH = L.top + .45;
  envGroup.add(at(metricBox(wallW, wallH, .01, wallMat), (L.tableMinX + L.tableMaxX) / 2, wallH / 2 - .1, -.31));
  envGroup.add(at(metricBox(L.tableMaxX - L.tableMinX, .02, L.tableMaxZ + .30, tableMat), (L.tableMinX + L.tableMaxX) / 2, -.01, (L.tableMaxZ - .30) / 2));
  const stand = new THREE.Group();
  stand.add(at(metricBox(W + .038, .012, .09, standFabric), L.lidX, .006, L.lidZ + .012));
  stand.add(at(metricBox(W + .023, .016, .010, standFabric), L.lidX, .020, L.lidZ + .0355));
  envGroup.add(stand); // solo la base sotto la cornice, senza puntelli dietro
}

// ---- Pezzi e pose ------------------------------------------------------------
const pieces = {};
function buildPieces() {
  for (const name of Object.keys(pieces)) disposeGroup(pieces[name]);
  pieces.base = buildBase(); pieces.lid = buildLid(); pieces.album = buildAlbum();
  for (const piece of Object.values(pieces)) { piece.rotation.order = 'YXZ'; scene.add(piece); }
}

function poses() {
  const L = computeLayout(), s = Math.max(1, Math.max(W, H) / .342);
  const albumInBoxZ = -D / 2 + FLOOR + .0005 + AD / 2;
  const view = (t, offset) => ({t, p: [t[0] + offset[0] * s, t[1] + offset[1] * s, t[2] + offset[2] * s]});
  const midX = (L.tableMinX + L.tableMaxX) / 2, midY = L.top * .42;
  const dist = Math.max(1.75, (L.tableMaxX - L.tableMinX) * 1.5, (L.top + .1) * 2);
  return {
    closed: {
      base: {p: [0, H / 2, 0], r: [0, 0, 0]},
      lid: {p: [0, H / 2, D / 2 + LT / 2], r: [0, 0, 0]},
      album: {p: [0, H / 2, albumInBoxZ], r: [0, 0, 0]},
      cam: view([0, H / 2, 0], [.5, .19, 1]), env: 0,
      text: 'Scatola chiusa: l’album è custodito all’interno, sotto il tappo con la foto.',
    },
    uses: {
      base: {p: [L.wallX, L.wallY, -.30 + D / 2], r: [0, 0, 0]},
      lid: {p: [L.lidX, L.lidY, L.lidZ], r: [L.lidTilt, 0, 0]},
      album: {p: [L.albumX, AD / 2 + .0002, L.albumZ], r: [-Math.PI / 2, .25, 0]},
      cam: {t: [midX, midY, .05], p: [midX + .05, midY + .3, dist]}, env: 1,
      text: 'Tre usi: il fondo è il quadro da parete, il tappo diventa cornice da tavolo, l’album si sfoglia.',
    },
  };
}

let mode = 'closed', layoutNow = null, camGoal = null;
const apply = (pose, instant) => {
  for (const name of Object.keys(pieces)) {
    pieces[name].userData.goal = pose[name];
    if (instant) { pieces[name].position.set(...pose[name].p); pieces[name].rotation.set(...pose[name].r); }
  }
};
function setMode(next, instant = false, piecesInstant = instant) {
  seqToken++; // interrompe l'eventuale sequenza "Apri e smonta" in corso
  mode = next;
  const pose = poses()[next];
  apply(pose, piecesInstant);
  envTarget = pose.env;
  if (piecesInstant) envOpacity = envTarget;
  if (instant) {
    camera.position.set(...pose.cam.p); controls.target.set(...pose.cam.t); camGoal = null;
  } else camGoal = {p: new THREE.Vector3(...pose.cam.p), t: new THREE.Vector3(...pose.cam.t)};
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === next));
  $('modeText').textContent = pose.text;
  updateSummary();
}
controls.addEventListener('start', () => { camGoal = null; });

/**
 * "Apri e smonta" come lo farebbe una persona: toglie il tappo, estrae l'album, lo appoggia
 * sul tavolo, mette il tappo sul piedistallo come cornice e appende il fondo al muro.
 */
let seqToken = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function playSequence() {
  const token = ++seqToken, pose = poses(), L = computeLayout();
  const lift = .22, still = [0, 0, 0];
  const steps = [
    {text: '1 · La scatola è chiusa, con l’album dentro.', env: 1, cam: pose.uses.cam, ms: 1500,
      base: pose.closed.base, lid: pose.closed.lid, album: pose.closed.album},
    {text: '2 · Togli il tappo: scorre in avanti.', ms: 1400,
      lid: {p: [0, H / 2, D / 2 + LT / 2 + lift + .1], r: still}},
    {text: '3 · Estrai l’album dalla scatola.', ms: 1500,
      album: {p: [0, H / 2, .28], r: still},
      lid: {p: [L.lidX - .12, H / 2 + .02, .34], r: still}},
    {text: '4 · Appoggi l’album sul tavolo.', ms: 1500,
      album: {p: [L.albumX, AD / 2 + .0002, L.albumZ], r: [-Math.PI / 2, .25, 0]}},
    {text: '5 · Il tappo diventa una cornice da tavolo, sul piedistallo.', ms: 1700,
      lid: {p: [L.lidX, L.lidY + .05, L.lidZ + .08], r: [L.lidTilt * .4, 0, 0]}},
    {text: '', ms: 900, lid: {p: [L.lidX, L.lidY, L.lidZ], r: [L.lidTilt, 0, 0]}},
    {text: '6 · Il fondo, ormai vuoto, si stacca…', ms: 1500,
      base: {p: [0, H / 2 + .1, -.02], r: still}},
    {text: '7 · …e si appende al muro: la foto stampata sul fondo diventa un quadro.', ms: 1900,
      base: {p: [L.wallX, L.wallY, -.30 + D / 2 + .1], r: still}},
    {text: '', ms: 900, base: pose.uses.base},
  ];
  mode = 'open';
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === 'open'));
  updateSummary();
  camGoal = null;
  for (const step of steps) {
    if (token !== seqToken) return;
    for (const name of ['base', 'lid', 'album']) if (step[name]) {
      pieces[name].userData.goal = step[name];
      if (step === steps[0]) { pieces[name].position.set(...step[name].p); pieces[name].rotation.set(...step[name].r); }
    }
    if (step.env !== undefined) { envTarget = step.env; if (step === steps[0]) envOpacity = 0; }
    if (step.cam) camGoal = {p: new THREE.Vector3(...step.cam.p), t: new THREE.Vector3(...step.cam.t)};
    if (step.text) $('modeText').textContent = step.text;
    await wait(step.ms);
  }
  if (token === seqToken) $('modeText').textContent = 'Fatto: quadro da parete, cornice da tavolo e album. Premi di nuovo per rivedere.';
}

/** Ricostruisce tutto per un nuovo formato (cm). */
function applyFormat(wCm, hCm) {
  setDims(wCm / 100, hCm / 100);
  buildPieces();
  layoutNow = computeLayout(); buildEnv(layoutNow);
  refreshPhotos();
  setMode(mode === 'open' ? 'uses' : mode, false, true);
  syncFormatUi();
}

// ---- Interfaccia -------------------------------------------------------------
const cm = n => String(Math.round(n * 10) / 10).replace('.', ',');
function markSwatches() {
  const current = chosen[target]?.id;
  for (const b of document.querySelectorAll('[data-finish]')) b.setAttribute('aria-pressed', String(b.dataset.finish === current));
}
const orientation = () => AW > AH + 1e-6 ? 'orizzontale' : AH > AW + 1e-6 ? 'verticale' : 'quadrato';
function updateSummary() {
  const same = $('sameFabric').checked;
  const lines = [
    `Formato album: ${cm(AW * 100)} × ${cm(AH * 100)} cm (${orientation()})`,
    `Scatola e tappo: ${cm(W * 100)} × ${cm(H * 100)} cm`,
    `Rivestimento scatola, tappo e piedistallo: ${chosen.box ? chosen.box.label : '—'}`,
    `Album: ${same ? 'stesso tessuto della scatola' : chosen.album ? chosen.album.label : '—'}`,
    ...Object.values(photoSlots).map(s => `${s.label}: ${s.state === 'esempio' ? 'foto di esempio' : s.state}`),
    `Vista: ${{closed: 'scatola chiusa', open: 'apri e smonta', uses: 'i tre usi'}[mode]}`,
  ];
  $('configurationSummary').textContent = lines.join('\n');
  $('materialLabel').textContent = chosen.box ? `${laboratory.name} · ${chosen.box.internalCode} · ${cm(AW * 100)} × ${cm(AH * 100)} cm` : 'Caricamento rivestimento…';
}

function syncFormatUi() {
  $('formatInput').value = `${cm(AW * 100)} × ${cm(AH * 100)}`;
  $('formatInfo').textContent = `Scatola e tappo: ${cm(W * 100)} × ${cm(H * 100)} cm (${orientation()}).`;
  $('orientV').setAttribute('aria-pressed', String(AH > AW + 1e-6));
  $('orientH').setAttribute('aria-pressed', String(AW > AH + 1e-6));
  for (const b of document.querySelectorAll('[data-size]')) {
    const [w, h] = b.dataset.size.split('x').map(Number);
    b.setAttribute('aria-pressed', String(Math.abs(w - AW * 100) < .01 && Math.abs(h - AH * 100) < .01));
  }
  updateSummary();
}
/** Accetta "25x35", "25 × 35", "30,5 per 20", con o senza "cm". */
function parseSize(text) {
  const m = text.trim().toLowerCase().replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*(?:x|×|\*|per)\s*(\d+(?:\.\d+)?)\s*(?:cm)?$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function submitFormat() {
  const status = $('formatStatus'), size = parseSize($('formatInput').value);
  if (!size) { status.textContent = 'Scrivi la misura così: 25x35 oppure 30x20 (larghezza per altezza, in cm).'; return; }
  const [w, h] = size;
  if ([w, h].some(n => n < MIN_CM || n > MAX_CM)) { status.textContent = `Ogni lato deve stare tra ${MIN_CM} e ${MAX_CM} cm.`; return; }
  status.textContent = `Formato applicato: ${cm(w)} × ${cm(h)} cm.`;
  applyFormat(w, h);
}
$('formatForm').onsubmit = e => { e.preventDefault(); submitFormat(); };
$('formatInput').onchange = submitFormat;
const orient = vertical => {
  const [a, b] = [AW, AH].sort((x, y) => x - y);
  $('formatStatus').textContent = vertical ? 'Formato verticale.' : 'Formato orizzontale.';
  applyFormat((vertical ? a : b) * 100, (vertical ? b : a) * 100);
};
$('orientV').onclick = () => orient(true);
$('orientH').onclick = () => orient(false);
for (const b of document.querySelectorAll('[data-size]')) b.onclick = () => {
  const [w, h] = b.dataset.size.split('x').map(Number);
  $('formatStatus').textContent = `Formato applicato: ${cm(w)} × ${cm(h)} cm.`;
  applyFormat(w, h);
};

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
for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => b.dataset.mode === 'open' ? playSequence() : setMode(b.dataset.mode);
$('reset').onclick = () => (mode === 'open' ? playSequence() : setMode(mode));
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
    setPhoto(name, sampleCanvas(photoSlots[name].hue, 'La tua foto', photoSlots[name].aspect()), 'esempio');
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
  for (const m of envMats) m.opacity = envOpacity;
  envGroup.visible = envOpacity > .01;
  if (camGoal) {
    camera.position.lerp(camGoal.p, k); controls.target.lerp(camGoal.t, k);
    if (camera.position.distanceTo(camGoal.p) < .003 && controls.target.distanceTo(camGoal.t) < .003) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
});

// ---- Avvio -------------------------------------------------------------------
refreshPhotos();
buildPieces();
layoutNow = computeLayout(); buildEnv(layoutNow);
await setFabric(initial.id, ['box', 'album']);
syncTargetButtons();
syncFormatUi();
setMode('closed', true);
$('status').textContent = '';
document.body.dataset.ready = 'true';
