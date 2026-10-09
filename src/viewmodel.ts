import * as THREE from 'three';
import { clamp, smoothing } from './util';

/**
 * The demon's own arms and weapon, seen in first person. Drawn in its own
 * scene on top of the world so it never sinks into walls.
 *
 * Camera space: x right, y up, -z forward.
 */

export type SwingKind = 'smash' | 'sweep';

/** Key positions of the ball during a swing, in camera space, at fractions of the swing's duration. */
interface Key {
  t: number;
  ball: [number, number, number];
  hand: [number, number, number];
}

const REST_HAND = new THREE.Vector3(0.28, -0.27, -0.72);
const SHOULDER_R = new THREE.Vector3(0.5, -1.05, -0.12);
const SHOULDER_L = new THREE.Vector3(-0.55, -1.1, -0.12);
const REST_LEFT = new THREE.Vector3(-0.42, -0.47, -0.74);
/** At rest the handle is held up and forward so the ball dangles in view. */
const HANDLE_UP = new THREE.Vector3(-0.2, 0.75, -0.6).normalize();
const HANDLE_LENGTH = 0.28;
const CHAIN_LENGTH = 0.42;
const LINKS = 9;

const SWINGS: Record<SwingKind, Key[]> = {
  // Wind up over the right shoulder, then bring it straight down in front.
  smash: [
    { t: 0.28, ball: [0.6, 0.5, 0.35], hand: [0.38, -0.12, -0.38] },
    { t: 0.42, ball: [0.25, 0.95, -0.9], hand: [0.3, -0.05, -0.6] },
    { t: 0.52, ball: [0.0, -0.4, -2.4], hand: [0.14, -0.3, -0.78] },
    { t: 0.75, ball: [0.04, -0.6, -2.1], hand: [0.2, -0.38, -0.7] },
  ],
  // Swing it out to the right and whip it across from right to left.
  sweep: [
    { t: 0.3, ball: [1.3, 0.05, -0.2], hand: [0.45, -0.28, -0.42] },
    { t: 0.45, ball: [0.75, 0.05, -1.9], hand: [0.32, -0.26, -0.68] },
    { t: 0.55, ball: [-0.1, 0.0, -2.5], hand: [0.05, -0.28, -0.78] },
    { t: 0.7, ball: [-1.3, -0.05, -1.3], hand: [-0.12, -0.32, -0.62] },
    { t: 0.85, ball: [-0.9, -0.3, -0.5], hand: [0.05, -0.36, -0.55] },
  ],
};

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** Points the box mesh's +Z from `from` to `to` and stretches it to fit. */
function span(mesh: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  const d = tmpA.subVectors(to, from);
  const len = d.length();
  mesh.position.copy(from).addScaledVector(d, 0.5);
  if (len > 1e-6) mesh.quaternion.setFromUnitVectors(Z, d.divideScalar(len));
  mesh.scale.z = len;
}

