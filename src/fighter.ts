import * as THREE from 'three';
import { createHumanoid, HIPS_HEIGHT, setFlash, type Humanoid, type HumanoidLook } from './character';
import { buildWeaponMesh, randomWeaponEnchant, rollQuality, type Quality, type Weapon, type WeaponId, type WeaponModel } from './weapons';
import { groundAt, heightAt, isLava, LAVA_Y, moveBody } from './world';
import { sfx, volumeAt } from './audio';
import { dampAngle, wrapAngle } from './util';
import type { Foe, GameContext, HellBody } from './types';

/**
 * Everyone who fights on foot: heaven's angels (and the demons who sold out
 * to them), and the imps who fight for hell in war-front missions.
 */

export type Side = 'heaven' | 'hell';
export type FighterKind = 'footsoldier' | 'archer' | 'priest' | 'officer' | 'traitor' | 'imp';

interface KindDef {
  side: Side;
  name: string;
  hp: number;
  speed: number;
  radius: number;
  scale: number;
  attack: 'melee' | 'bow' | 'priest';
  damage: number;
  /** Melee: how far past the two bodies' edges a blow reaches. */
  reach: number;
  windup: number;
  recover: number;
  cooldown: number;
  /** Ranged fighters try to stay about this far away. */
  keepAway: number;
  /** How far it can see you when you're not sneaking. */
  sight: number;
  xp: number;
  gold: number;
  drop?: { id: WeaponId; chance: number; minQuality?: Quality; enchantChance?: number };
  look: HumanoidLook;
  weapon: WeaponModel | null;
  shield?: boolean;
  wings?: boolean;
  halo?: number;
  horns?: number;
  cape?: number;
}

/** Every angel is worth the same gold: 10. */
const ANGEL_GOLD = 10;

const ANGEL_SKIN = 0xf2dcc4;
const KINDS: Record<FighterKind, KindDef> = {
  footsoldier: {
    side: 'heaven', name: 'Angel footsoldier', hp: 55, speed: 4.2, radius: 0.45, scale: 1,
    attack: 'melee', damage: 8, reach: 1.2, windup: 0.55, recover: 0.4, cooldown: 1.3, keepAway: 0, sight: 22,
    xp: 15, gold: ANGEL_GOLD, drop: { id: 'sword', chance: 0.4 },
    look: { skin: ANGEL_SKIN, shirt: 0xc8ccd8, pants: 0xe4ddca, boots: 0x9a9aa8, eyes: 0x7ac0ff, glowingEyes: true, belt: 0xc9a24a, armor: 0xb8bcc8 },
    weapon: 'sword', shield: true, wings: true, halo: 0xffe27a,
  },
  archer: {
    side: 'heaven', name: 'Angel archer', hp: 40, speed: 4.6, radius: 0.42, scale: 0.95,
    attack: 'bow', damage: 7, reach: 0, windup: 0.9, recover: 0.3, cooldown: 1.9, keepAway: 12, sight: 26,
    xp: 18, gold: ANGEL_GOLD, drop: { id: 'bow', chance: 0.3 },
    look: { skin: ANGEL_SKIN, shirt: 0xe8f0e0, pants: 0xd8d0b8, boots: 0xb08a50, eyes: 0x7ac0ff, glowingEyes: true, belt: 0x8a6a3a },
    weapon: 'bow', wings: true, halo: 0xffe27a,
  },
  priest: {
    side: 'heaven', name: 'Angel priest', hp: 45, speed: 3.8, radius: 0.42, scale: 1,
    attack: 'priest', damage: 5, reach: 0, windup: 1.0, recover: 0.4, cooldown: 2.6, keepAway: 9, sight: 22,
    xp: 22, gold: ANGEL_GOLD,
    look: { skin: ANGEL_SKIN, shirt: 0xfaf6ea, pants: 0xfaf6ea, boots: 0xd9b24a, eyes: 0xffe27a, glowingEyes: true, belt: 0xd9b24a },
    weapon: 'staff', wings: true, halo: 0xfff4c0,
  },
  officer: {
    side: 'heaven', name: 'Angel captain', hp: 160, speed: 4.6, radius: 0.5, scale: 1.15,
    attack: 'melee', damage: 15, reach: 1.6, windup: 0.6, recover: 0.5, cooldown: 1.0, keepAway: 0, sight: 24,
    xp: 60, gold: ANGEL_GOLD, drop: { id: 'spear', chance: 1, minQuality: 1, enchantChance: 0.2 },
    look: { skin: ANGEL_SKIN, shirt: 0xd9b24a, pants: 0xe4ddca, boots: 0xd9b24a, eyes: 0x7ac0ff, glowingEyes: true, belt: 0x3050c0, armor: 0xe0c060, plume: 0x3050c0 },
    weapon: 'spear', wings: true, halo: 0xffe27a, cape: 0x3050c0,
  },
  traitor: {
    side: 'heaven', name: 'Vargash the Traitor', hp: 260, speed: 4.8, radius: 0.55, scale: 1.25,
    attack: 'melee', damage: 16, reach: 1.6, windup: 0.65, recover: 0.5, cooldown: 1.0, keepAway: 0, sight: 22,
    xp: 100, gold: 30, drop: { id: 'axe', chance: 1, minQuality: 2 },
    look: { skin: 0x8a2018, shirt: 0x2a2228, pants: 0x1a1418, boots: 0x101010, eyes: 0xfff2b0, glowingEyes: true, belt: 0xd9b24a, armor: 0x2a2228 },
    weapon: 'axe', horns: 0x1a1210, cape: 0xf0ece2, halo: 0xb8a060,
  },
  imp: {
    side: 'hell', name: 'Imp', hp: 80, speed: 5, radius: 0.38, scale: 0.8,
    attack: 'melee', damage: 11, reach: 1.3, windup: 0.4, recover: 0.35, cooldown: 1.0, keepAway: 0, sight: 30,
    xp: 0, gold: 0,
    look: { skin: 0xa8281c, shirt: 0x5a1a12, pants: 0x3a0e0a, boots: 0x1a0c0a, eyes: 0xffd040, glowingEyes: true, belt: 0x1a0c0a },
    weapon: 'spear', horns: 0x2a1a14,
  },
};

