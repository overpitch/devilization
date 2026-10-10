import * as THREE from 'three';

/**
 * Weapons and armor. Each weapon has a combo of swings (clicking during a
 * swing chains into the next). Weapons come Notched, plain or Fine, and
 * may carry one enchantment. Armor takes a share off the damage you take.
 */

export type WeaponId = 'flail' | 'sword' | 'spear' | 'axe' | 'hammer' | 'scythe' | 'bow' | 'javelin';
export type WeaponModel = WeaponId | 'staff';

export interface SwingDef {
  /** Which first-person animation plays. */
  anim: string;
  /** Seconds the whole swing takes. */
  dur: number;
  /** Fraction of the swing when the blow lands (or the shot leaves). */
  strike: number;
  damage: number;
  reach: number;
  /** Half-angle (radians) of the arc in front of you that the swing covers. */
  arc: number;
  knockback: number;
  /** Heavy blows shake the screen more and thud into the ground on a miss. */
  heavy: boolean;
  /** Ranged weapons let fly a projectile instead of hitting in an arc. */
  shot?: 'arrow' | 'javelin';
  /** A shockwave on landing: everything within this radius of the impact is hit too. */
  quake?: number;
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  swings: SwingDef[];
  /** One line for the shop and the pick-up prompt. */
  blurb: string;
  /** Weaponsmith's price for a plain one. */
  price: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  flail: {
    id: 'flail',
    name: 'Spiked Flail',
    blurb: 'Wide sweeps and crushing overhead smashes',
    price: 50,
    swings: [
      { anim: 'sweep', dur: 0.56, strike: 0.5, damage: 14, reach: 3.1, arc: 1.15, knockback: 6, heavy: false },
      { anim: 'smash', dur: 0.74, strike: 0.52, damage: 24, reach: 3.4, arc: 0.5, knockback: 4, heavy: true },
    ],
  },
  sword: {
    id: 'sword',
    name: 'Angel Sword',
    blurb: 'Quick slashes, then a heavy chop',
    price: 60,
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
    price: 80,
    swings: [
      { anim: 'thrust', dur: 0.5, strike: 0.45, damage: 16, reach: 3.9, arc: 0.32, knockback: 5, heavy: false },
      { anim: 'thrust', dur: 0.5, strike: 0.45, damage: 16, reach: 3.9, arc: 0.32, knockback: 5, heavy: false },
      { anim: 'spin', dur: 0.66, strike: 0.5, damage: 12, reach: 3.5, arc: 1.25, knockback: 8, heavy: false },
    ],
  },
  axe: {
    id: 'axe',
    name: 'Hellforged Axe',
    blurb: 'Slow, brutal chops',
    price: 120,
    swings: [
      { anim: 'axeChop', dur: 0.78, strike: 0.55, damage: 31, reach: 2.9, arc: 0.6, knockback: 7, heavy: true },
      { anim: 'axeCleave', dur: 0.72, strike: 0.5, damage: 25, reach: 2.9, arc: 1.1, knockback: 8, heavy: true },
    ],
  },
  hammer: {
    id: 'hammer',
    name: 'Brimstone Hammer',
    blurb: 'Very slow, and every blow shakes the ground around it',
    price: 150,
    swings: [
      { anim: 'axeChop', dur: 0.95, strike: 0.58, damage: 36, reach: 2.8, arc: 0.6, knockback: 9, heavy: true, quake: 2.6 },
      { anim: 'axeCleave', dur: 0.85, strike: 0.52, damage: 28, reach: 2.8, arc: 1.0, knockback: 11, heavy: true },
    ],
  },
  scythe: {
    id: 'scythe',
    name: "Reaper's Scythe",
    blurb: 'Huge reaping sweeps that catch everything around you',
    price: 170,
    swings: [
      { anim: 'reapR', dur: 0.62, strike: 0.5, damage: 18, reach: 3.7, arc: 1.5, knockback: 6, heavy: false },
      { anim: 'reapL', dur: 0.62, strike: 0.5, damage: 18, reach: 3.7, arc: 1.5, knockback: 6, heavy: false },
    ],
  },
  bow: {
    id: 'bow',
    name: 'Longbow',
    blurb: 'Shoots burning arrows a long way',
    price: 110,
    swings: [{ anim: 'draw', dur: 0.7, strike: 0.6, damage: 16, reach: 0, arc: 0, knockback: 3, heavy: false, shot: 'arrow' }],
  },
  javelin: {
    id: 'javelin',
    name: 'Hell Javelins',
    blurb: 'Heavy spears thrown in a long arc; another is always at hand',
    price: 140,
    swings: [{ anim: 'throw', dur: 0.85, strike: 0.5, damage: 30, reach: 0, arc: 0, knockback: 9, heavy: true, shot: 'javelin' }],
  },
};

