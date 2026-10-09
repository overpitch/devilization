import * as THREE from 'three';
import type { Angel } from './angel';
import type { GameContext } from './types';
import { groundAt, isLava, LAVA_Y, moveBody } from './world';
import { sfx, volumeAt } from './audio';
import { dampAngle, smoothing } from './util';
import { breatheFire } from './powers';
import { UNLOCK } from './progression';

const RUN_SPEED = 11;
const CHARGE_SPEED = 18;
const CHARGE_WINDUP = 0.4;
const CHARGE_TIME = 0.9;
const CHARGE_COOLDOWN = 6;
const BITE_TIME = 0.42;
const BITE_COOLDOWN = 0.9;
const BITE_DAMAGE = 9;
const CHARGE_DAMAGE = 20;
const BREATH_TIME = 1.3;
const BREATH_COOLDOWN = 5;
const BREATH = { range: 5.5, halfAngle: 0.35, dps: 14, rate: 70 };
/** The dog leaps up ledges this tall without slowing down. */
const STEP_UP = 2.05;
/** Farther than this from you and it bounds back through a puff of fire. */
const LEASH = 45;

type State = 'follow' | 'attack' | 'bite' | 'windup' | 'charge' | 'breathe';

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const glow = (color: number) => new THREE.MeshBasicMaterial({ color });
const box = new THREE.BoxGeometry(1, 1, 1);

