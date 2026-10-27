import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

/*
 * ImageBox · album in un blocco di plexiglass.
 * Plexiglass davanti, sopra, sotto e a sinistra; l'album esce dal lato destro. Il retro è un pannello
 * rivestito con il tessuto della scatola, come le due cornici che stringono le estremità.
 * Sul fondo (dentro il retro) è stampata una foto; sul plexiglass davanti si incide una scritta o una grafica.
 * Geometria procedurale in metri; tessuti dal campionario Custodia / Peppe Lab.
 */

const $ = id => document.getElementById(id);
// Dentro la piattaforma il visualizzatore è in un iframe: foto, scelte dello studio e salvataggio li gestisce l'host.
const embedded = window.parent !== window;
let phone = false;   // telefono nella piattaforma: lo decide l'host
if (embedded) document.body.classList.add('embedded');
const notify = (type, payload = {}) => { if (embedded) window.parent.postMessage({channel: 'memorie-mockup-v1', type, ...payload}, location.origin); };
const SRC = new URL('../custodia-v1/', import.meta.url);

// ---- Misure (metri) --------------------------------------------------------
const P = 0.008;                     // spessore del plexiglass
const C = 0.003;                     // gioco attorno all'album
const AD = 0.032, BOARD = 0.0035;    // album: spessore e cartoni
const FW = 0.026;                    // larghezza delle cornici in tessuto
const FT = 0.010;                    // sporgenza delle cornici oltre il plexiglass
const FORMATS = [[20, 30], [30, 20], [25, 35], [35, 25], [30, 40], [40, 30]];
let AW = 0.30, AH = 0.20;            // album (larghezza × altezza)
let BW, BH, BD;                      // blocco di plexiglass (esterno)
const setDims = (w, h) => { AW = w; AH = h; BW = AW + 2 * C + P; BH = AH + 2 * C + 2 * P; BD = AD + 2 * C + 2 * P; };
setDims(AW, AH);
const boxY = () => FT + BH / 2;      // le cornici poggiano sul piano

// ---- Renderer e scena ------------------------------------------------------
const canvas = $('viewport'), stage = canvas.parentElement;
const renderer = new THREE.WebGLRenderer({canvas, antialias: true, alpha: true, preserveDrawingBuffer: false});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
canvas.addEventListener('webglcontextlost', e => {
  e.preventDefault();
  $('status').textContent = 'Anteprima 3D interrotta. Ricarica la pagina.';
  renderer.setAnimationLoop(null);
  notify('fatal-error', {message: 'Anteprima 3D interrotta'});
}, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe9e8e0);
const camera = new THREE.PerspectiveCamera(36, 1, .01, 30);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.enablePan = false;
controls.minDistance = .25; controls.maxDistance = 3.5; controls.autoRotateSpeed = 1.3;
controls.minPolarAngle = .05; controls.maxPolarAngle = Math.PI / 2 + .25;
{
  const env = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(env, .04).texture; scene.environmentIntensity = .35;
  env.dispose(); pmrem.dispose();
}
scene.add(new THREE.HemisphereLight(0xffffff, 0xc0b7a5, .45));
const key = new THREE.DirectionalLight(0xfff8ee, 1.15);
key.position.set(-.6, 1.2, 1.3); key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, {left: -1, right: 1, top: 1, bottom: -1, near: .05, far: 6});
key.shadow.bias = -.00008; scene.add(key);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({opacity: .13}));
ground.rotation.x = -Math.PI / 2; ground.position.y = -.0005; ground.receiveShadow = true; scene.add(ground);

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
const fabricOf = {box: [boxFabric], album: [albumFabric]};
const chosen = {box: null, album: null};
let twoFabrics = false;
const fabricTokens = {box: 0, album: 0};
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
  const tokens = which.map(name => [name, ++fabricTokens[name]]);
  try {
    const {color, height, variant} = await fabricTextures(id);
    for (const [name, token] of tokens) {
      if (token !== fabricTokens[name]) continue;
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
  } finally { markSwatches(); updateSummary(); }
}

// ---- Materiali fissi -----------------------------------------------------------
const plexi = new THREE.MeshPhysicalMaterial({
  color: 0xf2faf7, roughness: .05, metalness: 0, transparent: true, opacity: .16,
  clearcoat: 1, clearcoatRoughness: .04, depthWrite: false, side: THREE.DoubleSide,
});
const plexiEdge = new THREE.LineBasicMaterial({color: 0x8fa9a2, transparent: true, opacity: .7});
const paper = new THREE.MeshStandardMaterial({color: 0xf1ead9, roughness: .95});
function woodTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, c.height);
  g.addColorStop(0, '#caa071'); g.addColorStop(.5, '#bf915e'); g.addColorStop(1, '#c79b69');
  x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
  // venature: linee ondulate più scure, semi trasparenti
  for (let i = 0; i < 70; i++) {
    const y0 = (i / 70) * c.height + Math.sin(i * 7.3) * 6, amp = 3 + (i % 5) * 1.6, freq = .004 + (i % 7) * .0007;
    x.strokeStyle = `rgba(${90 + (i % 3) * 12},${55 + (i % 4) * 6},${28},${.07 + (i % 4) * .035})`;
    x.lineWidth = 1 + (i % 3);
    x.beginPath();
    for (let px = 0; px <= c.width; px += 8) x.lineTo(px, y0 + Math.sin(px * freq + i) * amp + Math.sin(px * .021 + i * 2) * 1.5);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const wood = new THREE.MeshStandardMaterial({map: woodTexture(), roughness: .62});

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
/** Lastra di plexiglass: trasparente, con gli spigoli appena visibili. */
function plexiPanel(w, h, d) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), plexi);
  mesh.renderOrder = 2;
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), plexiEdge));
  return mesh;
}

