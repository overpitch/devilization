import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, mulberry32 } from './util';
import { LAIR, LAIR_ZONE, PORTAL } from './layout';
import { plane, type PlaneDef } from './planes';

export { SPAWN, TRAINING } from './layout';

/**
 * A plane of hell: a blocky landscape cut by rivers and lakes of a burning
 * liquid (lava, blood or acid), ringed by cliffs. The ground is a grid of
 * 1 m columns (Minecraft-style), so every height is a whole number of
 * blocks. Which plane, and how it looks, comes from planes.ts.
 */

/** The world spans -HALF..HALF on x and z. */
export const HALF = 80;
const N = HALF * 2;
/** Height of the liquid's surface. Its bed is one block down, so bodies wade in it. */
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
  Ground,
  Rock,
  Vent,
  Spire,
  Cliff,
  /** The ruler's lair walls and the Hellgate's floor: dark obsidian on every plane. */
  Lair,
}

const heights = new Int16Array(N * N);
const kinds = new Uint8Array(N * N);
const lavaCells = new Uint8Array(N * N);
/** Distance (in cells, capped) to the nearest lava; drives the glow on nearby rock. */
const lavaDist = new Uint8Array(N * N);
let colliders: Circle[] = [];

/**
 * A gap in a wall that only some can pass: a crack only a tiny demon fits
 * through, or rubble only a huge one can smash. Axis-aligned box by center
 * and half sizes.
 */
export interface Gate {
  kind: 'crack' | 'rubble';
  x: number;
  z: number;
  hw: number;
  hd: number;
  /** Rubble that's been smashed. */
  open: boolean;
}
let gates: Gate[] = [];

/** The current plane's gates (to draw them and smash rubble). */
export function planeGates(): Gate[] {
  return gates;
}

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
 * than `step` above its feet, and out of trees, posts and gates. A `tiny`
 * body slips through cracks. Returns true if it ran into something.
 */
