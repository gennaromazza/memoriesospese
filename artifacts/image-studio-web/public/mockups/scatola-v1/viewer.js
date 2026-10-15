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
// Dentro la piattaforma il visualizzatore è in un iframe: foto, scelte dello studio e salvataggio li gestisce l'host.
const embedded = window.parent !== window;
let phone = false;   // telefono nella piattaforma: lo decide l'host
if (embedded) document.body.classList.add('embedded');
const notify = (type, payload = {}) => { if (embedded) window.parent.postMessage({channel: 'memorie-mockup-v1', type, ...payload}, location.origin); };
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
    if (name === 'album') showCover();
    else setPhoto(name, slot.state === 'esempio' ? sampleCanvas(slot.hue, 'La tua foto', slot.aspect()) : slot.source, slot.state);
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

// Piedistallo: blocco lungo con una fessura in cui si incastra la cornice, fronte arrotondato.
const STAND = {depth: .065, height: .04, slotWidth: .012, slotDepth: .02, slotAt: .38, radius: .016};

/** Posizioni della scena "tre usi": dipendono dal formato scelto. */
function computeLayout() {
  const lidX = W / 2 + .45, standZ = -.05;
  const slotZ = standZ - STAND.depth / 2 + STAND.slotAt * STAND.depth;     // centro della fessura
  const lidZ = slotZ, lidY = STAND.height - STAND.slotDepth + H / 2;        // cornice dritta, bordo basso nella fessura
  const wallX = .05, wallY = .45 + H / 2, top = Math.max(wallY + H / 2, lidY + H / 2);
  const albumX = (wallX + lidX) / 2, albumZ = .16 + AH / 2;
  const tableMinX = Math.min(-.25, wallX - W / 2 - .1), tableMaxX = lidX + W / 2 + .15;
  const tableMaxZ = Math.max(.545, albumZ + AH / 2 + .08);
  return {lidTilt: 0, lidX, lidZ, lidY, standZ, wallX, wallY, top, albumX, albumZ, tableMinX, tableMaxX, tableMaxZ};
}

