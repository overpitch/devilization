import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, mulberry32 } from './util';
import { FLAT_ZONES, LAIR, TREASURE, TREASURE_GEYSER } from './layout';

export { SPAWN, TRAINING } from './layout';

/**
 * The first plane of hell: a blocky plain cut by rivers of lava, ringed by
 * cliffs. The ground is a grid of 1 m columns (Minecraft-style), so every
 * height is a whole number of blocks.
 */

/** The world spans -HALF..HALF on x and z. */
export const HALF = 80;
const N = HALF * 2;
/** Height of the lava's surface. Lava cells' ground (the bed) is one block down, so bodies wade in it. */
export const LAVA_Y = -0.55;
const BED = -1;
/** Height reported outside the world: an impassable wall. */
const OUTSIDE = 60;


/** Solid circle (tree trunk, post). */
export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** What a block is made of; decides its colors and glow. */
const enum Kind {
  Ash,
  Basalt,
  Magma,
  Obsidian,
  Bone,
  Cliff,
}

const heights = new Int16Array(N * N);
const kinds = new Uint8Array(N * N);
const lavaCells = new Uint8Array(N * N);
/** Distance (in cells, capped) to the nearest lava; drives the glow on nearby rock. */
const lavaDist = new Uint8Array(N * N);
const colliders: Circle[] = [];

const cell = (i: number, j: number) => j * N + i;
const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < N && j < N;

/** Top of the ground column under a point. */
export function heightAt(x: number, z: number): number {
  const i = Math.floor(x) + HALF;
  const j = Math.floor(z) + HALF;
  return inside(i, j) ? heights[cell(i, j)] : OUTSIDE;
}

export function isLava(x: number, z: number): boolean {
  const i = Math.floor(x) + HALF;
  const j = Math.floor(z) + HALF;
  return inside(i, j) && lavaCells[cell(i, j)] === 1;
}

/** The highest ground under a body's square footprint (half-size r). */
export function groundAt(x: number, z: number, r: number): number {
  let top = -Infinity;
  for (let i = Math.floor(x - r) + HALF; i <= Math.floor(x + r) + HALF; i++) {
    for (let j = Math.floor(z - r) + HALF; j <= Math.floor(z + r) + HALF; j++) {
      top = Math.max(top, inside(i, j) ? heights[cell(i, j)] : OUTSIDE);
    }
  }
  return top;
}

/** True if any column under the footprint rises above maxTop (too tall to step onto). */
function blocked(x: number, z: number, r: number, maxTop: number) {
  return groundAt(x, z, r) > maxTop;
}

/**
 * Moves a body sideways by (dx, dz), sliding along walls of blocks taller
 * than `step` above its feet, and out of trees and posts.
 * Returns true if it ran into something.
 */
export function moveBody(pos: THREE.Vector3, dx: number, dz: number, r: number, step: number): boolean {
  const maxTop = pos.y + step;
  let bumped = false;
  if (dx !== 0) {
    pos.x += dx;
    if (blocked(pos.x, pos.z, r, maxTop)) {
      bumped = true;
      // Stop flush against the block face; fall back to not moving at all.
      pos.x = dx > 0 ? Math.floor(pos.x + r) - r - 0.001 : Math.floor(pos.x - r) + 1 + r + 0.001;
      if (blocked(pos.x, pos.z, r, maxTop)) pos.x -= dx;
    }
  }
  if (dz !== 0) {
    pos.z += dz;
    if (blocked(pos.x, pos.z, r, maxTop)) {
      bumped = true;
      pos.z = dz > 0 ? Math.floor(pos.z + r) - r - 0.001 : Math.floor(pos.z - r) + 1 + r + 0.001;
      if (blocked(pos.x, pos.z, r, maxTop)) pos.z -= dz;
    }
  }
  for (const c of colliders) {
    const ox = pos.x - c.x;
    const oz = pos.z - c.z;
    const min = r + c.r;
    const d2 = ox * ox + oz * oz;
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x += (ox / d) * (min - d);
      pos.z += (oz / d) * (min - d);
      bumped = true;
    }
  }
  const edge = HALF - 1;
  pos.x = clamp(pos.x, -edge, edge);
  pos.z = clamp(pos.z, -edge, edge);
  return bumped;
}