// Foto: fondo della scatola e copertina, ognuna con un'immagine di esempio sostituibile.
const photoSlots = {
  base: {label: 'Foto sul fondo', aspect: () => (BW - P) / (BH - 2 * P), hue: 205, state: 'esempio'},
  album: {label: 'Foto di copertina', aspect: () => coverPhotoSize()[0] / coverPhotoSize()[1], hue: 150, state: 'esempio'},
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
  x.fillStyle = 'rgba(255,255,255,.92)'; x.textAlign = 'center'; x.font = `600 ${Math.round(u * .06)}px system-ui,sans-serif`;
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
function showPhoto(name) {
  const slot = photoSlots[name];
  if (slot.loaded) setPhoto(name, slot.loaded.source, slot.loaded.state);
  else setPhoto(name, sampleCanvas(slot.hue, 'La tua foto', slot.aspect()), 'esempio');
}
const plane = (w, h, material) => {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.receiveShadow = true; return mesh;
};

// ---- Incisioni -------------------------------------------------------------------
// Testo oppure grafica. La grafica è una maschera: conta la trasparenza del PNG oppure,
// se il file non ne ha, quanto è scuro il disegno su fondo chiaro.
const coverEngraving = {mode: 'text', text: '', graphic: null, assetId: null};
const glassEngraving = {mode: 'none', text: '', color: 'white', graphic: null, assetId: null};
let allowGraphics = !embedded && location.hash === '#studio';

const STYLES = {
  wood: {font: f => `italic 400 ${f}px Georgia,'Times New Roman',serif`, ink: [61, 36, 18], alpha: .88},
  fabric: {font: f => `400 ${f}px Georgia,'Times New Roman',serif`, ink: [20, 14, 8], alpha: .45, relief: true},
  'glass-white': {font: f => `300 ${f}px 'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif`, ink: [255, 255, 255], alpha: .96},
  'glass-black': {font: f => `300 ${f}px 'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif`, ink: [18, 18, 18], alpha: .92},
  'glass-graphic': {keepColors: true, alpha: 1},
};
const normalizeText = text => String(text || '').split('\n').map(l => l.trim()).join('\n').trim();

function graphicMask(source, w, h, keepColors, ink, alpha) {
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d', {willReadFrequently: true});
  x.drawImage(source, 0, 0, c.width, c.height);
  const data = x.getImageData(0, 0, c.width, c.height), px = data.data;
  let transparent = false;
  for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { transparent = true; break; }
  for (let i = 0; i < px.length; i += 4) {
    const lum = (px[i] * .2126 + px[i + 1] * .7152 + px[i + 2] * .0722) / 255;
    const m = transparent ? px[i + 3] / 255 : Math.min(1, Math.max(0, (1 - lum) * 1.25 - .08));
    if (!keepColors) { px[i] = ink[0]; px[i + 1] = ink[1]; px[i + 2] = ink[2]; }
    px[i + 3] = Math.round(m * alpha * 255);
  }
  x.putImageData(data, 0, 0);
  return c;
}

/**
 * Disegna l'incisione su una trasparenza grande quanto la superficie (w × h metri).
 * `area` è il riquadro utile in frazioni della superficie: {cx, cy, w, h, maxFont}.
 */
function engravingTexture(spec, w, h, styleName, area) {
  const style = STYLES[styleName];
  const W = w >= h ? 1600 : Math.round(1600 * w / h), H = w >= h ? Math.round(1600 * h / w) : 1600;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const ax = area.cx * W, ay = area.cy * H, aw = area.w * W, ah = area.h * H;
  let layer = null;
  if (spec.mode === 'text' && normalizeText(spec.text)) {
    const lines = normalizeText(spec.text).split('\n');
    const probe = 100; x.font = style.font(probe);
    const widest = Math.max(...lines.map(l => x.measureText(l).width), 1);
    const font = Math.min(probe * aw / widest, ah / (lines.length * 1.3), area.maxFont * H);
    layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    const l = layer.getContext('2d');
    l.font = style.font(font); l.textAlign = 'center'; l.textBaseline = 'middle';
    l.fillStyle = `rgba(${style.ink.join(',')},${style.alpha})`;
    lines.forEach((line, i) => l.fillText(line, ax, ay + (i - (lines.length - 1) / 2) * font * 1.3));
  } else if (spec.mode === 'graphic' && spec.graphic) {
    const g = spec.graphic, scale = Math.min(aw / g.width, ah / g.height);
    const gw = g.width * scale, gh = g.height * scale;
    const mask = graphicMask(g, gw, gh, !!style.keepColors, style.ink || [0, 0, 0], style.alpha);
    layer = document.createElement('canvas'); layer.width = W; layer.height = H;
    layer.getContext('2d').drawImage(mask, ax - gw / 2, ay - gh / 2);
  }
  if (layer) {
    // Sul tessuto l'incisione è a secco: un filo di luce sotto il bordo dà la profondità.
    if (style.relief) {
      const light = document.createElement('canvas'); light.width = W; light.height = H;
      const l = light.getContext('2d'); l.drawImage(layer, 0, 0);
      l.globalCompositeOperation = 'source-in'; l.fillStyle = '#fff'; l.fillRect(0, 0, W, H);
      x.globalAlpha = .4; x.drawImage(light, 0, Math.max(1, H / 600)); x.globalAlpha = 1;
    }
    x.drawImage(layer, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}
const engravingMaterials = new Set();
function engravingPlane(spec, w, h, styleName, area) {
  const glass = styleName.startsWith('glass');
  const material = glass
    ? new THREE.MeshBasicMaterial({map: engravingTexture(spec, w, h, styleName, area), transparent: true, depthWrite: false, toneMapped: false})
    : new THREE.MeshStandardMaterial({map: engravingTexture(spec, w, h, styleName, area), transparent: true, depthWrite: false, roughness: .8, polygonOffset: true, polygonOffsetFactor: -2});
  engravingMaterials.add(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.renderOrder = 3;
  return mesh;
}
function disposeEngravings(group) {
  group.traverse(o => { if (engravingMaterials.has(o.material)) { o.material.map?.dispose(); o.material.dispose(); engravingMaterials.delete(o.material); } });
}

/** Grafica di esempio: la sostituisce quella caricata dallo studio. */
function sampleGraphic() {
  const c = document.createElement('canvas'); c.width = 800; c.height = 500;
  const x = c.getContext('2d');
  x.strokeStyle = '#222'; x.fillStyle = '#222'; x.lineWidth = 9; x.lineCap = 'round';
  for (const side of [-1, 1]) {
    x.beginPath(); x.arc(400 + side * 40, 250, 190, side < 0 ? Math.PI * .62 : -Math.PI * .38, side < 0 ? Math.PI * 1.38 : Math.PI * .38); x.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (side < 0 ? Math.PI * .7 : -Math.PI * .3) + i * .22, r = 190, cx = 400 + side * 40 + Math.cos(a) * r, cy = 250 + Math.sin(a) * r;
      x.beginPath(); x.ellipse(cx, cy, 26, 11, a + side * .9, 0, Math.PI * 2); x.fill();
    }
  }
  x.font = 'italic 400 150px Georgia,serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('L', 400, 255);
  return c;
}

// ---- Copertina dell'album --------------------------------------------------------
const LAYOUTS = {
  full: {label: 'Foto piena', text: 'La tua foto copre tutta la copertina.'},
  'photo-plaque': {label: 'Foto piccola al centro', text: 'Una foto al centro, sul tessuto dell’album.'},
  plaque: {label: 'Placchetta in legno', text: 'Una placchetta di legno al centro, sul tessuto dell’album, con la scritta incisa.'},
  'split-photo-fabric': {label: 'Metà foto, metà tessuto', text: 'Foto verticale a destra; a sinistra il tessuto della scatola, con un’incisione se vuoi.'},
};
let coverLayout = 'full';
const plaqueSize = () => { const w = Math.min(AW, AH) * .55; return [w, w * .55]; };
function coverPhotoSize() {
  if (coverLayout === 'split-photo-fabric') return [AW / 2 - .001, AH - .002];
  if (coverLayout === 'photo-plaque') { const w = AW * .45; return [w, w * AH / AW]; }
  return [AW - .002, AH - .002];
}
const coverNeedsPhoto = () => coverLayout !== 'plaque';
const coverHasEngraving = () => coverLayout === 'plaque' || coverLayout === 'split-photo-fabric';

// ---- Pezzi -----------------------------------------------------------------------
function buildBox() {
  const g = new THREE.Group(), cy = boxY();
  // Plexiglass davanti, sopra, sotto e sul fianco sinistro; a destra è aperto. Il retro è in tessuto.
  g.add(at(plexiPanel(BW, BH, P), 0, cy, BD / 2 - P / 2));
  g.add(at(metricBox(BW, BH, P, boxFabric), 0, cy, -BD / 2 + P / 2));
  g.add(at(plexiPanel(BW, P, BD - 2 * P), 0, cy + BH / 2 - P / 2, 0));
  g.add(at(plexiPanel(BW, P, BD - 2 * P), 0, cy - BH / 2 + P / 2, 0));
  g.add(at(plexiPanel(P, BH - 2 * P, BD - 2 * P), -BW / 2 + P / 2, cy, 0));
  // Foto stampata sul fondo, cioè sul lato interno del retro: si vede attraverso il plexiglass davanti.
  g.add(at(plane(BW - P, BH - 2 * P, photoSlots.base.material), P / 2, cy, -BD / 2 + P + .0004));
  // Cornici in tessuto alle due estremità: anelli rettangolari attorno al blocco.
  for (const side of [-1, 1]) {
    const x = side * (BW / 2 - FW / 2 + .002);
    g.add(at(metricBox(FW, FT, BD + 2 * FT, boxFabric), x, cy + BH / 2 + FT / 2, 0));
    g.add(at(metricBox(FW, FT, BD + 2 * FT, boxFabric), x, cy - BH / 2 - FT / 2, 0));
    g.add(at(metricBox(FW, BH, FT, boxFabric), x, cy, BD / 2 + FT / 2));
    g.add(at(metricBox(FW, BH, FT, boxFabric), x, cy, -BD / 2 - FT / 2));
  }
  // Incisione sul plexiglass davanti, tra le due cornici.
  if (glassEngraving.mode !== 'none') {
    const w = BW - 2 * FW, h = BH - 2 * P;
    const style = glassEngraving.mode === 'graphic' ? 'glass-graphic' : glassEngraving.color === 'black' ? 'glass-black' : 'glass-white';
    const area = glassEngraving.mode === 'graphic' ? {cx: .5, cy: .66, w: .6, h: .4, maxFont: 1} : {cx: .5, cy: .74, w: .72, h: .2, maxFont: .075};
    const spec = {...glassEngraving, graphic: glassEngraving.graphic || (glassEngraving.mode === 'graphic' ? sampleGraphic() : null)};
    g.add(at(engravingPlane(spec, w, h, style, area), 0, cy, BD / 2 + .0006));
  }
  return g;
}

function buildAlbum() {
  const g = new THREE.Group(), front = AD / 2 - BOARD / 2;
  if (coverLayout === 'split-photo-fabric') {
    // La metà in tessuto della copertina prende il tessuto della scatola.
    g.add(at(metricBox(AW / 2, AH, BOARD, boxFabric), -AW / 4, 0, front));
    g.add(at(metricBox(AW / 2, AH, BOARD, albumFabric), AW / 4, 0, front));
  } else g.add(at(metricBox(AW, AH, BOARD, albumFabric), 0, 0, front));
  g.add(at(metricBox(AW, AH, BOARD, albumFabric), 0, 0, -front));
  g.add(at(metricBox(BOARD, AH, AD - 2 * BOARD, albumFabric), -AW / 2 + BOARD / 2, 0, 0));
  g.add(at(metricBox(AW - 2 * BOARD, AH - .008, AD - 2 * BOARD - .002, paper), BOARD / 2, 0, 0));
  const z = AD / 2 + .0004, [pw, ph] = coverPhotoSize();
  if (coverLayout === 'full') g.add(at(plane(pw, ph, photoSlots.album.material), 0, 0, z));
  if (coverLayout === 'photo-plaque') {
    g.add(at(metricBox(pw + .004, ph + .004, .0012, paper), 0, 0, AD / 2 + .0006));
    g.add(at(plane(pw, ph, photoSlots.album.material), 0, 0, AD / 2 + .0013));
  }
  if (coverLayout === 'split-photo-fabric') {
    g.add(at(plane(pw, ph, photoSlots.album.material), AW / 4, 0, z));
    if (coverEngraving.mode !== 'none') g.add(at(engravingPlane(coverSpec(), AW / 2, AH, 'fabric', {cx: .5, cy: .5, w: .72, h: .32, maxFont: .09}), -AW / 4, 0, z));
  }
  if (coverLayout === 'plaque') {
    const [w, h] = plaqueSize(), T = .004;
    g.add(at(metricBox(w, h, T, wood), 0, 0, AD / 2 + T / 2));
    g.add(at(engravingPlane(coverSpec(), w, h, 'wood', {cx: .5, cy: .5, w: .84, h: .74, maxFont: .32}), 0, 0, AD / 2 + T + .0003));
  }
  return g;
}
/** Sulla placchetta serve sempre qualcosa: senza testo si mostra un esempio. */
function coverSpec() {
  if (coverEngraving.mode === 'graphic') return {mode: 'graphic', graphic: coverEngraving.graphic || sampleGraphic()};
  return {mode: 'text', text: normalizeText(coverEngraving.text) || (coverLayout === 'plaque' ? 'Il tuo testo' : '')};
}

const pieces = {};
function buildPieces() {
  for (const name of Object.keys(pieces)) { disposeEngravings(pieces[name]); disposeGroup(pieces[name]); }
  pieces.box = buildBox(); pieces.album = buildAlbum();
  for (const piece of Object.values(pieces)) scene.add(piece);
  applyPose(poses()[mode], true);
}
/** Ricostruisce solo l'album (copertina o incisione cambiate), lasciandolo dov'è. */
function rebuildAlbum() {
  const old = pieces.album, keep = {p: old.position.toArray(), queue: old.userData.queue, goal: old.userData.goal};
  disposeEngravings(old); disposeGroup(old);
  pieces.album = buildAlbum(); scene.add(pieces.album);
  pieces.album.position.fromArray(keep.p); pieces.album.userData.goal = keep.goal; pieces.album.userData.queue = keep.queue;
}
function rebuildBox() {
  const old = pieces.box; disposeEngravings(old); disposeGroup(old);
  pieces.box = buildBox(); scene.add(pieces.box);
}

// ---- Pose e viste ----------------------------------------------------------------
const albumInside = () => [-BW / 2 + P + C + AW / 2, FT + P + C + AH / 2, 0];
const albumOutside = () => [BW / 2 + AW / 2 + .05, AH / 2 + .0006, .015];
const scale = () => Math.max(1, Math.max(BW, BH) / .34);
function poses() {
  const s = scale(), cy = boxY(), out = albumOutside();
  const front = (t, o) => ({t, p: [t[0] + o[0] * s, t[1] + o[1] * s, t[2] + o[2] * s]});
  const midX = out[0] / 2;
  return {
    closed: {album: [albumInside()], cam: front([0, cy, 0], [.22, .1, .74]), text: 'L’album è dentro: la copertina si vede attraverso il plexiglass.'},
    open: {album: [[out[0], albumInside()[1], 0], out], cam: front([midX, cy * .8, 0], [.1, .12, 1.12]), text: 'Album fuori dal lato destro: sul fondo della scatola resta la foto stampata.'},
    back: {album: [albumInside()], cam: front([0, cy, 0], [-.26, .12, -.76]), text: 'Il retro è rivestito con il tessuto della scatola, come le cornici.'},
  };
}
let mode = 'closed', camGoal = null;
/** L'album segue una coda di posizioni: prima scivola fuori dal lato destro, poi si appoggia. */
function applyPose(pose, instant) {
  const album = pieces.album; if (!album) return;
  const final = pose.album[pose.album.length - 1];
  if (instant) { album.position.set(...final); album.userData.queue = []; album.userData.goal = null; return; }
  // Se è già fuori: per rientrare si alza all'altezza dell'apertura, altrimenti resta appoggiato.
  const path = album.position.x <= BW / 2 ? pose.album : final[0] < BW / 2 ? [[albumOutside()[0], albumInside()[1], 0], final] : [final];
  album.userData.queue = path.slice(1); album.userData.goal = path[0];
}
function setMode(next, instant = false) {
  const pose = poses()[next];
  applyPose(pose, instant);
  mode = next;
  if (instant) { camera.position.set(...pose.cam.p); controls.target.set(...pose.cam.t); camGoal = null; }
  else camGoal = {p: new THREE.Vector3(...pose.cam.p), t: new THREE.Vector3(...pose.cam.t)};
  for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === next));
  $('modeText').textContent = pose.text;
}
controls.addEventListener('start', () => { camGoal = null; });

/** Ricostruisce tutto per un nuovo formato (cm). */
function applyFormat(wCm, hCm) {
  setDims(wCm / 100, hCm / 100);
  for (const name of Object.keys(photoSlots)) showPhoto(name);
  buildPieces();
  setMode(mode, true);
  syncFormatUi();
}

// ---- Interfaccia -------------------------------------------------------------
const cm = n => String(Math.round(n * 10) / 10).replace('.', ',');
const orientation = () => AW > AH + 1e-6 ? 'orizzontale' : 'verticale';
function markSwatches() {
  for (const b of document.querySelectorAll('[data-finish]')) {
    const target = b.dataset.target === 'album' ? chosen.album : chosen.box;
    b.setAttribute('aria-pressed', String(target?.id === b.dataset.finish));
  }
}
const engravingSummary = (e, none) => e.mode === 'none' ? none
  : e.mode === 'graphic' ? (e.assetId || !embedded ? 'grafica dello studio' : 'grafica da caricare')
  : normalizeText(e.text) ? `«${normalizeText(e.text).replace(/\n/g, ' / ')}»${e.color && glassEngraving === e ? ` (${e.color === 'black' ? 'nera' : 'bianca'})` : ''}` : 'scritta da completare';
function updateSummary() {
  const base = photoSlots.base, album = photoSlots.album;
  const lines = [
    `Formato album: ${cm(AW * 100)} × ${cm(AH * 100)} cm (${orientation()}), stabilito dallo studio`,
    `ImageBox: ${cm((BW + .004) * 100)} × ${cm((BH + 2 * FT) * 100)} × ${cm((BD + 2 * FT) * 100)} cm circa`,
    twoFabrics ? `Tessuto della scatola (cornici e retro): ${chosen.box?.label || '—'}\nTessuto dell’album: ${chosen.album?.label || '—'}` : `Tessuto di scatola (cornici e retro) e album: ${chosen.box?.label || '—'}`,
    `Copertina: ${LAYOUTS[coverLayout].label.toLowerCase()}${coverNeedsPhoto() ? ` · ${album.state === 'esempio' ? 'foto da scegliere' : album.state}` : ''}`,
    ...(coverHasEngraving() ? [`Incisione ${coverLayout === 'plaque' ? 'della placchetta' : 'sul tessuto'}: ${engravingSummary(coverEngraving, 'nessuna')}`] : []),
    `Foto sul fondo: ${base.state === 'esempio' ? 'da scegliere' : base.state}`,
    `Plexiglass davanti: ${engravingSummary(glassEngraving, 'senza incisione')}`,
  ];
  $('configurationSummary').textContent = lines.join('\n');
  emitChange();
  const label = chosen.box ? (twoFabrics && chosen.album ? `${chosen.box.label} + ${chosen.album.label}` : chosen.box.label) : 'Caricamento rivestimento…';
  $('materialLabel').textContent = chosen.box ? `${label} · album ${cm(AW * 100)} × ${cm(AH * 100)} cm` : label;
}

// Scelte dello studio: formato dell'album e, solo nel percorso in cui prepara lui il mockup, le grafiche.
const assets = {base: null, album: null};
let studioFormat = null;
let allowedMaterials = null;   // Set di id consentiti dal laboratorio; null = tutto il campionario
let locked = false;

function engravingConfig(e, withColor) {
  if (e.mode === 'graphic') return e.assetId ? {mode: 'graphic', assetId: e.assetId} : null;
  const text = e.mode === 'text' ? normalizeText(e.text) : '';
  return text ? {mode: 'text', text, ...(withColor ? {color: e.color} : {})} : null;
}
/** Configurazione nel formato che la piattaforma salva (vedi mockup-types.ts). */
function currentConfiguration() {
  const box = chosen.box, album = twoFabrics ? chosen.album || chosen.box : chosen.box;
  const round = n => Math.round(n * 10) / 10;
  return {
    modelId: 'imagebox', assetRevision: 1,
    materialId: box?.id ?? null, appearanceRevision: box?.appearanceRevision ?? 0,
    albumMaterialId: album?.id ?? null, albumAppearanceRevision: album?.appearanceRevision ?? 0,
    coverLayout,
    format: studioFormat ? {w: studioFormat.w, h: studioFormat.h} : {w: round(AW * 100), h: round(AH * 100)},
    photoAssetId: assets.base,
    coverPhotoAssetId: coverNeedsPhoto() ? assets.album : null,
    coverEngraving: coverHasEngraving() ? engravingConfig(coverEngraving, false) : null,
    glassEngraving: engravingConfig(glassEngraving, true),
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

function syncFabricUi() {
  for (const b of document.querySelectorAll('[data-fabrics]')) b.setAttribute('aria-pressed', String((b.dataset.fabrics === 'two') === twoFabrics));
  $('albumFabricBox').hidden = !twoFabrics;
  $('boxFabricTitle').textContent = twoFabrics ? 'Tessuto della scatola' : 'Tessuto di scatola e album';
}
function syncCoverUi() {
  for (const b of document.querySelectorAll('[data-layout]')) b.setAttribute('aria-pressed', String(b.dataset.layout === coverLayout));
  $('layoutText').textContent = LAYOUTS[coverLayout].text;
  $('coverPhotoBox').hidden = !coverNeedsPhoto();
  $('coverEngravingBox').hidden = !coverHasEngraving();
  $('coverEngravingTitle').textContent = coverLayout === 'plaque' ? 'Incisione della placchetta' : 'Incisione sul tessuto (facoltativa)';
  // Sulla placchetta l'incisione c'è sempre; sul tessuto si può lasciare liscio.
  if (coverLayout === 'plaque' && coverEngraving.mode === 'none') coverEngraving.mode = 'text';
  for (const b of document.querySelectorAll('[data-cover-engraving]')) {
    b.setAttribute('aria-pressed', String(b.dataset.coverEngraving === coverEngraving.mode));
    b.hidden = (b.dataset.coverEngraving === 'none' && coverLayout === 'plaque') || (b.dataset.coverEngraving === 'graphic' && !allowGraphics && coverEngraving.mode !== 'graphic');
  }
  $('coverTextBox').hidden = coverEngraving.mode !== 'text';
  $('coverGraphicBox').hidden = coverEngraving.mode !== 'graphic';
  if ($('coverText').value !== coverEngraving.text) $('coverText').value = coverEngraving.text;
  $('coverTextCount').textContent = `${coverEngraving.text.length} / 120`;
}
function syncGlassUi() {
  for (const b of document.querySelectorAll('[data-glass]')) {
    b.setAttribute('aria-pressed', String(b.dataset.glass === glassEngraving.mode));
    b.hidden = b.dataset.glass === 'graphic' && !allowGraphics && glassEngraving.mode !== 'graphic';
  }
  for (const b of document.querySelectorAll('[data-glass-color]')) b.setAttribute('aria-pressed', String(b.dataset.glassColor === glassEngraving.color));
  $('glassTextBox').hidden = glassEngraving.mode !== 'text';
  $('glassGraphicBox').hidden = glassEngraving.mode !== 'graphic';
  if ($('glassText').value !== glassEngraving.text) $('glassText').value = glassEngraving.text;
  $('glassTextCount').textContent = `${glassEngraving.text.length} / 120`;
}
function syncFormatUi() {
  for (const b of document.querySelectorAll('[data-format]')) {
    const [w, h] = b.dataset.format.split('x').map(Number);
    b.setAttribute('aria-pressed', String(Math.abs(w - AW * 100) < .01 && Math.abs(h - AH * 100) < .01));
  }
  for (const b of [$('graphicsOn'), $('graphicsOff')]) b.setAttribute('aria-pressed', String((b.id === 'graphicsOn') === allowGraphics));
  updateSummary();
}
function syncAll() { syncFabricUi(); syncCoverUi(); syncGlassUi(); syncFormatUi(); }

// Strumenti studio (solo prototipo, #studio): formato e grafiche.
for (const [w, h] of FORMATS) {
  const b = document.createElement('button'); b.type = 'button'; b.dataset.format = `${w}x${h}`;
  b.textContent = `${w} × ${h} ${w > h ? 'orizzontale' : 'verticale'}`;
  b.onclick = () => applyFormat(w, h);
  $('formatChoice').append(b);
}
$('graphicsOn').onclick = () => { allowGraphics = true; syncAll(); };
$('graphicsOff').onclick = () => { allowGraphics = false; syncAll(); };
$('openStudio').hidden = location.hash !== '#studio';
$('openStudio').onclick = () => $('studioDialog').showModal();

// Tessuti
for (const b of document.querySelectorAll('[data-fabrics]')) b.onclick = () => {
  twoFabrics = b.dataset.fabrics === 'two';
  if (!twoFabrics && chosen.box) void setFabric(chosen.box.id, ['box', 'album']);
  syncFabricUi(); updateSummary();
};
const initial = variants.find(v => v.legacyId === 'mist-03') || variants[0];
function buildSwatches(container, target) {
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
      button.type = 'button'; button.dataset.finish = variant.id; button.dataset.target = target; button.title = variant.internalCode;
      const swatch = document.createElement('span'); swatch.className = 'swatch'; swatch.style.backgroundImage = `url('${assetUrl(variant.textureUrl)}')`;
      button.append(swatch, document.createTextNode(variant.label));
      button.onclick = () => setFabric(variant.id, target === 'album' ? ['album'] : twoFabrics ? ['box'] : ['box', 'album']);
      button.setAttribute('aria-pressed', 'false');
      grid.append(button);
    }
    section.append(title, grid); container.append(section);
  }
}
function rebuildSwatches() { buildSwatches($('materialsBox'), 'box'); buildSwatches($('materialsAlbum'), 'album'); markSwatches(); }
rebuildSwatches();

// Copertina e incisioni
for (const b of document.querySelectorAll('[data-layout]')) b.onclick = () => {
  coverLayout = b.dataset.layout; showPhoto('album'); rebuildAlbum(); syncCoverUi(); updateSummary();
};
for (const b of document.querySelectorAll('[data-cover-engraving]')) b.onclick = () => {
  coverEngraving.mode = b.dataset.coverEngraving; rebuildAlbum(); syncCoverUi(); updateSummary();
};
let typingTimer = 0;
const afterTyping = fn => { clearTimeout(typingTimer); typingTimer = setTimeout(fn, 180); };
$('coverText').oninput = () => {
  coverEngraving.text = $('coverText').value.split('\n').slice(0, 3).join('\n').slice(0, 120);
  $('coverTextCount').textContent = `${coverEngraving.text.length} / 120`;
  afterTyping(() => { rebuildAlbum(); updateSummary(); });
};
for (const b of document.querySelectorAll('[data-glass]')) b.onclick = () => {
  glassEngraving.mode = b.dataset.glass; rebuildBox(); syncGlassUi(); updateSummary();
};
for (const b of document.querySelectorAll('[data-glass-color]')) b.onclick = () => {
  glassEngraving.color = b.dataset.glassColor; rebuildBox(); syncGlassUi(); updateSummary();
};
$('glassText').oninput = () => {
  glassEngraving.text = $('glassText').value.split('\n').slice(0, 3).join('\n').slice(0, 120);
  $('glassTextCount').textContent = `${glassEngraving.text.length} / 120`;
  afterTyping(() => { rebuildBox(); updateSummary(); });
};

// Passi: uno per ogni scelta. Il formato lo decide lo studio.
const ALL_STEPS = [
  {id: 'stepFabric', title: 'Il tessuto', view: 'closed'},
  {id: 'stepCover', title: 'Copertina dell’album', view: 'open'},
  {id: 'stepBasePhoto', title: 'Foto sul fondo', view: 'open'},
  {id: 'stepGlass', title: 'Incisione sul plexiglass', view: 'closed'},
  {id: 'stepSummary', title: 'Riepilogo', view: 'closed'},
];
const STEPS = ALL_STEPS;
let step = 0;
for (let i = 0; i < STEPS.length; i++) $('progress').append(document.createElement('i'));
function goStep(index, {focus = true} = {}) {
  step = Math.max(0, Math.min(index, STEPS.length - 1));
  for (const section of document.querySelectorAll('[data-step]')) section.hidden = true;
  $(STEPS[step].id).hidden = false;
  [...$('progress').children].forEach((bar, i) => { bar.className = i <= step ? 'done' : ''; });
  $('stepCount').textContent = `Passo ${step + 1} di ${STEPS.length}`;
  const last = step === STEPS.length - 1;
  $('stepTitle').textContent = phone && last ? 'Ecco il tuo ImageBox' : STEPS[step].title;
  document.body.classList.toggle('mq-final', phone && last);
  document.body.classList.remove('mq-3d');
  notify('step', {index: step, last});
  $('prev').disabled = step === 0;
  $('next').textContent = last ? 'Ricomincia' : 'Avanti';
  $('next').hidden = embedded && last;
  document.querySelector('.panel-content').scrollTop = 0;
  if (mode !== STEPS[step].view) setMode(STEPS[step].view);
  if (focus) $('stepTitle').focus({preventScroll: true});
}
$('prev').onclick = () => goStep(step - 1);
$('next').onclick = () => goStep(step === STEPS.length - 1 ? 0 : step + 1);

for (const b of document.querySelectorAll('[data-mode]')) b.onclick = () => setMode(b.dataset.mode);
$('reset').onclick = () => setMode(mode);
$('rotate').onclick = () => {
  controls.autoRotate = !controls.autoRotate; camGoal = null;
  $('rotate').setAttribute('aria-pressed', String(controls.autoRotate));
};
const zoom = factor => { camGoal = null; camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target); };
$('plus').onclick = () => zoom(.85); $('minus').onclick = () => zoom(1.18);