/** What the weaponsmith stocks (the flail is your starting weapon). */
export const SHOP_WEAPONS: WeaponId[] = ['sword', 'spear', 'axe', 'hammer', 'scythe', 'bow', 'javelin'];

// ---------- Enchantments ----------

export type WeaponEnchant = 'flame' | 'thirst' | 'haste';
export type ArmorEnchant = 'ward' | 'thorns' | 'mending' | 'swift';

export const WEAPON_ENCHANTS: Record<WeaponEnchant, { name: string; effect: string; color: number }> = {
  flame: { name: 'Flame', effect: 'Sets angels burning', color: 0xff5a10 },
  thirst: { name: 'Thirst', effect: 'Heals you by a sixth of the damage dealt', color: 0xd01030 },
  haste: { name: 'Haste', effect: 'Swings and shoots a third faster', color: 0x40d0ff },
};

export const ARMOR_ENCHANTS: Record<ArmorEnchant, { name: string; effect: string; color: number }> = {
  ward: { name: 'Holy Ward', effect: 'Holy arrows and bolts do 40% less', color: 0xfff0a0 },
  thorns: { name: 'Thorns', effect: 'Hurts angels that strike you up close', color: 0x60c040 },
  mending: { name: 'Mending', effect: 'You heal sooner and twice as fast', color: 0xff4080 },
  swift: { name: 'Swiftness', effect: 'You move 15% faster', color: 0x40d0ff },
};

// ---------- Weapons you own ----------

/** 0 = Notched, 1 = plain, 2 = Fine. */
export type Quality = 0 | 1 | 2;
const QUALITY = [
  { prefix: 'Notched ', mult: 0.85, price: 0.5 },
  { prefix: '', mult: 1, price: 1 },
  { prefix: 'Fine ', mult: 1.2, price: 1.8 },
];
/** Enchanted gear costs this many times as much. */
const ENCHANT_PRICE = 2.5;
/** The armory pays this share of the price when you sell. */
export const SELL_SHARE = 0.35;

/** One weapon you own (or that lies on the ground, or sits in the shop). */
export interface Weapon {
  id: WeaponId;
  quality: Quality;
  enchant?: WeaponEnchant;
}

export const STARTING_WEAPON: Weapon = { id: 'flail', quality: 1 };
/** How many weapons you can carry. */
export const MAX_WEAPONS = 4;

export function weaponName(w: Weapon) {
  return QUALITY[w.quality].prefix + WEAPONS[w.id].name + (w.enchant ? ` of ${WEAPON_ENCHANTS[w.enchant].name}` : '');
}

export const qualityMult = (w: Weapon) => QUALITY[w.quality].mult;

/** Damage of the weapon's strongest swing, for comparing weapons. */
export function weaponPower(w: Weapon) {
  return Math.round(Math.max(...WEAPONS[w.id].swings.map((s) => s.damage)) * qualityMult(w));
}

export function weaponPrice(w: Weapon) {
  return Math.round(WEAPONS[w.id].price * QUALITY[w.quality].price * (w.enchant ? ENCHANT_PRICE : 1));
}