/** Adds a solid post or trunk that bodies can't walk through. */
export function addCollider(c: Circle) {
  colliders.push(c);
}

// ---------- Terrain generation ----------

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** A river of lava: its center line as a function along one axis, and its width. */
interface River {
  /** 'x' rivers run along x (their center is a z for each x); 'z' rivers the other way. */
  along: 'x' | 'z';
  center: (t: number) => number;
  width: (t: number) => number;
  /** The stretch of the along-axis the river covers. */
  from: number;
  to: number;
  /** Positions along the river where a basalt bridge crosses it. */
  bridges: number[];
}

const RIVERS: River[] = [
  // The great river north of the training ground, flowing across the whole plain.
  { along: 'x', center: (x) => 27 + 7 * Math.sin(x * 0.07) + 3 * Math.sin(x * 0.17 + 1), width: (x) => 5 + 1.5 * Math.sin(x * 0.05), from: -HALF, to: HALF, bridges: [-12, 19, 58] },
  // Western branch.
  { along: 'z', center: (z) => -36 + 6 * Math.sin(z * 0.08 + 1), width: (z) => 4 + Math.sin(z * 0.11), from: -HALF, to: 28, bridges: [-22, -58] },
  // Eastern branch.
  { along: 'z', center: (z) => 38 + 5 * Math.sin(z * 0.09), width: (z) => 4.5 + Math.sin(z * 0.07 + 2), from: -HALF, to: 28, bridges: [-8, -50] },
];

/** Round lava lakes: [x, z, radius]. */
const LAKES: [number, number, number][] = [
  [58, 56, 9],
  [-60, -52, 7],
];

/** Raised mesas with stepped sides: [x, z, radius, height]. */
const MESAS: [number, number, number, number][] = [
  [-52, 46, 9, 5],
  [55, -36, 10, 6],
  [-58, -10, 6, 4],
  [16, 54, 7, 4],
];

/** Fire geysers: vent positions. */
export const GEYSERS: { x: number; z: number }[] = [
  { x: 14.5, z: -42.5 },
  TREASURE_GEYSER,
  { x: -15.5, z: -22.5 },
  { x: 21.5, z: 9.5 },
  { x: -21.5, z: 11.5 },
  { x: 54.5, z: -60.5 },
  { x: -56.5, z: -28.5 },
  { x: 2.5, z: 46.5 },
  { x: -36.5, z: 56.5 },
  { x: 62.5, z: 12.5 },
  { x: 8.5, z: -48.5 },
];

/** How far inside the flattened zones a point is (0 outside, 1 well inside). */
function flatness(x: number, z: number) {
  let f = 0;
  for (const [fx, fz, r] of FLAT_ZONES) f = Math.max(f, smoothstep(r + 7, r, Math.hypot(x - fx, z - fz)));
  return f;
}

/** True within `margin` meters of a flattened zone (camps, the lair). */
function nearFlat(x: number, z: number, margin: number) {
  return FLAT_ZONES.some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r + margin);
}

function riverDistance(x: number, z: number): { d: number; half: number; bridge: boolean } {
  let best = { d: Infinity, half: 0, bridge: false };
  for (const r of RIVERS) {
    const t = r.along === 'x' ? x : z;
    if (t < r.from - 2 || t > r.to + 2) continue;
    const across = r.along === 'x' ? z : x;
    const d = Math.abs(across - r.center(t));
    if (d < best.d) best = { d, half: r.width(t) / 2, bridge: r.bridges.some((b) => Math.abs(t - b) < 1.6) };
  }
  for (const [lx, lz, lr] of LAKES) {
    const d = Math.hypot(x - lx, z - lz) - lr;
    if (d < best.d - best.half) best = { d: Math.max(d, 0), half: Math.max(-d, 0.01), bridge: false };
  }
  return best;
}

