import * as THREE from 'three';
import { addCollider, groundAt } from './world';
import { createHumanoid } from './character';
import { mergeRig } from './mergeRig';
import type { ArmoryTab } from './armory';

/**
 * The trading stands in every ruler's lair: little stalls with a counter,
 * a colored canopy and a demon shopkeeper, along the west side of the
 * courtyard. Walking up to a counter and pressing E (X on a controller)
 * opens that stand's goods.
 */

export type StandId = 'brewer' | 'weaponsmith' | 'armorer' | 'pens';

export interface StandDef {
  id: StandId;
  name: string;
  /** Under the name, in the shop window. */
  pitch: string;
  /** Which tabs of the armory window this stand sells from. */
  tabs: ArmoryTab[];
  canopy: number;
  keeper: number;
}

export const STANDS: StandDef[] = [
  { id: 'brewer', name: 'The Brimstone Brewer', pitch: 'Hellfire draughts, brewed fresh in the pits', tabs: ['potions'], canopy: 0x2f8a3a, keeper: 0x6a2a8a },
  { id: 'weaponsmith', name: 'The Weaponsmith', pitch: 'Blades, hammers and bows; your old gear bought back', tabs: ['weapons', 'gear'], canopy: 0xb0201c, keeper: 0x8a2a18 },
  { id: 'armorer', name: 'The Armorer', pitch: 'Leather, bone and obsidian to keep heaven off you', tabs: ['armor', 'gear'], canopy: 0x6a6e78, keeper: 0x5a3a2a },
  { id: 'pens', name: 'The Imp Pens', pitch: 'Imps for hire: they follow you and fight', tabs: ['imps'], canopy: 0xd07a18, keeper: 0xa8281c },
];

/** The stalls stand in a row at this x, facing east into the courtyard. */
const ROW_X = -11.5;
const ROW_Z = [-25, -20, -15, -10];

const box = new THREE.BoxGeometry(1, 1, 1);
const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

export interface StandSpot {
  def: StandDef;
  /** In front of the counter, where you stand to shop. */
  pos: THREE.Vector3;
}

/** Builds the stalls into `root` (the plane being built) and returns where each one's counter is. */
export function buildStands(root: THREE.Object3D): StandSpot[] {
  const wood = lambert(0x3a2418);
  const dark = lambert(0x24160e);
  const spots: StandSpot[] = [];
  STANDS.forEach((def, i) => {
    const z = ROW_Z[i];
    const y = groundAt(ROW_X, z, 1.6);
    const g = new THREE.Group();
    g.position.set(ROW_X, y, z);
    root.add(g);
    const part = (m: THREE.Material, w: number, h: number, d: number, x: number, py: number, pz: number, rotZ = 0) => {
      const mesh = new THREE.Mesh(box, m);
      mesh.scale.set(w, h, d);
      mesh.position.set(x, py, pz);
      mesh.rotation.z = rotZ;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    // The counter, with a darker top.
    part(wood, 0.8, 1.0, 2.8, 1.0, 0.5, 0);
    part(dark, 1.0, 0.1, 3.0, 1.0, 1.05, 0);
    // Corner posts and a sloping canopy in the stand's color, with a striped edge.
    for (const [px, pz] of [
      [1.4, 1.5],
      [1.4, -1.5],
      [-1.1, 1.5],
      [-1.1, -1.5],
    ]) {
      part(wood, 0.16, px > 0 ? 2.5 : 2.9, 0.16, px, px > 0 ? 1.25 : 1.45, pz);
    }
    part(lambert(def.canopy), 3.0, 0.12, 3.4, 0.15, 2.75, 0, -0.14);
    part(lambert(0xe8d8b0), 0.12, 0.3, 3.4, 1.62, 2.4, 0);
    // A few goods on the counter, in the stand's colors.
    const goods = lambert(def.id === 'brewer' ? 0x40ff70 : def.id === 'pens' ? 0xff9a30 : 0xc8ccd8);
    for (const gz of [-0.9, -0.2, 0.6]) part(goods, 0.2, 0.3, 0.2, 1.0, 1.25, gz);

    // The shopkeeper: a demon behind the counter, horns and all.
    const keeper = createHumanoid({ skin: def.keeper, shirt: 0x2a1a14, pants: 0x1a1210, boots: 0x101010, eyes: 0xffd040, glowingEyes: true, belt: 0x1a0c0a });
    keeper.root.position.set(0, 0, 0);
    keeper.root.rotation.y = Math.PI / 2;
    for (const side of [1, -1]) {
      const horn = new THREE.Mesh(box, dark);
      horn.scale.set(0.08, 0.24, 0.08);
      horn.position.set(0.15 * side, 0.42, 0);
      horn.rotation.z = -0.5 * side;
      keeper.head.add(horn);
    }
    // Hands resting on the counter.
    keeper.armL.rotation.set(-0.9, 0, 0.1);
    keeper.armR.rotation.set(-0.9, 0, -0.1);
    g.add(keeper.root);
    mergeRig(g);

    addCollider({ x: ROW_X + 0.5, z, r: 1.7 });
    spots.push({ def, pos: new THREE.Vector3(ROW_X + 2.4, y + 1, z) });
  });
  return spots;
}