function buildStandBlock(length) {
  const {depth, height, slotWidth, slotDepth, slotAt, radius: r} = STAND;
  const back = -depth / 2, front = depth / 2, zs = back + slotAt * depth, s0 = zs - slotWidth / 2, s1 = zs + slotWidth / 2;
  const shape = new THREE.Shape();           // sezione: x = verso l'osservatore, y = altezza
  shape.moveTo(back, 0); shape.lineTo(front, 0); shape.lineTo(front, height - r);
  shape.quadraticCurveTo(front, height, front - r, height);
  shape.lineTo(s1, height); shape.lineTo(s1, height - slotDepth); shape.lineTo(s0, height - slotDepth);
  shape.lineTo(s0, height); shape.lineTo(back, height); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {depth: length, bevelEnabled: false, curveSegments: 8});
  geometry.rotateY(-Math.PI / 2); geometry.translate(length / 2, 0, 0);
  const mesh = new THREE.Mesh(geometry, standFabric);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function buildEnv(L) {
  for (const child of [...envGroup.children]) disposeGroup(child);
  const wallW = L.tableMaxX - L.tableMinX + .9, wallH = L.top + .45;
  envGroup.add(at(metricBox(wallW, wallH, .01, wallMat), (L.tableMinX + L.tableMaxX) / 2, wallH / 2 - .1, -.31));
  envGroup.add(at(metricBox(L.tableMaxX - L.tableMinX, .02, L.tableMaxZ + .30, tableMat), (L.tableMinX + L.tableMaxX) / 2, -.01, (L.tableMaxZ - .30) / 2));
  envGroup.add(at(buildStandBlock(W * .9), L.lidX, 0, L.standZ));
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
    {text: '5 · Il tappo diventa una cornice: si incastra nella fessura del piedistallo.', ms: 1700,
      lid: {p: [L.lidX, L.lidY + .12, L.lidZ + .02], r: still}},
    {text: '', ms: 1000, lid: {p: [L.lidX, L.lidY, L.lidZ], r: still}},
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
  for (const b of document.querySelectorAll('[data-finish]')) {
    b.setAttribute('aria-pressed', String(chosen.box?.id === b.dataset.finish));
  }
}
const orientation = () => AW > AH + 1e-6 ? 'orizzontale' : AH > AW + 1e-6 ? 'verticale' : 'quadrato';
function updateSummary() {
  const lines = [
    `Formato album: ${cm(AW * 100)} × ${cm(AH * 100)} cm (${orientation()}), stabilito dallo studio`,
    `Scatola e tappo: ${cm(W * 100)} × ${cm(H * 100)} cm`,
    `Tessuto (scatola, album e piedistallo): ${chosen.box ? chosen.box.label : '—'}`,
    ...Object.values(photoSlots).map(s => s === photoSlots.album
      ? `Copertina dell’album: ${effectiveCover() === 'graphic' ? `grafica dello studio (${graphic.name})` : s.state === 'esempio' ? 'foto di esempio' : s.state}`
      : `${s.label}: ${s.state === 'esempio' ? 'foto di esempio' : s.state}`),
  ];
  const phoneLines = [
    `Album ${cm(AW * 100)} × ${cm(AH * 100)} cm · ${chosen.box ? chosen.box.label : '—'}`,
    ...Object.values(photoSlots).map(sl => sl === photoSlots.album
      ? `Copertina: ${effectiveCover() === 'graphic' ? 'grafica dello studio' : sl.state === 'esempio' ? 'da scegliere' : 'la tua foto'}`
      : `${sl === photoSlots.base ? 'Quadro da parete' : 'Cornice da tavolo'}: ${sl.state === 'esempio' ? 'da scegliere' : 'la tua foto'}`),
  ];
  $('configurationSummary').textContent = (phone ? phoneLines : lines).join('\n');
  emitChange();
  $('materialLabel').textContent = chosen.box ? (embedded ? `${chosen.box.label} · album ${cm(AW * 100)} × ${cm(AH * 100)} cm` : `${laboratory.name} · ${chosen.box.internalCode} · ${cm(AW * 100)} × ${cm(AH * 100)} cm`) : 'Caricamento rivestimento…';
}

// Scelte che fa lo studio, non il cliente: formato dell'album e tipo di copertina.
// In piattaforma arrivano con il messaggio 'apply' (option.format, option.cover); nel prototipo
// da scatola-offer.json o dagli strumenti studio (#studio).
const offer = {cover: {mode: 'choice'}};   // mode: 'choice' (sceglie il cliente) | 'photo' | 'graphic'
let coverChoice = 'photo';                   // scelta del cliente quando mode è 'choice'
const graphic = {source: null, name: 'grafica di esempio'};
const albumPhoto = {source: null, state: 'esempio'};
// Id degli asset del fotolibro scelti dal cliente (solo in piattaforma) e formato deciso dallo studio.
const assets = {base: null, lid: null, album: null};
let studioFormat = null;
let allowedMaterials = null;   // Set di id consentiti dal laboratorio; null = tutto il campionario
let locked = false;
const COVER_MODES = ['choice', 'photo', 'graphic'];
const effectiveCover = () => offer.cover.mode === 'choice' ? coverChoice : offer.cover.mode;