/** Sets a rectangle of columns (inclusive cell coordinates) to a height and kind. */
function fill(x0: number, z0: number, x1: number, z1: number, h: number, kind: Kind) {
  for (let z = z0; z <= z1; z++) {
    for (let x = x0; x <= x1; x++) {
      const c = cell(x + HALF, z + HALF);
      heights[c] = h;
      kinds[c] = kind;
    }
  }
}

/**
 * Malphas's lair: a raised basalt dais with a step up at the front, walled in
 * obsidian at the back and sides, with tall pillars at the front corners.
 */
function buildLair() {
  const x0 = Math.floor(LAIR.x - LAIR.halfWidth);
  const x1 = Math.floor(LAIR.x + LAIR.halfWidth);
  const front = Math.floor(LAIR.z + LAIR.depth / 2); // the step row
  const back = front - LAIR.depth;
  fill(x0, back, x1, front - 1, 3, Kind.Basalt);
  fill(x0, front, x1, front, 2, Kind.Basalt);
  fill(x0 - 1, back - 1, x1 + 1, back - 1, 8, Kind.Obsidian);
  fill(x0 - 1, back, x0 - 1, front - 2, 6, Kind.Obsidian);
  fill(x1 + 1, back, x1 + 1, front - 2, 6, Kind.Obsidian);
  for (const x of [x0, x1]) fill(x, front - 1, x, front - 1, 9, Kind.Obsidian);
}

/** The treasure pillar: three blocks taller than anything around it, right beside a geyser. */
function buildTreasurePillar() {
  const tx = Math.floor(TREASURE.x);
  const tz = Math.floor(TREASURE.z);
  const base = heights[cell(Math.floor(TREASURE_GEYSER.x) + HALF, Math.floor(TREASURE_GEYSER.z) + HALF)];
  // Keep the ground around it low, so nobody can jump up from a rock.
  for (let z = tz - 2; z <= tz + 2; z++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      const c = cell(x + HALF, z + HALF);
      if (Math.abs(x + 0.5 - TREASURE_GEYSER.x) <= 1 && Math.abs(z + 0.5 - TREASURE_GEYSER.z) <= 1) continue;
      heights[c] = Math.min(heights[c], base + 1);
    }
  }
  fill(tx - 1, tz - 1, tx + 1, tz + 1, base + 3, Kind.Obsidian);
}