type State = 'guard' | 'alert' | 'dead';
type Action = 'none' | 'windup' | 'recover';

const BURN_TIME = 2.5;
/** Gives up the chase this far from home. */
const LEASH = 55;
const FLASH_HIT = new THREE.Color(0xffffff);
const FLASH_TELL = new THREE.Color(0xffc040);
const tmp = new THREE.Vector3();
const box = new THREE.BoxGeometry(1, 1, 1);
const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

export interface SpawnOptions {
  /** Walks between these points while on guard. */
  patrol?: THREE.Vector3[];
  /** Which way it faces while standing guard. */
  facing?: number;
  /** Shown over its head (mission targets). */
  label?: string;
  /** Starts already hunting you (war-front waves). */
  alert?: boolean;
  /** Where it heads once alert, if nobody is in sight (an attack wave's objective). */
  goal?: THREE.Vector3;
  /** Deeper planes' angels are stronger: health and XP times this, damage a little less. */
  power?: number;
}

export class Fighter implements Foe, HellBody {
  readonly def: KindDef;
  /** How much harder this fighter hits than its kind's base (deeper planes). */
  private readonly damageMult: number;
  private readonly power: number;
  readonly side: Side;
  readonly pos = new THREE.Vector3();
  readonly radius: number;
  hp: number;
  readonly maxHp: number;
  alive = true;
  /** Fully faded away: can be removed from the world. */
  gone = false;
  yaw = 0;
  state: State = 'guard';
  /** Became alert at some point (missions check this for the "unseen" bonus). */
  everAlerted = false;
  /** Killed silently from behind. */
  assassinated = false;
  /** 0..1: how sure it is that it saw you. */
  suspicion = 0;
  readonly label: string | null;

  private readonly h: Humanoid;
  private readonly root = new THREE.Group();
  private readonly wings: THREE.Group[] = [];
  private action: Action = 'none';
  private actionTime = 0;
  private cooldown = Math.random();
  private target: HellBody | null = null;
  private retarget = 0;
  private readonly home = new THREE.Vector3();
  private readonly goal: THREE.Vector3 | null;
  private readonly patrol: THREE.Vector3[] | null;
  private patrolIndex = 0;
  private wait = 0;
  private readonly guardYaw: number;
  private readonly kb = new THREE.Vector3();
  private vy = 0;
  private airborne = false;
  private gait = 0;
  private moving = 0;
  private flash = 0;
  private burnTime = 0;
  private burnDps = 0;
  private burnShown = 0;
  private burnNumberTimer = 0;
  private impaled = 0;
  private deadTime = 0;
  private hurtSoundTimer = 0;
  private alertShown = 0;
  private readonly bar: HTMLDivElement;
  private readonly barFill: HTMLDivElement;
  private readonly mark: HTMLDivElement;
  private readonly dropRoll = Math.random();