// Prova locale: foto e grafiche dal dispositivo.
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
function localFile(input, status, use) {
  input.onchange = async () => {
    const file = input.files?.[0]; if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { status.textContent = 'Formato non supportato: usa JPG, PNG o WebP.'; input.value = ''; return; }
    if (file.size > MAX_PHOTO_BYTES) { status.textContent = 'Il file supera i 20 MB.'; input.value = ''; return; }
    try { use(await readImage(file), file.name); status.textContent = `Caricata: ${file.name}`; updateSummary(); }
    catch (error) { status.textContent = 'Impossibile leggere questo file.'; console.error(error); }
  };
}
for (const name of Object.keys(photoSlots)) localFile($(`${name}Upload`), $(`${name}Status`), (image, label) => { photoSlots[name].loaded = {source: image, state: label}; showPhoto(name); });
localFile($('coverGraphicUpload'), $('coverGraphicStatus'), image => { coverEngraving.graphic = image; rebuildAlbum(); });
localFile($('glassGraphicUpload'), $('glassGraphicStatus'), image => { glassEngraving.graphic = image; rebuildBox(); });

// ---- Ciclo di rendering ------------------------------------------------------
function resize() {
  const {clientWidth: w, clientHeight: h} = stage;
  if (!w || !h) return;
  renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage); resize();

