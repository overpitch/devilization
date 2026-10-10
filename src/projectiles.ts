import * as THREE from 'three';
import { heightAt } from './world';
import { sfx, volumeAt } from './audio';
import { buildWeaponMesh, type WeaponEnchant } from './weapons';
import type { Foe, GameContext, HellBody } from './types';

/** Heaven's: holy arrows and priests' bolts of light. Yours: burning arrows and javelins. */
export type ProjectileKind = 'arrow' | 'bolt' | 'hellArrow' | 'javelin';

interface Projectile {
  kind: ProjectileKind;
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  damage: number;
  life: number;
  gravity: number;
  /** Bolts curve gently toward this. */
  homing: HellBody | null;
  /** Your shots: what happens to the angel they hit. */
  onHit: ((foe: Foe, dir: THREE.Vector3) => void) | null;
}

const arrowGeo = new THREE.BoxGeometry(0.05, 0.05, 0.9);
const boltGeo = new THREE.BoxGeometry(0.28, 0.28, 0.28);
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const hellArrowMat = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
const boltMat = new THREE.MeshBasicMaterial({ color: 0xfff8d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const Z = new THREE.Vector3(0, 0, 1);
const tmp = new THREE.Vector3();

export class Projectiles {
  private readonly items: Projectile[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  /** An angel shoots from `from` toward `at`. Fire can't hurt you; these can. */
  fire(kind: 'arrow' | 'bolt', from: THREE.Vector3, at: THREE.Vector3, damage: number, target: HellBody | null) {
    const speed = kind === 'arrow' ? 30 : 13;
    const vel = tmp.subVectors(at, from);
    const dist = vel.length();
    vel.normalize().multiplyScalar(speed);
    // Arrows arc a little, so aim slightly up.
    if (kind === 'arrow') vel.y += (dist / speed) * 3;
    const mesh = new THREE.Mesh(kind === 'arrow' ? arrowGeo : boltGeo, kind === 'arrow' ? arrowMat : boltMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.items.push({ kind, mesh, vel: vel.clone(), damage, life: 4, gravity: kind === 'arrow' ? 6 : 0, homing: kind === 'bolt' ? target : null, onHit: null });
  }

  /** You shoot along `dir` (a unit vector). `onHit` deals the damage and any enchantment. */
  shoot(kind: 'hellArrow' | 'javelin', from: THREE.Vector3, dir: THREE.Vector3, enchant: WeaponEnchant | undefined, onHit: (foe: Foe, dir: THREE.Vector3) => void) {
    const speed = kind === 'hellArrow' ? 55 : 32;
    let mesh: THREE.Object3D;
    if (kind === 'javelin') mesh = buildWeaponMesh('javelin', enchant);
    else mesh = new THREE.Mesh(arrowGeo, hellArrowMat);
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.items.push({ kind, mesh, vel: dir.clone().multiplyScalar(speed), damage: 0, life: 3, gravity: kind === 'hellArrow' ? 4 : 11, homing: null, onHit });
  }

  update(dt: number, ctx: GameContext) {
    const targets: HellBody[] = [ctx.player, ctx.dog];
    for (const f of ctx.fighters) if (f.side === 'hell' && f.alive) targets.push(f);
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life -= dt;
      const pos = p.mesh.position;
      if (p.kind === 'bolt') {
        if (p.homing?.alive) {
          tmp.set(p.homing.pos.x - pos.x, p.homing.pos.y + 1.2 - pos.y, p.homing.pos.z - pos.z).normalize().multiplyScalar(13);
          p.vel.lerp(tmp, Math.min(1, dt * 1.5));
        }
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;
        if (Math.random() < dt * 30) ctx.fire.burst(pos, 0xfff0a0, 1, 0.5, { gravity: 0, life: 0.3, size: 0.08 });
      } else {
        p.vel.y -= p.gravity * dt;
        p.mesh.quaternion.setFromUnitVectors(Z, tmp.copy(p.vel).normalize());
        if (p.kind === 'hellArrow' && Math.random() < dt * 40) ctx.fire.burst(pos, 0xff6a10, 1, 0.3, { gravity: -1, life: 0.25, size: 0.07 });
      }
      pos.addScaledVector(p.vel, dt);

      let hit = false;
      if (p.onHit) {
        // Your shots hit heaven's side.
        for (const f of ctx.foes) {
          if (!f.alive) continue;
          const dx = pos.x - f.pos.x;
          const dz = pos.z - f.pos.z;
          const dy = pos.y - f.pos.y;
          if (dx * dx + dz * dz < (f.radius + 0.3) ** 2 && dy > -0.2 && dy < 2.4) {
            p.onHit(f, tmp.copy(p.vel).setY(0).normalize());
            hit = true;
            break;
          }
        }
      } else {
        for (const t of targets) {
          if (!t.alive) continue;
          const dx = pos.x - t.pos.x;
          const dz = pos.z - t.pos.z;
          const dy = pos.y - t.pos.y;
          if (dx * dx + dz * dz < (t.radius + 0.25) ** 2 && dy > 0 && dy < 2.1) {
            t.takeDamage(p.damage, ctx, { holy: true });
            hit = true;
            break;
          }
        }
      }
      const ground = !hit && pos.y < heightAt(pos.x, pos.z);
      if (hit || ground || p.life <= 0) {
        const vol = volumeAt(pos.distanceTo(ctx.player.pos));
        if (p.onHit) {
          ctx.fire.burst(pos, 0xff6a10, hit ? 10 : 6, 3, { life: 0.3, size: 0.07 });
          if (ground) {
            ctx.debris.burst(pos, 0x4a2a22, 6, 3, { size: 0.08 });
            sfx.thud(vol * 0.5);
          }
        } else if (hit || ground) {
          ctx.fire.burst(pos, 0xfff2b0, 8, 3, { life: 0.3, size: 0.06 });
          sfx.holyImpact(vol);
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
