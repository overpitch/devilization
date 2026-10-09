import * as THREE from 'three';
import { createHumanoid, setFlash, type Humanoid } from './character';
import { addCollider, groundAt } from './world';
import { sfx, volumeAt } from './audio';
import { clamp } from './util';
import type { GameContext } from './types';

const MAX_HP = 70;
const RESPAWN_TIME = 5;
const WHITE = new THREE.Color(0xfff4d0);

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const box = new THREE.BoxGeometry(1, 1, 1);

/** Feathered wings on the angel's back: rows of white blocks, longest at the top. */
function addWings(h: Humanoid) {
  const feather = lambert(0xf4f0e6);
  const tip = lambert(0xd8d0bc);
  const wings: THREE.Group[] = [];
  for (const side of [1, -1]) {
    const wing = new THREE.Group();
    wing.position.set(0.12 * side, 0.5, -0.18);
    h.torso.add(wing);
    const rows = [
      { len: 1.0, y: 0.1, mat: feather },
      { len: 0.85, y: -0.12, mat: feather },
      { len: 0.65, y: -0.34, mat: tip },
    ];
    for (const r of rows) {
      const m = new THREE.Mesh(box, r.mat);
      m.scale.set(r.len, 0.22, 0.08);
      m.position.set((r.len / 2) * side, r.y, 0);
      m.castShadow = true;
      wing.add(m);
    }
    // Captured: the wings droop.
    wing.rotation.set(0.2, -0.5 * side, -0.55 * side);
    wings.push(wing);
  }
  return wings;
}

/**
 * A captured angel chained to a post on the training ground. It doesn't
 * fight back; destroyed angels return a few seconds later.
 */
export class Angel {
  readonly pos = new THREE.Vector3();
  readonly radius = 0.45;
  hp = MAX_HP;
  readonly maxHp = MAX_HP;
  alive = true;

  private readonly h: Humanoid;
  /** Leans the whole body when hit; its own yaw stays fixed. */
  private readonly tilt = new THREE.Group();
  private readonly wings: THREE.Group[];
  private readonly halo: THREE.Mesh;
  private readonly lean = new THREE.Vector2();
  private readonly leanVel = new THREE.Vector2();
  private flash = 0;
  private time = Math.random() * 10;
  private deadTime = 0;
  private readonly bar: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private sinceHit = 99;

  constructor(scene: THREE.Scene, x: number, z: number, facing: number, barLayer: HTMLElement) {
    this.pos.set(x, groundAt(x, z, 0.3), z);
    this.h = createHumanoid({ skin: 0xf2dcc4, shirt: 0xf0ece2, pants: 0xe4ddca, boots: 0xc9a24a, eyes: 0x7ac0ff, glowingEyes: true, belt: 0xc9a24a, armor: 0xd8c070 });
    this.h.root.rotation.y = facing;
    this.tilt.position.copy(this.pos);
    this.tilt.add(this.h.root);
    scene.add(this.tilt);
    this.wings = addWings(this.h);

    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 4, 12), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 0.62;
    this.h.head.add(this.halo);

    // The post behind the angel, with a crossbar the chains hang from.
    const bx = x - Math.sin(facing) * 0.7;
    const bz = z - Math.cos(facing) * 0.7;
    const post = new THREE.Group();
    post.position.set(bx, this.pos.y, bz);
    post.rotation.y = facing;
    const obsidian = lambert(0x241a32);
    const iron = lambert(0x2a2a30);
    const part = (mat: THREE.Material, w: number, hh: number, d: number, px: number, py: number, pz: number) => {
      const m = new THREE.Mesh(box, mat);
      m.scale.set(w, hh, d);
      m.position.set(px, py, pz);
      m.castShadow = true;
      m.receiveShadow = true;
      post.add(m);
    };
    part(obsidian, 0.35, 3, 0.35, 0, 1.5, 0);
    part(obsidian, 1.6, 0.3, 0.3, 0, 2.7, 0);
    // Chains from the crossbar ends down to the angel's wrists.
    for (const side of [1, -1]) {
      for (let i = 0; i < 5; i++) part(iron, i % 2 ? 0.04 : 0.08, 0.16, i % 2 ? 0.08 : 0.04, 0.72 * side - 0.05 * i * side, 2.5 - i * 0.15, 0.1 + i * 0.07);
    }
    scene.add(post);
    addCollider({ x: bx, z: bz, r: 0.3 });

