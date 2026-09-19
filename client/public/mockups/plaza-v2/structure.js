import * as THREE from 'three';

// Metres, inferred from the reference photographs; not manufacturing dimensions.
// The swept diagonal of the inner case fits inside the stationary LED frame.
export const dimensions = Object.freeze({ width: .54, height: .43, opening: .488, caseWidth: .468, caseHeight: .368, caseDepth: .09, bookWidth: .432 * .94, bookHeight: .334 * .92, extraction: .46 });

export function buildStructure({ product, fixedFrame, mobilePivot, mobileFrame, album, fabric, frameMaterial, innerMaterial = frameMaterial, plex, metal, ledMaterial, box }) {
  mobilePivot.position.set(0, .215, 0);
  fixedFrame.position.set(0, .215, 0);
  album.position.set(0, 0, 0);
  // The book sits inside a substantial C-shaped cradle, below its raised edges.
  album.scale.set(.94, .92, 1);
  for (const [name, size, position] of [
    ['Montante esterno sinistro', [.026, .378, .10], [-.257, 0, 0]],
    ['Traversa esterna superiore', [.54, .026, .10], [0, .202, 0]],
    ['Base esterna', [.54, .026, .10], [0, -.202, 0]],
  ]) box(fixedFrame, name, size, position, frameMaterial);

  // Aluminium channel and opal diffuser lie on the inner faces, facing the case.
  const channel = new THREE.MeshStandardMaterial({ color: '#c9c9c2', metalness: .65, roughness: .36 });
  const ledBars = [];
  for (const [name, size, position] of [
    ['superiore', [.484, .003, .015], [0, .1875, 0]],
    ['sinistro', [.003, .372, .015], [-.2425, 0, 0]],
    ['inferiore', [.484, .003, .015], [0, -.1875, 0]],
  ]) {
    box(fixedFrame, `Profilo LED ${name}`, size, position, channel);
    const vertical = name === 'sinistro';
    const diffuserPosition = [...position];
    diffuserPosition[vertical ? 0 : 1] += vertical ? .0017 : name === 'superiore' ? -.0017 : .0017;
    ledBars.push(box(fixedFrame, `Diffusore LED ${name}`, vertical ? [.0008, .372, .011] : [.484, .0008, .011], diffuserPosition, ledMaterial));
  }
  const ledLights = [[-.16, .185, .052], [.15, .185, .052], [-.239, 0, .052], [-.16, -.185, .052], [.15, -.185, .052], [0, .185, -.052], [-.239, 0, -.052], [0, -.185, -.052]].map(position => {
    const light = new THREE.PointLight('#ffe4b9', 0, 1.4, 2);
    light.castShadow = true; light.shadow.mapSize.set(256, 256); light.shadow.camera.near = .003; light.shadow.bias = -.0001; light.shadow.normalBias = .001; light.position.set(...position); fixedFrame.add(light); return light;
  });
  for (const [name, size, position] of [
    // The upper fabric rail ends at the central axis; acrylic continues to the right.
    ['Traversa mobile superiore', [.234, .026, .09], [-.117, .171, 0]],
    ['Traversa mobile inferiore', [.468, .026, .09], [0, -.171, 0]],
    ['Dorso cofanetto mobile', [.028, .316, .09], [-.220, 0, 0]],
  ]) box(mobileFrame, name, size, position, innerMaterial);
  // Two small acrylic name plates cap the right-hand ends of the cradle rails.
  // Their writing faces the open page edge (visible when the case turns -90°).
  const namePlates = [ .171, -.171 ].map((y, index) => {
    const group = new THREE.Group(); group.name = index === 0 ? 'Placchetta laterale superiore' : 'Placchetta laterale inferiore';
    group.position.set(index === 0 ? .0006 : .2346, y, 0); group.rotation.y = Math.PI / 2; mobileFrame.add(group);
    const glass = box(group, 'Plexiglass placchetta', [.086, .024, .002], [0, 0, 0], plex);
    glass.castShadow = false;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(glass.geometry), new THREE.LineBasicMaterial({ color: '#d6e4e8', transparent: true, opacity: .8 })); group.add(edges);
    for (const x of [-.038, .038]) {
      const screw = new THREE.Mesh(new THREE.SphereGeometry(.0015, 12, 8), metal);
      screw.scale.z = .4; screw.position.set(x, 0, .0016); group.add(screw);
    }
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 256;
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const lettering = new THREE.Mesh(new THREE.PlaneGeometry(.070, .0175), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
    lettering.name = 'Nome inciso'; lettering.position.z = .0018; group.add(lettering);
    return { group, canvas, texture };
  });
  function updateSideNames(first, second) {
    [first, second].forEach((name, index) => {
      const { group, canvas, texture } = namePlates[index];
      const text = String(name || '').trim(); group.userData.nameText = text;
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = 'italic 150px "Segoe Script", Georgia, cursive';
      ctx.fillText(text, 512, 128, 970); texture.needsUpdate = true;
    });
  }
  // Right side stays open: the book slides between the two acrylic sheets.
  for (const y of [-.1865, .1865]) {
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(.003, .003, .011, 24), metal);
    pin.name = 'Perno centrale'; pin.position.y = y; mobilePivot.add(pin);
  }
  box(album, 'Pagine album', [.423, .324, .044], [.002, 0, 0], new THREE.MeshStandardMaterial({ color: '#f4f0e5', roughness: .94 }));
  box(album, 'Copertina tessuto album', [.432, .334, .004], [0, 0, .025], fabric);
  box(album, 'Retro tessuto album', [.432, .334, .004], [0, 0, -.025], fabric);
  box(album, 'Dorso album', [.009, .334, .054], [-.2115, 0, 0], fabric);
  const pageEdge = new THREE.MeshStandardMaterial({ color: '#dcd8ce', roughness: 1 });
  for (let i = 0; i < 30; i++) box(album, 'Taglio pagina', [.00015, .323, .00012], [.2136, 0, -.021 + i * .00145], pageEdge);

  // Rectangular finger recesses near the right corners match the photographed sheets.
  const shape = new THREE.Shape();
  shape.moveTo(-.234, -.176); shape.lineTo(.234, -.176);
  shape.lineTo(.234, -.153); shape.lineTo(.214, -.153); shape.lineTo(.214, -.122); shape.lineTo(.234, -.122);
  shape.lineTo(.234, .122); shape.lineTo(.214, .122); shape.lineTo(.214, .153); shape.lineTo(.234, .153);
  shape.lineTo(.234, .176); shape.lineTo(-.234, .176); shape.closePath();
  const sheetGeometry = new THREE.ExtrudeGeometry(shape, { depth: .002, bevelEnabled: false, curveSegments: 12 });
  for (const [name, z] of [['anteriore', .038], ['posteriore', -.040]]) {
    const sheet = new THREE.Mesh(sheetGeometry, plex); sheet.name = `Plexiglass ${name} scrigno`; sheet.position.z = z; mobileFrame.add(sheet);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(sheetGeometry), new THREE.LineBasicMaterial({ color: '#afc1c3', transparent: true, opacity: .5 }));
    edge.position.z = z; mobileFrame.add(edge);
    for (const y of [-.171, .171]) for (const x of [-.222, y > 0 ? -.006 : .222]) {
      const screw = new THREE.Mesh(new THREE.SphereGeometry(.0016, 12, 8), metal);
      screw.scale.z = .35; screw.position.set(x, y, z + (z > 0 ? .0024 : -.0004)); mobileFrame.add(screw);
    }
  }
  // Rear photo is bonded to the rotating sheet and never follows the extracted book.
  const rearGeometry = new THREE.ShapeGeometry(shape);
  const uv = rearGeometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (.234 - uv.getX(i)) / .468, (uv.getY(i) + .176) / .352);
  const rearCanvas = document.createElement('canvas'); rearCanvas.width = 1600; rearCanvas.height = 1200;
  const rearMap = new THREE.CanvasTexture(rearCanvas); rearMap.colorSpace = THREE.SRGBColorSpace;
  const rearPhoto = new THREE.Mesh(rearGeometry, new THREE.MeshPhysicalMaterial({ map: rearMap, roughness: .22, clearcoat: 1, side: THREE.BackSide }));
  rearPhoto.name = 'Foto plexiglass posteriore mobile'; rearPhoto.position.z = -.0378; mobileFrame.add(rearPhoto);
  const rearBacking = new THREE.Mesh(rearGeometry, new THREE.MeshStandardMaterial({ color: '#f3f1eb', roughness: .8, side: THREE.FrontSide }));
  rearBacking.position.z = -.0376; mobileFrame.add(rearBacking);
  return { ledBars, ledLights, rearCanvas, rearMap, rearPhoto, rearBacking, updateSideNames, namePlates };
}
