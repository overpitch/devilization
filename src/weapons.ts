import * as THREE from 'three';

/**
 * Weapons you can carry. Each has a combo of swings; clicking during a
 * swing chains into the next one. Weapons taken from the dead come in three
 * qualities. (Enchanted weapons and the weaponsmith arrive in milestone 4.)
 */

export type WeaponId = 'flail' | 'sword' | 'spear' | 'axe';
export type WeaponModel = WeaponId | 'bow' | 'staff';

export interface SwingDef {
  /** Which first-person animation plays. */
  anim: string;
  /** Seconds the whole swing takes. */
  dur: number;
  /** Fraction of the swing when the blow lands. */
  strike: number;
  damage: number;
  reach: number;
  /** Half-angle (radians) of the arc in front of you that the swing covers. */
  arc: number;
  knockback: number;
  /** Heavy blows shake the screen more and thud into the ground on a miss. */
  heavy: boolean;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  swings: SwingDef[];
  /** One line for the pick-up prompt and the weapon list. */
  blurb: string;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  flail: {
    id: 'flail',
    name: 'Spiked Flail',
    blurb: 'Wide sweeps and crushing overhead smashes',
    swings: [
      { anim: 'sweep', dur: 0.56, strike: 0.5, damage: 14, reach: 3.1, arc: 1.15, knockback: 6, heavy: false },
      { anim: 'smash', dur: 0.74, strike: 0.52, damage: 24, reach: 3.4, arc: 0.5, knockback: 4, heavy: true },
    ],
  },
  sword: {
    id: 'sword',
    name: 'Angel Sword',
    blurb: 'Quick slashes, then a heavy chop',
    swings: [
      { anim: 'slashR', dur: 0.42, strike: 0.5, damage: 13, reach: 2.7, arc: 1.0, knockback: 4, heavy: false },
      { anim: 'slashL', dur: 0.42, strike: 0.5, damage: 13, reach: 2.7, arc: 1.0, knockback: 4, heavy: false },
      { anim: 'chop', dur: 0.6, strike: 0.55, damage: 21, reach: 2.8, arc: 0.45, knockback: 5, heavy: true },
    ],
  },
  spear: {
    id: 'spear',
    name: 'Angel Spear',
    blurb: 'Long-reaching thrusts and a wide sweep',
    swings: [
      { anim: 'thrust', dur: 0.5, strike: 0.45, damage: 16, reach: 3.9, arc: 0.32, knockback: 5, heavy: false },
      { anim: 'thrust', dur: 0.5, strike: 0.45, damage: 16, reach: 3.9, arc: 0.32, knockback: 5, heavy: false },
      { anim: 'spin', dur: 0.66, strike: 0.5, damage: 12, reach: 3.5, arc: 1.25, knockback: 8, heavy: false },
    ],
  },
  axe: {
    id: 'axe',
    name: "Traitor's Axe",
    blurb: 'Slow, brutal chops',
    swings: [
      { anim: 'axeChop', dur: 0.78, strike: 0.55, damage: 31, reach: 2.9, arc: 0.6, knockback: 7, heavy: true },
      { anim: 'axeCleave', dur: 0.72, strike: 0.5, damage: 25, reach: 2.9, arc: 1.1, knockback: 8, heavy: true },
    ],
  },
};

/** 0 = Notched, 1 = plain, 2 = Fine. */
export type Quality = 0 | 1 | 2;
const QUALITY = [
  { prefix: 'Notched ', mult: 0.85 },
  { prefix: '', mult: 1 },
  { prefix: 'Fine ', mult: 1.2 },
];

/** One weapon you own (or that lies on the ground). */
export interface Weapon {
  id: WeaponId;
  quality: Quality;
}

export const STARTING_WEAPON: Weapon = { id: 'flail', quality: 1 };
/** How many weapons you can carry. */
export const MAX_WEAPONS = 4;

export function weaponName(w: Weapon) {
  return QUALITY[w.quality].prefix + WEAPONS[w.id].name;
}

export const qualityMult = (w: Weapon) => QUALITY[w.quality].mult;

