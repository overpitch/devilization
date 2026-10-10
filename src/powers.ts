import * as THREE from 'three';
import { groundAt, heightAt } from './world';
import { sfx, volumeAt } from './audio';
import type { GameContext } from './types';

// ---------- Fire breath ----------

const FLAME_COLORS = [0xff4a0a, 0xff7a1a, 0xffb030, 0xffe070];
const flamePush = new THREE.Vector3();
const toTarget = new THREE.Vector3();

export interface Breath {
  /** How far the flames reach, in meters. */
  range: number;
  /** Half-angle of the cone, in radians. */
  halfAngle: number;
  /** Damage per second to every angel in the cone. */
  dps: number;
  /** Flame particles per second. */
  rate: number;
}

/**
 * One frame of breathing fire from `origin` along `dir` (a unit vector):
 * a jet of flame particles, and damage to every angel inside the cone.
 * Angels keep burning for a while afterwards.
 */
export function breatheFire(origin: THREE.Vector3, dir: THREE.Vector3, b: Breath, dt: number, ctx: GameContext) {
  const speed = b.range * 2.4;
  const count = Math.max(1, Math.round(b.rate * dt + Math.random() - 0.5));
  for (let i = 0; i < count; i++) {
    flamePush.copy(dir).multiplyScalar(speed);
    const color = FLAME_COLORS[Math.floor(Math.random() * FLAME_COLORS.length)];
    ctx.fire.burst(origin, color, 1, speed * Math.tan(b.halfAngle) * 0.8, { push: flamePush, gravity: -4, life: 0.42, size: 0.3, spread: 0.08, grow: true });
  }
  const cos = Math.cos(b.halfAngle);
  for (const a of ctx.foes) {
    if (!a.alive) continue;
    toTarget.set(a.pos.x - origin.x, a.pos.y + 1.2 - origin.y, a.pos.z - origin.z);
    const d = toTarget.length();
    if (d > b.range + a.radius) continue;
    // Close enough counts even off-center: the flames billow around a body.
    if (d > 1.2 && toTarget.dot(dir) / d < cos) continue;
    a.burn(b.dps * dt, b.dps * 0.25, ctx);
  }
}

// ---------- Ground spikes ----------

/** Radius of the patch of ground the spikes burst from. */
export const SPIKE_RADIUS = 2;
const TELEGRAPH = 0.3;
const HOLD = 0.8;
const RETRACT = 0.3;
const PER_CAST = 11;
const POOL = PER_CAST * 6;

interface Spike {
  dx: number;
  dz: number;
  height: number;
  tilt: THREE.Quaternion;
}

interface Cast {
  x: number;
  z: number;
  t: number;
  damage: number;
  struck: boolean;
  spikes: Spike[];
  slot: number;
}

const m = new THREE.Matrix4();
const p = new THREE.Vector3();
const sc = new THREE.Vector3();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Obsidian spikes that burst out of the ground where you aim, impaling
 * every angel standing there. Also draws the aiming marker.
 */