  constructor(
    private readonly scene: THREE.Object3D,
    readonly kind: FighterKind,
    x: number,
    z: number,
    barLayer: HTMLElement,
    opts: SpawnOptions = {},
  ) {
    const def = (this.def = KINDS[kind]);
    this.side = def.side;
    this.radius = def.radius;
    this.power = opts.power ?? 1;
    this.damageMult = 1 + (this.power - 1) * 0.75;
    this.hp = this.maxHp = Math.round(def.hp * this.power);
    this.label = opts.label ?? null;
    this.pos.set(x, groundAt(x, z, 0.3), z);
    this.home.copy(this.pos);
    this.patrol = opts.patrol ?? null;
    this.goal = opts.goal ?? null;
    this.guardYaw = this.yaw = opts.facing ?? Math.random() * Math.PI * 2;

    this.h = createHumanoid(def.look);
    this.root.add(this.h.root);
    this.root.scale.setScalar(def.scale);
    this.dress(def);
    scene.add(this.root);

    this.bar = document.createElement('div');
    this.bar.className = `enemy-bar ${def.side}${this.label ? ' target' : ''}`;
    this.barFill = document.createElement('div');
    this.bar.appendChild(this.barFill);
    if (this.label) {
      const name = document.createElement('span');
      name.textContent = this.label;
      this.bar.appendChild(name);
    }
    barLayer.appendChild(this.bar);
    this.mark = document.createElement('div');
    this.mark.className = 'awareness';
    barLayer.appendChild(this.mark);

    if (opts.alert) {
      this.state = 'alert';
      this.everAlerted = true;
    }
  }

