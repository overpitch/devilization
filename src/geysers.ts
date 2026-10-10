import * as THREE from 'three';
import { heightAt, planeGeysers } from './world';
import { plane } from './planes';
import { sfx, volumeAt } from './audio';
import type { GameContext } from './types';

const WARN_TIME = 1.4;
const ERUPT_TIME = 2.2;
/** Bodies within this distance of a vent get blasted. */
const BLAST_RADIUS = 1.5;
const COLUMN_HEIGHT = 10;
/** Holy flesh burns; demons are only thrown into the air. */
const ANGEL_DAMAGE = 40;
/** Upward speed a blast gives you: enough to land on a high ledge. */
export const LAUNCH_SPEED = 15;

type Phase = 'idle' | 'warn' | 'erupt';

interface Geyser {
  x: number;
  z: number;
  /** Height of the vent floor. */
  y: number;
  phase: Phase;
  timer: number;
  column: THREE.Group;
  /** Who this eruption has already burned, and thrown into the air. */
  hit: Set<object>;
  thrown: Set<object>;
}

const columnMat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const columnGeo = new THREE.BoxGeometry(1, 1, 1);

/** Vents in the ground that rumble, then shoot a pillar of fire high into the air. */
export class Geysers {
  readonly items: Geyser[] = [];
  private readonly tmp = new THREE.Vector3();

  /** Builds the current plane's geysers under `scene` (the plane's root). */
  constructor(scene: THREE.Object3D) {
    const columnMats = plane().geyserColors.map(columnMat);
    for (const g of planeGeysers()) {
      const column = new THREE.Group();
      column.position.set(g.x, heightAt(g.x, g.z), g.z);
      // Nested boxes: a white-hot core inside orange flame.
      columnMats.forEach((mat, i) => {
        const box = new THREE.Mesh(columnGeo, mat);
        const w = 1.5 - i * 0.4;
        box.scale.set(w, 1, w);
        box.position.y = 0.5;
        column.add(box);
      });
      column.visible = false;
      scene.add(column);
      this.items.push({ x: g.x, z: g.z, y: heightAt(g.x, g.z), phase: 'idle', timer: 1 + Math.random() * 8, column, hit: new Set(), thrown: new Set() });
    }
  }

  update(dt: number, ctx: GameContext) {
    const player = ctx.player.pos;
    for (const g of this.items) {
      g.timer -= dt;
      const dist = Math.hypot(player.x - g.x, player.z - g.z);
      const vent = this.tmp.set(g.x, g.y + 0.3, g.z);
      if (g.phase === 'idle') {
        // A wisp of smoke now and then.
        if (Math.random() < dt * 2 && dist < 60) ctx.debris.burst(vent, 0x2a2222, 1, 0.6, { gravity: -2, life: 1.6, size: 0.25 });
        if (g.timer <= 0) {
          g.phase = 'warn';
          g.timer = WARN_TIME;
          sfx.geyserWarn(volumeAt(dist));
        }
      } else if (g.phase === 'warn') {
        if (dist < 70) {
          ctx.debris.burst(vent, 0x3a2e2a, 2, 1.5, { gravity: -3, life: 1.2, size: 0.3, spread: 0.3 });
          ctx.fire.burst(vent, 0xff7a1a, 1, 2, { gravity: -2, life: 0.5, size: 0.12, spread: 0.4 });
        }
        if (g.timer <= 0) {
          g.phase = 'erupt';
          g.timer = ERUPT_TIME;
          g.hit.clear();
          g.thrown.clear();
          g.column.visible = true;
          sfx.geyser(volumeAt(dist));
          if (dist < 12) ctx.addShake(0.35 * (1 - dist / 12));
        }
      } else {
        const t = 1 - g.timer / ERUPT_TIME;
        // Shoot up fast, roar, then sink back down.
        const rise = Math.min(1, t * 6);
        const fall = t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
        const height = COLUMN_HEIGHT * rise * fall;
        g.column.children.forEach((box, i) => {
          const flicker = 1 + Math.sin(performance.now() * 0.03 + i * 2) * 0.12;
          const w = (1.5 - i * 0.4) * flicker * (0.6 + fall * 0.4);
          box.scale.set(w, height * (1 - i * 0.08), w);
          box.position.y = (height * (1 - i * 0.08)) / 2;
        });
        if (dist < 70) {
          const top = this.tmp.set(g.x, g.y + height * Math.random(), g.z);
          ctx.fire.burst(top, Math.random() < 0.5 ? 0xff6a10 : 0xffc040, 3, 4, { gravity: -6, life: 0.6, size: 0.25, spread: 0.5 });
        }
        if (t < 0.75) this.blast(g, g.y + height, ctx);
        if (g.timer <= 0) {
          g.phase = 'idle';
          g.timer = 4 + Math.random() * 6;
          g.column.visible = false;
        }
      }
    }
  }

  /** Throws demons standing in the column of fire into the air, and burns angels. */
  private blast(g: Geyser, top: number, ctx: GameContext) {
    const inColumn = (p: THREE.Vector3) => Math.hypot(p.x - g.x, p.z - g.z) < BLAST_RADIUS && p.y < top && p.y > g.y - 1;
    const { player, dog } = ctx;
    if (player.alive && !g.hit.has(player) && inColumn(player.pos)) {
      g.hit.add(player);
      player.launch(LAUNCH_SPEED, ctx);
    }
    if (!g.hit.has(dog) && inColumn(dog.pos)) {
      g.hit.add(dog);
      dog.launch(LAUNCH_SPEED);
    }
    for (const a of ctx.foes) {
      if (a.alive && !g.hit.has(a) && inColumn(a.pos)) {
        g.hit.add(a);
        a.takeHit(ANGEL_DAMAGE, new THREE.Vector3(0, 1, 0), 0, ctx);
      }
    }
    // Everyone on foot gets thrown up; only angels get burned.
    for (const f of ctx.fighters) {
      if (f.alive && !g.thrown.has(f) && inColumn(f.pos)) {
        g.thrown.add(f);
        f.launch(LAUNCH_SPEED * 0.8);
      }
    }
  }
}
