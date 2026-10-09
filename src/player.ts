import * as THREE from 'three';
import type { Input } from './input';
import type { FirstPersonCamera } from './camera';
import type { SwingKind } from './viewmodel';
import type { Angel } from './angel';
import type { GameContext } from './types';
import { groundAt, heightAt, isLava, LAVA_Y, moveBody } from './world';
import { setBreathing, sfx } from './audio';
import { clamp, smoothing, wrapAngle } from './util';
import { breatheFire, type Breath } from './powers';
import { MAX_LEVEL, RANKS, statsForLevel, UNLOCK, xpToNext } from './progression';

const WALK_SPEED = 6;
const SPRINT_SPEED = 9.5;
/** Lava can't burn a demon, but it's thick: wading through it is slow. */
const LAVA_SLOW = 0.45;
const JUMP_SPEED = 9;
const GRAVITY = 26;
/** Tallest block you walk up without jumping. */
const STEP_UP = 1.05;
const REGEN_DELAY = 4;
const REGEN_RATE = 6;

/** Hellfire per second while breathing fire. */
const BREATH_COST = 22;
/** You can't start breathing again until the bar has this much back. */
const BREATH_RESTART = 15;
const BREATH: Breath = { range: 7.5, halfAngle: 0.38, dps: 30, rate: 110 };
const SPIKE_COST = 35;
export const SPIKE_COOLDOWN = 1.2;
const SPIKE_DAMAGE = 45;
/** How far away you can raise spikes. */
const SPIKE_RANGE = 18;
/** Hellfire per second coming back, once unused for a moment. */
const ENERGY_REGEN = 16;
const ENERGY_REGEN_DELAY = 0.7;

interface SwingDef {
  /** Seconds the whole swing takes. */
  dur: number;
  /** Fraction of the swing when the ball lands. */
  strike: number;
  damage: number;
  reach: number;
  /** Half-angle (radians) of the arc in front of you that the swing covers. */
  arc: number;
  knockback: number;
}

const SWINGS: Record<SwingKind, SwingDef> = {
  sweep: { dur: 0.56, strike: 0.5, damage: 14, reach: 3.1, arc: 1.15, knockback: 6 },
  smash: { dur: 0.74, strike: 0.52, damage: 24, reach: 3.4, arc: 0.5, knockback: 4 },
};

const tmp = new THREE.Vector3();
const fwd = new THREE.Vector3();

/** The demon: moved in first person, fights with a spiked ball on a chain, fire and spikes. */
export class Player {
  name = 'Imp';
  level = 1;
  /** XP toward the next level. */
  xp = 0;
  gold = 0;
  rank = 0;
  /** Hellfire: burned by fire breath and ground spikes. */
  energy = 100;
  maxEnergy = 100;
  /** Multiplies all damage you deal. */
  damageMult = 1;
  breathing = false;
  /** Seconds until spikes can be raised again. */
  spikeCooldown = 0;

  readonly pos = new THREE.Vector3();
  readonly radius = 0.4;
  readonly eyeHeight = 1.85;
  maxHp = 100;
  hp = 100;
  alive = true;
  /** Seconds since dying. */
  deadTime = 0;

  /** Walk cycle (radians) and how strongly it shows (0 standing, 1 running). */
  walkPhase = 0;
  bob = 0;
  sprinting = false;
  /** Which way you're looking (camera yaw). */
  facing = 0;
  inLava = false;
  /** 0..1: how recently you were hurt (drives the red edges of the screen). */
  hurtFlash = 0;
  /** The angel you last hit and when; the dog joins in on it. */
  lastTarget: Angel | null = null;
  lastTargetTime = -Infinity;

  private vel = new THREE.Vector3();
  private grounded = true;
  /** Smooths the camera when stepping up a block. */
  private eyeLag = 0;
  private sinceHurt = 99;
  private sizzleTimer = 0;
  private time = 0;