/** Damage of the weapon's strongest swing, for comparing weapons. */
export function weaponPower(w: Weapon) {
  return Math.round(Math.max(...WEAPONS[w.id].swings.map((s) => s.damage)) * qualityMult(w));
}

/** Random quality for a dropped weapon: mostly plain, sometimes notched or fine. */
export function rollQuality(): Quality {
  const r = Math.random();
  return r < 0.3 ? 0 : r < 0.85 ? 1 : 2;
}

export function isWeapon(w: unknown): w is Weapon {
  const o = w as Weapon;
  return !!o && typeof o === 'object' && o.id in WEAPONS && (o.quality === 0 || o.quality === 1 || o.quality === 2);
}

// ---------- Models ----------

const box = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<number, THREE.MeshLambertMaterial>();
function mat(color: number, emissive = 0) {
  const key = color * 7 + emissive;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true })));
  return m;
}

function part(g: THREE.Group, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(box, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * A blocky model of a weapon, held at the origin with the business end
 * pointing along +Z (blade edges and axe heads face +Y).
 */
export function buildWeaponMesh(model: WeaponModel): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0xe4e6ee);
  const gold = mat(0xd9b24a);
  switch (model) {
    case 'sword':
      part(g, mat(0x6a4a2a), 0.045, 0.045, 0.22, 0, 0, -0.02);
      part(g, gold, 0.3, 0.05, 0.06, 0, 0, 0.11);
      part(g, steel, 0.075, 0.02, 0.85, 0, 0, 0.56);
      part(g, steel, 0.04, 0.02, 0.1, 0, 0, 1.02);
      part(g, gold, 0.07, 0.07, 0.06, 0, 0, -0.15);
      break;
    case 'spear':
      part(g, mat(0xd8c8a0), 0.05, 0.05, 2.1, 0, 0, 0.35);
      part(g, gold, 0.08, 0.08, 0.08, 0, 0, 1.4);
      part(g, steel, 0.12, 0.02, 0.26, 0, 0, 1.56);
      part(g, steel, 0.06, 0.02, 0.12, 0, 0, 1.74);
      break;
    case 'axe':
      part(g, mat(0x2a1a14), 0.055, 0.055, 1.0, 0, 0, 0.25);
      part(g, mat(0x2c2a30), 0.06, 0.34, 0.22, 0, 0.13, 0.66);
      // A glowing red edge on the blade.
      part(g, mat(0x8a1a0a, 0x6a1000), 0.065, 0.06, 0.24, 0, 0.32, 0.66);
      part(g, mat(0x2c2a30), 0.06, 0.12, 0.1, 0, -0.08, 0.66);
      break;
    case 'flail':
      part(g, mat(0x3a3a42), 0.05, 0.05, 0.3, 0, 0, 0.05);
      for (let i = 0; i < 4; i++) part(g, mat(0x3a3a42), 0.03, 0.03, 0.07, 0, 0, 0.24 + i * 0.07);
      part(g, mat(0x3a3a42), 0.22, 0.22, 0.22, 0, 0, 0.6).rotation.set(0.6, 0.6, 0);
      break;
    case 'bow': {
      // A bow held upright, string toward the archer.
      const wood = mat(0xf0e6c8);
      part(g, wood, 0.05, 0.5, 0.05, 0, 0.22, 0.1).rotation.x = -0.35;
      part(g, wood, 0.05, 0.5, 0.05, 0, -0.22, 0.1).rotation.x = 0.35;
      part(g, gold, 0.06, 0.1, 0.06, 0, 0, 0.18);
      part(g, mat(0xffffff, 0x666666), 0.01, 0.9, 0.01, 0, 0, 0.0);
      break;
    }
    case 'staff':
      part(g, mat(0xf0e6c8), 0.05, 0.05, 1.6, 0, 0, 0.3);
      part(g, gold, 0.14, 0.14, 0.14, 0, 0, 1.12);
      part(g, mat(0xfff4c0, 0xffd860), 0.09, 0.09, 0.09, 0, 0, 1.22);
      break;
  }
  return g;
}
