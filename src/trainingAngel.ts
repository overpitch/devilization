import * as THREE from 'three';
import { createHumanoid, setFlash, type Humanoid } from './character';
import { addCollider, groundAt } from './world';
import { sfx, volumeAt } from './audio';
import { clamp } from './util';
import type { Foe, GameContext } from './types';

const MAX_HP = 70;
const RESPAWN_TIME = 5;
/** Seconds an angel keeps burning after the flames stop touching it. */
const BURN_TIME = 2.5;
/** How often burn damage shows as a floating number. */
const BURN_NUMBER_EVERY = 0.35;
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
    // Dazed: the wings hang folded.
    wing.rotation.set(0.15, -0.25 * side, -0.7 * side);
    wings.push(wing);
  }
  return wings;
}

/**
 * A captured angel standing dazed on the training ground: arms limp, head
 * bowed. It doesn't fight back or react; destroyed angels return a few
 * seconds later.
 */
export class TrainingAngel implements Foe {
  readonly pos = new THREE.Vector3();
  readonly radius = 0.45;
  hp = MAX_HP;
  readonly maxHp = MAX_HP;
  alive = true;

  private readonly h: Humanoid;
  /** Leans the whole body when hit; its own yaw stays fixed. */
  private readonly tilt = new THREE.Group();
  private readonly halo: THREE.Mesh;
  private readonly lean = new THREE.Vector2();
  private readonly leanVel = new THREE.Vector2();
  private flash = 0;
  private deadTime = 0;
  private readonly bar: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private burnTime = 0;
  private burnDps = 0;
  /** Burn damage not yet shown as a number. */
  private burnShown = 0;
  private burnNumberTimer = 0;
  /** Seconds left stuck on ground spikes. */
  private impaled = 0;
  private hurtSoundTimer = 0;
  private struggle = Math.random() * 10;

  constructor(scene: THREE.Scene, x: number, z: number, facing: number, barLayer: HTMLElement) {
    this.pos.set(x, groundAt(x, z, 0.3), z);
    this.h = createHumanoid({ skin: 0xf2dcc4, shirt: 0xf0ece2, pants: 0xe4ddca, boots: 0xc9a24a, eyes: 0x7ac0ff, glowingEyes: true, belt: 0xc9a24a, armor: 0xd8c070 });
    this.h.root.rotation.y = facing;
    this.tilt.position.copy(this.pos);
    this.tilt.add(this.h.root);
    scene.add(this.tilt);
    addWings(this.h);

    this.halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 4, 12), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
    this.halo.rotation.x = Math.PI / 2;
    this.halo.position.y = 0.62;
    this.h.head.add(this.halo);

    // Solid, so you can't walk through it.
    addCollider({ x, z, r: 0.35 });