function generateTerrain() {
  const rand = mulberry32(666);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i - HALF + 0.5;
      const z = j - HALF + 0.5;
      const n =
        1.6 * Math.sin(x * 0.061 + 0.3) * Math.cos(z * 0.053 - 1.1) +
        1.1 * Math.sin(x * 0.13 + 2.1) * Math.sin(z * 0.117 + 0.4) +
        0.5 * Math.sin((x - z) * 0.23);
      let h = 1 + n;
      let kind = Kind.Ash;

      for (const [mx, mz, mr, mh] of MESAS) {
        const d = Math.hypot(x - mx, z - mz);
        // Stepped sides: one block lower for every cell out from the rim.
        if (d < mr + mh) h = Math.max(h, mh + 1 - Math.max(0, d - mr));
      }

      // Cliffs ringing the plain: too steep to climb.
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > HALF - 12) {
        h += (edge - (HALF - 12)) * 2.3 + 1.5 * Math.sin(x * 0.3 + z * 0.2);
        kind = Kind.Cliff;
      }

      const flat = flatness(x, z);
      h = h * (1 - flat) + 1 * flat;
      h = Math.max(0, Math.round(h));

      const river = riverDistance(x, z);
      let isLava = false;
      if (river.d < river.half) {
        if (river.bridge) {
          h = 0;
          kind = Kind.Basalt;
        } else {
          isLava = true;
          h = BED;
        }
      } else if (river.d < river.half + 2.5) {
        // Scorched shore, sloping down to the lava.
        h = Math.min(h, river.d < river.half + 1.2 ? 0 : 1);
        kind = rand() < 0.18 && river.d < river.half + 1.2 ? Kind.Magma : Kind.Basalt;
      }

      const c = cell(i, j);
      heights[c] = h;
      kinds[c] = kind;
      lavaCells[c] = isLava ? 1 : 0;
    }
  }

  // Geyser craters: a raised ring of basalt around a glowing vent.
  for (const g of GEYSERS) {
    const gi = Math.floor(g.x) + HALF;
    const gj = Math.floor(g.z) + HALF;
    const base = heights[cell(gi, gj)];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const c = cell(gi + di, gj + dj);
        if (di === 0 && dj === 0) {
          heights[c] = base;
          kinds[c] = Kind.Magma;
        } else {
          heights[c] = base + 1;
          kinds[c] = Kind.Basalt;
        }
      }
    }
  }

  // Obsidian spires and basalt boulders scattered over the plain.
  const clearOf = (x: number, z: number, r: number) => {
    if (nearFlat(x, z, 4)) return false;
    if (GEYSERS.some((g) => Math.hypot(x - g.x, z - g.z) < 5)) return false;
    if (Math.hypot(x - TREASURE.x, z - TREASURE.z) < 6) return false;
    const river = riverDistance(x, z);
    if (river.d < river.half + 3 + r) return false;
    return Math.max(Math.abs(x), Math.abs(z)) < HALF - 14;
  };
  for (let n = 0; n < 45; n++) {
    const x = Math.floor((rand() * 2 - 1) * (HALF - 14));
    const z = Math.floor((rand() * 2 - 1) * (HALF - 14));
    const size = rand() < 0.35 ? 2 : 1;
    if (!clearOf(x + 0.5, z + 0.5, size)) continue;
    const tall = 3 + Math.floor(rand() * 7);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        const c = cell(x + a + HALF, z + b + HALF);
        heights[c] += tall - (a + b) * Math.floor(rand() * 2);
        kinds[c] = Kind.Obsidian;
      }
    }
  }
  for (let n = 0; n < 70; n++) {
    const x = Math.floor((rand() * 2 - 1) * (HALF - 14));
    const z = Math.floor((rand() * 2 - 1) * (HALF - 14));
    if (!clearOf(x + 0.5, z + 0.5, 2)) continue;
    for (let k = 0; k < 4; k++) {
      const c = cell(x + Math.floor(rand() * 3) + HALF, z + Math.floor(rand() * 3) + HALF);
      heights[c] += 1 + (rand() < 0.3 ? 1 : 0);
      kinds[c] = Kind.Basalt;
    }
  }

  buildLair();
  buildTreasurePillar();

  // How far each cell is from lava (up to 4 cells), for the glow on nearby rock.
  lavaDist.fill(4);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!lavaCells[cell(i, j)]) continue;
      for (let dj = -3; dj <= 3; dj++) {
        for (let di = -3; di <= 3; di++) {
          if (!inside(i + di, j + dj)) continue;
          const c = cell(i + di, j + dj);
          lavaDist[c] = Math.min(lavaDist[c], Math.max(Math.abs(di), Math.abs(dj)));
        }
      }
    }
  }
}

// ---------- Terrain mesh ----------

/** Top and side colors for each kind of block. */
const PALETTE: Record<Kind, { top: number; side: number; deep: number; glow: number }> = {
  [Kind.Ash]: { top: 0x6b4038, side: 0x7a3022, deep: 0x5a2219, glow: 0 },
  [Kind.Basalt]: { top: 0x3a2e2c, side: 0x2f2524, deep: 0x251d1c, glow: 0 },
  [Kind.Magma]: { top: 0x8a2e0c, side: 0x6a220a, deep: 0x4a1a0a, glow: 0.9 },
  [Kind.Obsidian]: { top: 0x2c2040, side: 0x241a36, deep: 0x1c142a, glow: 0 },
  [Kind.Bone]: { top: 0xcfc4a8, side: 0xb8ad92, deep: 0x9a9078, glow: 0 },
  [Kind.Cliff]: { top: 0x55271c, side: 0x4a2016, deep: 0x3a1a12, glow: 0 },
};

/** A 16×16 speckled block texture with darker edges, drawn with hard pixels. */
function blockTexture(rand: () => number) {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 205 + rand() * 50;
      if (rand() < 0.06) v -= 60;
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) v *= 0.82;
      g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Lambert material that also glows by a per-vertex amount (rock lit from
 * below by nearby lava, and magma blocks).
 */
