import * as THREE from 'three';
import { heightAt } from './world';
import { sfx, volumeAt } from './audio';
import type { GameContext, HellBody } from './types';

export type ProjectileKind = 'arrow' | 'bolt';

interface Projectile {
  kind: ProjectileKind;
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  /** Bolts curve gently toward this. */
  homing: HellBody | null;
}

const arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.9);
const boltGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const boltMat = new THREE.MeshBasicMaterial({ color: 0xfff8d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const Z = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3();

/** Holy arrows from archers and bolts of light from priests. Fire can't hurt you; these can. */
export class Projectiles {
  private readonly items: Projectile[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** Fires from `from` toward `at` (with a little lead for moving targets). */
  fire(kind: ProjectileKind, from: THREE.Vector3, at: THREE.Vector3, damage: number, target: HellBody | null) {
    const speed = kind === 'arrow' ? 30 : 13;
    const vel = tmp.subVectors(at, from);
    const dist = vel.length();
    vel.normalize().multiplyScalar(speed);
    // Arrows arc a little, so aim slightly up.
    if (kind === 'arrow') vel.y += (dist / speed) * 3;
    const mesh = new THREE.Mesh(kind === 'arrow' ? arrowGeo : boltGeo, kind === 'arrow' ? arrowMat : boltMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.items.push({ kind, mesh, vel: vel.clone(), damage, life: 4, homing: kind === 'bolt' ? target : null });
  }

  update(dt: number, ctx: GameContext) {
    const targets: HellBody[] = [ctx.player, ctx.dog];
    for (const f of ctx.fighters) if (f.side === 'hell' && f.alive) targets.push(f);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      const pos = p.mesh.position;
      if (p.kind === 'arrow') {
        p.vel.y -= 6 * dt;
        p.mesh.quaternion.setFromUnitVectors(Z, tmp.copy(p.vel).normalize());
      } else {
        if (p.homing?.alive) {
          tmp.set(p.homing.pos.x - pos.x, p.homing.pos.y + 1.2 - pos.y, p.homing.pos.z - pos.z).normalize().multiplyScalar(13);
          p.vel.lerp(tmp, Math.min(1, dt * 1.5));
        }
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
        if (Math.random() < dt * 30) ctx.fire.burst(pos, 0xfff0a0, 1, 0.5, { gravity: 0, life: 0.3, size: 0.08 });
      }
      pos.addScaledVector(p.vel, dt);

      let hit = false;
      for (const t of targets) {
        if (!t.alive) continue;
        const dx = pos.x - t.pos.x;
        const dz = pos.z - t.pos.z;
        const dy = pos.y - t.pos.y;
        if (dx * dx + dz * dz < (t.radius + 0.25) ** 2 && dy > 0 && dy < 2.1) {
          t.takeDamage(p.damage, ctx);
          hit = true;
          break;
        }
      }
      if (!hit && pos.y < heightAt(pos.x, pos.z)) hit = true;
      if (hit || p.life <= 0) {
        if (hit) {
          ctx.fire.burst(pos, 0xfff2b0, 8, 3, { life: 0.3, size: 0.06 });
          sfx.holyImpact(volumeAt(pos.distanceTo(ctx.player.pos)));
        }
        this.scene.remove(p.mesh);
        this.items.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.items) this.scene.remove(p.mesh);
    this.items.length = 0;
  }
}