  private sinceEnergyUse = 99;
  /** Ran out of hellfire mid-breath: wait for F to be let go and the bar to refill a little. */
  private breathSpent = false;
  private aiming = false;
  private readonly aimPoint = new THREE.Vector3();
  private aimValid = false;
  /** Locked powers only explain themselves once per key press. */
  private lockedHintShown = { breath: false, spikes: false };

  private swing: { kind: SwingKind; time: number; struck: boolean } | null = null;
  private nextKind: SwingKind = 'sweep';
  private queued = false;

  /** Where the ball is in the world (set by the view model), for dust when it hits the ground. */
  ballAt: (() => THREE.Vector3) | null = null;
  onLand?: (speed: number) => void;

  get rankName() {
    return RANKS[this.rank];
  }

  get xpNeeded() {
    return this.level >= MAX_LEVEL ? 0 : xpToNext(this.level);
  }

  /** Sets name, level and progress from a saved game. */
  loadHero(name: string, level: number, xp: number, gold: number, rank: number) {
    this.name = name;
    this.level = clamp(Math.round(level), 1, MAX_LEVEL);
    this.xp = xp;
    this.gold = gold;
    this.rank = clamp(rank, 0, RANKS.length - 1);
    this.applyLevel();
  }

  private applyLevel() {
    const s = statsForLevel(this.level);
    this.maxHp = s.maxHp;
    this.maxEnergy = s.maxEnergy;
    this.damageMult = s.damage;
  }