    this.bar = document.createElement('div');
    this.bar.className = 'enemy-bar';
    this.barFill = document.createElement('div');
    this.bar.appendChild(this.barFill);
    barLayer.appendChild(this.bar);
  }

  /** A blow from a weapon, horns or teeth. The attacker shows the damage number. */
  takeHit(damage: number, dir: THREE.Vector3, knockback: number, ctx: GameContext) {
    if (!this.alive) return;
    this.flash = 1;
    // Chained up, so a hit only rocks the body back.
    this.leanVel.x += dir.x * (2 + knockback);
    this.leanVel.y += dir.z * (2 + knockback);
    const chest = this.chest();
    ctx.debris.burst(chest, 0xf4f0e6, 6, 3, { dir, size: 0.08, gravity: 3, life: 1.2 });
    ctx.fire.burst(chest, 0xffe27a, 8, 4, { dir, life: 0.35, size: 0.06 });
    this.damage(damage, ctx, false);
  }

  /** Fire: `amount` now, and the angel keeps burning at `afterDps` for a while. */
  burn(amount: number, afterDps: number, ctx: GameContext) {
    if (!this.alive) return;
    this.burnTime = BURN_TIME;
    this.burnDps = Math.max(this.burnDps, afterDps);
    this.burnShown += amount;
    this.flash = Math.max(this.flash, 0.35);
    this.damage(amount, ctx, true);
  }

  /** Run through by ground spikes: lifted up and held there, struggling. */
  impale(damage: number, seconds: number, ctx: GameContext) {
    if (!this.alive) return;
    this.impaled = seconds;
    this.flash = 1;
    const chest = this.chest();
    ctx.floatText(chest.clone().setY(chest.y + 1), String(Math.round(damage)), 'heavy');
    ctx.fire.burst(chest, 0xffe27a, 20, 5, { life: 0.5, size: 0.08 });
    ctx.debris.burst(chest, 0xf4f0e6, 15, 4, { gravity: 3, life: 1.5, size: 0.1 });
    this.damage(damage, ctx, false);
  }

  /** Chained up facing you: it always sees you coming. */
  canAssassinate() {
    return false;
  }

  assassinate() {}

  /** Every angel is worth 10 gold; training angels give only a little XP. */
  readonly reward = { xp: 10, gold: 10, drop: null };

  private chest() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.3, this.pos.z);
  }

  private damage(amount: number, ctx: GameContext, quiet: boolean) {
    this.hp -= amount;
    const dist = this.pos.distanceTo(ctx.player.pos);
    if (this.hp <= 0) {
      this.die(ctx, dist);
    } else if (!quiet || this.hurtSoundTimer <= 0) {
      sfx.angelHurt(volumeAt(dist));
      this.hurtSoundTimer = 0.6;
    }
  }

  private die(ctx: GameContext, dist: number) {
    this.hp = 0;
    this.alive = false;
    this.deadTime = 0;
    this.burnTime = 0;
    this.impaled = 0;
    this.flushBurnNumber(ctx);
    const chest = this.chest();
    sfx.angelDie(volumeAt(dist));
    ctx.fire.burst(chest, 0xfff4c0, 40, 5, { gravity: -3, life: 1.2, size: 0.12 });
    ctx.fire.burst(chest, 0xffd04a, 25, 7, { life: 0.6, size: 0.08 });
    ctx.debris.burst(chest, 0xf4f0e6, 30, 5, { gravity: 2, life: 2, size: 0.1 });
    ctx.addShake(0.15);
    ctx.onFoeKilled(this);
  }

  private flushBurnNumber(ctx: GameContext) {
    if (this.burnShown >= 1) {
      const at = this.chest();
      at.y += 1;
      ctx.floatText(at, String(Math.round(this.burnShown)), 'burn');
    }
    this.burnShown = 0;
    this.burnNumberTimer = 0;
  }

  update(dt: number, ctx: GameContext) {
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
    this.hurtSoundTimer -= dt;

    // Burning: flames lick up the body and the damage keeps ticking.
    if (this.burnTime > 0) {
      this.burnTime -= dt;
      if (Math.random() < dt * 25) {
        const at = this.chest();
        at.y += (Math.random() - 0.6) * 1.4;
        ctx.fire.burst(at, Math.random() < 0.5 ? 0xff6a10 : 0xffb030, 1, 1, { gravity: -5, life: 0.5, size: 0.2, spread: 0.25 });
      }
      this.burnShown += this.burnDps * dt;
      this.damage(this.burnDps * dt, ctx, true);
      if (!this.alive) return;
      if (this.burnTime <= 0) this.burnDps = 0;
    }
    this.burnNumberTimer += dt;
    if (this.burnNumberTimer >= BURN_NUMBER_EVERY) this.flushBurnNumber(ctx);

    // Impaled: lifted off the ground until the spikes sink back.
    const lift = this.impaled > 0 ? Math.min(0.6, this.impaled * 3) : 0;
    this.impaled = Math.max(0, this.impaled - dt);
    this.tilt.position.y += (this.pos.y + lift - this.tilt.position.y) * Math.min(1, dt * 20);

    // The lean springs back upright.
    this.leanVel.x += (-this.lean.x * 60 - this.leanVel.x * 7) * dt;
    this.leanVel.y += (-this.lean.y * 60 - this.leanVel.y * 7) * dt;
    this.lean.x = clamp(this.lean.x + this.leanVel.x * dt, -0.6, 0.6);
    this.lean.y = clamp(this.lean.y + this.leanVel.y * dt, -0.6, 0.6);
    this.tilt.rotation.set(this.lean.y * 0.6, 0, -this.lean.x * 0.6);

    // Dazed and unresponsive: arms limp, head bowed, only slow breathing.
    this.struggle += dt;
    const t = this.struggle;
    const h = this.h;
    h.armL.rotation.set(0.05, 0, 0.06);
    h.armR.rotation.set(0.05, 0, -0.06);
    h.head.rotation.set(0.45, 0.15, 0);
    h.torso.rotation.x = 0.12 + Math.sin(t * 1.1) * 0.015;
    this.halo.position.y = 0.6;

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
    this.tilt.position.y = this.pos.y;
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