function part(parent: THREE.Object3D, mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(box, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

/**
 * Your demon-dog: a horned hellhound that follows you, bites, and charges
 * with its horns. It can't be hurt.
 */
export class Dog {
  name = 'Cinder';
  readonly pos = new THREE.Vector3();
  readonly radius = 0.5;
  yaw = 0;

  private readonly root = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly jaw = new THREE.Group();
  private readonly tail = new THREE.Group();
  private readonly legs: THREE.Group[] = [];

  private state: State = 'follow';
  private stateTime = 0;
  private target: Angel | null = null;
  private biteCooldown = 0;
  private chargeCooldown = 2;
  private breathCooldown = 1;
  private chargeHit = false;
  private readonly chargeDir = new THREE.Vector3();
  private vy = 0;
  private airborne = false;
  private speed = 0;
  private gait = 0;
  private time = 0;
  private sizzle = 0;

  constructor(scene: THREE.Scene) {
    const hide = lambert(0x3a1410);
    const belly = lambert(0x5a1e14);
    const dark = lambert(0x160c0a);
    const bone = lambert(0xd8cbb0);
    const ember = glow(0xff6a1a);
    const eye = glow(0xffd040);

    this.root.add(this.body);
    this.body.position.y = 0.88;
    part(this.body, hide, 0.62, 0.55, 1.25, 0, 0, 0);
    part(this.body, belly, 0.5, 0.12, 1.0, 0, -0.3, 0);
    part(this.body, hide, 0.7, 0.62, 0.5, 0, 0.04, 0.38); // heavy shoulders
    // Spikes along the spine and glowing cracks on the flanks.
    for (let i = 0; i < 5; i++) part(this.body, dark, 0.08, 0.2 - i * 0.02, 0.12, 0, 0.36, 0.45 - i * 0.24);
    for (const side of [1, -1]) {
      part(this.body, ember, 0.02, 0.05, 0.3, 0.315 * side, 0.08, -0.15);
      part(this.body, ember, 0.02, 0.18, 0.04, 0.315 * side, 0.0, 0.1);
      part(this.body, ember, 0.02, 0.04, 0.2, 0.355 * side, -0.05, 0.42);
    }

    // Head with a snout, a jaw that opens to bite, and two forward-curving horns.
    this.head.position.set(0, 0.2, 0.72);
    this.body.add(this.head);
    part(this.head, hide, 0.46, 0.42, 0.44, 0, 0.05, 0);
    part(this.head, hide, 0.3, 0.2, 0.34, 0, -0.04, 0.36);
    part(this.head, dark, 0.12, 0.06, 0.04, 0, 0.03, 0.54); // nose
    for (const side of [1, -1]) {
      part(this.head, eye, 0.08, 0.05, 0.02, 0.13 * side, 0.12, 0.225);
      // Horns: three segments, each smaller and bent further forward.
      const horn = new THREE.Group();
      horn.position.set(0.17 * side, 0.26, 0.02);
      horn.rotation.set(-0.5, 0, -0.35 * side);
      this.head.add(horn);
      let seg: THREE.Object3D = horn;
      [0.13, 0.1, 0.07].forEach((w, i) => {
        const g = new THREE.Group();
        g.position.y = i === 0 ? 0 : 0.2;
        g.rotation.x = i === 0 ? 0 : 0.55;
        seg.add(g);
        part(g, i === 2 ? dark : bone, w, 0.22, w, 0, 0.11, 0);
        seg = g;
      });
    }
    this.jaw.position.set(0, -0.14, 0.2);
    this.head.add(this.jaw);
    part(this.jaw, belly, 0.26, 0.07, 0.32, 0, 0, 0.14);
    for (const side of [1, -1]) part(this.jaw, bone, 0.04, 0.06, 0.04, 0.09 * side, 0.06, 0.26);

    for (const [x, z] of [[0.22, 0.42], [-0.22, 0.42], [0.22, -0.45], [-0.22, -0.45]]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.66, z);
      this.root.add(leg);
      part(leg, hide, 0.18, 0.6, 0.2, 0, -0.3, 0);
      part(leg, dark, 0.2, 0.1, 0.26, 0, -0.61, 0.04);
      this.legs.push(leg);
    }

    this.tail.position.set(0, 0.15, -0.62);
    this.body.add(this.tail);
    part(this.tail, hide, 0.1, 0.1, 0.5, 0, 0.12, -0.22).rotation.x = -0.5;
    part(this.tail, ember, 0.14, 0.14, 0.14, 0, 0.27, -0.45);

    scene.add(this.root);
  }

  /** Puts the dog at your heel. */
  reset(x: number, z: number, yaw: number) {
    this.pos.set(x - Math.sin(yaw) * 2 + Math.cos(yaw) * 1.5, 0, z - Math.cos(yaw) * 2 - Math.sin(yaw) * 1.5);
    this.pos.y = groundAt(this.pos.x, this.pos.z, 0.3);
    this.yaw = yaw;
    this.state = 'follow';
    this.target = null;
    this.vy = 0;
    this.airborne = false;
  }

  /** Thrown into the air (by a geyser). It doesn't mind. */
  launch(speed: number) {
    this.vy = speed;
    this.airborne = true;
  }

  private setState(s: State) {
    this.state = s;
    this.stateTime = 0;
  }

  update(dt: number, ctx: GameContext) {
    this.time += dt;
    this.stateTime += dt;
    this.biteCooldown -= dt;
    this.chargeCooldown -= dt;
    this.breathCooldown -= dt;
    const player = ctx.player;
    // The dog grows with you: it hits as hard as you do, and learns new attacks at your levels.
    const mult = player.damageMult;
    const canCharge = player.level >= UNLOCK.dogCharge;
    const canBreathe = player.level >= UNLOCK.dogFireBreath;

    // Join in on whatever angel you're fighting.
    const wanted = player.lastTarget;
    const pick = wanted && wanted.alive && player.sinceLastHit() < 12 && wanted.pos.distanceTo(player.pos) < 25 ? wanted : null;
    if (pick !== this.target) {
      if (pick && !this.target) sfx.bark(volumeAt(this.pos.distanceTo(player.pos)));
      this.target = pick;
      if (!pick && this.state !== 'follow') this.setState('follow');
      else if (pick && this.state === 'follow') this.setState('attack');
    }

    let moveX = 0;
    let moveZ = 0;
    let faceYaw: number | null = null;
    const target = this.target;

    switch (this.state) {
      case 'follow': {
        // Trot along behind your left shoulder.
        const yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        const camYaw = ctx.player.facing;
        const spotX = player.pos.x - Math.sin(camYaw) * 1.8 + Math.cos(camYaw) * 1.6;
        const spotZ = player.pos.z - Math.cos(camYaw) * 1.8 - Math.sin(camYaw) * 1.6;
        const dx = spotX - this.pos.x;
        const dz = spotZ - this.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.6) {
          const speed = Math.min(RUN_SPEED, d * 2.2);
          moveX = (dx / d) * speed;
          moveZ = (dz / d) * speed;
        } else {
          faceYaw = yaw;
        }
        break;
      }
      case 'attack': {
        if (!target) break;
        const dx = target.pos.x - this.pos.x;
        const dz = target.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz);
        const edge = d - target.radius - this.radius;
        faceYaw = Math.atan2(dx, dz);
        if (canCharge && edge > 4 && edge < 14 && this.chargeCooldown <= 0) {
          this.setState('windup');
          sfx.charge(volumeAt(this.pos.distanceTo(player.pos)));
        } else if (canBreathe && edge > 0.3 && edge < 4 && this.breathCooldown <= 0) {
          this.setState('breathe');
          sfx.dogBreath(volumeAt(this.pos.distanceTo(player.pos)));
        } else if (edge < 0.5) {
          if (this.biteCooldown <= 0) {
            this.setState('bite');
            this.chargeHit = false;
          }
        } else {
          const speed = Math.min(RUN_SPEED, edge * 3 + 2);
          moveX = (dx / d) * speed;
          moveZ = (dz / d) * speed;
        }
        break;
      }
      case 'bite': {
        if (target) faceYaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
        if (!this.chargeHit && this.stateTime > BITE_TIME * 0.45 && target) {
          this.chargeHit = true;
          sfx.bite(volumeAt(this.pos.distanceTo(player.pos)));
          if (target.pos.distanceTo(this.pos) < target.radius + this.radius + 1.1) {
            const dir = new THREE.Vector3(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
            this.damage(target, BITE_DAMAGE * mult, dir, 2, ctx);
          }
        }
        if (this.stateTime > BITE_TIME) {
          this.biteCooldown = BITE_COOLDOWN;
          this.setState(target ? 'attack' : 'follow');
        }
        break;
      }
      case 'breathe': {
        // A gout of flame from the jaws.
        if (target) faceYaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
        const mouth = new THREE.Vector3(Math.sin(this.yaw) * 1.1, 1.05, Math.cos(this.yaw) * 1.1).add(this.pos);
        const dir = target
          ? new THREE.Vector3(target.pos.x - mouth.x, target.pos.y + 1 - mouth.y, target.pos.z - mouth.z).normalize()
          : new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        breatheFire(mouth, dir, { ...BREATH, dps: BREATH.dps * mult }, dt, ctx);
        if (this.stateTime > BREATH_TIME) {
          this.breathCooldown = BREATH_COOLDOWN;
          this.setState(target ? 'attack' : 'follow');
        }
        break;
      }
      case 'windup': {
        // Head down, horns forward, paws scraping.
        if (target) {
          faceYaw = Math.atan2(target.pos.x - this.pos.x, target.pos.z - this.pos.z);
          this.chargeDir.set(target.pos.x - this.pos.x, 0, target.pos.z - this.pos.z).normalize();
        }
        if (Math.random() < dt * 20) ctx.debris.burst(new THREE.Vector3(this.pos.x, this.pos.y + 0.1, this.pos.z), 0x4a2a22, 2, 2, { size: 0.08 });
        if (this.stateTime > CHARGE_WINDUP) {
          this.setState('charge');
          this.chargeHit = false;
        }
        break;
      }
      case 'charge': {
        moveX = this.chargeDir.x * CHARGE_SPEED;
        moveZ = this.chargeDir.z * CHARGE_SPEED;
        faceYaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
        ctx.fire.burst(new THREE.Vector3(this.pos.x, this.pos.y + 0.3, this.pos.z), 0xff6a1a, 1, 1, { gravity: -2, life: 0.4, size: 0.1 });
        if (target && !this.chargeHit && target.pos.distanceTo(this.pos) < target.radius + this.radius + 0.5) {
          this.chargeHit = true;
          this.damage(target, CHARGE_DAMAGE * mult, this.chargeDir, 9, ctx);
          ctx.addShake(0.12);
          this.stateTime = CHARGE_TIME; // stop on impact
        }
        if (this.stateTime >= CHARGE_TIME) {
          this.chargeCooldown = CHARGE_COOLDOWN;
          this.biteCooldown = 0.4;
          this.setState(target ? 'attack' : 'follow');
        }
        break;
      }
    }

    // Move, leaping up ledges and keeping out from under your feet.
    const startX = this.pos.x;
    const startZ = this.pos.z;
    moveBody(this.pos, moveX * dt, moveZ * dt, this.radius * 0.8, this.airborne ? 0.5 : STEP_UP);
    const px = this.pos.x - player.pos.x;
    const pz = this.pos.z - player.pos.z;
    const pd = Math.hypot(px, pz);
    const minGap = this.radius + player.radius + 0.1;
    if (pd < minGap && pd > 1e-4) moveBody(this.pos, (px / pd) * (minGap - pd), (pz / pd) * (minGap - pd), this.radius * 0.8, STEP_UP);
    this.speed = Math.hypot(this.pos.x - startX, this.pos.z - startZ) / Math.max(dt, 1e-4);

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
      // Bound smoothly up and down blocks.
      this.pos.y += (ground - this.pos.y) * smoothing(16, dt);
    }

    if (this.pos.distanceTo(player.pos) > LEASH) {
      this.reset(player.pos.x, player.pos.z, player.facing);
      ctx.fire.burst(new THREE.Vector3(this.pos.x, this.pos.y + 0.8, this.pos.z), 0xff6a1a, 30, 4, { gravity: -3, life: 0.6, size: 0.15 });
    }

    // Lava doesn't hurt it, but it does steam.
    if (isLava(this.pos.x, this.pos.z) && this.pos.y < LAVA_Y + 0.1) {
      this.sizzle -= dt;
      if (this.sizzle <= 0) {
        this.sizzle = 0.15;
        ctx.fire.burst(new THREE.Vector3(this.pos.x, LAVA_Y + 0.1, this.pos.z), 0xff7a1a, 2, 1.5, { gravity: -3, life: 0.4, size: 0.1, spread: 0.4 });
      }
    }

    if (this.speed > 0.5 && faceYaw === null) faceYaw = Math.atan2(this.pos.x - startX, this.pos.z - startZ);
    if (faceYaw !== null) this.yaw = dampAngle(this.yaw, faceYaw, this.state === 'charge' ? 20 : 10, dt);
    this.animate(dt);
  }

  private damage(target: Angel, amount: number, dir: THREE.Vector3, knockback: number, ctx: GameContext) {
    target.takeHit(amount, dir, knockback, ctx);
    ctx.floatText(new THREE.Vector3(target.pos.x, target.pos.y + 2.3, target.pos.z), String(Math.round(amount)), 'dog');
  }

  private animate(dt: number) {
    const run = Math.min(this.speed / RUN_SPEED, 1.6);
    this.gait += dt * (3 + this.speed * 1.3);
    const swing = Math.sin(this.gait) * 0.7 * Math.min(run * 1.5, 1);
    // Diagonal pairs of legs move together.
    this.legs[0].rotation.x = swing;
    this.legs[3].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    this.legs[2].rotation.x = -swing;
    this.body.position.y = 0.88 + Math.abs(Math.sin(this.gait)) * 0.06 * run;

    let headPitch = Math.sin(this.time * 1.5) * 0.05;
    let jawOpen = this.state === 'follow' && run < 0.1 ? 0.15 + Math.sin(this.time * 9) * 0.08 : 0.05; // panting
    if (this.state === 'windup' || this.state === 'charge') headPitch = 0.45;
    if (this.state === 'breathe') jawOpen = 0.8;
    if (this.state === 'bite') {
      const t = this.stateTime / BITE_TIME;
      headPitch = t < 0.45 ? -0.2 : 0.25;
      jawOpen = t < 0.45 ? 0.7 : 0;
    }
    this.head.rotation.x += (headPitch - this.head.rotation.x) * smoothing(18, dt);
    this.jaw.rotation.x += (jawOpen - this.jaw.rotation.x) * smoothing(25, dt);
    // A wagging tail when content; held straight out when running.
    this.tail.rotation.y = run < 0.2 ? Math.sin(this.time * 10) * 0.5 : Math.sin(this.gait) * 0.15;

    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
  }
}