  /** Weapons, shield, wings, halo, horns and cape. */
  private dress(def: KindDef) {
    const h = this.h;
    if (def.weapon) {
      const w = buildWeaponMesh(def.weapon);
      if (def.weapon === 'bow') {
        w.position.set(0, -0.64, 0);
        w.rotation.x = Math.PI / 2;
        h.armL.add(w);
      } else {
        w.position.set(0, -0.64, 0);
        if (def.weapon === 'staff') {
          w.rotation.x = -Math.PI / 2;
          w.position.z = -0.4;
        }
        if (this.kind === 'imp') w.scale.setScalar(0.8);
        h.armR.add(w);
      }
    }
    if (def.shield) {
      const s = new THREE.Group();
      s.position.set(0.12, -0.4, 0.02);
      h.armL.add(s);
      const face = new THREE.Mesh(box, lambert(0xc8ccd8));
      face.scale.set(0.07, 0.6, 0.48);
      s.add(face);
      const cross = new THREE.Mesh(box, lambert(0xd9b24a));
      cross.scale.set(0.08, 0.4, 0.08);
      s.add(cross);
      const bar = new THREE.Mesh(box, lambert(0xd9b24a));
      bar.scale.set(0.08, 0.08, 0.3);
      bar.position.y = 0.06;
      s.add(bar);
    }
    if (def.wings) {
      const feather = lambert(0xf4f0e6);
      const tip = lambert(0xd8d0bc);
      for (const side of [1, -1]) {
        const wing = new THREE.Group();
        wing.position.set(0.12 * side, 0.5, -0.18);
        h.torso.add(wing);
        [
          { len: 1.0, y: 0.1, m: feather },
          { len: 0.85, y: -0.12, m: feather },
          { len: 0.65, y: -0.34, m: tip },
        ].forEach((r) => {
          const m = new THREE.Mesh(box, r.m);
          m.scale.set(r.len, 0.22, 0.08);
          m.position.set((r.len / 2) * side, r.y, 0);
          m.castShadow = true;
          wing.add(m);
        });
        this.wings.push(wing);
      }
    }
    if (def.halo !== undefined) {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 4, 12), new THREE.MeshBasicMaterial({ color: def.halo }));
      halo.rotation.x = Math.PI / 2;
      halo.position.y = 0.62;
      if (this.kind === 'traitor') {
        // The halo he was paid with sits crooked on his horns.
        halo.rotation.y = 0.4;
        halo.position.y = 0.7;
      }
      h.head.add(halo);
    }
    if (def.horns !== undefined) {
      const m = lambert(def.horns);
      for (const side of [1, -1]) {
        const horn = new THREE.Group();
        horn.position.set(0.15 * side, 0.36, 0);
        horn.rotation.z = -0.5 * side;
        h.head.add(horn);
        const a = new THREE.Mesh(box, m);
        a.scale.set(0.08, 0.2, 0.08);
        a.position.y = 0.1;
        horn.add(a);
        const b = new THREE.Mesh(box, m);
        b.scale.set(0.06, 0.16, 0.06);
        b.position.set(0.04 * side, 0.24, 0);
        b.rotation.z = 0.6 * side;
        horn.add(b);
      }
    }
    if (def.cape !== undefined) {
      const cape = new THREE.Mesh(box, lambert(def.cape));
      cape.scale.set(0.5, 0.9, 0.04);
      cape.position.set(0, 0.15, -0.19);
      cape.rotation.x = 0.12;
      h.torso.add(cape);
    }
  }

  get reward() {
    const d = this.def.drop;
    let drop: Weapon | null = null;
    if (d && this.dropRoll < d.chance) {
      drop = { id: d.id, quality: Math.max(d.minQuality ?? 0, rollQuality()) as Quality };
      if (Math.random() < (d.enchantChance ?? 0)) drop.enchant = randomWeaponEnchant();
    }
    // Gold stays the same on every plane: 10 from every angel.
    return { xp: Math.round(this.def.xp * this.power), gold: this.def.gold, drop };
  }

  // ---------- Being hurt ----------

  takeHit(damage: number, dir: THREE.Vector3, knockback: number, ctx: GameContext) {
    if (!this.alive) return;
    this.flash = 1;
    this.kb.addScaledVector(dir, knockback * 0.9);
    const chest = this.chest();
    if (this.side === 'heaven') {
      ctx.debris.burst(chest, 0xf4f0e6, 5, 3, { dir, size: 0.08, gravity: 3, life: 1.2 });
      ctx.fire.burst(chest, 0xffe27a, 6, 4, { dir, life: 0.35, size: 0.06 });
    } else {
      ctx.debris.burst(chest, 0x6a0a06, 6, 3, { dir, size: 0.08 });
    }
    this.provoked(ctx);
    // A blow knocks a priest or archer out of its spell or shot.
    if (this.action === 'windup' && this.def.attack !== 'melee') this.action = 'none';
    this.damage(damage, ctx, false);
  }

  burn(amount: number, afterDps: number, ctx: GameContext) {
    if (!this.alive) return;
    this.burnTime = BURN_TIME;
    this.burnDps = Math.max(this.burnDps, afterDps);
    this.burnShown += amount;
    this.flash = Math.max(this.flash, 0.35);
    this.provoked(ctx);
    this.damage(amount, ctx, true);
  }

  impale(damage: number, seconds: number, ctx: GameContext) {
    if (!this.alive) return;
    this.impaled = seconds;
    this.flash = 1;
    this.action = 'none';
    const chest = this.chest();
    ctx.floatText(chest.clone().setY(chest.y + 1), String(Math.round(damage)), 'heavy');
    ctx.fire.burst(chest, 0xffe27a, 20, 5, { life: 0.5, size: 0.08 });
    this.provoked(ctx);
    this.damage(damage, ctx, false);
  }

  /** For angels' victims on hell's side (imps). */
  takeDamage(amount: number, ctx: GameContext) {
    if (!this.alive) return;
    this.flash = 1;
    ctx.debris.burst(this.chest(), 0x6a0a06, 6, 3, { size: 0.08 });
    this.damage(amount, ctx, false);
  }

  canAssassinate(from: THREE.Vector3): boolean {
    if (!this.alive || this.side !== 'heaven' || this.state === 'alert') return false;
    const dx = from.x - this.pos.x;
    const dz = from.z - this.pos.z;
    if (Math.hypot(dx, dz) > this.radius + 2.2) return false;
    // You must be behind it.
    return Math.abs(wrapAngle(Math.atan2(dx, dz) - this.yaw)) > 1.9;
  }

  assassinate(ctx: GameContext) {
    if (!this.alive) return;
    this.assassinated = true;
    const chest = this.chest();
    ctx.fire.burst(chest, 0xff3010, 30, 5, { life: 0.6, size: 0.1 });
    ctx.debris.burst(chest, 0xf4f0e6, 20, 4, { gravity: 3, life: 1.5, size: 0.1 });
    this.damage(this.hp, ctx, true);
  }

  /** Hit by something: it now knows you're here. */
  private provoked(ctx: GameContext) {
    if (this.side === 'heaven' && this.state === 'guard') this.becomeAlert(ctx, ctx.player, true);
  }

  private chest() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.3 * this.def.scale, this.pos.z);
  }

  private damage(amount: number, ctx: GameContext, quiet: boolean) {
    this.hp -= amount;
    if (this.hp <= 0) {
      this.die(ctx);
    } else if (!quiet || this.hurtSoundTimer <= 0) {
      const vol = volumeAt(this.pos.distanceTo(ctx.player.pos));
      if (this.side === 'heaven') sfx.angelHurt(vol);
      else sfx.impHurt(vol);
      this.hurtSoundTimer = 0.6;
    }
  }

  private die(ctx: GameContext) {
    this.hp = 0;
    this.alive = false;
    this.state = 'dead';
    this.deadTime = 0;
    this.burnTime = 0;
    this.impaled = 0;
    this.action = 'none';
    this.flushBurnNumber(ctx);
    const vol = volumeAt(this.pos.distanceTo(ctx.player.pos));
    if (this.side === 'heaven') {
      sfx.angelDie(vol);
      // A loud death alerts everyone nearby. A silent kill doesn't.
      if (!this.assassinated) {
        for (const f of ctx.fighters) {
          if (f !== this && f.alive && f.side === 'heaven' && f.state === 'guard' && f.pos.distanceTo(this.pos) < 18) f.becomeAlert(ctx, ctx.player, true);
        }
      }
      ctx.onFoeKilled(this);
    } else {
      sfx.impDie(vol);
    }
  }

  private flushBurnNumber(ctx: GameContext) {
    if (this.burnShown >= 1) ctx.floatText(this.chest().setY(this.pos.y + 2.4), String(Math.round(this.burnShown)), 'burn');
    this.burnShown = 0;
    this.burnNumberTimer = 0;
  }

  // ---------- Thinking ----------

  becomeAlert(ctx: GameContext, target: HellBody, spread: boolean) {
    if (this.state === 'dead') return;
    const wasGuard = this.state === 'guard';
    this.state = 'alert';
    this.everAlerted = true;
    this.suspicion = 1;
    this.target = target;
    if (wasGuard) {
      this.alertShown = 2;
      sfx.alert(volumeAt(this.pos.distanceTo(ctx.player.pos)));
    }
    if (!spread) return;
    for (const f of ctx.fighters) {
      if (f !== this && f.alive && f.side === this.side && f.state === 'guard' && f.pos.distanceTo(this.pos) < 16) f.becomeAlert(ctx, target, false);
    }
  }

  /** Can it see this point from its eyes? The blocky ground can hide you. */
  private lineOfSight(to: THREE.Vector3) {
    const eyeY = this.pos.y + 1.7 * this.def.scale;
    const toY = to.y + 1.2;
    const dx = to.x - this.pos.x;
    const dz = to.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.floor(dist);
    for (let i = 1; i < steps; i++) {
      const t = i / dist;
      if (heightAt(this.pos.x + dx * t, this.pos.z + dz * t) > eyeY + (toY - eyeY) * t) return false;
    }
    return true;
  }

  /** Angels on guard watch for you. Sneaking (C) makes you much harder to spot. */
  private perceive(dt: number, ctx: GameContext) {
    const p = ctx.player;
    if (!p.alive) {
      this.suspicion = Math.max(0, this.suspicion - dt * 0.3);
      return;
    }
    const dx = p.pos.x - this.pos.x;
    const dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const range = this.def.sight * (p.sneaking ? 0.4 : 1);
    const near = p.sneaking ? 1.4 : 3.5;
    let seen = false;
    if (dist < near) seen = true;
    else if (dist < range && Math.abs(wrapAngle(Math.atan2(dx, dz) - this.yaw)) < 1.05 && this.lineOfSight(p.pos)) seen = true;
    if (seen) {
      this.suspicion += dt * (0.5 + 2.5 * (1 - dist / range)) * (p.sneaking ? 0.5 : 1.4);
    } else {
      this.suspicion = Math.max(0, this.suspicion - dt * 0.15);
    }
    // Imps charging in are hard to miss.
    for (const f of ctx.fighters) {
      if (f.side === 'hell' && f.alive && f.pos.distanceTo(this.pos) < 14) {
        this.becomeAlert(ctx, f, true);
        return;
      }
    }
    if (this.suspicion >= 1) this.becomeAlert(ctx, p, true);
  }

  /** The nearest enemy worth fighting. */
  private pickTarget(ctx: GameContext): HellBody | null {
    let best: HellBody | null = null;
    let bestD = Infinity;
    const consider = (t: HellBody, bias = 0) => {
      if (!t.alive) return;
      const d = t.pos.distanceTo(this.pos) - bias;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    };
    if (this.side === 'heaven') {
      // Prefers you over your dog and imps when you're about as close.
      consider(ctx.player, 3);
      consider(ctx.dog);
      for (const f of ctx.fighters) if (f.side === 'hell') consider(f);
      return bestD < 30 ? best : null;
    }
    for (const f of ctx.fighters) if (f.side === 'heaven') consider(f);
    return bestD < this.def.sight ? best : null;
  }

  update(dt: number, ctx: GameContext) {
    this.flash = Math.max(0, this.flash - dt * 5);
    this.hurtSoundTimer -= dt;
    this.alertShown = Math.max(0, this.alertShown - dt);
    if (!this.alive) {
      this.updateDead(dt);
      return;
    }

    this.updateBurning(dt, ctx);
    if (!this.alive) return;

    let moveX = 0;
    let moveZ = 0;
    let faceYaw: number | null = null;
    let speed = this.def.speed;

    if (this.impaled > 0) {
      this.impaled -= dt;
    } else if (this.side === 'heaven' && this.state === 'guard') {
      this.perceive(dt, ctx);
      // Turns toward something it half-noticed.
      if (this.suspicion > 0.3) faceYaw = Math.atan2(ctx.player.pos.x - this.pos.x, ctx.player.pos.z - this.pos.z);
      else if (this.patrol) {
        const to = this.patrol[this.patrolIndex];
        const dx = to.x - this.pos.x;
        const dz = to.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.8) {
          this.wait -= dt;
          if (this.wait <= 0) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrol.length;
            this.wait = 1.5 + Math.random() * 2;
          }
        } else {
          speed *= 0.45;
          moveX = (dx / d) * speed;
          moveZ = (dz / d) * speed;
        }
      } else {
        const dx = this.home.x - this.pos.x;
        const dz = this.home.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1) {
          speed *= 0.5;
          moveX = (dx / d) * speed;
          moveZ = (dz / d) * speed;
        } else faceYaw = this.guardYaw + Math.sin(performance.now() * 0.0004 + this.home.x) * 0.6;
      }
    } else {
      // Alert (or an imp): fight.
      this.retarget -= dt;
      if (this.retarget <= 0 || !this.target?.alive) {
        this.retarget = 0.5;
        this.target = this.pickTarget(ctx);
      }
      const t = this.target;
      if (this.side === 'heaven' && this.home.distanceTo(this.pos) > LEASH && (!t || t.pos.distanceTo(this.home) > LEASH)) {
        // Too far from its post: give up and go back.
        this.state = 'guard';
        this.suspicion = 0.4;
        this.target = null;
      } else if (t) {
        const r = this.fight(dt, ctx, t);
        moveX = r.x;
        moveZ = r.z;
        faceYaw = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
      } else {
        // Nobody in sight: march on the goal (attack waves), or head home.
        const to = this.goal ?? this.home;
        const dx = to.x - this.pos.x;
        const dz = to.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.5) {
          moveX = (dx / d) * speed * 0.8;
          moveZ = (dz / d) * speed * 0.8;
        }
      }
    }

    this.move(dt, moveX, moveZ);
    if (faceYaw === null && Math.hypot(moveX, moveZ) > 0.3) faceYaw = Math.atan2(moveX, moveZ);
    if (faceYaw !== null && this.action !== 'recover') this.yaw = dampAngle(this.yaw, faceYaw, 8, dt);
    this.animate(dt);
  }

  /** Approaches, keeps its distance, and attacks. Returns the wanted velocity. */
  private fight(dt: number, ctx: GameContext, t: HellBody): { x: number; z: number } {
    const def = this.def;
    this.cooldown -= dt;
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const edge = d - this.radius - t.radius;
    const out = { x: 0, z: 0 };

    if (this.action === 'windup') {
      this.actionTime += dt;
      if (this.actionTime >= def.windup) this.release(ctx, t, edge);
      return out;
    }
    if (this.action === 'recover') {
      this.actionTime += dt;
      if (this.actionTime >= def.recover) this.action = 'none';
      return out;
    }

    if (def.attack === 'melee') {
      if (edge > def.reach * 0.8) {
        out.x = (dx / d) * def.speed;
        out.z = (dz / d) * def.speed;
      } else if (this.cooldown <= 0) this.startWindup();
      return out;
    }

    // Priests mend wounded angels before anything else.
    if (def.attack === 'priest' && this.cooldown <= 0 && this.woundedAlly(ctx)) {
      this.startWindup();
      return out;
    }
    // Ranged: hold a distance, and shoot when there's a clear line.
    if (d < def.keepAway * 0.6) {
      out.x = (-dx / d) * def.speed;
      out.z = (-dz / d) * def.speed;
    } else if (d > def.keepAway * 1.4 || !this.lineOfSight(t.pos)) {
      out.x = (dx / d) * def.speed;
      out.z = (dz / d) * def.speed;
    } else if (this.cooldown <= 0 && d < 30) {
      this.startWindup();
    }
    return out;
  }

  private startWindup() {
    this.action = 'windup';
    this.actionTime = 0;
  }

  /** The end of a windup: the blow, the arrow, the bolt or the healing. */
  private release(ctx: GameContext, t: HellBody, edge: number) {
    const def = this.def;
    this.action = 'recover';
    this.actionTime = 0;
    this.cooldown = def.cooldown * (0.8 + Math.random() * 0.4);
    const vol = volumeAt(this.pos.distanceTo(ctx.player.pos));
    const chest = this.chest();
    if (def.attack === 'melee') {
      sfx.angelSwing(vol);
      const facing = Math.abs(wrapAngle(Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z) - this.yaw)) < 1.3;
      if (edge < def.reach + 0.4 && facing) t.takeDamage(def.damage * this.damageMult, ctx, { attacker: this });
    } else if (def.attack === 'bow') {
      sfx.bowShot(vol);
      ctx.projectiles.fire('arrow', chest, tmp.set(t.pos.x, t.pos.y + 1.2, t.pos.z), def.damage * this.damageMult, t);
    } else {
      const ally = this.woundedAlly(ctx);
      if (ally) {
        ally.hp = Math.min(ally.maxHp, ally.hp + 30 * this.power);
        sfx.heal(vol);
        const from = chest.clone();
        const to = ally.chest();
        for (let i = 0; i <= 10; i++) ctx.fire.burst(from.clone().lerp(to, i / 10), 0xfff4c0, 1, 0.5, { gravity: -1, life: 0.6, size: 0.1 });
        ctx.fire.burst(to, 0xfff4c0, 20, 2, { gravity: -2, life: 0.8, size: 0.1 });
      } else {
        sfx.cast(vol);
        ctx.projectiles.fire('bolt', chest, tmp.set(t.pos.x, t.pos.y + 1.2, t.pos.z), def.damage * this.damageMult, t);
      }
    }
  }

  private woundedAlly(ctx: GameContext): Fighter | null {
    let best: Fighter | null = null;
    for (const f of ctx.fighters) {
      if (f.side !== 'heaven' || !f.alive || f.hp > f.maxHp * 0.65) continue;
      if (f.pos.distanceTo(this.pos) > 14) continue;
      if (!best || f.hp / f.maxHp < best.hp / best.maxHp) best = f;
    }
    return best;
  }

  /** Walks, steering around lava (it burns angels), with knockback and gravity. */
  private move(dt: number, vx: number, vz: number) {
    const speed = Math.hypot(vx, vz);
    if (speed > 0.01) {
      let angle = Math.atan2(vx, vz);
      // Try the straight way first, then gradually wider detours.
      for (const turn of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
        const a = angle + turn;
        if (!isLava(this.pos.x + Math.sin(a) * 1.3, this.pos.z + Math.cos(a) * 1.3)) {
          angle = a;
          break;
        }
        if (turn === -1.9) angle = NaN;
      }
      if (!Number.isNaN(angle)) {
        vx = Math.sin(angle) * speed;
        vz = Math.cos(angle) * speed;
      } else {
        vx = vz = 0;
      }
    }
    this.moving += (Math.min(Math.hypot(vx, vz) / this.def.speed, 1) - this.moving) * Math.min(1, dt * 8);
    vx += this.kb.x;
    vz += this.kb.z;
    this.kb.multiplyScalar(Math.max(0, 1 - dt * 6));
    moveBody(this.pos, vx * dt, vz * dt, this.radius * 0.8, this.airborne ? 0.3 : 1.05);

    const ground = groundAt(this.pos.x, this.pos.z, this.radius * 0.6);
    if (this.airborne) {
      this.vy -= 26 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.airborne = false;
        this.vy = 0;
      }
    } else if (ground < this.pos.y - 0.3) {
      this.airborne = true;
      this.vy = 0;
    } else {
      this.pos.y += (ground - this.pos.y) * Math.min(1, dt * 16);
    }
  }

  /** Thrown up by a geyser. */
  launch(speed: number) {
    this.vy = speed;
    this.airborne = true;
  }

  private updateBurning(dt: number, ctx: GameContext) {
    // Lava burns angels (but never imps).
    if (this.side === 'heaven' && isLava(this.pos.x, this.pos.z) && this.pos.y < LAVA_Y + 0.2) this.burn(30 * dt, 10, ctx);
    if (this.burnTime > 0) {
      this.burnTime -= dt;
      if (Math.random() < dt * 25) {
        const at = this.chest();
        at.y += (Math.random() - 0.6) * 1.4;
        ctx.fire.burst(at, Math.random() < 0.5 ? 0xff6a10 : 0xffb030, 1, 1, { gravity: -5, life: 0.5, size: 0.2, spread: 0.25 });
      }
      this.burnShown += this.burnDps * dt;
      this.damage(this.burnDps * dt, ctx, true);
      if (this.burnTime <= 0) this.burnDps = 0;
    }
    this.burnNumberTimer += dt;
    if (this.burnNumberTimer >= 0.35) this.flushBurnNumber(ctx);
  }

  // ---------- Looks ----------

  private animate(dt: number) {
    const h = this.h;
    this.gait += dt * (4 + this.moving * 7);
    const swing = Math.sin(this.gait) * 0.7 * this.moving;
    h.legL.rotation.x = swing;
    h.legR.rotation.x = -swing;
    h.hips.position.y = HIPS_HEIGHT + Math.abs(Math.sin(this.gait)) * 0.04 * this.moving;
    h.armL.rotation.set(-swing * 0.6, 0, 0.08);
    h.armR.rotation.set(-0.35 + swing * 0.3, 0, -0.08);
    h.torso.rotation.set(0, 0, 0);
    h.head.rotation.set(0, 0, 0);

    const def = this.def;
    const t = this.action === 'windup' ? Math.min(1, this.actionTime / def.windup) : 0;
    const rt = this.action === 'recover' ? Math.min(1, this.actionTime / def.recover) : 1;
    if (def.attack === 'melee') {
      if (this.action === 'windup') {
        // Weapon raised high: the telltale before the blow.
        h.armR.rotation.set(-0.35 - 2.4 * t, -0.3 * t, -0.2 * t);
        h.torso.rotation.y = 0.35 * t;
      } else if (this.action === 'recover') {
        h.armR.rotation.set(-1.2 * (1 - rt) - 0.35 * rt, 0.4 * (1 - rt), 0);
        h.torso.rotation.y = -0.3 * (1 - rt);
      }
      if (def.shield) h.armL.rotation.set(-0.9, 0.5, 0.2);
    } else if (def.attack === 'bow') {
      const draw = this.state === 'alert' ? 1 : 0.2;
      h.armL.rotation.set(-1.45 * draw, -0.15 * draw, 0);
      h.armR.rotation.set(-1.45 * draw, 0.35 * draw + 0.5 * t, 0);
    } else if (this.action === 'windup') {
      // Priests raise both arms to call down light.
      h.armL.rotation.set(-2.6 * t, 0, 0.3);
      h.armR.rotation.set(-2.6 * t, 0, -0.3);
    }
    if (this.impaled > 0) {
      h.armL.rotation.set(-2.5 + Math.sin(this.gait * 3) * 0.4, 0, 0.6);
      h.armR.rotation.set(-2.5 + Math.cos(this.gait * 3) * 0.4, 0, -0.6);
    }
    for (const [i, w] of this.wings.entries()) {
      const side = i === 0 ? 1 : -1;
      const spread = this.state === 'alert' ? 0.9 + Math.sin(this.gait * 1.5) * 0.15 : 0.35;
      w.rotation.set(0.15, -spread * side, -0.3 * side);
    }

    const tell = this.action === 'windup' ? 0.5 * t : 0;
    // Angels shine faintly with holy light; it flares white when they're hit.
    const shine = this.side === 'heaven' && this.kind !== 'traitor' ? 0.1 : 0;
    if (this.flash > tell) setFlash(h, FLASH_HIT, shine + this.flash * 0.8);
    else if (tell > 0) setFlash(h, FLASH_TELL, tell);
    else setFlash(h, FLASH_HIT, shine);

    const lift = this.impaled > 0 ? Math.min(0.6, this.impaled * 3) : 0;
    this.root.position.set(this.pos.x, this.pos.y + lift, this.pos.z);
    this.root.rotation.set(0, this.yaw, 0);
  }

  private updateDead(dt: number) {
    this.deadTime += dt;
    // Topples backward, then dissolves into light.
    const fall = Math.min(1, this.deadTime / 0.5);
    this.root.rotation.set(-fall * 1.4, this.yaw, 0, 'YXZ');
    if (this.deadTime > 1.2) this.root.scale.setScalar(this.def.scale * Math.max(0, 1 - (this.deadTime - 1.2) / 0.5));
    if (this.deadTime > 1.7 && !this.gone) {
      this.gone = true;
      this.dispose();
    }
  }

  /** Health bar (once hurt, or always for mission targets), and ? / ! over its head. */
  updateBar(camera: THREE.Camera, playerPos: THREE.Vector3) {
    const near = this.pos.distanceTo(playerPos) < 45;
    const showBar = this.alive && near && (this.hp < this.maxHp || this.label !== null);
    const head = new THREE.Vector3(this.pos.x, this.pos.y + 2.5 * this.def.scale, this.pos.z).project(camera);
    const onScreen = head.z < 1;
    const x = (head.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-head.y * 0.5 + 0.5) * window.innerHeight;
    if (showBar && onScreen) {
      this.bar.style.display = '';
      this.bar.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      this.barFill.style.width = `${(this.hp / this.maxHp) * 100}%`;
    } else this.bar.style.display = 'none';

    let mark = '';
    if (this.alive && near && this.side === 'heaven') {
      if (this.alertShown > 0) mark = '!';
      else if (this.state === 'guard' && this.suspicion > 0.05) mark = '?';
    }
    if (mark && onScreen) {
      this.mark.style.display = '';
      this.mark.textContent = mark;
      this.mark.className = `awareness ${mark === '!' ? 'alert' : 'suspicious'}`;
      this.mark.style.opacity = mark === '?' ? String(0.35 + this.suspicion * 0.65) : '1';
      this.mark.style.transform = `translate(${x}px, ${y - 22}px) translate(-50%, -50%) scale(${mark === '?' ? 0.8 + this.suspicion * 0.5 : 1.3})`;
    } else this.mark.style.display = 'none';
  }

  /** Removes it from the world at once (mission ended). */
  dispose() {
    this.gone = true;
    this.scene.remove(this.root);
    this.bar.remove();
    this.mark.remove();
  }
}

export { KINDS as FIGHTER_KINDS };
