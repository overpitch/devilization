import * as THREE from 'three';
import { createHumanoid, HIPS_HEIGHT, setFlash, type Humanoid } from './character';
import { buildWeaponMesh } from './weapons';
import type { Player } from './player';

const box = new THREE.BoxGeometry(1, 1, 1);
const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const HURT = new THREE.Color(0xffffff);

/** Skin and clothes for each player's demon, so co-op partners can tell each other apart. */
const LOOKS = [
  { skin: 0xa8281c, shirt: 0x3a1410, pants: 0x241010, horns: 0x1a1210, wing: 0x4a1410 },
  { skin: 0x5a2a8a, shirt: 0x24143a, pants: 0x180e24, horns: 0x101018, wing: 0x2a1450 },
];

/**
 * A demon's body as the other player sees it in split screen: horns,
 * the weapon it holds, wings in flight, and its size. Each player's
 * camera skips their own body (it sits on that player's render layer).
 */
export class Avatar {
  readonly root = new THREE.Group();
  private readonly h: Humanoid;
  private readonly wings: THREE.Group[] = [];
  private weaponKey = '';
  private weaponMesh: THREE.Group | null = null;
  private gait = 0;

  /** `slot` 0 is Player 1, 1 is Player 2; the body lives on render layer slot + 1. */
  constructor(
    scene: THREE.Scene,
    readonly slot: number,
  ) {
    const look = LOOKS[slot];
    this.h = createHumanoid({ skin: look.skin, shirt: look.shirt, pants: look.pants, boots: 0x101010, eyes: 0xffd040, glowingEyes: true, belt: 0x1a0c0a });
    this.root.add(this.h.root);

    const hornMat = lambert(look.horns);
    for (const side of [1, -1]) {
      const horn = new THREE.Group();
      horn.position.set(0.15 * side, 0.36, 0);
      horn.rotation.z = -0.5 * side;
      this.h.head.add(horn);
      const a = new THREE.Mesh(box, hornMat);
      a.scale.set(0.09, 0.22, 0.09);
      a.position.y = 0.1;
      horn.add(a);
      const b = new THREE.Mesh(box, hornMat);
      b.scale.set(0.06, 0.18, 0.06);
      b.position.set(0.04 * side, 0.26, 0);
      b.rotation.z = 0.6 * side;
      horn.add(b);
    }
    // A pointed tail.
    const tail = new THREE.Mesh(box, lambert(look.skin));
    tail.scale.set(0.06, 0.06, 0.6);
    tail.position.set(0, -0.05, -0.38);
    tail.rotation.x = 0.6;
    this.h.hips.add(tail);

    const wingMat = lambert(look.wing);
    for (const side of [1, -1]) {
      const wing = new THREE.Group();
      wing.position.set(0.12 * side, 0.5, -0.18);
      this.h.torso.add(wing);
      for (const [len, y] of [
        [1.1, 0.1],
        [0.9, -0.14],
        [0.6, -0.36],
      ]) {
        const m = new THREE.Mesh(box, wingMat);
        m.scale.set(len, 0.24, 0.05);
        m.position.set((len / 2) * side, y, 0);
        wing.add(m);
      }
      wing.visible = false;
      this.wings.push(wing);
    }

    this.root.traverse((o) => {
      o.layers.set(slot + 1);
      if (o instanceof THREE.Mesh) o.castShadow = false;
    });
    this.root.visible = false;
    scene.add(this.root);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  update(dt: number, p: Player) {
    const h = this.h;
    this.root.position.copy(p.pos);
    this.root.rotation.y = p.facing;
    this.root.scale.setScalar(p.scale);

    const w = p.weapon;
    const key = `${w.id}|${w.enchant ?? ''}`;
    if (key !== this.weaponKey) {
      this.weaponKey = key;
      if (this.weaponMesh) h.armR.remove(this.weaponMesh);
      this.weaponMesh = buildWeaponMesh(w.id, w.enchant);
      this.weaponMesh.position.set(0, -0.64, 0);
      this.weaponMesh.traverse((o) => o.layers.set(this.slot + 1));
      h.armR.add(this.weaponMesh);
    }

    // Lying where it fell.
    if (!p.alive) {
      h.root.rotation.x = -Math.PI / 2;
      h.root.position.y = 0.3;
      return;
    }
    h.root.rotation.x = 0;
    h.root.position.y = 0;

    const moving = Math.min(1, Math.hypot(p.vel.x, p.vel.z) / 5);
    this.gait += dt * (4 + moving * 7);
    const swing = Math.sin(this.gait) * 0.7 * moving * (p.flying ? 0.2 : 1);
    h.legL.rotation.x = swing;
    h.legR.rotation.x = -swing;
    h.hips.position.y = HIPS_HEIGHT + Math.abs(Math.sin(this.gait)) * 0.04 * moving - (p.sneaking ? 0.2 : 0);
    h.torso.rotation.x = p.sneaking ? 0.35 : 0;
    h.armL.rotation.set(-swing * 0.6, 0, 0.08);
    const s = p.swingInfo;
    if (s) {
      // A blow: the arm comes over and down.
      const t = s.t;
      h.armR.rotation.set(-2.6 + t * 2.6, 0, -0.2);
    } else if (p.breathing) {
      h.armR.rotation.set(-0.6, 0, -0.2);
    } else {
      h.armR.rotation.set(-0.35 + swing * 0.3, 0, -0.08);
    }
    const flap = p.flying ? Math.sin(performance.now() * 0.012) * 0.6 : 0;
    this.wings.forEach((wing, i) => {
      wing.visible = p.flying;
      wing.rotation.y = (i === 0 ? -1 : 1) * (0.4 + flap);
    });
    setFlash(h, HURT, p.hurtFlash * 0.6);
  }
}