/** Catmull-Rom interpolation through four points. */
function catmull(p0: THREE.Vector3, p1: THREE.Vector3, p2: THREE.Vector3, p3: THREE.Vector3, u: number, out: THREE.Vector3) {
  const u2 = u * u;
  const u3 = u2 * u;
  for (const k of ['x', 'y', 'z'] as const) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

export class ViewModel {
  readonly scene = new THREE.Scene();
  /** Follows the camera; everything else hangs from it in camera space. */
  private readonly rig = new THREE.Group();
  private readonly armR: THREE.Mesh;
  private readonly handR = new THREE.Group();
  private readonly armL: THREE.Mesh;
  private readonly handL = new THREE.Group();
  private readonly handle: THREE.Mesh;
  private readonly links: THREE.Mesh[] = [];
  private readonly ball = new THREE.Group();

  /** The ball, simulated in world space so it swings when you move and turn. */
  readonly ballWorld = new THREE.Vector3();
  private readonly ballVel = new THREE.Vector3();
  private settled = false;

  private readonly hand = REST_HAND.clone();
  private readonly ballLocal = new THREE.Vector3();
  private readonly swingStart = new THREE.Vector3();
  private readonly swingHandStart = new THREE.Vector3();
  private lastSwing: SwingKind | null = null;
  private sway = new THREE.Vector2();
  /** 0 = handle held upright at rest, 1 = handle following the swing. */
  private aim = 0;
  private readonly anchor = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();

  constructor() {
    const hemi = new THREE.HemisphereLight(0xd07050, 0x501408, 2.4);
    const key = new THREE.DirectionalLight(0xffb090, 1.6);
    key.position.set(-1, 2, 1);
    this.scene.add(hemi, key, this.rig);

    const skin = lambert(0x8a1e14);
    const dark = lambert(0x3a0c08);
    const claw = lambert(0x1a1210);
    const iron = lambert(0x3a3a42);
    const steel = lambert(0xa8a8b4);
    const box = new THREE.BoxGeometry(1, 1, 1);

    const arm = (thick: number) => {
      const m = new THREE.Mesh(box, skin);
      m.scale.set(thick, thick, 1);
      this.rig.add(m);
      return m;
    };
    this.armR = arm(0.12);
    this.armL = arm(0.11);

    // Hands: a red fist with black claws; ridges of spikes on the knuckles.
    const buildHand = (g: THREE.Group, grip: boolean) => {
      const palm = new THREE.Mesh(box, skin);
      palm.scale.set(0.17, 0.15, 0.18);
      g.add(palm);
      for (let i = 0; i < 4; i++) {
        const c = new THREE.Mesh(box, claw);
        const x = -0.06 + i * 0.04;
        if (grip) {
          c.scale.set(0.035, 0.1, 0.035);
          c.position.set(x, -0.04, 0.1);
        } else {
          c.scale.set(0.03, 0.03, 0.14);
          c.position.set(x, -0.03, 0.14);
          c.rotation.x = 0.4;
        }
        g.add(c);
      }
      const ridge = new THREE.Mesh(box, dark);
      ridge.scale.set(0.12, 0.04, 0.05);
      ridge.position.set(0, 0.08, 0.04);
      g.add(ridge);
      g.scale.setScalar(0.75);
      this.rig.add(g);
    };
    buildHand(this.handR, true);
    buildHand(this.handL, false);

    this.handle = new THREE.Mesh(box, iron);
    this.handle.scale.set(0.05, 0.05, 1);
    this.rig.add(this.handle);

    for (let i = 0; i < LINKS; i++) {
      const link = new THREE.Mesh(box, iron);
      link.scale.set(i % 2 ? 0.02 : 0.045, i % 2 ? 0.045 : 0.02, 1);
      this.links.push(link);
      this.rig.add(link);
    }

    // The spiked ball: a blocky iron core studded with steel spikes.
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 0), iron);
    this.ball.add(core);
    const spike = new THREE.ConeGeometry(0.045, 0.13, 4);
    const dirs = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
      [1, 1, 1], [-1, 1, -1], [1, -1, -1], [-1, -1, 1],
    ];
    for (const [x, y, z] of dirs) {
      const d = new THREE.Vector3(x, y, z).normalize();
      const s = new THREE.Mesh(spike, steel);
      s.position.copy(d).multiplyScalar(0.16);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
      this.ball.add(s);
    }
    this.ball.scale.setScalar(0.8);
    this.rig.add(this.ball);
  }

  /**
   * Places the arms and swings the ball. `swing` is the current attack and
   * its progress 0..1 (null when not attacking). `bob` and `phase` come
   * from walking; `lookDelta` is this frame's mouse movement.
   */
  update(dt: number, camera: THREE.Camera, swing: { kind: SwingKind; t: number } | null, bob: number, phase: number, lookDelta: { x: number; y: number }) {
    this.rig.position.copy(camera.position);
    this.rig.quaternion.copy(camera.quaternion);
    this.rig.updateMatrixWorld();

    // The arms lag a little behind fast turns.
    this.sway.x = clamp(this.sway.x * (1 - smoothing(10, dt)) - lookDelta.x * 0.0004, -0.08, 0.08);
    this.sway.y = clamp(this.sway.y * (1 - smoothing(10, dt)) + lookDelta.y * 0.0004, -0.08, 0.08);
    const bobX = Math.sin(phase) * 0.025 * bob + this.sway.x;
    const bobY = -Math.abs(Math.cos(phase)) * 0.025 * bob + this.sway.y;

    if (swing) {
      if (swing.kind !== this.lastSwing || swing.t < 0.02) {
        // A new swing starts from wherever the ball and hand are now.
        this.swingStart.copy(this.ballLocal);
        this.swingHandStart.copy(this.hand);
      }
      this.lastSwing = swing.kind;
      this.scripted(SWINGS[swing.kind], swing.t, dt);
    } else {
      this.lastSwing = null;
      this.hand.lerp(tmpA.copy(REST_HAND), smoothing(10, dt));
    }
    this.aim += ((swing ? 1 : 0) - this.aim) * smoothing(swing ? 30 : 6, dt);

    const hand = tmpB.copy(this.hand);
    hand.x += bobX;
    hand.y += bobY;
    this.handR.position.copy(hand);
    span(this.armR, SHOULDER_R, hand);
    this.handR.quaternion.copy(this.armR.quaternion);

    const left = tmpC.copy(REST_LEFT);
    left.x += bobX * 0.8;
    left.y += bobY * 1.2 - (swing ? 0.12 : 0); // tucked down out of the way while swinging
    this.handL.position.copy(left);
    span(this.armL, SHOULDER_L, left);
    this.handL.quaternion.copy(this.armL.quaternion);

    // At rest the handle is held upright; mid-swing it points along the chain.
    const toBall = tmpA.subVectors(this.ballLocal, hand);
    if (toBall.lengthSq() > 1e-6) toBall.normalize();
    const handleDir = toBall.multiplyScalar(this.aim).addScaledVector(HANDLE_UP, 1 - this.aim).normalize();
    const tip = this.tip.copy(hand).addScaledVector(handleDir, HANDLE_LENGTH);
    span(this.handle, hand, tip);
    if (!swing) this.simulate(dt, tip);
    this.ball.position.copy(this.ballLocal);
    this.ball.rotation.x += dt * (swing ? 14 : 1);
    this.ball.rotation.y += dt * (swing ? 9 : 0.6);
    this.drawChain(tip);
  }

  /** Follows the swing's key positions, remembering the speed for when it lets go. */
  private scripted(keys: Key[], t: number, dt: number) {
    const ballPts = [this.swingStart, ...keys.map((k) => new THREE.Vector3(...k.ball))];
    const handPts = [this.swingHandStart, ...keys.map((k) => new THREE.Vector3(...k.hand))];
    const times = [0, ...keys.map((k) => k.t)];
    const prev = tmpA.copy(this.ballWorld);
    if (t >= times[times.length - 1]) {
      // Hold the last pose until the swing ends.
      this.ballLocal.copy(ballPts[ballPts.length - 1]);
      this.hand.copy(handPts[handPts.length - 1]);
    } else {
      let s = 0;
      while (t > times[s + 1]) s++;
      const u = (t - times[s]) / (times[s + 1] - times[s]);
      const at = (pts: THREE.Vector3[], i: number) => pts[clamp(i, 0, pts.length - 1)];
      catmull(at(ballPts, s - 1), at(ballPts, s), at(ballPts, s + 1), at(ballPts, s + 2), u, this.ballLocal);
      catmull(at(handPts, s - 1), at(handPts, s), at(handPts, s + 1), at(handPts, s + 2), u, this.hand);
    }
    this.ballWorld.copy(this.ballLocal).applyMatrix4(this.rig.matrixWorld);
    if (dt > 0) this.ballVel.subVectors(this.ballWorld, prev).divideScalar(dt).clampLength(0, 25);
    this.settled = true;
  }

  /** Lets the ball hang and swing from the handle on its chain. */
  private simulate(dt: number, tip: THREE.Vector3) {
    const anchor = this.anchor.copy(tip).applyMatrix4(this.rig.matrixWorld);
    if (!this.settled) {
      this.ballWorld.copy(anchor).y -= CHAIN_LENGTH;
      this.ballVel.set(0, 0, 0);
      this.settled = true;
    }
    // Several small steps keep the chain stable.
    const steps = 3;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.ballVel.y -= 14 * h;
      this.ballVel.multiplyScalar(1 - Math.min(1, 2.2 * h));
      this.ballWorld.addScaledVector(this.ballVel, h);
      // The chain can't stretch: pull the ball back and cancel the outward speed.
      const off = tmpC.subVectors(this.ballWorld, anchor);
      const len = off.length();
      if (len > CHAIN_LENGTH) {
        off.divideScalar(len);
        this.ballWorld.copy(anchor).addScaledVector(off, CHAIN_LENGTH);
        const out = this.ballVel.dot(off);
        if (out > 0) this.ballVel.addScaledVector(off, -out);
      }
    }
    this.ballLocal.copy(this.ballWorld);
    this.rig.worldToLocal(this.ballLocal);
  }

  /** Lays the links from the handle tip to the ball, sagging when the chain is slack. */
  private drawChain(tip: THREE.Vector3) {
    const end = this.ballLocal;
    const dist = tip.distanceTo(end);
    const slack = Math.max(0, CHAIN_LENGTH - dist);
    const mid = new THREE.Vector3().addVectors(tip, end).multiplyScalar(0.5);
    mid.y -= slack * 0.8;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const point = (u: number, out: THREE.Vector3) => {
      // Quadratic curve through the sagging middle.
      const k = 1 - u;
      return out.set(
        k * k * tip.x + 2 * k * u * mid.x + u * u * end.x,
        k * k * tip.y + 2 * k * u * mid.y + u * u * end.y,
        k * k * tip.z + 2 * k * u * mid.z + u * u * end.z,
      );
    };
    for (let i = 0; i < LINKS; i++) {
      point(i / LINKS, a);
      point((i + 1) / LINKS, b);
      span(this.links[i], a, b);
      this.links[i].scale.z *= 1.15; // links overlap a little so the chain looks solid
    }
  }

  /** Puts the ball back to hanging still (after respawning). */
  reset() {
    this.settled = false;
  }
}