    this.bar = document.createElement('div');
    this.bar.className = 'enemy-bar';
    this.barFill = document.createElement('div');
    this.bar.appendChild(this.barFill);
    barLayer.appendChild(this.bar);
  }

  takeHit(damage: number, dir: THREE.Vector3, knockback: number, ctx: GameContext) {
    if (!this.alive) return;
    this.hp -= damage;
    this.flash = 1;
    this.sinceHit = 0;
    // Chained up, so a hit only rocks the body back.
    this.leanVel.x += dir.x * (2 + knockback);
    this.leanVel.y += dir.z * (2 + knockback);
    const dist = this.pos.distanceTo(ctx.player.pos);
    const chest = new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z);
    ctx.debris.burst(chest, 0xf4f0e6, 6, 3, { dir, size: 0.08, gravity: 3, life: 1.2 });
    ctx.fire.burst(chest, 0xffe27a, 8, 4, { dir, life: 0.35, size: 0.06 });
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.deadTime = 0;
      sfx.angelDie(volumeAt(dist));
      ctx.fire.burst(chest, 0xfff4c0, 40, 5, { gravity: -3, life: 1.2, size: 0.12 });
      ctx.fire.burst(chest, 0xffd04a, 25, 7, { life: 0.6, size: 0.08 });
      ctx.debris.burst(chest, 0xf4f0e6, 30, 5, { gravity: 2, life: 2, size: 0.1 });
      ctx.addShake(0.15);
      ctx.onAngelKilled(this);
    } else {
      sfx.angelHurt(volumeAt(dist));
    }
  }

  update(dt: number, ctx: GameContext) {
    this.time += dt;
    this.sinceHit += dt;
    const root = this.h.root;
    if (!this.alive) {
      this.deadTime += dt;
      // Dissolve into light, then come back after a while.
      const fade = clamp(1 - this.deadTime / 0.4, 0, 1);
      root.scale.set(fade, fade, fade);
      root.visible = fade > 0;
      if (this.deadTime >= RESPAWN_TIME) this.respawn(ctx);
      return;
    }
    if (root.scale.x < 1) root.scale.setScalar(Math.min(1, root.scale.x + dt * 2.5));

    // The lean springs back upright.
    this.leanVel.x += (-this.lean.x * 60 - this.leanVel.x * 7) * dt;
    this.leanVel.y += (-this.lean.y * 60 - this.leanVel.y * 7) * dt;
    this.lean.x = clamp(this.lean.x + this.leanVel.x * dt, -0.6, 0.6);
    this.lean.y = clamp(this.lean.y + this.leanVel.y * dt, -0.6, 0.6);
    this.tilt.rotation.set(this.lean.y * 0.6, 0, -this.lean.x * 0.6);

    // Struggling against the chains.
    const t = this.time;
    const h = this.h;
    h.armL.rotation.set(-3.25 + Math.sin(t * 2.3) * 0.12, 0, 0.5 + Math.sin(t * 3.1) * 0.08);
    h.armR.rotation.set(-3.25 + Math.sin(t * 2.7 + 1) * 0.12, 0, -0.5 - Math.sin(t * 2.9) * 0.08);
    h.head.rotation.set(0.25 + Math.sin(t * 0.7) * 0.1, Math.sin(t * 0.5) * 0.4, 0);
    h.torso.rotation.x = Math.sin(t * 1.9) * 0.04;
    for (const [i, w] of this.wings.entries()) {
      const side = i === 0 ? 1 : -1;
      w.rotation.y = (-0.5 + Math.sin(t * 4 + i) * 0.06 + (this.sinceHit < 0.6 ? Math.sin(t * 30) * 0.2 : 0)) * side;
    }
    this.halo.position.y = 0.62 + Math.sin(t * 2) * 0.03;

    this.flash = Math.max(0, this.flash - dt * 5);
    // A faint holy glow, flaring white when hit.
    setFlash(h, WHITE, 0.12 + this.flash * 0.8);
  }

  private respawn(ctx: GameContext) {
    this.alive = true;
    this.hp = MAX_HP;
    this.h.root.visible = true;
    this.h.root.scale.setScalar(0.01);
    this.lean.set(0, 0);
    this.leanVel.set(0, 0);
    const chest = new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z);
    ctx.fire.burst(chest, 0xfff4c0, 30, 3, { gravity: -2, life: 0.8, size: 0.1, spread: 0.4 });
    sfx.angelAppear(volumeAt(this.pos.distanceTo(ctx.player.pos)));
  }

  /** Health bar floating over the angel once it has been hurt. */
  updateBar(camera: THREE.Camera) {
    const show = this.alive && this.hp < this.maxHp;
    if (!show) {
      this.bar.style.display = 'none';
      return;
    }
    const p = new THREE.Vector3(this.pos.x, this.pos.y + 2.55, this.pos.z).project(camera);
    if (p.z > 1) {
      this.bar.style.display = 'none';
      return;
    }
    this.bar.style.display = '';
    this.bar.style.transform = `translate(${(p.x * 0.5 + 0.5) * window.innerWidth}px, ${(-p.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%, -50%)`;
    this.barFill.style.width = `${(this.hp / this.maxHp) * 100}%`;
  }
}
