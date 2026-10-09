import * as THREE from 'three';
import { heightAt } from './world';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  /** Downward pull; negative makes it rise (fire, holy light). */
  gravity: number;
}

export interface BurstOptions {
  /** Pushes the whole burst in a direction. */
  dir?: THREE.Vector3;
  gravity?: number;
  /** Seconds each particle lives (randomized ±40%). */
  life?: number;
  size?: number;
  /** Spread of start positions around the origin, in meters. */
  spread?: number;
}

/**
 * Little flying cubes, all in one draw call. `glowing` particles ignore
 * lighting and add light (fire, sparks, holy light); the others are
 * solid (dust, debris, feathers).
 */
export class Particles {
  private readonly mesh: THREE.InstancedMesh;
  private readonly items: Particle[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(scene: THREE.Scene, glowing: boolean, private readonly max = 600) {
    const mat = glowing
      ? new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })
      : new THREE.MeshLambertMaterial();
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.frustumCulled = false;
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < max; i++) {
      this.items.push({ pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0, gravity: 16 });
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, this.c.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  burst(origin: THREE.Vector3, color: number, count: number, speed: number, opts: BurstOptions = {}) {
    const { dir, gravity = 16, life = 0.7, size = 0.1, spread = 0 } = opts;
    this.c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const p = this.items[i];
      p.pos.copy(origin);
      if (spread > 0) p.pos.add(this.s.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(spread * 2));
      p.vel.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      if (gravity > 0) p.vel.y += 2;
      if (dir) p.vel.addScaledVector(dir, speed * 0.6);
      p.maxLife = p.life = life * (0.6 + Math.random() * 0.8);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
      this.mesh.setColorAt(i, this.c);
    }
    this.mesh.instanceColor!.needsUpdate = true;
  }

  update(dt: number) {
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vel.y -= p.gravity * dt;
      if (p.gravity < 0) p.vel.multiplyScalar(1 - Math.min(1, dt * 1.5)); // rising particles slow down
      p.pos.addScaledVector(p.vel, dt);
      const ground = heightAt(p.pos.x, p.pos.z) + p.size / 2;
      if (p.pos.y < ground) {
        p.pos.y = ground;
        p.vel.set(p.vel.x * 0.5, -p.vel.y * 0.25, p.vel.z * 0.5);
      }
      const size = p.life > 0 ? p.size * Math.min(1, (p.life / p.maxLife) * 2) : 0;
      this.m.compose(p.pos, this.q, this.s.setScalar(size));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