const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), orbitFrom = new THREE.Spherical(), orbitTo = new THREE.Spherical();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), k = 1 - Math.exp(-dt * 5.5);
  const album = pieces.album, goal = album?.userData.goal;
  if (goal) {
    album.position.lerp(tmp.set(...goal), k);
    if (album.position.distanceTo(tmp) < .004) {
      const next = album.userData.queue?.shift();
      if (next) album.userData.goal = next; else { album.position.copy(tmp); album.userData.goal = null; }
    }
  }
  if (camGoal) {
    // La camera gira attorno alla scatola (coordinate sferiche): andando sul retro non la attraversa.
    const from = orbitFrom.setFromVector3(tmp.copy(camera.position).sub(controls.target));
    const to = orbitTo.setFromVector3(tmp.copy(camGoal.p).sub(camGoal.t));
    let dTheta = to.theta - from.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI; else if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    from.radius += (to.radius - from.radius) * k; from.phi += (to.phi - from.phi) * k; from.theta += dTheta * k;
    controls.target.lerp(camGoal.t, k);
    camera.position.setFromSpherical(from).add(controls.target);
    if (camera.position.distanceTo(camGoal.p) < .003 && controls.target.distanceTo(camGoal.t) < .003) camGoal = null;
  }
  controls.update();
  renderer.render(scene, camera);
});