function glowingLambert(map: THREE.Texture) {
  const mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * vec3(1.0, 0.22, 0.03);');
  };
  return mat;
}

function buildTerrainMesh(rand: () => number) {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const glow: number[] = [];
  const index: number[] = [];
  const color = new THREE.Color();

  /** Glow from nearby lava, strongest low down and close to it. */
  const lavaGlow = (c: number, y: number) => {
    const d = lavaDist[c];
    if (d >= 4) return 0;
    return 0.26 * (1 - d / 4) * clamp(1 - (y - LAVA_Y) / 2.5, 0, 1);
  };

  /** One square face: corners p, p+u, p+u+v, p+v. u × v must point outward. */
  const face = (px: number, py: number, pz: number, u: number[], v: number[], n: number[], c: THREE.Color, glowAt: (y: number) => number) => {
    const base = pos.length / 3;
    const corners = [
      [px, py, pz],
      [px + u[0], py + u[1], pz + u[2]],
      [px + u[0] + v[0], py + u[1] + v[1], pz + u[2] + v[2]],
      [px + v[0], py + v[1], pz + v[2]],
    ];
    const uvs = [0, 0, 0, 1, 1, 1, 1, 0];
    for (let k = 0; k < 4; k++) {
      pos.push(corners[k][0], corners[k][1], corners[k][2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(uvs[k * 2], uvs[k * 2 + 1]);
      col.push(c.r, c.g, c.b);
      glow.push(glowAt(corners[k][1]));
    }
    index.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  const shade = (hex: number, jitter: number) => color.set(hex).multiplyScalar(1 - jitter + rand() * jitter * 2);

  const sides: { di: number; dj: number; n: number[] }[] = [
    { di: 1, dj: 0, n: [1, 0, 0] },
    { di: -1, dj: 0, n: [-1, 0, 0] },
    { di: 0, dj: 1, n: [0, 0, 1] },
    { di: 0, dj: -1, n: [0, 0, -1] },
  ];

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const c = cell(i, j);
      if (lavaCells[c]) continue; // the lava surface covers its bed
      const h = heights[c];
      const pal = PALETTE[kinds[c] as Kind];
      const x0 = i - HALF;
      const z0 = j - HALF;
      const magma = pal.glow;
      const glowAt = (y: number) => Math.max(magma, lavaGlow(c, y));

      face(x0, h, z0, [0, 0, 1], [1, 0, 0], [0, 1, 0], shade(pal.top, 0.08), glowAt);

      for (const s of sides) {
        const ni = i + s.di;
        const nj = j + s.dj;
        // Neighbors outside the world are never seen; lava neighbors show sides down to the lava.
        if (!inside(ni, nj)) continue;
        const nc = cell(ni, nj);
        const nh = lavaCells[nc] ? BED : heights[nc];
        for (let y = h - 1; y >= nh; y--) {
          const hex = y === h - 1 ? pal.side : pal.deep;
          const sc = shade(hex, 0.07);
          if (s.di === 1) face(x0 + 1, y, z0, [0, 1, 0], [0, 0, 1], s.n, sc, glowAt);
          else if (s.di === -1) face(x0, y, z0, [0, 0, 1], [0, 1, 0], s.n, sc, glowAt);
          else if (s.dj === 1) face(x0, y, z0 + 1, [1, 0, 0], [0, 1, 0], s.n, sc, glowAt);
          else face(x0, y, z0, [0, 1, 0], [1, 0, 0], s.n, sc, glowAt);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 1));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, glowingLambert(blockTexture(rand)));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** Seamless, pixelated lava: dark crust over bright molten swirls. */
function lavaTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const tau = Math.PI * 2;
  // Bright enough that the blend seen from far away still reads as molten orange.
  const palette = ['#7a1404', '#b82a04', '#e04a08', '#ff7010', '#ffa020', '#ffd850'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Whole-number frequencies so the pattern wraps seamlessly.
      const f =
        Math.sin(tau * (u * 2 + v)) * 0.5 +
        Math.sin(tau * (v * 3 - u)) * 0.35 +
        Math.sin(tau * (u * 5 + v * 4)) * 0.2 +
        Math.sin(tau * (u * 1 - v * 2) + 1.3) * 0.4;
      const k = clamp(Math.floor(((f + 1.45) / 2.9) * palette.length), 0, palette.length - 1);
      g.fillStyle = palette[k];
      g.fillRect(x, y, 1, 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.anisotropy = 8;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildLavaMesh() {
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const scale = 1 / 8;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      if (!lavaCells[cell(i, j)]) continue;
      const x0 = i - HALF;
      const z0 = j - HALF;
      const base = pos.length / 3;
      for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [1, 0]]) {
        pos.push(x0 + dx, LAVA_Y, z0 + dz);
        uv.push((x0 + dx) * scale, (z0 + dz) * scale);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeBoundingSphere();
  const tex = lavaTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  return { mesh: new THREE.Mesh(geo, mat), tex, mat };
}

// ---------- Scenery ----------

/** Merges boxes into one mesh: [w, h, d, x, y, z, rotY?]. */
function boxes(list: number[][], mat: THREE.Material) {
  const geos = list.map(([w, h, d, x, y, z, ry = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Charred dead trees and piles of bones. */
function addScenery(scene: THREE.Scene, rand: () => number) {
  const trunks: number[][] = [];
  const bones: number[][] = [];
  const open = (x: number, z: number) => {
    if (isLava(x, z) || nearFlat(x, z, 2) || Math.hypot(x - TREASURE.x, z - TREASURE.z) < 4) return false;
    if (GEYSERS.some((g) => Math.hypot(x - g.x, z - g.z) < 3)) return false;
    const h = heightAt(x, z);
    // Only on level ground.
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => heightAt(x + a, z + b) === h) && Math.max(Math.abs(x), Math.abs(z)) < HALF - 13;
  };

  for (let n = 0; n < 60; n++) {
    const x = Math.floor((rand() * 2 - 1) * HALF) + 0.5;
    const z = Math.floor((rand() * 2 - 1) * HALF) + 0.5;
    if (!open(x, z)) continue;
    const y = heightAt(x, z);
    const tall = 2.5 + rand() * 2.5;
    trunks.push([0.45, tall, 0.45, x, y + tall / 2, z]);
    // A few crooked branches.
    const branches = 2 + Math.floor(rand() * 3);
    for (let b = 0; b < branches; b++) {
      const a = rand() * Math.PI * 2;
      const by = y + tall * (0.45 + rand() * 0.5);
      const len = 0.8 + rand() * 1.1;
      trunks.push([len, 0.22, 0.22, x + Math.cos(a) * len * 0.5, by, z - Math.sin(a) * len * 0.5, a]);
      trunks.push([0.2, 0.6, 0.2, x + Math.cos(a) * len, by + 0.3, z - Math.sin(a) * len]);
    }
    addCollider({ x, z, r: 0.35 });
  }

  for (let n = 0; n < 90; n++) {
    const x = (rand() * 2 - 1) * (HALF - 14);
    const z = (rand() * 2 - 1) * (HALF - 14);
    if (!open(x, z)) continue;
    const y = heightAt(x, z);
    // A skull and a few scattered bones.
    bones.push([0.3, 0.28, 0.32, x, y + 0.14, z, rand() * 3]);
    for (let b = 0; b < 3; b++) {
      bones.push([0.6 + rand() * 0.4, 0.08, 0.08, x + (rand() - 0.5) * 1.4, y + 0.04, z + (rand() - 0.5) * 1.4, rand() * 3]);
    }
  }

  scene.add(boxes(trunks, new THREE.MeshLambertMaterial({ color: 0x1c1412, flatShading: true })));
  scene.add(boxes(bones, new THREE.MeshLambertMaterial({ color: 0xd6cbb0, flatShading: true })));
}

/** Glowing embers drifting up through the air around the player. */
function createEmbers(count: number) {
  const span = { x: 70, y: 30 };
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * span.x;
    positions[i * 3 + 1] = Math.random() * span.y;
    positions[i * 3 + 2] = (Math.random() - 0.5) * span.x;
    speeds[i] = 0.6 + Math.random() * 1.6;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ color: 0xff8a3a, size: 0.13, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  points.frustumCulled = false;
  let time = 0;
  const update = (dt: number, center: THREE.Vector3) => {
    time += dt;
    for (let i = 0; i < count; i++) {
      let x = positions[i * 3];
      let y = positions[i * 3 + 1] + speeds[i] * dt;
      let z = positions[i * 3 + 2];
      x += Math.sin(time * 0.7 + i) * 0.3 * dt;
      // Keep every ember within a box around the player, wrapping at the edges.
      const wrap = (v: number, c: number, s: number) => c + ((((v - c + s / 2) % s) + s) % s) - s / 2;
      x = wrap(x, center.x, span.x);
      z = wrap(z, center.z, span.x);
      if (y > center.y + span.y * 0.7) y -= span.y;
      if (y < center.y - span.y * 0.3) y += span.y;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return { points, update };
}

/** A vertical gradient for the sky: black-red overhead, fiery at the horizon. */
function skyTexture(horizon: THREE.Color) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#070103');
  grad.addColorStop(0.3, '#1e0606');
  grad.addColorStop(0.47, '#6a200c');
  grad.addColorStop(0.5, `#${horizon.getHexString()}`);
  grad.addColorStop(1, '#1a0604');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type World = ReturnType<typeof createWorld>;

export function createWorld(scene: THREE.Scene) {
  const rand = mulberry32(1666);
  generateTerrain();

  const horizon = new THREE.Color(0x4a1408);
  scene.background = skyTexture(horizon);
  scene.fog = new THREE.Fog(horizon, 30, 115);

  const hemi = new THREE.HemisphereLight(0xc06048, 0x401008, 2.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffb090, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(-30, 60, 20);

  scene.add(buildTerrainMesh(rand));
  const lava = buildLavaMesh();
  scene.add(lava.mesh);
  addScenery(scene, rand);
  const embers = createEmbers(500);
  scene.add(embers.points);

  let time = 0;
  return {
    setShadows(on: boolean) {
      sun.castShadow = on;
    },
    update(dt: number, center: THREE.Vector3) {
      time += dt;
      // The lava creeps along and its glow pulses slowly.
      lava.tex.offset.set(time * 0.035, time * 0.02);
      const pulse = 0.92 + Math.sin(time * 1.3) * 0.06 + Math.sin(time * 3.1) * 0.03;
      lava.mat.color.setScalar(pulse);
      embers.update(dt, center);
      // Keep the shadow area centered on the player.
      sun.position.copy(center).add(sunOffset);
      sun.target.position.copy(center);
    },
  };
}

/**
 * A random spot on open, dry ground at least `minDist` from (fromX, fromZ):
 * for side missions. Returns null if none was found.
 */
export function findOpenSpot(fromX: number, fromZ: number, minDist: number): { x: number; z: number } | null {
  for (let tries = 0; tries < 200; tries++) {
    const x = Math.floor((Math.random() * 2 - 1) * (HALF - 16)) + 0.5;
    const z = Math.floor((Math.random() * 2 - 1) * (HALF - 16)) + 0.5;
    if (Math.hypot(x - fromX, z - fromZ) < minDist) continue;
    if (nearFlat(x, z, 3) || lavaNearness(x, z) < 4) continue;
    const h = heightAt(x, z);
    // Fairly level: no big drops within a few meters.
    let level = true;
    for (const [a, b] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) if (Math.abs(heightAt(x + a, z + b) - h) > 1) level = false;
    if (level) return { x, z };
  }
  return null;
}

/** Distance from a point to the nearest lava cell (in whole cells, 0..4). */
export function lavaNearness(x: number, z: number) {
  const i = Math.floor(x) + HALF;
  const j = Math.floor(z) + HALF;
  return inside(i, j) ? lavaDist[cell(i, j)] : 4;
}
