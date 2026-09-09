import * as THREE from 'three';

// Ambientazioni esplorative condivise. Le unità sono metri; nessun dato d'ordine.
export function installHomeScenes({ scene, camera, controls, ground, product, album, beforeEnter, afterLeave }) {
  const room = new THREE.Group(); room.visible = false; scene.add(room);
  const furniture = new THREE.MeshPhysicalMaterial({ color: '#c6bbaa', roughness: .72 });
  const fronts = furniture.clone();
  const baseLights = scene.children.filter(child => child.isLight);
  const wall = new THREE.MeshStandardMaterial({ color: '#eee9df', roughness: 1 });
  const stone = new THREE.MeshStandardMaterial({ color: '#d9d0bf', roughness: .9 });
  const dark = new THREE.MeshStandardMaterial({ color: '#353b39', roughness: .7 });
  const mirrorMaterial = new THREE.MeshStandardMaterial({ color: '#b1c5c5', metalness: .7, roughness: .25 });
  const woodCanvas = document.createElement('canvas'); woodCanvas.width = 128; woodCanvas.height = 512;
  const ctx = woodCanvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 100; i++) { ctx.strokeStyle = `rgba(80,48,20,${.03 + i % 5 * .012})`; ctx.beginPath(); const x = i * 37 % 128; ctx.moveTo(x, 0); ctx.bezierCurveTo(x + 4, 150, x - 5, 340, x, 512); ctx.stroke(); }
  const grain = new THREE.CanvasTexture(woodCanvas); grain.colorSpace = THREE.SRGBColorSpace;
  const cementCanvas = document.createElement('canvas'); cementCanvas.width = cementCanvas.height = 256;
  const cc = cementCanvas.getContext('2d'), pixels = cc.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const value = 225 + 9 * Math.sin(x * .08 + Math.sin(y * .06)) + 7 * Math.sin(y * .12 + x * .035) + 4 * Math.sin(x * 13 + y * 37);
    const offset = (y * 256 + x) * 4; pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = value; pixels.data[offset + 3] = 255;
  }
  cc.putImageData(pixels, 0, 0); const cement = new THREE.CanvasTexture(cementCanvas); cement.colorSpace = THREE.SRGBColorSpace;
  // Campioni procedurali ispirati a famiglie di finiture, non scansioni del produttore.
  const finishes = {
    white: ['Bianco opaco', '#f2efe7'], gloss: ['Bianco lucido', '#faf8f2', null, .16],
    taupe: ['Tortora opaco', '#b6a899'], cashmere: ['Cashmere', '#c8bdac'], charcoal: ['Antracite', '#414745'],
    oak: ['Rovere chiaro', '#c7a674', grain], cadiz: ['Rovere miele · stile Cadiz', '#b99768', grain],
    walnut: ['Noce caldo', '#76513a', grain], mercure: ['Noce grigio · stile Mercure', '#8c7a65', grain],
    cement: ['Effetto cemento', '#aaa9a4', cement], oxide: ['Effetto ossido', '#78665a', cement],
    nordic: ['Bianco lucido + rovere', '#c7a674', grain, .72, '#f5f3ec'],
    modern: ['Cashmere + noce', '#8c7a65', grain, .72, '#c8bdac'],
  };
  const ledMaterial = new THREE.MeshStandardMaterial({ color: '#fff0d5', emissive: '#ffbd72', emissiveIntensity: 0 });
  let ledLights = [];
  const dimensions = { width: 190, height: 82, depth: 46 };
  const panel = document.createElement('section'); panel.className = 'home-panel'; panel.id = 'homePanel'; panel.hidden = true;
  panel.innerHTML = `<h2>Visualizza in casa</h2><label for="homeScene">Ambientazione</label><select id="homeScene"><option value="none">Solo album</option><option value="living">Parete attrezzata</option><option value="sideboard">Madia scandinava</option><option value="warm">Living con doghe</option><option value="console">Consolle ingresso</option></select><div id="homeFinishRow" hidden><label for="homeFinish">Finitura del mobile</label><select id="homeFinish">${Object.entries(finishes).map(([id, [name]]) => `<option value="${id}">${name}</option>`).join('')}</select><label for="homeLighting">Illuminazione</label><select id="homeLighting"><option value="day">Luce naturale</option><option value="evening">Sera · LED caldi</option></select><details class="home-measures"><summary>Misure del tuo mobile</summary><p>Solo il mobile d’appoggio, non tutta la parete. Misure in cm.</p>${[['width','Larghezza',80,300],['height','Altezza',50,110],['depth','Profondità',30,65]].map(([key,label,min,max]) => `<label for="home-${key}">${label} (${min}–${max} cm)</label><input id="home-${key}" type="number" min="${min}" max="${max}" step="1" value="${dimensions[key]}" inputmode="numeric">`).join('')}<p id="homeDimensionStatus" role="status"></p></details><p>Riferimento visivo · album 30 × 40 cm.<br>Box e finiture indicativi, non campioni certificati.</p></div>`;
  const aside = document.querySelector('aside');
  let content = aside.querySelector('.panel-content');
  if (!content) {
    content = document.createElement('div'); content.className = 'panel-content';
    aside.insertBefore(content, aside.querySelector('#fabricPanel'));
    for (const id of ['fabricPanel','detailPanel','summaryPanel']) content.append(document.getElementById(id));
    const footer = document.createElement('div'); footer.className = 'download-bar';
    aside.append(footer); footer.append(document.getElementById('downloadClient'), document.getElementById('downloadStatus'));
  }
  content.append(panel);
  const nav = aside.querySelector('nav');
  const homeTab = document.createElement('button'); homeTab.type = 'button'; homeTab.dataset.panel = panel.id; homeTab.textContent = 'In casa'; homeTab.setAttribute('aria-pressed', 'false'); nav.append(homeTab);
  homeTab.onclick = () => {
    for (const tab of nav.querySelectorAll('[data-panel]')) { tab.setAttribute('aria-pressed', String(tab === homeTab)); document.getElementById(tab.dataset.panel).hidden = tab !== homeTab; }
  };
  const style = document.createElement('style'); style.textContent = `.home-panel{padding:16px 0;border-top:1px solid #d8ded7;margin-top:16px}.home-panel h2{font-size:13px}.home-panel label{display:block;margin:10px 0 6px}.home-panel select{width:100%;padding:10px;border:1px solid #becbc1;border-radius:7px;background:#fff;color:#29413f;font:inherit}.home-panel p{font-size:12px;line-height:1.5}body[data-home-scene]:not([data-home-scene="none"]) :is(.tools,.view-tools,.hint,.zoom){display:none!important}body[data-home-scene]:not([data-home-scene="none"]) #viewport{cursor:default}`;
  document.head.append(style);
  style.textContent += `
    header{height:56px;padding:16px 22px;align-items:center}
    main{height:calc(100dvh - 56px);grid-template-columns:320px minmax(0,1fr);min-height:0}
    aside{display:flex;flex-direction:column;min-height:0;overflow:hidden;padding:18px}
    aside>h1{font:24px Georgia,serif;margin:0 0 8px}aside>p{font-size:12px;margin:0 0 10px}
    aside nav{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;flex-shrink:0;margin:12px 0}
    aside nav button{font-size:12px!important;padding:9px 3px!important;min-width:0}
    .panel-content{flex:1;min-height:0;overflow:auto;padding:2px 8px 12px 2px;scrollbar-gutter:stable}
    .home-panel{margin:0;padding:0;border:0}.home-panel h2{margin:6px 0 12px}
    .download-bar{flex-shrink:0;background:#faf8f3;padding-top:12px;margin-top:8px;border-top:1px solid #d8ded7}
    .download-bar #downloadClient{margin:0;width:100%;font-size:13px;background:#315f58;color:white}
    .download-bar p{margin:4px 0 0;font-size:12px}.workspace{min-height:0}
    @media(max-width:760px){main{height:auto}aside{overflow:visible}.panel-content{max-height:52dvh;min-height:150px}.stage{height:360px}header{height:56px}}
  `;
  style.textContent += '.home-measures{margin-top:14px}.home-measures summary{cursor:pointer}.home-measures input{width:100%;padding:9px;border:1px solid #becbc1;border-radius:7px;font:inherit}.home-measures input:invalid{border-color:#ad4635}';
  const select = panel.querySelector('#homeScene'), finish = panel.querySelector('#homeFinish');
  const lighting = panel.querySelector('#homeLighting');
  let saved, active = false;
  function box(size, position, material = furniture) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...position); mesh.castShadow = mesh.receiveShadow = true; room.add(mesh); return mesh;
  }
  function vase(x, y, z) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.035, .065, .19, 24), stone); mesh.position.set(x, y + .095, z); mesh.castShadow = true; room.add(mesh);
    for (let i = 0; i < 5; i++) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(.0015, .0015, .28, 5), dark); stem.position.set(x + (i - 2) * .014, y + .28, z); stem.rotation.z = (i - 2) * .16; room.add(stem);
      for (let j = 0; j < 3; j++) {
        const leaf = new THREE.Mesh(new THREE.SphereGeometry(.025, 10, 8), dark); leaf.scale.set(.5, 1.4, .15);
        leaf.position.set(x + (i - 2) * (.014 + j * .012), y + .24 + j * .055, z); leaf.rotation.z = (j % 2 ? 1 : -1) * .7; room.add(leaf);
      }
    }
  }
  function build(kind) {
    for (const child of [...room.children]) { child.geometry?.dispose(); room.remove(child); }
    ledLights = [];
    const width = dimensions.width / 100, totalHeight = dimensions.height / 100, depth = dimensions.depth / 100;
    const back = -depth / 2 - .16, front = depth / 2;
    // Il piano superiore del mobile è y=0, come la base dei modelli esistenti.
    box([6, 3.5, .05], [0, .3, back - .035], wall);
    box([6, .03, 5], [0, -totalHeight - .015, .4], stone);
    // Fughe del pavimento: geometria semplice, senza texture remote.
    for (let i = -12; i <= 12; i++) box([.002, .001, 4], [i * .24, -totalHeight + .001, 1.6], wall);
    box([6, .055, .016], [0, -totalHeight + .0275, back], fronts);
    const height = kind === 'console' ? .12 : totalHeight - .2;
    box([width, .035, depth], [0, -.0175, 0]);
    box([width - .025, height, depth - .03], [0, -.035 - height / 2, 0]);
    const legs = totalHeight - .035 - height;
    for (const x of [-width / 2 + .09, width / 2 - .09]) for (const z of [-depth / 2 + .06, front - .06]) box([.026, legs, .026], [x, -.035 - height - legs / 2, z], dark);
    const doors = width < 1.3 ? 2 : 3;
    for (let i = 0; i < doors; i++) box([width / doors - .008, height - .009, .012], [-width / 2 + (i + .5) * width / doors, -.035 - height / 2, front - .009], fronts);
    if (width >= 1.2) {
      vase(width / 2 - .15, 0, -.04);
      for (let i = 0; i < 3; i++) box([.21 - i * .02, .018, .15], [-width / 2 + .16, .009 + i * .018, .02], i === 1 ? dark : stone);
    }
    const stretch = width / 1.9;
    if (kind === 'living') {
      box([width * .55, .035, .18], [-.15 * stretch, .84, back + .10]);
      box([width * .19, .44, .19], [-.72 * stretch, .64, back + .105]);
      box([width * .22, .35, .19], [.6 * stretch, .72, back + .105], fronts);
      ledStrip(width * .54, [-.15 * stretch, .818, back + .06]);
    } else if (kind === 'warm') {
      for (let i = 0; i < 20; i++) box([width * .013, totalHeight + 1, .028], [(-.49 + i * .026) * width, (1 - totalHeight) / 2, back + .01]);
      box([.38 * stretch, .48, .028], [.31 * width, .58, back + .015], stone);
      box([.28 * stretch, .035, .031], [.31 * width, .56, back + .034], dark);
      ledStrip(width * .5, [-width * .24, 1.02, back + .05]);
    } else if (kind === 'console') {
      const mirror = new THREE.Mesh(new THREE.CircleGeometry(.32, 48), mirrorMaterial);
      mirror.position.set(0, .73, back + .01); room.add(mirror);
    } else {
      box([.5 * stretch, .48, .025], [-.2 * width, .68, back + .015], stone);
      box([.22 * stretch, .3, .029], [-.23 * width, .7, back + .031], dark);
    }
    ledStrip(width - .08, [0, -.045 - height, -depth / 2 + .035]);
    applyLighting(); update();
  }
  function ledStrip(width, position) {
    box([width, .008, .012], position, ledMaterial).castShadow = false;
    for (const x of [-width * .3, width * .3]) { const light = new THREE.PointLight('#ffc384', .2, 1.2, 2); light.position.set(position[0] + x, position[1] - .025, position[2] + .045); room.add(light); ledLights.push(light); }
  }
  function restoreLighting() { if (saved) { baseLights.forEach((light, i) => light.intensity = saved.lights[i]); scene.environmentIntensity = saved.environmentIntensity; } }
  function applyLighting() {
    if (!active) return;
    const evening = lighting.value === 'evening';
    baseLights.forEach((light, i) => light.intensity = saved.lights[i] * (evening ? .28 : .85));
    scene.environmentIntensity = saved.environmentIntensity * (evening ? .65 : 1);
    ledMaterial.emissiveIntensity = evening ? 3 : 0;
    ledLights.forEach(light => light.intensity = evening ? .22 : 0);
    document.body.dataset.homeLighting = lighting.value;
  }
  lighting.onchange = applyLighting;
  for (const key of ['width','height','depth']) {
    const input = panel.querySelector(`#home-${key}`);
    input.onchange = () => {
      if (!input.validity.valid || !input.value || !Number.isFinite(input.valueAsNumber)) {
        panel.querySelector('#homeDimensionStatus').textContent = `Inserisci una misura tra ${input.min} e ${input.max} cm. La scena mantiene l’ultima misura valida.`; return;
      }
      dimensions[key] = input.valueAsNumber; panel.querySelector('#homeDimensionStatus').textContent = '';
      if (active) build(select.value);
    };
  }
  function applyFinish() {
    const [, color, map, roughness = .72, contrast] = finishes[finish.value];
    furniture.color.set(color); furniture.map = map || null; furniture.roughness = roughness; furniture.clearcoat = roughness < .2 ? .8 : 0; furniture.needsUpdate = true;
    fronts.copy(furniture); if (contrast) { fronts.color.set(contrast); fronts.map = null; fronts.roughness = finish.value === 'nordic' ? .16 : .72; fronts.clearcoat = finish.value === 'nordic' ? .8 : 0; } fronts.needsUpdate = true;
    document.body.dataset.homeFinish = finish.value;
  }
  finish.value = 'oak'; finish.onchange = applyFinish; applyFinish();
  function update() {
    if (!active) return;
    // Inquadratura fissa, adattata anche agli schermi stretti, senza scalare l'album.
    controls.target.set(0, .12, 0);
    const halfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distance = Math.max(3.6, (dimensions.height / 100 + 1.45) / (2 * halfFov), (dimensions.width / 200 + .28) / (halfFov * camera.aspect));
    camera.position.set(distance * .12, .12 + distance * .19, distance); camera.lookAt(controls.target);
  }
  select.onchange = () => {
    if (select.value !== 'none' && !active) {
      saved = { position: camera.position.clone(), target: controls.target.clone(), scale: product.scale.clone(), ground: ground.visible, background: scene.background, enabled: controls.enabled, auto: controls.autoRotate, lights: baseLights.map(light => light.intensity), environmentIntensity: scene.environmentIntensity };
      beforeEnter(); controls.autoRotate = false; controls.enabled = false;
      product.updateMatrixWorld(true);
      // Il GLB storico ha misure indicative: normalizzazione uniforme SOLO nella vista casa.
      const size = new THREE.Box3().setFromObject(album).getSize(new THREE.Vector3());
      product.scale.multiplyScalar(.4 / size.x);
      active = true; ground.visible = false; room.visible = true;
    }
    if (select.value === 'none' && active) {
      active = false; room.visible = false; product.scale.copy(saved.scale); ground.visible = saved.ground; scene.background = saved.background;
      restoreLighting(); afterLeave(); camera.position.copy(saved.position); controls.target.copy(saved.target); controls.enabled = saved.enabled; controls.autoRotate = saved.auto; controls.update();
    } else if (active) { build(select.value); update(); }
    panel.querySelector('#homeFinishRow').hidden = !active;
    document.body.dataset.homeScene = select.value;
  };
  return { update, suspend() {
    if (!active) return () => {};
    const scale = product.scale.clone(); room.visible = false; product.scale.copy(saved.scale); restoreLighting();
    return () => { product.scale.copy(scale); room.visible = true; ground.visible = false; applyLighting(); update(); };
  } };
}