/** Random quality for a dropped weapon: mostly plain, sometimes notched or fine. */
export function rollQuality(): Quality {
  const r = Math.random();
  return r < 0.3 ? 0 : r < 0.85 ? 1 : 2;
}

export function randomWeaponEnchant(): WeaponEnchant {
  const all = Object.keys(WEAPON_ENCHANTS) as WeaponEnchant[];
  return all[Math.floor(Math.random() * all.length)];
}

export function isWeapon(w: unknown): w is Weapon {
  const o = w as Weapon;
  return (
    !!o &&
    typeof o === 'object' &&
    o.id in WEAPONS &&
    (o.quality === 0 || o.quality === 1 || o.quality === 2) &&
    (o.enchant === undefined || o.enchant in WEAPON_ENCHANTS)
  );
}

// ---------- Armor ----------

export type ArmorId = 'leather' | 'bone' | 'obsidian';

export const ARMORS: Record<ArmorId, { name: string; reduction: number; price: number; color: number; blurb: string }> = {
  leather: { name: 'Leather Harness', reduction: 0.12, price: 80, color: 0x6a4024, blurb: 'Light, cheap, better than bare hide' },
  bone: { name: 'Bone Mail', reduction: 0.2, price: 200, color: 0xd8cdb0, blurb: 'Plates of angel bone, laced with sinew' },
  obsidian: { name: 'Obsidian Plate', reduction: 0.3, price: 450, color: 0x2a1c3a, blurb: 'Heavy volcanic glass, forged in the pits' },
};

export interface Armor {
  id: ArmorId;
  enchant?: ArmorEnchant;
}

export function armorName(a: Armor) {
  return ARMORS[a.id].name + (a.enchant ? ` of ${ARMOR_ENCHANTS[a.enchant].name}` : '');
}

export function armorPrice(a: Armor) {
  return Math.round(ARMORS[a.id].price * (a.enchant ? 2.2 : 1));
}

export function isArmor(a: unknown): a is Armor {
  const o = a as Armor;
  return !!o && typeof o === 'object' && o.id in ARMORS && (o.enchant === undefined || o.enchant in ARMOR_ENCHANTS);
}

// ---------- Models ----------

const box = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<string, THREE.MeshLambertMaterial>();
function mat(color: number, emissive = 0) {
  const key = `${color}|${emissive}`;
  let m = mats.get(key);
  if (!m) mats.set(key, (m = new THREE.MeshLambertMaterial({ color, emissive, flatShading: true })));
  return m;
}

/**
 * A blocky model of a weapon, held at the origin with the business end
 * pointing along +Z (blade edges and axe heads face +Y). An enchantment
 * makes the business end glow in its color.
 */