  /** Adds XP. Returns the levels gained; each level up fully heals you. */
  gainXp(amount: number): number {
    if (this.level >= MAX_LEVEL) return 0;
    this.xp += amount;
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      gained++;
    }
    if (this.level >= MAX_LEVEL) this.xp = 0;
    if (gained > 0) {
      this.applyLevel();
      this.hp = this.maxHp;
      this.energy = this.maxEnergy;
    }
    return gained;
  }

  reset(x: number, z: number) {
    this.pos.set(x, groundAt(x, z, this.radius * 0.7), z);
    this.vel.set(0, 0, 0);
    this.hp = this.maxHp;
    this.energy = this.maxEnergy;
    this.breathing = false;
    this.aiming = false;
    this.spikeCooldown = 0;
    this.alive = true;
    this.deadTime = 0;
    this.grounded = true;
    this.eyeLag = 0;
    this.swing = null;
    this.queued = false;
    this.hurtFlash = 0;
    this.lastTarget = null;
  }

  /** Eye position for the camera. */
  eye(out: THREE.Vector3) {
    out.copy(this.pos);
    if (!this.alive) {
      // Collapse to the ground.
      out.y += Math.max(0.35, this.eyeHeight * (1 - this.deadTime * 1.6));
      return out;
    }
    out.y += this.eyeHeight + this.eyeLag;
    return out;
  }

  /** The current swing and how far through it (0..1), for the view model. */
  get swingInfo(): { kind: SwingKind; t: number } | null {
    return this.swing ? { kind: this.swing.kind, t: this.swing.time / SWINGS[this.swing.kind].dur } : null;
  }

  update(dt: number, ctx: GameContext, input: Input, cam: FirstPersonCamera) {
    this.time += dt;
    this.facing = cam.yaw;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.5);
    if (!this.alive) {
      this.deadTime += dt;
      this.stopPowers(ctx);
      this.applyGravity(dt);
      return;
    }

    // ----- Moving -----
    const move = input.moveVector();
    this.sprinting = input.sprintHeld && move.z > 0.3 && !this.swing;
    let speed = this.sprinting ? SPRINT_SPEED : WALK_SPEED;
    if (this.swing || this.breathing) speed *= 0.75;
    if (this.inLava) speed *= LAVA_SLOW;
    cam.forward(fwd);
    const rightX = -fwd.z;
    const rightZ = fwd.x;
    const wishX = (fwd.x * move.z + rightX * move.x) * speed;
    const wishZ = (fwd.z * move.z + rightZ * move.x) * speed;
    // Quick to respond on the ground; drifting in the air.
    const grip = smoothing(this.grounded ? 14 : 2.5, dt);
    this.vel.x += (wishX - this.vel.x) * grip;
    this.vel.z += (wishZ - this.vel.z) * grip;
    moveBody(this.pos, this.vel.x * dt, this.vel.z * dt, this.radius, this.grounded ? STEP_UP : 0.25);

    if (input.jumpPressed && this.grounded) {
      this.vel.y = this.inLava ? JUMP_SPEED * 0.8 : JUMP_SPEED;
      this.grounded = false;
    }
    this.applyGravity(dt);

    // Footsteps and head bob.
    const flatSpeed = Math.hypot(this.vel.x, this.vel.z);
    const moving = this.grounded ? Math.min(flatSpeed / WALK_SPEED, 1.4) : 0;
    this.bob += (moving - this.bob) * smoothing(8, dt);
    const before = Math.floor(this.walkPhase / Math.PI);
    this.walkPhase += flatSpeed * dt * 1.7;
    if (Math.floor(this.walkPhase / Math.PI) !== before && this.grounded) sfx.step(Math.min(flatSpeed / SPRINT_SPEED, 1));

    // ----- Lava: harmless to a demon, but it hisses and steams around you -----
    this.inLava = isLava(this.pos.x, this.pos.z) && this.pos.y < LAVA_Y + 0.1;
    if (this.inLava) {
      this.sizzleTimer -= dt;
      if (this.sizzleTimer <= 0) {
        sfx.sizzle();
        this.sizzleTimer = 0.35;
      }
      ctx.fire.burst(tmp.set(this.pos.x, LAVA_Y + 0.1, this.pos.z), 0xff7a1a, 2, 2, { gravity: -4, life: 0.5, size: 0.12, spread: 0.4 });
    }

    // Health comes back after a while out of harm's way.
    this.sinceHurt += dt;
    if (this.sinceHurt > REGEN_DELAY) this.hp = Math.min(this.maxHp, this.hp + REGEN_RATE * dt);

    if (!this.breathing) this.updateSwing(dt, ctx, input, cam);
    this.updatePowers(dt, ctx, input, cam);
  }

  /** Fire breath (hold F) and ground spikes (hold R to aim, let go to strike). */
  private updatePowers(dt: number, ctx: GameContext, input: Input, cam: FirstPersonCamera) {
    this.sinceEnergyUse += dt;
    this.spikeCooldown = Math.max(0, this.spikeCooldown - dt);
    if (this.sinceEnergyUse > ENERGY_REGEN_DELAY) {
      this.energy = Math.min(this.maxEnergy, this.energy + ENERGY_REGEN * (this.maxEnergy / 100) * dt);
    }

    // ----- Fire breath -----
    const wantBreath = input.breathHeld;
    if (!wantBreath) {
      this.lockedHintShown.breath = false;
      if (this.energy >= BREATH_RESTART) this.breathSpent = false;
    }
    if (wantBreath && this.level < UNLOCK.fireBreath && !this.lockedHintShown.breath) {
      this.lockedHintShown.breath = true;
      ctx.toast(`Fire breath unlocks at level ${UNLOCK.fireBreath}`);
    }
    const canBreathe = wantBreath && this.level >= UNLOCK.fireBreath && !this.breathSpent && !this.swing && this.energy > 0;
    if (canBreathe) {
      this.energy -= BREATH_COST * dt;
      this.sinceEnergyUse = 0;
      if (this.energy <= 0) {
        this.energy = 0;
        this.breathSpent = true;
      }
      const look = cam.lookDir(tmp);
      const origin = this.eye(new THREE.Vector3()).addScaledVector(look, 1);
      origin.y -= 0.3;
      breatheFire(origin, look, { ...BREATH, dps: BREATH.dps * this.damageMult }, dt, ctx);
    }
    if (canBreathe !== this.breathing) {
      this.breathing = canBreathe;
      setBreathing(canBreathe);
    } else if (canBreathe && Math.random() < dt * 4) {
      setBreathing(true); // keeps the roar flickering
    }

    // ----- Ground spikes -----
    const wantAim = input.spikesHeld;
    if (wantAim && this.level < UNLOCK.spikes) {
      if (!this.lockedHintShown.spikes) {
        this.lockedHintShown.spikes = true;
        ctx.toast(`Ground spikes unlock at level ${UNLOCK.spikes}`);
      }
    } else if (wantAim) {
      this.aiming = true;
      this.aimValid = this.aimAtGround(cam);
      ctx.spikes.aim(this.aimValid ? this.aimPoint : null, this.spikesReady);
    } else if (this.aiming) {
      // Let go: strike.
      this.aiming = false;
      ctx.spikes.aim(null, false);
      if (!this.aimValid) {
        // Looking at the sky: nothing to aim at.
      } else if (!this.spikesReady) {
        sfx.denied();
        ctx.toast(this.spikeCooldown > 0 ? 'Not ready yet' : 'Not enough hellfire');
      } else {
        this.energy -= SPIKE_COST;
        this.sinceEnergyUse = 0;
        this.spikeCooldown = SPIKE_COOLDOWN;
        ctx.spikes.cast(this.aimPoint, SPIKE_DAMAGE * this.damageMult, ctx);
      }
    }
    if (!wantAim) this.lockedHintShown.spikes = false;
  }

  get spikesReady() {
    return this.energy >= SPIKE_COST && this.spikeCooldown <= 0;
  }

  /** Finds where your gaze meets the ground (within range). */
  private aimAtGround(cam: FirstPersonCamera) {
    const eye = this.eye(new THREE.Vector3());
    const look = cam.lookDir(new THREE.Vector3());
    const step = 0.25;
    for (let d = 1.5; d <= SPIKE_RANGE; d += step) {
      const x = eye.x + look.x * d;
      const y = eye.y + look.y * d;
      const z = eye.z + look.z * d;
      if (y <= heightAt(x, z)) {
        this.aimPoint.set(x, y, z);
        return true;
      }
    }
    // Looking above the horizon: aim at the farthest ground straight ahead instead.
    if (look.y > -0.05) {
      const flat = Math.hypot(look.x, look.z) || 1;
      const x = this.pos.x + (look.x / flat) * SPIKE_RANGE * 0.6;
      const z = this.pos.z + (look.z / flat) * SPIKE_RANGE * 0.6;
      this.aimPoint.set(x, heightAt(x, z), z);
      return true;
    }
    return false;
  }

  /** Stops breathing and aiming (death, pause). */
  stopPowers(ctx: GameContext) {
    if (this.breathing) setBreathing(false);
    this.breathing = false;
    if (this.aiming) ctx.spikes.aim(null, false);
    this.aiming = false;
  }

  private applyGravity(dt: number) {
    const ground = groundAt(this.pos.x, this.pos.z, this.radius * 0.7);
    this.eyeLag *= 1 - smoothing(14, dt);
    if (this.grounded) {
      if (ground > this.pos.y) {
        // Stepped up onto a block: the camera eases up instead of popping.
        this.eyeLag -= ground - this.pos.y;
        this.pos.y = ground;
      } else if (ground < this.pos.y - 0.05) {
        this.grounded = false;
        this.vel.y = 0;
      }
    }
    if (!this.grounded) {
      this.vel.y -= GRAVITY * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= ground) {
        const impact = -this.vel.y;
        this.pos.y = ground;
        this.vel.y = 0;
        this.grounded = true;
        if (impact > 6) {
          sfx.land(Math.min(impact / 18, 1));
          this.eyeLag -= Math.min(impact * 0.02, 0.3); // knees bend on a hard landing
          this.onLand?.(impact);
        }
      }
    }
  }

  private updateSwing(dt: number, ctx: GameContext, input: Input, cam: FirstPersonCamera) {
    if (input.attackPressed) {
      if (!this.swing) this.startSwing(this.nextKind);
      else this.queued = true;
    }
    const s = this.swing;
    if (!s) return;
    const def = SWINGS[s.kind];
    s.time += dt;
    const t = s.time / def.dur;
    if (!s.struck && t >= def.strike - 0.18 && t - dt / def.dur < def.strike - 0.18) sfx.swing(s.kind === 'smash');
    if (!s.struck && t >= def.strike) {
      s.struck = true;
      this.strike(def, s.kind, ctx, cam);
    }
    if (t >= 1) {
      this.swing = null;
      // Clicking during a swing chains into the other swing.
      const other: SwingKind = s.kind === 'sweep' ? 'smash' : 'sweep';
      if (this.queued) this.startSwing(other);
      else this.nextKind = 'sweep';
    }
  }

  private startSwing(kind: SwingKind) {
    this.swing = { kind, time: 0, struck: false };
    this.queued = false;
    this.nextKind = kind === 'sweep' ? 'smash' : 'sweep';
  }

  /** The ball lands: hit every angel in the arc in front of you. */
  private strike(def: SwingDef, kind: SwingKind, ctx: GameContext, cam: FirstPersonCamera) {
    let hits = 0;
    for (const a of ctx.angels) {
      if (!a.alive) continue;
      const dx = a.pos.x - this.pos.x;
      const dz = a.pos.z - this.pos.z;
      const dy = a.pos.y - this.pos.y;
      const dist = Math.hypot(dx, dz);
      if (dist > def.reach + a.radius || dy < -2 || dy > 3) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - cam.yaw)) > def.arc && dist > a.radius + 0.6) continue;
      const damage = Math.round(def.damage * this.damageMult * (0.85 + Math.random() * 0.3));
      const dir = tmp.set(dx, 0, dz).normalize();
      a.takeHit(damage, dir, def.knockback, ctx);
      ctx.floatText(new THREE.Vector3(a.pos.x, a.pos.y + 2.3, a.pos.z), String(damage), kind === 'smash' ? 'heavy' : 'damage');
      this.lastTarget = a;
      this.lastTargetTime = this.time;
      hits++;
    }
    if (hits > 0) {
      sfx.hit(kind === 'smash');
      ctx.hitStop(kind === 'smash' ? 0.09 : 0.06);
      ctx.addShake(kind === 'smash' ? 0.3 : 0.18);
    } else if (kind === 'smash' && this.ballAt) {
      // A miss slams into the ground.
      const at = this.ballAt();
      sfx.thud();
      ctx.addShake(0.15);
      ctx.debris.burst(at, 0x4a2a22, 12, 4, { size: 0.12 });
      ctx.fire.burst(at, 0xffa040, 6, 4, { life: 0.3, size: 0.06 });
    }
  }

  /** Seconds since you last hit an angel; the dog uses this to pick a fight. */
  sinceLastHit() {
    return this.time - this.lastTargetTime;
  }

  /**
   * Thrown into the air by a geyser. Fire can't burn a demon, so it does no
   * damage: it's a free ride up onto high ledges.
   */
  launch(speed: number, ctx: GameContext) {
    this.vel.y = speed;
    this.grounded = false;
    ctx.fire.burst(tmp.copy(this.pos), 0xff8a2a, 30, 6, { gravity: -4, life: 0.6, size: 0.2 });
  }

  /** Damage from an attack. Lava and fire never call this: they can't hurt a demon. */
  takeDamage(amount: number, ctx: GameContext) {
    if (!this.alive) return;
    this.hp -= amount;
    this.sinceHurt = 0;
    this.hurtFlash = Math.min(1, this.hurtFlash + 0.7);
    sfx.hurt();
    ctx.addShake(0.25);
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.swing = null;
      sfx.demonRoar();
    }
  }
}