export function moveBody(pos: THREE.Vector3, dx: number, dz: number, r: number, step: number, tiny = false): boolean {
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
  for (const g of gates) {
    if (g.open || (g.kind === 'crack' && tiny)) continue;
    const cx = clamp(pos.x, g.x - g.hw, g.x + g.hw);
    const cz = clamp(pos.z, g.z - g.hd, g.z + g.hd);
    const ox = pos.x - cx;
    const oz = pos.z - cz;
    const d2 = ox * ox + oz * oz;
    if (d2 > r * r) continue;
    bumped = true;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x += (ox / d) * (r - d);
      pos.z += (oz / d) * (r - d);
    } else {
      // Inside the box: push out the shallow way.
      const px = g.hw + r - Math.abs(pos.x - g.x);
      const pz = g.hd + r - Math.abs(pos.z - g.z);
      if (px < pz) pos.x += Math.sign(pos.x - g.x || 1) * px;
      else pos.z += Math.sign(pos.z - g.z || 1) * pz;
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

/** Every geyser on the current plane, including the one beside the treasure pillar. */
export function planeGeysers(): { x: number; z: number }[] {
  return [...plane().geysers, plane().treasureGeyser];
}

/** The flattened zones: the lair's, plus the plane's own (camps, posts, battlefields). */
function flatZones(): [number, number, number][] {
  return [LAIR_ZONE, ...plane().flatZones];
}

/** How far inside the flattened zones a point is (0 outside, 1 well inside). */
function flatness(x: number, z: number) {
  let f = 0;
  for (const [fx, fz, r] of flatZones()) f = Math.max(f, smoothstep(r + 7, r, Math.hypot(x - fx, z - fz)));
  return f;
}

/** True within `margin` meters of a flattened zone (camps, the lair). */
function nearFlat(x: number, z: number, margin: number) {
  return flatZones().some(([fx, fz, r]) => Math.hypot(x - fx, z - fz) < r + margin);
}

function riverDistance(x: number, z: number): { d: number; half: number; bridge: boolean } {
  let best = { d: Infinity, half: 0, bridge: false };
  for (const r of plane().rivers) {
    const t = r.along === 'x' ? x : z;
    if (t < r.from - 2 || t > r.to + 2) continue;
    const across = r.along === 'x' ? z : x;
    const d = Math.abs(across - r.center(t));
    if (d < best.d) best = { d, half: r.width(t) / 2, bridge: r.bridges.some((b) => Math.abs(t - b) < 1.6) };
  }
  for (const [lx, lz, lr] of plane().lakes) {
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
  fill(x0, back, x1, front - 1, 3, Kind.Rock);
  fill(x0, front, x1, front, 2, Kind.Rock);
  fill(x0 - 1, back - 1, x1 + 1, back - 1, 8, Kind.Lair);
  fill(x0 - 1, back, x0 - 1, front - 2, 6, Kind.Lair);
  fill(x1 + 1, back, x1 + 1, front - 2, 6, Kind.Lair);
  for (const x of [x0, x1]) fill(x, front - 1, x, front - 1, 9, Kind.Lair);
}

/** The Hellgate's floor: a flat obsidian slab beside the lair. */
function buildPortalFloor() {
  const x = Math.floor(PORTAL.x);
  const z = Math.floor(PORTAL.z);
  fill(x - 2, z - 1, x + 2, z + 1, 1, Kind.Lair);
}

/**
 * A locked treasure: a ring of tall walls around the chest, with one way
 * in on the south side, closed by a crack (tiny demons only) or rubble
 * (huge demons smash it).
 */
function buildTreasureVault(kind: 'crack' | 'rubble') {
  const t = plane().treasure;
  const tx = Math.floor(t.x);
  const tz = Math.floor(t.z);
  const floor = heights[cell(tx + HALF, tz + HALF)];
  // Level the inside, then wall it in (3 cells out from the chest).
  for (let z = tz - 2; z <= tz + 2; z++) for (let x = tx - 2; x <= tx + 2; x++) fill(x, z, x, z, floor, Kind.Rock);
  for (let z = tz - 3; z <= tz + 3; z++) {
    for (let x = tx - 3; x <= tx + 3; x++) {
      if (Math.max(Math.abs(x - tx), Math.abs(z - tz)) !== 3) continue;
      fill(x, z, x, z, floor + 5, Kind.Spire);
    }
  }
  // The way in, on the south wall: a narrow crack, or a doorway wide enough for
  // a huge demon (heaped with rubble). A path leads up to it.
  const w = kind === 'rubble' ? 1 : 0;
  fill(tx - w, tz - 3, tx + w, tz - 3, floor, Kind.Rock);
  fill(tx - w, tz - 6, tx + w, tz - 4, floor, Kind.Rock);
  // Stairs down (or up) to the ground, one block at a time, so anyone can get there.
  for (let k = 1; k <= 10; k++) {
    const c = cell(tx + HALF, tz - 6 - k + HALF);
    const target = floor + Math.sign(heights[c] - floor) * k;
    if (Math.abs(heights[c] - floor) <= k) break;
    fill(tx - w, tz - 6 - k, tx + w, tz - 6 - k, target, Kind.Rock);
  }
  gates.push({ kind, x: tx + 0.5, z: tz - 2.5, hw: w + 0.5, hd: 0.5, open: false });
}

/** The treasure pillar: taller than anything around it, right beside a geyser (or, in the sky, too tall for anything but wings). */
function buildTreasurePillar() {
  const lock = plane().treasureLock;
  if (lock === 'crack' || lock === 'rubble') {
    buildTreasureVault(lock);
    return;
  }
  const TREASURE = plane().treasure;
  const TREASURE_GEYSER = plane().treasureGeyser;
  const tx = Math.floor(TREASURE.x);
  const tz = Math.floor(TREASURE.z);
  const base = heights[cell(Math.floor(TREASURE_GEYSER.x) + HALF, Math.floor(TREASURE_GEYSER.z) + HALF)];
  // Keep the ground around it low, so nobody can jump up from a rock (a sky pillar is too tall to matter).
  for (let z = tz - 2; lock !== 'sky' && z <= tz + 2; z++) {
    for (let x = tx - 2; x <= tx + 2; x++) {
      const c = cell(x + HALF, z + HALF);
      if (Math.abs(x + 0.5 - TREASURE_GEYSER.x) <= 1 && Math.abs(z + 0.5 - TREASURE_GEYSER.z) <= 1) continue;
      heights[c] = Math.min(heights[c], base + 1);
    }
  }
  fill(tx - 1, tz - 1, tx + 1, tz + 1, base + (lock === 'sky' ? 14 : 3), Kind.Spire);
}

/**
 * Heaven's fortress on the last plane: thick white walls with battlements,
 * tall corner towers, and a wide gate in the south wall.
 */
function buildFortress() {
  const f = plane().finale?.fortress;
  if (!f) return;
  const cx = Math.floor(f.x);
  const cz = Math.floor(f.z);
  const floor = heights[cell(cx + HALF, cz + HALF)];
  for (let z = cz - f.half; z <= cz + f.half; z++) {
    for (let x = cx - f.half; x <= cx + f.half; x++) {
      const ring = Math.max(Math.abs(x - cx), Math.abs(z - cz));
      if (ring < f.half - 1) continue;
      // The gate: a gap five blocks wide in the south wall.
      if (z < cz && Math.abs(x - cx) <= 2 && Math.abs(z - cz) >= f.half - 1) {
        fill(x, z, x, z, floor, Kind.Rock);
        continue;
      }
      // Battlements along the outer edge.
      const crenel = ring === f.half && (x + z) % 2 === 0 ? 1 : 0;
      fill(x, z, x, z, floor + f.height + crenel, Kind.Spire);
    }
  }
  // Corner towers, and gatehouse towers on either side of the gate.
  const towers: [number, number][] = [
    [cx - f.half, cz - f.half], [cx + f.half, cz - f.half], [cx - f.half, cz + f.half], [cx + f.half, cz + f.half],
    [cx - 4, cz - f.half], [cx + 4, cz - f.half],
  ];
  for (const [tx, tz] of towers) fill(tx - 1, tz - 1, tx + 1, tz + 1, floor + f.height + 5, Kind.Spire);
}

/** Distance from a point to the line segment a-b. */
function distToSegment(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
}

/** City blocks: tall obsidian buildings in a grid, with streets between. */
function buildCity(rand: () => number) {
  const city = plane().terrain.city;
  if (!city) return;
  const period = city.block + city.street;
  const blockHeights = new Map<string, number>();
  const war = plane().missions.war;
  const TREASURE = plane().treasure;
  for (let z = -HALF + 13; z < HALF - 13; z++) {
    for (let x = -HALF + 13; x < HALF - 13; x++) {
      const u = (((x + 7) % period) + period) % period;
      const v = (((z + 7) % period) + period) % period;
      if (u >= city.block || v >= city.block) continue; // a street
      const key = `${Math.floor((x + 7) / period)},${Math.floor((z + 7) / period)}`;
      let h = blockHeights.get(key);
      if (h === undefined) {
        // Some blocks are left empty as little squares.
        h = rand() < 0.18 ? 0 : city.minHeight + Math.floor(rand() * (city.maxHeight - city.minHeight + 1));
        blockHeights.set(key, h);
      }
      if (h === 0) continue;
      const cx = x + 0.5;
      const cz = z + 0.5;
      if (nearFlat(cx, cz, 3) || Math.hypot(cx - TREASURE.x, cz - TREASURE.z) < 6) continue;
      // Keep the attack waves' road to the battlefield open.
      if (distToSegment(cx, cz, war.from, war.defend) < 6) continue;
      if (planeGeysers().some((g) => Math.hypot(cx - g.x, cz - g.z) < 4)) continue;
      const river = riverDistance(cx, cz);
      if (river.d < river.half + 3) continue;
      // Stepped tops: the edges of each block are a little lower.
      const edge = Math.min(u, v, city.block - 1 - u, city.block - 1 - v);
      const c = cell(x + HALF, z + HALF);
      heights[c] = heights[c] + h - (edge === 0 ? 1 : 0);
      kinds[c] = Kind.Spire;
    }
  }
}

function generateTerrain() {
  const p = plane();
  const rand = mulberry32(p.seed);
  const { base, amp, freq } = p.terrain;
  // Each plane's hills are shifted, so no two look alike.
  const ox = p.seed * 0.37;
  const oz = p.seed * 0.11;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = i - HALF + 0.5;
      const z = j - HALF + 0.5;
      const fx = (x + ox) * freq;
      const fz = (z + oz) * freq;
      const n =
        1.6 * Math.sin(fx * 0.061 + 0.3) * Math.cos(fz * 0.053 - 1.1) +
        1.1 * Math.sin(fx * 0.13 + 2.1) * Math.sin(fz * 0.117 + 0.4) +
        0.5 * Math.sin((fx - fz) * 0.23);
      let h = base + n * amp;
      let kind = Kind.Ground;

      for (const [mx, mz, mr, mh] of p.mesas) {
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
      // A sea of fire: everything that isn't an island, a causeway or a flattened zone is liquid.
      const sea = p.terrain.sea && !nearFlat(x, z, 0) && !p.mesas.some(([mx, mz, mr, mh]) => Math.hypot(x - mx, z - mz) < mr + mh - 1) && !p.causeways?.some(([ax, az, bx, bz]) => distToSegment(x, z, { x: ax, z: az }, { x: bx, z: bz }) < 1.6);
      if (sea && edge <= HALF - 12) {
        isLava = true;
        h = BED;
      } else if (river.d < river.half) {
        if (river.bridge) {
          h = 0;
          kind = Kind.Rock;
        } else {
          isLava = true;
          h = BED;
        }
      } else if (river.d < river.half + 2.5) {
        // Scorched shore, sloping down to the liquid.
        h = Math.min(h, river.d < river.half + 1.2 ? 0 : 1);
        kind = rand() < 0.18 && river.d < river.half + 1.2 ? Kind.Vent : Kind.Rock;
      } else if (river.d < river.half + 9) {
        // Higher ground steps down to the shore a block at a time, so it can always be climbed.
        h = Math.min(h, Math.floor(river.d - river.half - 0.5));
      }

      const c = cell(i, j);
      heights[c] = h;
      kinds[c] = kind;
      lavaCells[c] = isLava ? 1 : 0;
    }
  }

  // Geyser craters: a raised ring of rock around a glowing vent.
  for (const g of planeGeysers()) {
    const gi = Math.floor(g.x) + HALF;
    const gj = Math.floor(g.z) + HALF;
    const base = heights[cell(gi, gj)];
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const c = cell(gi + di, gj + dj);
        if (di === 0 && dj === 0) {
          heights[c] = base;
          kinds[c] = Kind.Vent;
        } else {
          heights[c] = base + 1;
          kinds[c] = Kind.Rock;
        }
      }
    }
  }

  // Obsidian spires and basalt boulders scattered over the plain.
  const clearOf = (x: number, z: number, r: number) => {
    if (nearFlat(x, z, 4)) return false;
    if (planeGeysers().some((g) => Math.hypot(x - g.x, z - g.z) < 5)) return false;
    if (Math.hypot(x - p.treasure.x, z - p.treasure.z) < 6) return false;
    const river = riverDistance(x, z);
    if (river.d < river.half + 3 + r) return false;
    return Math.max(Math.abs(x), Math.abs(z)) < HALF - 14;
  };
  for (let n = 0; n < p.terrain.spires; n++) {
    const x = Math.floor((rand() * 2 - 1) * (HALF - 14));
    const z = Math.floor((rand() * 2 - 1) * (HALF - 14));
    const size = rand() < 0.35 ? 2 : 1;
    if (!clearOf(x + 0.5, z + 0.5, size)) continue;
    const tall = 3 + Math.floor(rand() * 7);
    for (let a = 0; a < size; a++) {
      for (let b = 0; b < size; b++) {
        const c = cell(x + a + HALF, z + b + HALF);
        heights[c] += tall - (a + b) * Math.floor(rand() * 2);
        kinds[c] = Kind.Spire;
      }
    }
  }
  for (let n = 0; n < p.terrain.boulders; n++) {
    const x = Math.floor((rand() * 2 - 1) * (HALF - 14));
    const z = Math.floor((rand() * 2 - 1) * (HALF - 14));
    if (!clearOf(x + 0.5, z + 0.5, 2)) continue;
    for (let k = 0; k < 4; k++) {
      const c = cell(x + Math.floor(rand() * 3) + HALF, z + Math.floor(rand() * 3) + HALF);
      heights[c] += 1 + (rand() < 0.3 ? 1 : 0);
      kinds[c] = Kind.Rock;
    }
  }

  buildCity(rand);
  buildFortress();
  buildLair();
  buildPortalFloor();
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

/** Top, side and deep colors for each kind of block on the current plane, and how much it glows. */
function palette(p: PlaneDef): Record<Kind, { top: number; side: number; deep: number; glow: number }> {
  const c = (list: number[], glow = 0) => ({ top: list[0], side: list[1], deep: list[2], glow });
  return {
    [Kind.Ground]: c(p.palette.ground),
    [Kind.Rock]: c(p.palette.rock),
    [Kind.Vent]: c(p.palette.vent, 0.9),
    [Kind.Spire]: c(p.palette.spire, p.palette.spireGlow),
    [Kind.Cliff]: c(p.palette.cliff),
    [Kind.Lair]: c([0x2c2040, 0x241a36, 0x1c142a]),
  };
}

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
function glowingLambert(map: THREE.Texture, glowColor: [number, number, number]) {
  const mat = new THREE.MeshLambertMaterial({ map, vertexColors: true, flatShading: true });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * vec3(${glowColor.map((v) => v.toFixed(3)).join(', ')});`);
  };
  return mat;
}

function buildTerrainMesh(rand: () => number) {
  const PALETTE = palette(plane());
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
  const mesh = new THREE.Mesh(geo, glowingLambert(blockTexture(rand), plane().liquid.glow));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

/** Seamless, pixelated liquid: dark crust over bright swirls (lava, blood or acid). */
function lavaTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  const tau = Math.PI * 2;
  // Bright enough that the blend seen from far away still reads as molten.
  const palette = plane().liquid.colors;
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

/** Merges boxes into one mesh: [w, h, d, x, y, z, rotY?, tiltZ?]. */
function boxes(list: number[][], mat: THREE.Material) {
  const geos = list.map(([w, h, d, x, y, z, ry = 0, rz = 0]) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.rotateZ(rz);
    g.rotateY(ry);
    g.translate(x, y, z);
    return g;
  });
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Trees (charred, bone or swamp), scattered bones, and glowing crystals. */
function addScenery(root: THREE.Object3D, rand: () => number) {
  const p = plane();
  const trunks: number[][] = [];
  const moss: number[][] = [];
  const bones: number[][] = [];
  const crystals: number[][] = [];
  const open = (x: number, z: number) => {
    if (isLava(x, z) || nearFlat(x, z, 2) || Math.hypot(x - p.treasure.x, z - p.treasure.z) < 4) return false;
    if (Math.hypot(x - PORTAL.x, z - PORTAL.z) < 5) return false;
    if (planeGeysers().some((g) => Math.hypot(x - g.x, z - g.z) < 3)) return false;
    const h = heightAt(x, z);
    // Only on level ground.
    return [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => heightAt(x + a, z + b) === h) && Math.max(Math.abs(x), Math.abs(z)) < HALF - 13;
  };

  const trees = p.scenery.trees;
  for (let n = 0; trees && n < trees.count * 2; n++) {
    const x = Math.floor((rand() * 2 - 1) * HALF) + 0.5;
    const z = Math.floor((rand() * 2 - 1) * HALF) + 0.5;
    if (!open(x, z)) continue;
    const y = heightAt(x, z);
    if (trees.style === 'bone') {
      // A spine of bone with ribs curving up from it.
      const tall = 3 + rand() * 3;
      trunks.push([0.38, tall, 0.38, x, y + tall / 2, z]);
      const levels = 2 + Math.floor(rand() * 3);
      for (let k = 0; k < levels; k++) {
        const by = y + tall * (0.35 + k * 0.18);
        const a = rand() * Math.PI;
        for (const side of [1, -1]) {
          const ax = Math.cos(a) * side;
          const az = -Math.sin(a) * side;
          trunks.push([1.1, 0.14, 0.14, x + ax * 0.5, by, z + az * 0.5, a, side * 0.55]);
          trunks.push([0.14, 0.5, 0.14, x + ax * 1.0, by + 0.42, z + az * 1.0]);
        }
      }
      trunks.push([0.5, 0.42, 0.5, x, y + tall + 0.15, z, rand() * 3]); // a skull on top
    } else {
      const tall = (trees.style === 'swamp' ? 2 : 2.5) + rand() * 2.5;
      trunks.push([0.45, tall, 0.45, x, y + tall / 2, z]);
      if (trees.style === 'swamp') {
        // Splayed roots, and moss hanging from the branches.
        for (let r = 0; r < 4; r++) {
          const a = (r / 4) * Math.PI * 2 + rand();
          trunks.push([0.9, 0.16, 0.16, x + Math.cos(a) * 0.5, y + 0.3, z - Math.sin(a) * 0.5, a, 0.6]);
        }
      }
      const branches = 2 + Math.floor(rand() * 3);
      for (let b = 0; b < branches; b++) {
        const a = rand() * Math.PI * 2;
        const by = y + tall * (0.45 + rand() * 0.5);
        const len = 0.8 + rand() * 1.1;
        trunks.push([len, 0.22, 0.22, x + Math.cos(a) * len * 0.5, by, z - Math.sin(a) * len * 0.5, a]);
        trunks.push([0.2, 0.6, 0.2, x + Math.cos(a) * len, by + 0.3, z - Math.sin(a) * len]);
        if (trees.style === 'swamp') moss.push([0.12, 1.0, 0.12, x + Math.cos(a) * len * 0.8, by - 0.5, z - Math.sin(a) * len * 0.8]);
      }
    }
    addCollider({ x, z, r: 0.35 });
    if (trunks.length > trees.count * 40) break;
  }

  for (let n = 0; n < (p.scenery.bones ?? 0); n++) {
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

  const chains: number[][] = [];
  const posts: number[][] = [];
  for (let n = 0; n < (p.scenery.chains ?? 0) * 3; n++) {
    if (posts.length >= (p.scenery.chains ?? 0) * 2 * 3) break;
    const x = (rand() * 2 - 1) * (HALF - 18);
    const z = (rand() * 2 - 1) * (HALF - 18);
    const a = rand() * Math.PI;
    const len = 8 + rand() * 6;
    const bx = x + Math.cos(a) * len;
    const bz = z + Math.sin(a) * len;
    if (!open(x, z) || !open(bx, bz)) continue;
    const ya = heightAt(x, z);
    const yb = heightAt(bx, bz);
    const top = Math.max(ya, yb) + 6;
    // Two iron posts, and a heavy chain sagging between their tops.
    for (const [px, pz, py] of [[x, z, ya], [bx, bz, yb]]) {
      posts.push([0.5, top - py + 0.6, 0.5, px, (top + py) / 2 + 0.3, pz]);
      addCollider({ x: px, z: pz, r: 0.35 });
    }
    const links = Math.round(len / 0.4);
    for (let k = 0; k <= links; k++) {
      const t = k / links;
      const sag = Math.sin(t * Math.PI) * 2.2;
      chains.push([0.42, k % 2 ? 0.08 : 0.2, k % 2 ? 0.2 : 0.08, x + (bx - x) * t, top - sag, z + (bz - z) * t, -a]);
    }
  }

  const cr = p.scenery.crystals;
  for (let n = 0; cr && n < cr.count; n++) {
    const x = (rand() * 2 - 1) * (HALF - 14);
    const z = (rand() * 2 - 1) * (HALF - 14);
    if (!open(x, z)) continue;
    const y = heightAt(x, z);
    // A cluster of leaning shards.
    for (let k = 0; k < 3; k++) {
      const tall = 0.6 + rand() * 1.2;
      crystals.push([0.2, tall, 0.2, x + (rand() - 0.5) * 0.6, y + tall / 2 - 0.1, z + (rand() - 0.5) * 0.6, rand() * 3, (rand() - 0.5) * 0.6]);
    }
  }

  if (trunks.length) root.add(boxes(trunks, new THREE.MeshLambertMaterial({ color: trees!.color, flatShading: true })));
  if (moss.length) root.add(boxes(moss, new THREE.MeshLambertMaterial({ color: 0x5a6a20, flatShading: true })));
  if (bones.length) root.add(boxes(bones, new THREE.MeshLambertMaterial({ color: 0xd6cbb0, flatShading: true })));
  if (posts.length) root.add(boxes(posts, new THREE.MeshLambertMaterial({ color: 0x2a2424, flatShading: true })));
  if (chains.length) root.add(boxes(chains, new THREE.MeshLambertMaterial({ color: 0x4a4440, flatShading: true })));
  if (crystals.length) {
    const c = new THREE.Color(cr!.color);
    root.add(boxes(crystals, new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(0.5), flatShading: true })));
  }
}

/** Motes drifting through the air around the player: embers rising, ash falling, spores. */
function createEmbers(count: number, motes: PlaneDef['motes']) {
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
    new THREE.PointsMaterial({ color: motes.color, size: motes.size, transparent: true, opacity: 0.9, blending: motes.rise > 0 ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false }),
  );
  points.frustumCulled = false;
  let time = 0;
  const update = (dt: number, center: THREE.Vector3) => {
    time += dt;
    for (let i = 0; i < count; i++) {
      let x = positions[i * 3];
      let y = positions[i * 3 + 1] + speeds[i] * motes.rise * dt;
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

/** A vertical gradient for the sky: dark overhead, glowing at the horizon. */
function skyTexture(sky: PlaneDef['sky'], horizon: THREE.Color) {
  const canvas = document.createElement('canvas');
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(0.3, sky.upper);
  grad.addColorStop(0.47, sky.near);
  grad.addColorStop(0.5, `#${horizon.getHexString()}`);
  grad.addColorStop(1, sky.bottom);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export type World = ReturnType<typeof createWorld>;

/**
 * Builds the current plane (see setPlane in planes.ts): its ground, liquid,
 * scenery, lights and sky. Everything goes under `root`, so leaving the
 * plane is just removing root.
 */
export function createWorld(scene: THREE.Scene, root: THREE.Object3D) {
  const p = plane();
  const rand = mulberry32(p.seed + 1000);
  colliders = [];
  gates = [];
  generateTerrain();

  const horizon = new THREE.Color(p.sky.horizon);
  scene.background = skyTexture(p.sky, horizon);
  scene.fog = new THREE.Fog(horizon, p.fog[0], p.fog[1]);

  const hemi = new THREE.HemisphereLight(p.hemi[0], p.hemi[1], p.hemi[2]);
  root.add(hemi);
  const sun = new THREE.DirectionalLight(p.sun[0], p.sun[1]);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.04;
  root.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(-30, 60, 20);

  const terrain = buildTerrainMesh(rand);
  root.add(terrain);
  const lava = buildLavaMesh();
  root.add(lava.mesh);
  addScenery(root, rand);
  const embers = createEmbers(500, p.motes);
  root.add(embers.points);

  let time = 0;
  return {
    setShadows(on: boolean) {
      sun.castShadow = on;
    },
    /** Frees the big meshes' memory when leaving the plane. */
    dispose() {
      for (const m of [terrain, lava.mesh]) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
      lava.tex.dispose();
      sun.shadow.map?.dispose();
    },
    update(dt: number, center: THREE.Vector3) {
      time += dt;
      // The lava creeps along and its glow pulses slowly.
      lava.tex.offset.set(time * 0.035, time * 0.02);
      const pulse = p.liquid.brightness + Math.sin(time * 1.3) * 0.06 + Math.sin(time * 3.1) * 0.03;
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