// ---- Avvio -------------------------------------------------------------------
for (const name of Object.keys(photoSlots)) showPhoto(name);
buildPieces();
await setFabric(initial.id, ['box', 'album']);
setMode('closed', true);
syncAll();
goStep(0, {focus: false});
$('status').textContent = '';
document.body.dataset.ready = 'true';

if (embedded) {
  /** Foto o grafica scelta nell'host (galleria o caricamento): arriva con il suo id. */
  async function setHostImage(slot, {id, blob, name}) {
    const image = await readImage(blob), label = name || 'foto scelta';
    if (slot === 'coverGraphic') { coverEngraving.graphic = image; coverEngraving.assetId = id; coverEngraving.mode = 'graphic'; $('coverGraphicStatus').textContent = `Grafica: ${label}`; return; }
    if (slot === 'glassGraphic') { glassEngraving.graphic = image; glassEngraving.assetId = id; glassEngraving.mode = 'graphic'; $('glassGraphicStatus').textContent = `Grafica: ${label}`; return; }
    const name2 = slot === 'cover' ? 'album' : slot;
    assets[name2] = id;
    photoSlots[name2].loaded = {source: image, state: label};
    showPhoto(name2);
    $(`${name2}Status`).textContent = `Foto scelta: ${label}`;
  }
  function applyLock(value) {
    locked = value === true;
    for (const el of document.querySelectorAll('.panel-content button, .panel-content textarea')) el.disabled = locked;
    document.body.classList.toggle('locked', locked);
  }
  function restoreEngraving(target, saved) {
    target.graphic = null; target.assetId = null;
    if (!saved) { target.mode = target === coverEngraving && coverLayout === 'plaque' ? 'text' : 'none'; target.text = ''; return; }
    target.mode = saved.mode;
    if (saved.mode === 'text') { target.text = saved.text; if (saved.color) target.color = saved.color; }
    else target.assetId = saved.assetId;
  }
  async function applyFromHost(data) {
    const option = data.option || {}, setup = option.setup;
    if (typeof data.allowGraphics === 'boolean') allowGraphics = data.allowGraphics;
    if (Array.isArray(option.materials)) { allowedMaterials = new Set(option.materials.map(m => m.id)); rebuildSwatches(); }
    if (setup?.format && FORMATS.some(([w, h]) => w === setup.format.w && h === setup.format.h)) {
      studioFormat = {w: setup.format.w, h: setup.format.h};
      if (Math.abs(studioFormat.w - AW * 100) > .01 || Math.abs(studioFormat.h - AH * 100) > .01) applyFormat(studioFormat.w, studioFormat.h);
    }
    const cfg = data.configuration;
    if (cfg && cfg.modelId === 'imagebox') {
      twoFabrics = cfg.albumMaterialId !== cfg.materialId;
      if (LAYOUTS[cfg.coverLayout]) coverLayout = cfg.coverLayout;
      restoreEngraving(coverEngraving, cfg.coverEngraving);
      restoreEngraving(glassEngraving, cfg.glassEngraving);
      assets.base = cfg.photoAssetId || null; assets.album = cfg.coverPhotoAssetId || null;
      await setFabric(cfg.materialId, twoFabrics ? ['box'] : ['box', 'album']);
      if (twoFabrics) await setFabric(cfg.albumMaterialId, ['album']);
    } else if (allowedMaterials && chosen.box && !allowedMaterials.has(chosen.box.id)) {
      const first = variants.find(v => allowedMaterials.has(v.id));
      if (first) await setFabric(first.id, ['box', 'album']);
    }
    const photos = data.photos || {};
    for (const slot of ['base', 'cover', 'coverGraphic', 'glassGraphic']) if (photos[slot]) await setHostImage(slot, photos[slot]);
    showPhoto('album'); showPhoto('base');
    rebuildAlbum(); rebuildBox(); syncAll();
    if (data.readOnly !== undefined) applyLock(data.readOnly);
  }

  /** Otto viste per il report di conferma dello studio. */
  const EXPORT_SIZE = [1200, 900];
  function exportViews() {
    const s = scale(), cy = boxY(), out = albumOutside();
    const prevMode = mode, prevCam = camera.position.clone(), prevTarget = controls.target.clone();
    const prevRatio = renderer.getPixelRatio();
    const add = (t, o) => ({t, p: [t[0] + o[0], t[1] + o[1], t[2] + o[2]]});
    const views = [
      ['Album dentro, vista frontale', 'closed', add([0, cy, 0], [0, .02 * s, 1.05 * s])],
      ['Album dentro, tre quarti', 'closed', poses().closed.cam],
      ['Album fuori, foto sul fondo', 'open', poses().open.cam],
      ['Copertina dell’album', 'open', add([out[0], out[1], out[2]], [.04 * s, .05 * s, .7 * s])],
      ['Incisione sul plexiglass', 'closed', add([0, FT + BH * .3, BD / 2], [.05 * s, .04 * s, .5 * s])],
      ['Lato destro: l’apertura', 'closed', add([BW / 2, cy, 0], [.62 * s, .1 * s, .32 * s])],
      ['Lato sinistro chiuso in plexiglass', 'closed', add([-BW / 2, cy, 0], [-.62 * s, .1 * s, .32 * s])],
      ['Retro in tessuto', 'back', poses().back.cam],
    ];
    renderer.setPixelRatio(1); renderer.setSize(...EXPORT_SIZE, false);
    camera.aspect = EXPORT_SIZE[0] / EXPORT_SIZE[1]; camera.updateProjectionMatrix();
    const previews = [];
    try {
      for (const [label, viewMode, cam] of views) {
        setMode(viewMode, true);
        camera.position.set(...cam.p); controls.target.set(...cam.t); controls.update();
        renderer.render(scene, camera);
        previews.push({label, image: canvas.toDataURL('image/jpeg', .85)});
      }
    } finally {
      renderer.setPixelRatio(prevRatio); resize();
      setMode(prevMode, true);
      camera.position.copy(prevCam); controls.target.copy(prevTarget); controls.update();
    }
    return previews;
  }

  // ---- Telefono: galleria nello slide, 3D in miniatura, azioni finali ----
  const picked = {base: null, album: null};
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
  for (const b of document.querySelectorAll('[data-pick-graphic]')) b.onclick = () => notify('pick-graphic', {slot: b.dataset.pickGraphic});
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
      else if (data.type === 'gallery') { galleryData = {photos: data.photos || [], chapters: data.chapters || []}; for (const slot of ['base', 'album']) renderGallery(slot); }
      else if (data.type === 'status') { $('hostStatus').textContent = data.text || ''; $('submitHost').disabled = !data.canSubmit; $('submitHost').textContent = data.submitLabel || 'Invia allo studio'; }
      else if (data.type === 'export') {
        try { notify('exported', {requestId: data.requestId, previews: exportViews(), configuration: currentConfiguration()}); }
        catch (error) { console.error(error); notify('export-error', {requestId: data.requestId}); }
      }
    } catch (error) { console.error(error); notify('busy', {busy: false}); notify('fatal-error', {message: 'Impossibile applicare le scelte'}); }
  });
}
notify('ready');
