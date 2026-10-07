import * as THREE from "three";

export const phoneView =
  matchMedia("(pointer: coarse)").matches &&
  Math.min(screen.width, screen.height) <= 700;

/** Adatta il prodotto alla finestra effettiva, non a una sfera con molto margine vuoto. */
export function fitPhoneProduct(product, camera, controls) {
  if (!phoneView || !product || !(camera.aspect > 0)) return false;

  // Assicura che le trasformazioni del prodotto siano aggiornate
  product.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(product);
  if (bounds.isEmpty()) return false;

  const center = bounds.getCenter(new THREE.Vector3());

  // Calcola la direzione evitando casi degeneri
  let direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.0001) {
    direction.set(0, 0.2, 1);
  }
  direction.normalize();

  const right = new THREE.Vector3()
    .crossVectors(camera.up, direction)
    .normalize();
  if (right.lengthSq() < 0.0001) {
    // Gestione del caso in cui camera.up sia parallelo alla direzione
    right.set(1, 0, 0);
  }
  const up = new THREE.Vector3().crossVectors(direction, right).normalize();

  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / camera.zoom;
  const tanH = tanV * camera.aspect;
  let distance = 0;

  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center);
        const depth = corner.dot(direction);
        distance = Math.max(
          distance,
          depth + Math.abs(corner.dot(right)) / tanH,
          depth + Math.abs(corner.dot(up)) / tanV,
        );
      }
    }
  }

  // Aggiorna target e posizione prima di aggiornare i controlli
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, distance * 1.06);

  // Forza l'aggiornamento dello stato interno di OrbitControls
  camera.updateProjectionMatrix();
  controls.update();
  return true;
}

/** Limite vicino alla superficie: dettaglio del tessuto senza entrare dentro il box. */
export function phoneDetailDistance(product, camera, controls) {
  if (!phoneView || !product) return controls.minDistance;

  product.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(product);
  if (bounds.isEmpty()) return controls.minDistance;

  const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const center = bounds.getCenter(new THREE.Vector3());

  let direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.0001) {
    direction.set(0, 0, 1);
  } else {
    direction.normalize();
  }

  // Correzione vector offset: offset dal centro al target (controls.target - center)
  const targetOffset = controls.target.clone().sub(center);

  // Intersezione del raggio della camera con le facce dell'AABB
  const limits = ["x", "y", "z"]
    .filter((axis) => Math.abs(direction[axis]) > 0.001)
    .map(
      (axis) =>
        (half[axis] - Math.sign(direction[axis]) * targetOffset[axis]) /
        Math.abs(direction[axis]),
    )
    .filter((value) => value > 0);

  return Math.max(0.075, (limits.length ? Math.min(...limits) : 0.05) + 0.04);
}