export class Spikes {
  private readonly mesh: THREE.InstancedMesh;
  private readonly casts: Cast[] = [];
  private nextSlot = 0;
  /** One aiming marker per player. */
  private readonly markers: THREE.Group[] = [];
  private readonly markerMats: THREE.MeshBasicMaterial[] = [];
  private time = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.ConeGeometry(0.24, 1, 4);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0x3a2850, emissive: 0x6a1008, flatShading: true }), POOL);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    for (let i = 0; i < POOL; i++) this.mesh.setMatrixAt(i, ZERO);
    scene.add(this.mesh);

    // A square of glowing red on the ground, the size of the strike.
    const side = SPIKE_RADIUS * 2;
    const box = new THREE.BoxGeometry(1, 1, 1);
    for (let k = 0; k < 2; k++) {
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const marker = new THREE.Group();
    for (const [w, d, x, z] of [
      [side, 0.12, 0, SPIKE_RADIUS],
      [side, 0.12, 0, -SPIKE_RADIUS],
      [0.12, side, SPIKE_RADIUS, 0],
      [0.12, side, -SPIKE_RADIUS, 0],
      [0.5, 0.5, 0, 0],
    ]) {
      const edge = new THREE.Mesh(box, markerMat);
      edge.scale.set(w, 0.06, d);
      edge.position.set(x, 0.05, z);
      marker.add(edge);
    }
    marker.visible = false;
    scene.add(marker);
    this.markers.push(marker);
    this.markerMats.push(markerMat);
    }
  }

  /** Shows the aiming marker at a point (null hides it); grey when you can't cast yet. */
  aim(at: THREE.Vector3 | null, ready: boolean, slot = 0) {
    const marker = this.markers[slot];
    marker.visible = at !== null;
    if (!at) return;
    marker.position.set(at.x, heightAt(at.x, at.z), at.z);
    this.markerMats[slot].color.set(ready ? 0xff3010 : 0x605858);
    this.markerMats[slot].opacity = 0.55 + Math.sin(this.time * 10) * 0.25;
  }

  cast(at: THREE.Vector3, damage: number, ctx: GameContext) {
    const spikes: Spike[] = [];
    for (let i = 0; i < PER_CAST; i++) {
      // One tall spike in the middle, the rest leaning outward around it.
      const r = i === 0 ? 0 : 0.5 + Math.random() * (SPIKE_RADIUS - 0.6);
      const a = Math.random() * Math.PI * 2;
      const dx = Math.cos(a) * r;
      const dz = Math.sin(a) * r;
      const lean = (r / SPIKE_RADIUS) * 0.5;
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * lean, 0, -Math.cos(a) * lean));
      spikes.push({ dx, dz, height: i === 0 ? 2.6 : 1.2 + Math.random() * 1.1, tilt });
    }
    this.casts.push({ x: at.x, z: at.z, t: 0, damage, struck: false, spikes, slot: this.nextSlot });
    this.nextSlot = (this.nextSlot + 1) % (POOL / PER_CAST);
    sfx.spikeRumble(volumeAt(at.distanceTo(ctx.player.pos)));
  }

  update(dt: number, ctx: GameContext) {
    this.time += dt;
    for (let ci = this.casts.length - 1; ci >= 0; ci--) {
      const c = this.casts[ci];
      c.t += dt;
      const y = heightAt(c.x, c.z);
      if (c.t < TELEGRAPH) {
        // The ground cracks and glows.
        p.set(c.x + (Math.random() - 0.5) * 3, y + 0.1, c.z + (Math.random() - 0.5) * 3);
        ctx.fire.burst(p, 0xff4010, 1, 1.5, { gravity: -3, life: 0.4, size: 0.1 });
        ctx.debris.burst(p, 0x3a2a26, 1, 2, { size: 0.1 });
      } else if (!c.struck) {
        c.struck = true;
        this.strike(c, ctx);
      }
      // Burst up fast, hold, then sink back.
      const age = c.t - TELEGRAPH;
      let grow = 0;
      if (age > 0) grow = age < 0.08 ? age / 0.08 : age < HOLD ? 1 : Math.max(0, 1 - (age - HOLD) / RETRACT);
      c.spikes.forEach((s, i) => {
        const index = c.slot * PER_CAST + i;
        if (grow <= 0) {
          this.mesh.setMatrixAt(index, ZERO);
          return;
        }
        const gx = c.x + s.dx;
        const gz = c.z + s.dz;
        p.set(gx, groundAt(gx, gz, 0.1) - 0.2, gz);
        sc.set(1, s.height * grow, 1);
        m.compose(p, s.tilt, sc);
        this.mesh.setMatrixAt(index, m);
      });
      if (age > HOLD + RETRACT) this.casts.splice(ci, 1);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private strike(c: Cast, ctx: GameContext) {
    const y = heightAt(c.x, c.z);
    const dist = Math.hypot(c.x - ctx.player.pos.x, c.z - ctx.player.pos.z);
    sfx.spikes(volumeAt(dist));
    ctx.addShake(Math.max(0, 0.3 - dist * 0.015));
    p.set(c.x, y + 0.3, c.z);
    ctx.debris.burst(p, 0x3a2a26, 25, 6, { size: 0.16, spread: 1 });
    ctx.fire.burst(p, 0xff6a1a, 15, 5, { life: 0.4, size: 0.1, spread: 1 });
    for (const a of ctx.foes) {
      if (!a.alive) continue;
      if (Math.hypot(a.pos.x - c.x, a.pos.z - c.z) > SPIKE_RADIUS + a.radius) continue;
      if (Math.abs(a.pos.y - y) > 2.5) continue;
      a.impale(c.damage, HOLD, ctx);
    }
  }
}