export function buildWeaponMesh(model: WeaponModel, enchant?: WeaponEnchant): THREE.Group {
  const g = new THREE.Group();
  const glow = enchant ? WEAPON_ENCHANTS[enchant].color : 0;
  // The part that glows when enchanted.
  const edge = (color: number) => (enchant ? mat(color, new THREE.Color(glow).multiplyScalar(0.55).getHex()) : mat(color));
  const steel = edge(0xe4e6ee);
  const gold = mat(0xd9b24a);
  const part = (m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(box, m);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  switch (model) {
    case 'sword':
      part(mat(0x6a4a2a), 0.045, 0.045, 0.22, 0, 0, -0.02);
      part(gold, 0.3, 0.05, 0.06, 0, 0, 0.11);
      part(steel, 0.075, 0.02, 0.85, 0, 0, 0.56);
      part(steel, 0.04, 0.02, 0.1, 0, 0, 1.02);
      part(gold, 0.07, 0.07, 0.06, 0, 0, -0.15);
      break;
    case 'spear':
      part(mat(0xd8c8a0), 0.05, 0.05, 2.1, 0, 0, 0.35);
      part(gold, 0.08, 0.08, 0.08, 0, 0, 1.4);
      part(steel, 0.12, 0.02, 0.26, 0, 0, 1.56);
      part(steel, 0.06, 0.02, 0.12, 0, 0, 1.74);
      break;
    case 'javelin': {
      const tip = edge(0x8a1a0a);
      part(mat(0x3a1a12), 0.045, 0.045, 1.6, 0, 0, 0.3);
      part(mat(0x1a1210), 0.07, 0.07, 0.06, 0, 0, 1.1);
      part(tip, 0.1, 0.02, 0.22, 0, 0, 1.22);
      part(tip, 0.05, 0.02, 0.1, 0, 0, 1.38);
      // Fletching of black feathers.
      part(mat(0x1a1210), 0.02, 0.14, 0.18, 0, 0, -0.42);
      part(mat(0x1a1210), 0.14, 0.02, 0.18, 0, 0, -0.42);
      break;
    }
    case 'axe':
      part(mat(0x2a1a14), 0.055, 0.055, 1.0, 0, 0, 0.25);
      part(mat(0x2c2a30), 0.06, 0.34, 0.22, 0, 0.13, 0.66);
      // A glowing red edge on the blade.
      part(enchant ? edge(0x8a1a0a) : mat(0x8a1a0a, 0x6a1000), 0.065, 0.06, 0.24, 0, 0.32, 0.66);
      part(mat(0x2c2a30), 0.06, 0.12, 0.1, 0, -0.08, 0.66);
      break;
    case 'hammer': {
      const head = edge(0x3a2a2a);
      part(mat(0x2a1a14), 0.06, 0.06, 1.1, 0, 0, 0.3);
      part(head, 0.3, 0.3, 0.42, 0, 0, 0.88);
      // Glowing brimstone seams across the head.
      part(mat(0xff6a10, 0xff4a00), 0.31, 0.04, 0.43, 0, 0.08, 0.88);
      part(mat(0xff6a10, 0xff4a00), 0.31, 0.04, 0.43, 0, -0.08, 0.88);
      break;
    }
    case 'scythe': {
      part(mat(0x2a1a14), 0.05, 0.05, 1.8, 0, 0, 0.45);
      part(mat(0x1a1210), 0.08, 0.08, 0.08, 0, 0, 1.36);
      // The blade sweeps out sideways from the top of the shaft, curving back.
      const blade = edge(0xc8c8d0);
      part(blade, 0.02, 0.5, 0.12, 0, 0.27, 1.33);
      part(blade, 0.02, 0.35, 0.09, 0, 0.62, 1.26).rotation.x = 0.35;
      part(blade, 0.02, 0.2, 0.06, 0, 0.84, 1.13).rotation.x = 0.8;
      break;
    }
    case 'flail':
      part(mat(0x3a3a42), 0.05, 0.05, 0.3, 0, 0, 0.05);
      for (let i = 0; i < 4; i++) part(mat(0x3a3a42), 0.03, 0.03, 0.07, 0, 0, 0.24 + i * 0.07);
      part(edge(0x3a3a42), 0.22, 0.22, 0.22, 0, 0, 0.6).rotation.set(0.6, 0.6, 0);
      break;
    case 'bow': {
      // A bow held upright (+Y), string toward the archer (-Z).
      const wood = edge(0xf0e6c8);
      part(wood, 0.05, 0.5, 0.05, 0, 0.22, 0.1).rotation.x = -0.35;
      part(wood, 0.05, 0.5, 0.05, 0, -0.22, 0.1).rotation.x = 0.35;
      part(gold, 0.06, 0.1, 0.06, 0, 0, 0.18);
      part(mat(0xffffff, 0x666666), 0.01, 0.9, 0.01, 0, 0, 0.0);
      break;
    }
    case 'staff':
      part(mat(0xf0e6c8), 0.05, 0.05, 1.6, 0, 0, 0.3);
      part(gold, 0.14, 0.14, 0.14, 0, 0, 1.12);
      part(mat(0xfff4c0, 0xffd860), 0.09, 0.09, 0.09, 0, 0, 1.22);
      break;
  }
  return g;
}
