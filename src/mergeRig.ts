import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Merges the plain colored boxes hanging from each joint of a model into
 * one mesh per joint, colored per vertex. Limbs still move (the joints are
 * untouched), but a character takes a third of the draw calls, which keeps
 * big battles smooth on slower machines like an Xbox.
 *
 * Glowing, see-through and textured parts are left alone. Returns the
 * materials that should flash when the model is hit.
 */
export function mergeRig(root: THREE.Object3D): THREE.MeshLambertMaterial[] {
  const shared = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const nodes: THREE.Object3D[] = [];
  root.traverse((o) => nodes.push(o));
  let used = false;
  for (const node of nodes) {
    const parts = node.children.filter((c): c is THREE.Mesh => c instanceof THREE.Mesh && c.children.length === 0 && mergeable(c));
    if (parts.length < 2) continue;
    const geos = parts.map((m) => {
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.clearGroups();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      g.applyMatrix4(m.matrix);
      const c = (m.material as THREE.MeshLambertMaterial).color;
      const n = g.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return g;
    });
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, shared);
    mesh.userData.merged = true;
    mesh.castShadow = parts.some((p) => p.castShadow);
    mesh.receiveShadow = parts.some((p) => p.receiveShadow);
    mesh.layers.mask = parts[0].layers.mask;
    for (const p of parts) node.remove(p);
    node.add(mesh);
    used = true;
  }
  // Everything plain that's left (merged or not) flashes when hit.
  const flash = new Set<THREE.MeshLambertMaterial>();
  if (used) flash.add(shared);
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && mergeable(o)) flash.add(o.material as THREE.MeshLambertMaterial);
  });
  return [...flash];
}

/** Frees the geometry that mergeRig made (the original boxes are shared and stay). */
export function disposeMerged(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.merged) o.geometry.dispose();
  });
}

function mergeable(m: THREE.Mesh) {
  const mat = m.material;
  return (
    !Array.isArray(mat) &&
    mat instanceof THREE.MeshLambertMaterial &&
    !mat.transparent &&
    !mat.map &&
    mat.emissive.getHex() === 0 &&
    m.visible
  );
}