/** Accetta "25x35", "25 × 35", "30,5 per 20", con o senza "cm". */
function parseSize(text) {
  const m = String(text).trim().toLowerCase().replace(/,/g, '.').match(/^(\d+(?:\.\d+)?)\s*(?:x|×|\*|per)\s*(\d+(?:\.\d+)?)\s*(?:cm)?$/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
function normalizeFormat(f) {
  const size = typeof f === 'string' ? parseSize(f) : f && f.w && f.h ? [Number(f.w), Number(f.h)] : null;
  return size && size.every(n => n >= MIN_CM && n <= MAX_CM) ? size : null;
}
async function loadOffer() {
  try {
    const response = await fetch(new URL('scatola-offer.json', import.meta.url));
    if (response.ok) return await response.json();
  } catch { /* si usano i valori di esempio */ }
  return {};
}
/** Grafica di esempio: la sostituisce quella caricata dallo studio. */
function sampleGraphic(aspect) {
  const w = aspect >= 1 ? 1600 : Math.round(1600 * aspect), h = aspect >= 1 ? Math.round(1600 / aspect) : 1600;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), u = Math.min(w, h);
  x.fillStyle = '#1f3f46'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#d6b979'; x.lineWidth = u * .006; x.strokeRect(u * .06, u * .06, w - u * .12, h - u * .12);
  x.lineWidth = u * .0025; x.strokeRect(u * .085, u * .085, w - u * .17, h - u * .17);
  x.fillStyle = '#d6b979'; x.textAlign = 'center';
  x.font = `italic 400 ${Math.round(u * .34)}px Georgia,serif`; x.fillText('M&S', w / 2, h * .54);
  x.font = `400 ${Math.round(u * .045)}px Georgia,serif`; x.fillText('I VOSTRI NOMI', w / 2, h * .66);
  x.font = `400 ${Math.round(u * .03)}px system-ui,sans-serif`; x.fillText('GRAFICA DI ESEMPIO', w / 2, h * .9);
  return c;
}
/** Copertina: la foto del cliente oppure la grafica dello studio, secondo quanto deciso. */
function showCover() {
  const slot = photoSlots.album, aspect = slot.aspect();
  if (effectiveCover() === 'graphic') setPhoto('album', graphic.source || sampleGraphic(aspect), graphic.name);
  else if (albumPhoto.source) setPhoto('album', albumPhoto.source, albumPhoto.state);
  else setPhoto('album', sampleCanvas(slot.hue, 'La tua foto', aspect), 'esempio');
}
/** Configurazione nel formato che la piattaforma salva (vedi mockup-types.ts). */
function currentConfiguration() {
  const box = chosen.box, album = chosen.album || chosen.box;
  const round = n => Math.round(n * 10) / 10;
  const cover = effectiveCover();
  return {
    modelId: 'scatola-cornice', assetRevision: 1,
    materialId: box?.id ?? null, appearanceRevision: box?.appearanceRevision ?? 0,
    albumMaterialId: album?.id ?? null, albumAppearanceRevision: album?.appearanceRevision ?? 0,
    coverLayout: cover,
    format: studioFormat ? {w: studioFormat.w, h: studioFormat.h} : {w: round(AW * 100), h: round(AH * 100)},
    photoAssetId: assets.base, lidPhotoAssetId: assets.lid,
    coverPhotoAssetId: cover === 'photo' ? assets.album : null,
  };
}
let lastSignature = '';
/** Avvisa l'host solo se la configurazione è davvero cambiata (cambiare vista non è una modifica). */
function emitChange(force = false) {
  if (!embedded) return;
  const configuration = currentConfiguration(), signature = JSON.stringify(configuration);
  if (!force && signature === lastSignature) return;
  lastSignature = signature;
  notify('change', {configuration});
}
function syncCoverUi() {
  const choice = offer.cover.mode === 'choice', graphicOn = effectiveCover() === 'graphic';
  $('coverChoice').hidden = !choice;
  $('coverPhotoBox').hidden = graphicOn; $('coverGraphicBox').hidden = !graphicOn;
  for (const b of document.querySelectorAll('[data-cover]')) b.setAttribute('aria-pressed', String(b.dataset.cover === effectiveCover()));
  for (const b of document.querySelectorAll('[data-covermode]')) b.setAttribute('aria-pressed', String(b.dataset.covermode === offer.cover.mode));
}
/** Applica le scelte dello studio (dal messaggio della piattaforma, dal file o dagli strumenti studio). */
function applyOffer(next = {}) {
  if (COVER_MODES.includes(next.cover?.mode)) offer.cover.mode = next.cover.mode;
  if (offer.cover.mode !== 'choice') coverChoice = offer.cover.mode;
  const size = normalizeFormat(next.format);
  if (size) applyFormat(size[0], size[1]); else refreshPhotos();
  rebuildSteps(); syncCoverUi(); updateSummary();
  goStep(Math.min(step, STEPS.length - 1), {focus: false});
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
// Strumenti studio: misura libera per provare formati fuori elenco.
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
for (const b of document.querySelectorAll('[data-covermode]')) b.onclick = () => applyOffer({cover: {mode: b.dataset.covermode}});
$('graphicUpload').onchange = async () => {
  const input = $('graphicUpload'), file = input.files?.[0], status = $('graphicStatus'); if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { status.textContent = 'Formato non supportato: usa JPG, PNG o WebP.'; input.value = ''; return; }
  if (file.size > 20 * 1024 * 1024) { status.textContent = 'La grafica supera i 20 MB.'; input.value = ''; return; }
  try { graphic.source = await readImage(file); graphic.name = file.name; status.textContent = `Caricata: ${file.name}`; showCover(); updateSummary(); }
  catch (error) { status.textContent = 'Impossibile leggere questa grafica.'; console.error(error); }
};
$('graphicRestore').onclick = () => { graphic.source = null; graphic.name = 'grafica di esempio'; $('graphicUpload').value = ''; $('graphicStatus').textContent = 'Grafica di esempio ripristinata.'; showCover(); updateSummary(); };
$('openStudio').hidden = location.hash !== '#studio'; // riservato allo studio: si apre aggiungendo #studio all'indirizzo
$('openStudio').onclick = () => $('studioDialog').showModal();

for (const b of document.querySelectorAll('[data-cover]')) b.onclick = () => { coverChoice = b.dataset.cover; showCover(); syncCoverUi(); updateSummary(); };

// Campionario: una griglia per ogni scelta (scatola, album).
const initial = variants.find(v => v.legacyId === 'mist-03') || variants[0];
function buildSwatches(container) {
  container.textContent = '';
  for (const family of catalog.families.filter(f => f.laboratoryId === laboratory.id)) {
    const samples = variants.filter(v => v.familyId === family.id && (!allowedMaterials || allowedMaterials.has(v.id)));
    if (!samples.length) continue;
    const section = document.createElement('details'); section.className = 'material-category';
    if (phone || samples.some(v => v.id === initial.id)) section.open = true;
    const title = document.createElement('summary'); title.textContent = `${family.name} · ${samples.length} rivestimenti`;
    const grid = document.createElement('div'); grid.className = 'materials';
    for (const variant of samples) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.finish = variant.id; button.title = variant.internalCode;
      const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundImage = `url('${assetUrl(variant.textureUrl)}')`;
      button.append(swatch, document.createTextNode(variant.label));
      // Un solo tessuto per scatola, album e piedistallo.
      button.onclick = () => setFabric(variant.id, ['box', 'album']);
      button.setAttribute('aria-pressed', 'false');
      grid.append(button);
    }
    section.append(title, grid); container.append(section);
  }
}
function rebuildSwatches() { buildSwatches($('materialsBox')); markSwatches(); }
rebuildSwatches();

// Un passo per ogni scelta del cliente. Formato e tipo di copertina li decide lo studio.
const ALL_STEPS = [
  {id: 'stepBoxFabric', title: 'Il tessuto', view: 'closed'},
  {id: 'stepBasePhoto', title: 'Foto del quadro da parete', view: 'uses'},
  {id: 'stepLidPhoto', title: 'Foto della cornice da tavolo', view: 'uses'},
  {id: 'stepCover', title: 'Copertina dell’album', view: 'uses'},
  {id: 'stepSummary', title: 'Riepilogo', view: 'uses'},
];
let STEPS = [...ALL_STEPS], step = 0;
function rebuildSteps() {
  STEPS = ALL_STEPS.filter(s => s.id !== 'stepCover' || offer.cover.mode !== 'graphic');
  $('progress').textContent = '';
  for (let i = 0; i < STEPS.length; i++) $('progress').append(document.createElement('i'));
}
function goStep(index, {focus = true} = {}) {
  step = Math.max(0, Math.min(index, STEPS.length - 1));
  for (const section of document.querySelectorAll('[data-step]')) section.hidden = true;
  $(STEPS[step].id).hidden = false;
  [...$('progress').children].forEach((bar, i) => { bar.className = i <= step ? 'done' : ''; });
  $('stepCount').textContent = `Passo ${step + 1} di ${STEPS.length}`;
  const last = step === STEPS.length - 1;
  $('stepTitle').textContent = phone && last ? 'Ecco il tuo Quadrobook' : STEPS[step].title;
  document.body.classList.toggle('mq-final', phone && last);
  document.body.classList.remove('mq-3d');
  notify('step', {index: step, last});
  $('prev').disabled = step === 0;
  $('next').textContent = step === STEPS.length - 1 ? 'Ricomincia' : 'Avanti';
  $('next').hidden = embedded && step === STEPS.length - 1;
  document.querySelector('.panel-content').scrollTop = 0;
  if (mode !== STEPS[step].view) setMode(STEPS[step].view);
  if (focus) $('stepTitle').focus({preventScroll: true});
}
$('prev').onclick = () => goStep(step - 1);
$('next').onclick = () => goStep(step === STEPS.length - 1 ? 0 : step + 1);

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
      if (name === 'album') { albumPhoto.source = image; albumPhoto.state = file.name; showCover(); }
      else setPhoto(name, image, file.name);
      status.textContent = `Caricata: ${file.name}`;
      updateSummary();
    } catch (error) { status.textContent = 'Impossibile leggere questa foto.'; console.error(error); }
  };
  $(`${name}Restore`).onclick = () => {
    if (name === 'album') { albumPhoto.source = null; albumPhoto.state = 'esempio'; showCover(); }
    else setPhoto(name, sampleCanvas(photoSlots[name].hue, 'La tua foto', photoSlots[name].aspect()), 'esempio');
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
const initialOffer = await loadOffer();
{
  const size = normalizeFormat(initialOffer.format);
  if (size) setDims(size[0] / 100, size[1] / 100);
  if (COVER_MODES.includes(initialOffer.cover?.mode)) offer.cover.mode = initialOffer.cover.mode;
  if (offer.cover.mode !== 'choice') coverChoice = offer.cover.mode;
}
refreshPhotos();
buildPieces();
layoutNow = computeLayout(); buildEnv(layoutNow);
await setFabric(initial.id, ['box', 'album']);
syncFormatUi();
setMode('closed', true);
rebuildSteps(); syncCoverUi();
goStep(0, {focus: false});
$('status').textContent = '';
document.body.dataset.ready = 'true';

if (embedded) {
  /** Foto scelta dal cliente nell'host (galleria o caricamento): arriva già ridotta, con il suo id. */
  async function setHostPhoto(slot, {id, blob, name}) {
    const image = await readImage(blob), label = name || 'foto scelta';
    assets[slot] = id;
    if (slot === 'album') { albumPhoto.source = image; albumPhoto.state = label; showCover(); }
    else setPhoto(slot, image, label);
    $(`${slot}Status`).textContent = `Foto scelta: ${label}`;
  }
  function applyLock(value) {
    locked = value === true;
    for (const b of document.querySelectorAll('.panel-content button')) b.disabled = locked;
    document.body.classList.toggle('locked', locked);
  }
  async function applyFromHost(data) {
    const option = data.option || {}, setup = option.setup;
    if (Array.isArray(option.materials)) { allowedMaterials = new Set(option.materials.map(m => m.id)); rebuildSwatches(); }
    if (data.photos?.graphic) { graphic.source = await readImage(data.photos.graphic.blob); graphic.name = data.photos.graphic.name || 'grafica dello studio'; }
    if (setup) {
      const size = normalizeFormat(setup.format);
      if (size) studioFormat = {w: setup.format.w, h: setup.format.h};
      applyOffer({format: setup.format, cover: setup.cover});
    }
    const cfg = data.configuration;
    if (cfg && cfg.modelId === 'scatola-cornice') {
      if (offer.cover.mode === 'choice' && ['photo', 'graphic'].includes(cfg.coverLayout)) coverChoice = cfg.coverLayout;
      await setFabric(cfg.materialId, ['box', 'album']);
    } else if (allowedMaterials && chosen.box && !allowedMaterials.has(chosen.box.id)) {
      const first = variants.find(v => allowedMaterials.has(v.id));
      if (first) await setFabric(first.id, ['box', 'album']);
    }
    for (const slot of ['base', 'lid', 'album']) {
      const photo = data.photos?.[slot === 'album' ? 'cover' : slot];
      if (photo) await setHostPhoto(slot, photo);
    }
    showCover(); syncCoverUi(); updateSummary();
    if (data.readOnly !== undefined) applyLock(data.readOnly);
  }

  /** Otto viste per il report di conferma dello studio. */
  const EXPORT_SIZE = [1200, 900];
  function exportViews() {
    const L = computeLayout(), s = Math.max(1, Math.max(W, H) / .342);
    const prevMode = mode, prevCam = camera.position.clone(), prevTarget = controls.target.clone();
    const prevRatio = renderer.getPixelRatio(), prevPose = Object.fromEntries(Object.entries(pieces).map(([k, p]) => [k, {p: p.position.toArray(), r: p.rotation.toArray().slice(0, 3)}]));
    const add = (t, o) => ({t, p: [t[0] + o[0], t[1] + o[1], t[2] + o[2]]});
    const wall = [L.wallX, L.wallY, -.30], lid = [L.lidX, L.lidY, L.lidZ], album = [L.albumX, AD, L.albumZ];
    const views = [
      ['Scatola chiusa', 'closed', poses().closed.cam],
      ['Scatola chiusa, vista laterale', 'closed', add([0, H / 2, 0], [-.95 * s, .12 * s, .55 * s])],
      ['I tre usi', 'uses', poses().uses.cam],
      ['Quadro da parete (fondo)', 'uses', add(wall, [.1, .05, 1.25 * s])],
      ['Cornice da tavolo (tappo)', 'uses', add(lid, [.2 * s, .12, .75 * s])],
      ['Album sul tavolo', 'uses', add(album, [.1, .55 * s, .55 * s])],
      ['Dettaglio tessuto della scatola', 'closed', add([W / 2 - .04, H - .04, D / 2], [.12, .05, .22])],
      ['Dettaglio tessuto dell’album', 'uses', add([L.albumX + AW * .2, AD, L.albumZ], [.08, .18, .3])],
    ];
    renderer.setPixelRatio(1); renderer.setSize(...EXPORT_SIZE, false);
    camera.aspect = EXPORT_SIZE[0] / EXPORT_SIZE[1]; camera.updateProjectionMatrix();
    const previews = [];
    try {
      for (const [label, viewMode, cam] of views) {
        setMode(viewMode, true);
        for (const m of envMats) m.opacity = envOpacity;
        envGroup.visible = envOpacity > .01;
        camera.position.set(...cam.p); controls.target.set(...cam.t); controls.update();
        renderer.render(scene, camera);
        previews.push({label, image: canvas.toDataURL('image/jpeg', .85)});
      }
    } finally {
      renderer.setPixelRatio(prevRatio); resize();
      setMode(prevMode === 'open' ? 'uses' : prevMode, true);
      for (const [k, v] of Object.entries(prevPose)) { pieces[k].position.set(...v.p); pieces[k].rotation.set(...v.r); }
      camera.position.copy(prevCam); controls.target.copy(prevTarget); controls.update();
    }
    return previews;
  }

  // ---- Telefono: galleria nello slide, 3D in miniatura, azioni finali ----
  const picked = {base: null, lid: null, album: null};
  let galleryData = {photos: [], chapters: []};
  function renderGallery(slot) {
    const box = document.querySelector(`[data-gallery="${slot}"]`); if (!box) return;
    const active = box.dataset.chapter || '';
    const used = galleryData.chapters.filter(c => galleryData.photos.some(p => p.chapterId === c.id));
    box.textContent = '';
    if (used.length) {
      const chips = document.createElement('div'); chips.className = 'mq-chips';
      for (const [id, label] of [['', 'Tutte'], ...used.map(c => [c.id, c.titolo])]) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', String(id === active));
        b.onclick = () => { box.dataset.chapter = id; renderGallery(slot); };
        chips.append(b);
      }
      box.append(chips);
    }
    const grid = document.createElement('div'); grid.className = 'mq-thumbs';
    for (const photo of galleryData.photos.filter(p => !active || p.chapterId === active)) {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-label', photo.name || 'Foto');
      b.style.backgroundImage = `url("${String(photo.thumbnailUrl || photo.url).replace(/"/g, '%22')}")`;
      b.setAttribute('aria-pressed', String(picked[slot] === photo.id));
      b.disabled = locked;
      b.onclick = () => { picked[slot] = photo.id; renderGallery(slot); notify('pick-gallery', {slot, photoId: photo.id}); };
      grid.append(b);
    }
    if (!galleryData.photos.length) { const p = document.createElement('p'); p.textContent = 'Caricamento della galleria…'; grid.append(p); }
    box.append(grid);
  }
  function setPhone(value) {
    phone = value === true;
    document.body.classList.toggle('phone', phone); document.body.classList.toggle('mq-phone', phone);
    if (phone) for (const d of document.querySelectorAll('.material-category')) d.open = true;
    updateSummary();
    goStep(step, {focus: false});
  }
  $('pipOpen').onclick = () => document.body.classList.add('mq-3d');
  $('pipClose').onclick = () => document.body.classList.remove('mq-3d');
  $('closeHost').onclick = () => notify('close');
  $('editAgain').onclick = () => goStep(0);
  $('submitHost').onclick = () => notify('submit');

  for (const b of document.querySelectorAll('[data-pick]')) b.onclick = () => notify('pick-photo', {slot: b.dataset.pick.split(':')[0], source: b.dataset.pick.split(':')[1]});
  window.addEventListener('message', async event => {
    if (event.source !== window.parent || event.origin !== location.origin || event.data?.channel !== 'memorie-mockup-v1') return;
    const data = event.data;
    try {
      if (data.type === 'apply') {
        notify('busy', {busy: true});
        await applyFromHost(data);
        notify('busy', {busy: false});
        emitChange(true);
        notify('applied');
      } else if (data.type === 'lock') applyLock(data.readOnly);
      else if (data.type === 'layout') setPhone(data.phone);
      else if (data.type === 'gallery') { galleryData = {photos: data.photos || [], chapters: data.chapters || []}; for (const slot of ['base', 'lid', 'album']) renderGallery(slot); }
      else if (data.type === 'status') { $('hostStatus').textContent = data.text || ''; $('submitHost').disabled = !data.canSubmit; $('submitHost').textContent = data.submitLabel || 'Invia allo studio'; }
      else if (data.type === 'export') {
        try { notify('exported', {requestId: data.requestId, previews: exportViews(), configuration: currentConfiguration()}); }
        catch (error) { console.error(error); notify('export-error', {requestId: data.requestId}); }
      }
    } catch (error) { console.error(error); notify('busy', {busy: false}); notify('fatal-error', {message: 'Impossibile applicare le scelte'}); }
  });
}
notify('ready');
