import * as THREE from 'three';
import { heightAt } from './world';

const MAX = 200;
/** Coins this close fly to you. */
const MAGNET = 5;
const COLLECT = 0.9;
/** Coins lie around this long before crumbling to ash. */
const LIFETIME = 90;

interface Coin {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  active: boolean;
  spin: number;
  /** Gold this coin is worth. */
  value: number;
}

/** Gold coins that burst out of fallen angels, bounce, and fly to you when you come near. */
export class Pickups {
  private readonly mesh: THREE.InstancedMesh;
  private readonly coins: Coin[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Called once per coin picked up. */
  onCollect?: (at: THREE.Vector3, value: number) => void;

  constructor(scene: THREE.Scene) {
    // Thick little square coins: blocky gold.
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.22, 0.22, 0.06),
      new THREE.MeshLambertMaterial({ color: 0xffc830, emissive: 0x6a4000, flatShading: true }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    for (let i = 0; i < MAX; i++) {
      this.coins.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), age: 0, active: false, spin: 0, value: 1 });
      this.mesh.setMatrixAt(i, this.zero);
    }
    scene.add(this.mesh);
  }

  /** Bursts `count` coins out of a point, each worth `value` gold. */
  spawnGold(at: THREE.Vector3, count: number, value = 1) {
    for (let n = 0; n < count; n++) {
      const c = this.coins[this.next];
      this.next = (this.next + 1) % MAX;
      c.pos.copy(at);
      const a = Math.random() * Math.PI * 2;
      const out = 1.5 + Math.random() * 2;
      c.vel.set(Math.cos(a) * out, 5 + Math.random() * 3, Math.sin(a) * out);
      c.age = 0;
      c.active = true;
      c.spin = Math.random() * 6;
      c.value = value;
    }
  }

  update(dt: number, player: THREE.Vector3) {
    for (let i = 0; i < MAX; i++) {
      const c = this.coins[i];
      if (!c.active) continue;
      c.age += dt;
      c.spin += dt * 4;
      const dx = player.x - c.pos.x;
      const dy = player.y + 1 - c.pos.y;
      const dz = player.z - c.pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (c.age > 0.5 && d < MAGNET) {
        // Pulled in, faster the closer it gets.
        const pull = 30 / Math.max(d, 0.5);
        c.vel.set((dx / d) * pull, (dy / d) * pull, (dz / d) * pull);
        c.pos.addScaledVector(c.vel, dt);
        if (d < COLLECT) {
          c.active = false;
          this.mesh.setMatrixAt(i, this.zero);
          this.onCollect?.(c.pos, c.value);
          continue;
        }
      } else {
        c.vel.y -= 20 * dt;
        c.pos.addScaledVector(c.vel, dt);
        const ground = heightAt(c.pos.x, c.pos.z) + 0.12;
        if (c.pos.y < ground) {
          c.pos.y = ground;
          c.vel.set(c.vel.x * 0.5, Math.abs(c.vel.y) > 2 ? -c.vel.y * 0.35 : 0, c.vel.z * 0.5);
          if (c.vel.y === 0) c.vel.set(0, 0, 0);
        }
      }
      if (c.age > LIFETIME) {
        c.active = false;
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      // Hover and spin once settled, so they catch the eye.
      const bob = c.vel.lengthSq() === 0 ? Math.sin(c.age * 3 + i) * 0.05 + 0.1 : 0;
      this.q.setFromEuler(this.e.set(0, c.spin, 0));
      this.m.compose(this.p.set(c.pos.x, c.pos.y + bob, c.pos.z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear() {
    for (let i = 0; i < MAX; i++) {
      this.coins[i].active = false;
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
