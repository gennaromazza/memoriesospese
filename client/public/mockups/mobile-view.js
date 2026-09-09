import * as THREE from 'three';

// Stesso criterio del contenitore React: lo schermo fisico non cambia con la tastiera.
export const phoneView = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) <= 700;

/** Adatta il prodotto alla finestra effettiva, non a una sfera con molto margine vuoto. */
export function fitPhoneProduct(product, camera, controls) {
  if (!phoneView || !product || !(camera.aspect > 0)) return false;
  const bounds = new THREE.Box3().setFromObject(product);
  if (bounds.isEmpty()) return false;
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (direction.lengthSq() === 0) direction.set(0, .2, 1).normalize();
  const right = new THREE.Vector3().crossVectors(camera.up, direction).normalize();
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();
  const center = bounds.getCenter(new THREE.Vector3());
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
  const tanH = tanV * camera.aspect;
  let distance = 0;
  for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
    const corner = new THREE.Vector3(x, y, z).sub(center), depth = corner.dot(direction);
    distance = Math.max(distance, depth + Math.abs(corner.dot(right)) / tanH, depth + Math.abs(corner.dot(up)) / tanV);
  }
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance * 1.06);
  controls.update();
  return true;
}

/** Limite vicino alla superficie: dettaglio del tessuto senza entrare dentro il box. */
export function phoneDetailDistance(product, camera, controls) {
  if (!phoneView || !product) return controls.minDistance;
  const bounds = new THREE.Box3().setFromObject(product);
  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
  const center = bounds.getCenter(new THREE.Vector3());
  const direction = camera.position.clone().sub(controls.target).normalize();
  const toCenter = center.sub(controls.target);
  // Intersezione del raggio della camera con la faccia più vicina del volume.
  const limits = ['x', 'y', 'z'].filter(axis => Math.abs(direction[axis]) > .001)
    .map(axis => (half[axis] + Math.sign(direction[axis]) * toCenter[axis]) / Math.abs(direction[axis]))
    .filter(value => value > 0);
  return Math.max(.075, (limits.length ? Math.min(...limits) : .05) + .04);
}
