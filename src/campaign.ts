import * as THREE from 'three';
import { createHumanoid, setFlash, type Humanoid } from './character';
import { Fighter, type FighterKind, type SpawnOptions } from './fighter';
import { buildWeaponMesh, randomWeaponEnchant, WEAPON_ENCHANTS, weaponName, weaponPower, type Quality, type Weapon, type WeaponId } from './weapons';
import { addCollider, findOpenSpot, groundAt, heightAt, isLava, planeGates, type Gate } from './world';
import { LAIR, PORTAL, SPAWN, THRONE } from './layout';
import { ALL_PLANE_NAMES, BUILT_PLANES, PLANES, plane, type PlaneDef } from './planes';
import { sfx } from './audio';
import { RANKS } from './progression';
import type { GameContext } from './types';

/**
 * A plane's story: its ruler and missions, the angels' camp and watchpost,
 * the treasure chest, the Hellgate, ambient patrols, and weapons lying on
 * the ground. A new Campaign is built for each plane you visit; what you've
 * achieved everywhere lives in Progress.
 */

export type MissionKind = 'war' | 'retrieve' | 'assassinate';

/** What you've done across all the planes (saved). */
export interface Progress {
  /** Main missions finished, as "plane:mission" (e.g. "1:crown"). */
  done: Set<string>;
  /** Planes whose treasure chest you've opened. */
  chests: Set<number>;
  /** Planes whose ruler you've met. */
  talked: Set<number>;
  sideDone: number;
}

export interface Offer {
  id: string;
  title: string;
  kind: MissionKind;
  main: boolean;
  /** What the ruler says about it. */
  brief: string;
  /** What the ruler says when you report back. */
  praise?: string;
  reward: { xp: number; gold: number };
  /** Where a side mission takes place. */
  spot?: { x: number; z: number };
  /** Side missions: which template. */
  template?: 'patrol' | 'captain' | 'gem' | 'assault';
}

interface Item {
  name: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  carried: boolean;
}

interface Running {
  offer: Offer;
  phase: 'go' | 'fight' | 'return';
  fighters: Fighter[];
  target: Fighter | null;
  item: Item | null;
  allies: Fighter[];
  wave: number;
  waveTimer: number;
  /** Nobody raised the alarm before the target died. */
  unseen: boolean;
  /** War missions: where you hold, and where the angels come from. */
  war: { defend: { x: number; z: number }; from: { x: number; z: number } } | null;
}

export interface Interactable {
  pos: THREE.Vector3;
  label: string;
  /** How close you must be. */
  range: number;
  /** The ruler and the Hellgate open dialogs (through main). */
  kind?: 'ruler' | 'portal';
  act(): void;
}

/** What a dialog shows: the ruler's words and missions, or the Hellgate's planes. */
export interface Dialog {
  name: string;
  title: string;
  speech: string;
  cards: { title: string; tag: string; main: boolean; text: string; reward: string; button: string; disabled?: boolean; act: () => void }[];
}

export interface CampaignHooks {
  spawn(kind: FighterKind, x: number, z: number, opts?: SpawnOptions): Fighter;
  reward(xp: number, gold: number): void;
  announce(title: string, detail: string): void;
  toast(text: string): void;
  promoted(rank: number): void;
  dropGold(at: THREE.Vector3, coins: number, valueEach: number): void;
  /** Called when the dialog's contents change while it's open. */
  refreshDialog(): void;
  /** Go to another plane (1-based). */
  travel(index: number): void;
  /** Heaven's general is dead: you are Demon Lord. */
  victory(): void;
  save(): void;
}

const KIND_TAG: Record<MissionKind, string> = { war: 'War front', retrieve: 'Retrieval', assassinate: 'Assassination' };

const CAPTAIN_NAMES = ['Auriel', 'Seraphon', 'Cassiel', 'Zadkiel', 'Haniel', 'Barachiel', 'Jophiel', 'Raziel', 'Phanuel', 'Sachiel'];
const SIDE_TEMPLATES = {
  patrol: { kind: 'war' as const, title: 'Cull the Patrol', brief: 'An angel patrol is sniffing around my lands. Hunt them down, every one.' },
  captain: { kind: 'assassinate' as const, title: 'Silence the Captain', brief: 'An angel captain is scouting my lands. Kill the captain. Unseen pays double.' },
  gem: { kind: 'retrieve' as const, title: 'Recover the Soul Gem', brief: 'One of my soul gems was taken by angels. Bring it back before they carry it off to heaven.' },
  assault: { kind: 'war' as const, title: "Heaven's Counterattack", brief: 'Angels are marching on one of my outposts. Take my imps and hold it until their waves break.' },
};

const lambert = (color: number, emissive = 0) => new THREE.MeshLambertMaterial({ color, emissive, flatShading: true });
const box = new THREE.BoxGeometry(1, 1, 1);

function part(g: THREE.Object3D, m: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number) {
  const mesh = new THREE.Mesh(box, m);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** The plane's ruler: a huge horned demon seated on an obsidian throne. */
class Ruler {
  readonly pos: THREE.Vector3;
  readonly h: Humanoid;
  private time = 0;
  private talking = 0;
  private readonly glow: THREE.Color;

  constructor(root: THREE.Object3D, p: PlaneDef) {
    const r = p.ruler;
    const y = heightAt(THRONE.x, THRONE.z);
    this.pos = new THREE.Vector3(THRONE.x, y, THRONE.z);
    const throne = new THREE.Group();
    throne.position.copy(this.pos);
    const obsidian = lambert(0x221830);
    const seam = lambert(r.eyes, new THREE.Color(r.eyes).multiplyScalar(0.6).getHex());
    const bone = lambert(0xd6cbb0);
    part(throne, obsidian, 2.4, 1.0, 1.8, 0, 0.5, -0.2); // seat
    part(throne, obsidian, 2.6, 4.2, 0.5, 0, 2.1, -1.0); // back
    part(throne, seam, 0.12, 3.6, 0.1, 0, 2.2, -0.74); // glowing seam up the back
    for (const s of [1, -1]) {
      part(throne, obsidian, 0.4, 1.6, 1.8, 1.25 * s, 0.8, -0.2); // armrests
      part(throne, obsidian, 0.3, 1.2, 0.3, 1.2 * s, 4.6, -1.0); // spikes on top
      part(throne, bone, 0.32, 0.3, 0.34, 1.25 * s, 1.75, 0.55); // skulls on the armrests
    }
    root.add(throne);
    addCollider({ x: THRONE.x, z: THRONE.z - 0.3, r: 1.3 });

    this.h = createHumanoid({ skin: r.skin, shirt: r.robe, pants: r.robe, boots: 0x0c0606, eyes: r.eyes, glowingEyes: true, belt: 0xd9b24a, armor: 0x2a1a14 });
    this.h.root.scale.setScalar(1.9);
    this.h.root.position.set(THRONE.x, y + 0.2, THRONE.z + 0.15);
    // Seated: thighs forward, shins down.
    this.h.hips.position.y = 0.55;
    for (const leg of [this.h.legL, this.h.legR]) leg.rotation.x = -1.45;
    this.h.armL.rotation.set(-0.5, 0, 0.25);
    this.h.armR.rotation.set(-0.5, 0, -0.25);
    // Great curling horns and a crown of gold spikes.
    const horn = lambert(r.horns);
    for (const s of [1, -1]) {
      const g = new THREE.Group();
      g.position.set(0.17 * s, 0.38, 0);
      this.h.head.add(g);
      part(g, horn, 0.1, 0.24, 0.1, 0.05 * s, 0.1, 0).rotation.z = -0.6 * s;
      part(g, horn, 0.08, 0.22, 0.08, 0.18 * s, 0.26, 0).rotation.z = -0.2 * s;
      part(g, horn, 0.06, 0.18, 0.06, 0.22 * s, 0.44, 0.04).rotation.z = 0.4 * s;
    }
    const gold = lambert(0xd9b24a, 0x3a2a00);
    for (let i = 0; i < 5; i++) part(this.h.head, gold, 0.06, 0.12 + (i % 2) * 0.06, 0.06, -0.14 + i * 0.07, 0.46, 0.17);
    const cape = new THREE.Mesh(box, lambert(0x5a0a0a));
    cape.scale.set(0.7, 1.0, 0.05);
    cape.position.set(0, 0.1, -0.2);
    this.h.torso.add(cape);
    root.add(this.h.root);
    this.glow = new THREE.Color(r.eyes);
  }

  /** Speaks: sound, and a moment of glowing eyes. */
  speak() {
    sfx.rulerVoice();
    this.talking = 1.4;
  }

  update(dt: number, player: THREE.Vector3) {
    this.time += dt;
    this.talking = Math.max(0, this.talking - dt);
    // Watches you when you come near.
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const near = Math.hypot(dx, dz) < 16;
    const look = near ? Math.max(-0.8, Math.min(0.8, Math.atan2(dx, dz))) : Math.sin(this.time * 0.3) * 0.3;
    this.h.head.rotation.y += (look - this.h.head.rotation.y) * Math.min(1, dt * 3);
    this.h.torso.rotation.x = Math.sin(this.time * 0.8) * 0.02;
    this.h.armR.rotation.x = -0.5 - (this.talking > 0 ? Math.sin(this.talking * 6) * 0.3 + 0.3 : 0);
    setFlash(this.h, this.glow, this.talking > 0 ? 0.25 : 0.08);
  }
}

/** A weapon lying on the ground, glowing so it's easy to spot. */
interface Drop {
  weapon: Weapon;
  group: THREE.Group;
  pos: THREE.Vector3;
  age: number;
}

const QUALITY_GLOW = [0x9a9a9a, 0xfff2c0, 0x6ad0ff];

export class Campaign {
  active: Running | null = null;
  readonly plane: PlaneDef;
  private offers: Offer[] = [];
  private readonly ruler: Ruler;
  private readonly drops: Drop[] = [];
  private readonly chest: THREE.Group;
  private readonly chestLid: THREE.Group;
  private chestOpenT = 0;
  private readonly portalGlow: THREE.Mesh;
  /** The rubble blocking a vault, by gate (removed when smashed). */
  private readonly rubble = new Map<Gate, THREE.Group>();
  private readonly ambient: { at: { x: number; z: number }; fighters: Fighter[]; respawn: number }[] = [];
  private time = 0;
  private playerPos = new THREE.Vector3();

  constructor(
    private readonly root: THREE.Object3D,
    private readonly progress: Progress,
    private readonly hooks: CampaignHooks,
  ) {
    this.plane = plane();
    this.ruler = new Ruler(root, this.plane);
    this.buildCamp();
    this.buildWatchpost();
    this.buildBraziers();
    this.portalGlow = this.buildPortal();
    this.buildGates();
    const ch = this.buildChest();
    this.chest = ch.group;
    this.chestLid = ch.lid;
    this.chestOpenT = this.chestOpened ? 1 : 0;
    // Three angel patrols roam the plane between missions.
    for (let i = 0; i < 3; i++) {
      const at = findOpenSpot(SPAWN.x, SPAWN.z, 35);
      if (at) this.ambient.push({ at, fighters: [], respawn: 0 });
    }
  }

  private get chestOpened() {
    return this.progress.chests.has(this.plane.index);
  }

  private get rulerName() {
    return this.plane.ruler.name;
  }

  // ---------- Scenery ----------

  /** The angels' camp: white tents, a holy banner, and the altar where the stolen treasure sits. */
  private buildCamp() {
    const c = this.plane.missions.retrieve.camp;
    const g = new THREE.Group();
    const cloth = lambert(0xf2eee2);
    const gold = lambert(0xd9b24a);
    for (const [x, z, r] of [[-4, 3, 0.3], [4, 4, -0.4], [0, -5, 0]]) {
      const tent = new THREE.Group();
      tent.position.set(c.x + x, heightAt(c.x + x, c.z + z), c.z + z);
      tent.rotation.y = r;
      // A pitched roof of two slabs over a box.
      part(tent, cloth, 2.4, 1.2, 2.6, 0, 0.6, 0);
      part(tent, cloth, 1.7, 0.12, 2.8, 0.62, 1.55, 0).rotation.z = -0.75;
      part(tent, cloth, 1.7, 0.12, 2.8, -0.62, 1.55, 0).rotation.z = 0.75;
      part(tent, gold, 0.1, 0.1, 2.9, 0, 2.15, 0);
      g.add(tent);
      addCollider({ x: c.x + x, z: c.z + z, r: 1.4 });
    }
    // Banner of heaven: white and gold on a tall pole.
    const y = heightAt(c.x, c.z);
    part(g, gold, 0.12, 5, 0.12, c.x + 2, y + 2.5, c.z);
    part(g, cloth, 0.05, 1.6, 1.1, c.x + 2, y + 4, c.z + 0.6);
    part(g, gold, 0.06, 0.6, 0.12, c.x + 2, y + 4.1, c.z + 0.6);
    // The altar.
    part(g, cloth, 1.2, 0.9, 0.8, c.x, y + 0.45, c.z);
    part(g, gold, 1.3, 0.1, 0.9, c.x, y + 0.95, c.z);
    this.root.add(g);
  }

  /** The angels' white stone watchpost, where the assassination target waits. */
  private buildWatchpost() {
    const post = this.plane.missions.assassinate.post;
    const g = new THREE.Group();
    const stone = lambert(0xe8e4da);
    const gold = lambert(0xd9b24a);
    const x = post.x - 4;
    const z = post.z + 3;
    const y = heightAt(x, z);
    part(g, stone, 2.4, 5, 2.4, x, y + 2.5, z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(g, stone, 0.5, 0.6, 0.5, x + dx * 1.1, y + 5.3, z + dz * 1.1);
    part(g, gold, 0.1, 2.2, 0.1, x, y + 6.1, z);
    part(g, lambert(0xf2eee2), 0.05, 0.9, 1.1, x, y + 6.6, z + 0.6);
    this.root.add(g);
    addCollider({ x, z, r: 1.6 });
  }

  /** Burning braziers at the front of the lair. */
  private buildBraziers() {
    const iron = lambert(0x2a2228);
    for (const s of [1, -1]) {
      const x = LAIR.x + s * (LAIR.halfWidth - 1.5);
      const z = LAIR.z + LAIR.depth / 2 - 1.5;
      const g = new THREE.Group();
      g.position.set(x, heightAt(x, z), z);
      part(g, iron, 0.25, 1.1, 0.25, 0, 0.55, 0);
      part(g, iron, 0.8, 0.25, 0.8, 0, 1.2, 0);
      part(g, lambert(0xff6a10, 0xff4a00), 0.6, 0.15, 0.6, 0, 1.36, 0);
      this.root.add(g);
    }
  }

  /**
   * The ways into treasure vaults: a narrow crack glowing in the wall
   * (only a tiny demon fits), or a heap of boulders (a huge demon smashes it).
   */
  private buildGates() {
    for (const g of planeGates()) {
      const y = heightAt(g.x, g.z);
      const grp = new THREE.Group();
      grp.position.set(g.x, y, g.z);
      if (g.kind === 'crack') {
        // The wall continues above a low, dark slit with a faint red glow inside.
        part(grp, lambert(this.plane.palette.spire[0]), 1.0, 4.0, 1.0, 0, 3.0, 0);
        part(grp, new THREE.MeshBasicMaterial({ color: 0x120404 }), 0.5, 1.0, 1.02, 0, 0.5, 0);
        part(grp, lambert(0x2a0804, 0x8a1a04), 0.1, 0.9, 1.04, 0, 0.5, 0);
      } else {
        // Loose boulders heaped in the doorway.
        // (The doorway is open above: a huge demon is too tall for a lintel.)
        const rock = lambert(this.plane.palette.rock[0]);
        const width = g.hw * 2;
        for (let i = 0; i < 9; i++) {
          const size = (0.6 + Math.random() * 0.4) * (width / 2);
          const b = part(grp, rock, size, size, size, ((i % 3) - 1) * g.hw * 0.66, 0.4 + Math.floor(i / 3) * 0.7, (Math.random() - 0.5) * 0.4);
          b.rotation.set(Math.random(), Math.random(), Math.random());
        }
        this.rubble.set(g, grp);
      }
      this.root.add(grp);
    }
  }

  /** A huge demon walking into rubble smashes it apart. */
  private updateGates(ctx: GameContext) {
    const p = ctx.player;
    for (const [g, grp] of this.rubble) {
      if (g.open) continue;
      const near = Math.abs(p.pos.x - g.x) < g.hw + p.radius + 0.3 && Math.abs(p.pos.z - g.z) < g.hd + p.radius + 0.3;
      if (!near) continue;
      if (p.size !== 1) {
        if (Math.random() < 0.01) ctx.toast('Only something huge could move these boulders');
        continue;
      }
      g.open = true;
      grp.clear();
      const at = new THREE.Vector3(g.x, heightAt(g.x, g.z) + 0.8, g.z);
      ctx.debris.burst(at, this.plane.palette.rock[0], 40, 7, { size: 0.25, spread: 0.6 });
      sfx.thud();
      sfx.spikes();
      ctx.addShake(0.4);
      ctx.toast('You smash the boulders aside');
    }
  }

  /** The Hellgate: two obsidian pillars and a lintel around a sheet of swirling fire. */
  private buildPortal() {
    const g = new THREE.Group();
    g.position.set(PORTAL.x, heightAt(PORTAL.x, PORTAL.z), PORTAL.z);
    const obsidian = lambert(0x221830);
    const trim = lambert(0xff4a10, 0xc02a00);
    for (const s of [1, -1]) {
      part(g, obsidian, 0.8, 4.6, 0.8, 0, 2.3, 1.7 * s);
      part(g, trim, 0.82, 0.12, 0.82, 0, 1.2, 1.7 * s);
      part(g, trim, 0.82, 0.12, 0.82, 0, 3.4, 1.7 * s);
      addCollider({ x: PORTAL.x, z: PORTAL.z + 1.7 * s, r: 0.55 });
    }
    part(g, obsidian, 1.0, 0.8, 4.6, 0, 4.9, 0);
    // Horns on the lintel.
    for (const s of [1, -1]) part(g, lambert(0xd6cbb0), 0.2, 0.9, 0.2, 0, 5.6, 2.1 * s).rotation.x = 0.5 * s;
    const glow = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0xff5010, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(0.12, 4.2, 2.6);
    glow.position.y = 2.2;
    g.add(glow);
    this.root.add(g);
    return glow;
  }

  private buildChest() {
    const t = this.plane.treasure;
    const group = new THREE.Group();
    group.position.set(t.x, heightAt(t.x, t.z), t.z);
    group.rotation.y = 0.3;
    const wood = lambert(0x4a2414);
    const gold = lambert(0xe0b030, 0x3a2400);
    part(group, wood, 1.0, 0.55, 0.65, 0, 0.28, 0);
    part(group, gold, 1.04, 0.08, 0.69, 0, 0.5, 0);
    part(group, gold, 0.1, 0.56, 0.7, 0.35, 0.28, 0);
    part(group, gold, 0.1, 0.56, 0.7, -0.35, 0.28, 0);
    const lid = new THREE.Group();
    lid.position.set(0, 0.55, -0.32);
    part(lid, wood, 1.0, 0.25, 0.65, 0, 0.12, 0.32);
    part(lid, gold, 0.16, 0.16, 0.06, 0, 0.05, 0.66);
    group.add(lid);
    this.root.add(group);
    return { group, lid };
  }

  // ---------- Missions ----------

  /** This plane's three main missions, with rewards that grow deeper down. */
  private mainOffers(): Offer[] {
    const p = this.plane;
    if (p.finale) {
      const m = p.finale.mission;
      return [{ id: `${p.index}:${m.id}`, title: m.title, kind: 'war', main: true, brief: m.brief, praise: m.praise, reward: { xp: 0, gold: 2000 } }];
    }
    const m = p.missions;
    const reward = { xp: Math.round(150 * p.power), gold: Math.round(120 * p.power) };
    return [
      { id: `${p.index}:${m.war.id}`, title: m.war.title, kind: 'war', main: true, brief: m.war.brief, praise: m.war.praise, reward },
      { id: `${p.index}:${m.retrieve.id}`, title: m.retrieve.title, kind: 'retrieve', main: true, brief: m.retrieve.brief, praise: m.retrieve.praise, reward },
      { id: `${p.index}:${m.assassinate.id}`, title: m.assassinate.title, kind: 'assassinate', main: true, brief: m.assassinate.brief, praise: m.assassinate.praise, reward },
    ];
  }

  private get allMainDone() {
    return this.mainOffers().every((o) => this.progress.done.has(o.id));
  }

  private sideOffers(level: number): Offer[] {
    if (this.offers.length === 0) {
      // Endless work: two of the four kinds of side mission, at fresh spots each time.
      const kinds = (['patrol', 'captain', 'gem', 'assault'] as const).slice().sort(() => Math.random() - 0.5).slice(0, 2);
      for (const template of kinds) {
        const t = SIDE_TEMPLATES[template];
        const spot = findOpenSpot(SPAWN.x, SPAWN.z, 30);
        if (!spot) continue;
        this.offers.push({
          id: `side-${template}-${Date.now()}`,
          title: t.title,
          kind: t.kind,
          main: false,
          brief: t.brief,
          reward: { xp: Math.round((40 + 8 * level) * Math.sqrt(this.plane.power)), gold: 25 + 5 * level },
          spot,
          template,
        });
      }
    }
    return this.offers;
  }

  /** What the ruler says and offers right now. Claims a finished mission's reward first. */
  dialog(level: number, rank: number): Dialog {
    this.ruler.speak();
    const r = this.plane.ruler;
    const head = { name: r.name, title: r.title };
    let speech: string;
    const firstTime = !this.progress.talked.has(this.plane.index);
    this.progress.talked.add(this.plane.index);
    const a = this.active;
    if (a && a.phase === 'return') {
      speech = this.claim(a, rank);
    } else if (a) {
      return {
        ...head,
        speech: 'Why are you still here? Go and finish what I asked of you.',
        cards: [
          {
            title: a.offer.title,
            tag: KIND_TAG[a.offer.kind] + (a.offer.main ? '' : ' · side'),
            main: a.offer.main,
            text: this.objective().text,
            reward: rewardText(a.offer),
            button: 'Abandon',
            act: () => {
              this.cancel();
              this.hooks.toast('Mission abandoned');
              this.hooks.refreshDialog();
            },
          },
        ],
      };
    } else if (firstTime) {
      speech = r.greeting;
    } else {
      speech = this.allMainDone ? r.allDone : r.again;
    }
    const cards: Dialog['cards'] = [];
    for (const m of this.mainOffers()) {
      if (this.progress.done.has(m.id)) continue;
      cards.push({ title: m.title, tag: KIND_TAG[m.kind], main: true, text: m.brief, reward: rewardText(m), button: 'Accept', act: () => this.accept(m) });
    }
    for (const o of this.sideOffers(level)) {
      cards.push({ title: o.title, tag: `${KIND_TAG[o.kind]} · side`, main: false, text: o.brief, reward: rewardText(o), button: 'Accept', act: () => this.accept(o) });
    }
    if (!this.chestOpened && this.mainOffers().some((o) => this.progress.done.has(o.id))) speech += ` ${r.chestHint}`;
    return { ...head, speech, cards };
  }

  /** Hands over the reward for a finished mission. Returns the ruler's words. */
  private claim(a: Running, rank: number): string {
    const o = a.offer;
    let gold = o.reward.gold;
    let words = o.praise ?? 'Well done. Here is your reward.';
    if (o.kind === 'assassinate' && a.unseen) {
      gold *= 2;
      words = 'Not one of them saw you coming. Double pay, as promised.';
    }
    this.hooks.reward(o.reward.xp, gold);
    this.hooks.announce('Mission complete', `${o.title} · +${o.reward.xp} XP · +${gold} gold`);
    this.end();
    if (o.main) this.progress.done.add(o.id);
    else {
      this.progress.sideDone++;
      this.offers = [];
    }
    // Finishing a plane's main missions earns the next rank, which opens the next plane.
    const next = this.plane.index;
    if (o.main && this.allMainDone && next < 9 && rank === next - 1) {
      words += ` ${this.plane.ruler.promotion}`;
      setTimeout(() => this.hooks.promoted(next), 2500);
    } else if (o.main && this.allMainDone && next === 9) {
      words += ` ${this.plane.ruler.promotion}`;
      setTimeout(() => this.hooks.announce('The war camp awaits', 'Reach level 50, then the Hellgate opens on the Tenth Plane'), 2500);
    }
    this.hooks.save();
    return words;
  }

  private accept(o: Offer) {
    if (this.active) return;
    sfx.click();
    this.offers = this.offers.filter((x) => x !== o);
    const run: Running = { offer: o, phase: 'go', fighters: [], target: null, item: null, allies: [], wave: 0, waveTimer: 0, unseen: true, war: null };
    this.active = run;
    const spawn = (kind: FighterKind, x: number, z: number, opts?: SpawnOptions) => {
      const f = this.hooks.spawn(this.deepen(kind), x, z, opts);
      run.fighters.push(f);
      return f;
    };
    const ring = (cx: number, cz: number, r: number, n: number, phase = 0) =>
      Array.from({ length: n }, (_, i) => {
        const a = phase + (i / n) * Math.PI * 2;
        return new THREE.Vector3(cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r);
      });
    const m = this.plane.missions;

    if (o.main && o.kind === 'retrieve') {
      const c = m.retrieve.camp;
      spawn('footsoldier', c.x - 6, c.z, { patrol: ring(c.x, c.z, 7, 4) });
      spawn('footsoldier', c.x + 6, c.z, { patrol: ring(c.x, c.z, 7, 4, Math.PI) });
      spawn('footsoldier', c.x, c.z + 6, { facing: 0 });
      spawn('archer', c.x - 3, c.z - 7, { facing: Math.PI });
      spawn('archer', c.x + 7, c.z + 5, { facing: Math.PI / 2 });
      spawn('priest', c.x + 1.5, c.z - 1.5, { facing: Math.PI });
      // Deeper planes guard their camps more heavily.
      if (this.plane.index >= 3) spawn('officer', c.x - 2, c.z + 2, { facing: 0.5 });
      run.item = this.makeItem(m.retrieve.item.name, m.retrieve.item.look, m.retrieve.item.color, c.x, c.z, 1.0);
    } else if (o.main && o.kind === 'assassinate') {
      const t = m.assassinate.post;
      run.target = spawn(m.assassinate.target.kind, t.x, t.z, { facing: Math.PI * 0.75, label: m.assassinate.target.label });
      spawn('footsoldier', t.x + 4, t.z - 4, { patrol: ring(t.x, t.z, 6, 5) });
      spawn('footsoldier', t.x - 3, t.z + 5, { facing: 0.3 });
      spawn('archer', t.x - 4, t.z + 1, { facing: Math.PI });
      if (this.plane.index >= 3) spawn('priest', t.x + 2, t.z + 3, { facing: Math.PI });
    } else if (o.main && this.plane.finale) {
      this.garrison(run);
    } else if (o.main && o.kind === 'war') {
      // The imps and the waves arrive once you reach the battlefield.
      run.war = { defend: m.war.defend, from: m.war.from };
    } else if (o.spot) {
      const { x, z } = o.spot;
      if (o.template === 'assault') {
        // Heaven's counterattack: they come from somewhere open, 25 meters off.
        run.war = { defend: o.spot, from: this.approachFrom(o.spot) };
      } else if (o.template === 'patrol') {
        const path = [new THREE.Vector3(x - 6, 0, z - 6), new THREE.Vector3(x + 6, 0, z - 6), new THREE.Vector3(x + 6, 0, z + 6), new THREE.Vector3(x - 6, 0, z + 6)];
        const n = 3 + Math.floor(Math.random() * 2);
        for (let i = 0; i < n; i++) spawn(i === n - 1 ? 'archer' : 'footsoldier', x - 6 + i * 1.5, z - 6, { patrol: path.slice(i % 4).concat(path.slice(0, i % 4)) });
      } else if (o.template === 'captain') {
        const name = CAPTAIN_NAMES[Math.floor(Math.random() * CAPTAIN_NAMES.length)];
        run.target = spawn('officer', x, z, { facing: Math.random() * 6, label: `Captain ${name}` });
        spawn('footsoldier', x + 2.5, z + 1, { patrol: ring(x, z, 5, 4) });
        spawn('footsoldier', x - 2.5, z - 1, { patrol: ring(x, z, 5, 4, Math.PI) });
      } else {
        spawn('footsoldier', x + 3, z, { facing: 1 });
        spawn('footsoldier', x - 3, z + 2, { patrol: ring(x, z, 5, 3) });
        spawn('priest', x, z - 3, { facing: Math.PI });
        run.item = this.makeItem('Soul Gem', 'gem', 0xc040ff, x, z, 0.4);
      }
    }
    this.hooks.toast(`Mission: ${o.title}`);
    this.hooks.refreshDialog();
    this.hooks.save();
  }

  /**
   * Deeper planes field heavier angels: knights (from the Sixth Plane) in
   * place of some footsoldiers, and flying seraphs (from the Seventh) in
   * place of some archers.
   */
  private deepen(kind: FighterKind): FighterKind {
    const i = this.plane.index;
    if (kind === 'footsoldier' && i >= 6 && Math.random() < 0.45) return 'knight';
    if (kind === 'archer' && i >= 7 && Math.random() < 0.5) return 'seraph';
    return kind;
  }

  /** Somewhere open about 25 m from a spot, for an attack wave to start. */
  private approachFrom(spot: { x: number; z: number }) {
    for (let tries = 0; tries < 24; tries++) {
      const a = Math.random() * Math.PI * 2;
      const x = spot.x + Math.sin(a) * 25;
      const z = spot.z + Math.cos(a) * 25;
      if (Math.max(Math.abs(x), Math.abs(z)) > 64 || isLava(x, z)) continue;
      if (Math.abs(heightAt(x, z) - heightAt(spot.x, spot.z)) > 3) continue;
      return { x, z };
    }
    return { x: spot.x, z: Math.min(64, spot.z + 25) };
  }

  /**
   * The war camp's defenders: knights, priests and footsoldiers in the
   * courtyard, archers on the walls, seraphs overhead, and the general
   * waiting in the middle.
   */
  private garrison(run: Running) {
    const fin = this.plane.finale!;
    const f = fin.fortress;
    const spawn = (kind: FighterKind, x: number, z: number, opts?: SpawnOptions) => {
      const fighter = this.hooks.spawn(kind, x, z, opts);
      run.fighters.push(fighter);
      return fighter;
    };
    const general = spawn('general', f.x, f.z + 6, { facing: Math.PI, label: fin.general });
    general.onSummon = () => this.hooks.announce(fin.general, `“${fin.summonLine}”`);
    run.target = general;
    // Guards at the gate and in the courtyard.
    spawn('knight', f.x - 3, f.z - f.half + 4, { facing: Math.PI });
    spawn('knight', f.x + 3, f.z - f.half + 4, { facing: Math.PI });
    spawn('footsoldier', f.x - 8, f.z - 4, { facing: Math.PI });
    spawn('footsoldier', f.x + 8, f.z - 4, { facing: Math.PI });
    spawn('priest', f.x - 5, f.z + 4, { facing: Math.PI });
    spawn('priest', f.x + 5, f.z + 4, { facing: Math.PI });
    // Archers on the south wall, seraphs circling overhead.
    for (const dx of [-10, 10]) spawn('archer', f.x + dx, f.z - f.half + 0.5, { facing: Math.PI });
    spawn('seraph', f.x - 10, f.z + 10, { facing: Math.PI });
    spawn('seraph', f.x + 10, f.z + 10, { facing: Math.PI });
  }

  /** Inside the war camp's walls? */
  private insideFortress(pos: THREE.Vector3) {
    const f = this.plane.finale?.fortress;
    return !!f && Math.abs(pos.x - f.x) < f.half - 1.5 && Math.abs(pos.z - f.z) < f.half - 1.5;
  }

  /** The last battle: the general wakes when you storm the courtyard, and its death ends the war. */
  private updateFinale(a: Running, ctx: GameContext) {
    const fin = this.plane.finale!;
    const g = a.target;
    if (!g) return;
    if (a.phase === 'go' && this.insideFortress(ctx.player.pos)) {
      a.phase = 'fight';
      g.becomeAlert(ctx, ctx.player, true);
      this.hooks.announce(fin.general, `“${fin.taunt}”`);
      sfx.warHorn();
    }
    if (!g.alive) {
      this.progress.done.add(a.offer.id);
      this.hooks.announce(fin.general, `“${fin.deathLine}”`);
      this.hooks.reward(0, a.offer.reward.gold);
      this.end();
      this.hooks.victory();
      this.hooks.save();
    }
  }

  /** A stolen treasure: a crown or a gem, glowing and slowly turning. */
  private makeItem(name: string, look: 'crown' | 'gem', color: number, x: number, z: number, lift: number): Item {
    const mesh = new THREE.Group();
    const c = new THREE.Color(color);
    if (look === 'crown') {
      const gold = lambert(color, c.clone().multiplyScalar(0.35).getHex());
      part(mesh, gold, 0.5, 0.14, 0.5, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        part(mesh, gold, 0.1, 0.22, 0.1, Math.sin(a) * 0.2, 0.15, Math.cos(a) * 0.2);
      }
      part(mesh, lambert(0xff3010, 0xff2000), 0.1, 0.1, 0.1, 0, 0.1, 0.26);
    } else {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshLambertMaterial({ color, emissive: c.clone().multiplyScalar(0.5), flatShading: true }));
      mesh.add(gem);
    }
    const pos = new THREE.Vector3(x, heightAt(x, z) + lift, z);
    mesh.position.copy(pos);
    this.root.add(mesh);
    return { name, mesh, pos, carried: false };
  }

  /** Ends the running mission and clears away what it brought into the world. */
  private end() {
    const a = this.active;
    if (!a) return;
    for (const f of [...a.fighters, ...a.allies]) if (!f.gone) f.dispose();
    if (a.item) this.root.remove(a.item.mesh);
    this.active = null;
  }

  /** Abandons (or fails) the running mission. */
  cancel() {
    this.end();
  }

  /** Banished: the running mission fails. */
  onPlayerDeath() {
    if (!this.active) return;
    this.hooks.toast(`Mission failed: ${this.active.offer.title}`);
    this.end();
  }

  /** True while it's quiet: no mission, and no angel nearby is hunting you. */
  canReturnToLair(ctx: GameContext): { ok: boolean; reason: string } {
    if (this.active) return { ok: false, reason: 'Not during a mission' };
    const hunted = ctx.fighters.some((f) => f.alive && f.side === 'heaven' && f.state === 'alert' && f.pos.distanceTo(ctx.player.pos) < 45);
    if (hunted || ctx.player.calm < 5) return { ok: false, reason: 'Not in the middle of a fight' };
    return { ok: true, reason: '' };
  }

  update(dt: number, ctx: GameContext) {
    this.time += dt;
    this.playerPos.copy(ctx.player.pos);
    this.ruler.update(dt, ctx.player.pos);
    this.updateChest(dt, ctx);
    this.updateDrops(dt);
    this.updatePortal(dt, ctx);
    this.updateGates(ctx);
    this.updateAmbient(dt);
    const a = this.active;
    if (!a) return;
    if (a.item && !a.item.carried) {
      a.item.mesh.rotation.y += dt * 1.5;
      a.item.mesh.position.y = a.item.pos.y + Math.sin(this.time * 2) * 0.05;
      if (Math.random() < dt * 6) ctx.fire.burst(a.item.pos, 0xffd060, 1, 0.6, { gravity: -1, life: 0.6, size: 0.05, spread: 0.3 });
    }
    // Stealth: once anyone raises the alarm, the kill isn't unseen any more.
    if (a.unseen && a.target?.alive && a.fighters.some((f) => f.everAlerted)) a.unseen = false;

    if (a.offer.main && this.plane.finale) this.updateFinale(a, ctx);
    else if (a.war) this.updateWar(dt, a);
    else if (a.phase === 'go') {
      if (a.target && !a.target.alive) this.objectiveDone(a, a.unseen ? `${a.target.label} is dead, and nobody saw you` : `${a.target.label} is dead`);
      else if (!a.target && !a.item && a.fighters.every((f) => !f.alive)) this.objectiveDone(a, 'The patrol is destroyed');
    }
  }

  private objectiveDone(a: Running, detail: string) {
    a.phase = 'return';
    sfx.missionDone();
    this.hooks.announce('Objective complete', `${detail}. Return to ${this.rulerName}.`);
    this.hooks.save();
  }

  /** The war front: your imps against three waves of angels marching on the place you defend. */
  private updateWar(dt: number, a: Running) {
    if (a.phase === 'return' || !a.war) return;
    const w = { ...a.war, title: a.offer.title };
    const d = w.defend;
    // Unit vector from the defended spot toward where the angels come from.
    const toward = new THREE.Vector2(w.from.x - d.x, w.from.z - d.z).normalize();
    const side = new THREE.Vector2(-toward.y, toward.x);
    if (a.phase === 'go') {
      if (Math.hypot(this.playerPos.x - d.x, this.playerPos.z - d.z) > 14) return;
      a.phase = 'fight';
      for (let i = 0; i < 6; i++) {
        const across = (i % 3) * 3 - 3;
        const back = 2 + Math.floor(i / 3) * 2;
        const imp = this.hooks.spawn('imp', d.x + side.x * across - toward.x * back, d.z + side.y * across - toward.y * back, { facing: Math.atan2(toward.x, toward.y) });
        a.allies.push(imp);
      }
      a.wave = 0;
      a.waveTimer = 3;
      this.hooks.announce(w.title, 'Your imps stand with you');
      return;
    }
    const left = a.fighters.filter((f) => f.alive).length;
    if (left > 0) return;
    if (a.wave >= 3) {
      this.objectiveDone(a, 'The line held');
      return;
    }
    a.waveTimer -= dt;
    if (a.waveTimer > 0) return;
    a.wave++;
    a.waveTimer = 4;
    sfx.warHorn();
    const waves: FighterKind[][] = [
      ['footsoldier', 'footsoldier', 'footsoldier', 'footsoldier'],
      ['footsoldier', 'footsoldier', 'footsoldier', 'archer', 'archer'],
      ['officer', 'footsoldier', 'footsoldier', 'footsoldier', 'priest', 'archer'],
    ];
    const goal = new THREE.Vector3(d.x, 0, d.z);
    const captain = CAPTAIN_NAMES[this.plane.index % CAPTAIN_NAMES.length];
    waves[a.wave - 1].forEach((kind, i) => {
      const across = (i % 4) * 2.5 - 3.75;
      const back = Math.floor(i / 4) * 2.5;
      const x = w.from.x + side.x * across + toward.x * back;
      const z = w.from.z + side.y * across + toward.y * back;
      const f = this.hooks.spawn(this.deepen(kind), x, z, { alert: true, goal, facing: Math.atan2(-toward.x, -toward.y), label: kind === 'officer' ? `Captain ${captain}` : undefined });
      a.fighters.push(f);
    });
    this.hooks.toast(`Wave ${a.wave} of 3: the angels are coming!`);
  }

  /** Angel patrols roaming the plane between missions; they return a while after being wiped out. */
  private updateAmbient(dt: number) {
    for (const p of this.ambient) {
      if (p.fighters.some((f) => f.alive)) continue;
      p.respawn -= dt;
      const far = Math.hypot(this.playerPos.x - p.at.x, this.playerPos.z - p.at.z) > 45;
      if (p.respawn > 0 || !far) continue;
      p.fighters = [];
      p.respawn = 90;
      const path = [new THREE.Vector3(p.at.x - 7, 0, p.at.z), new THREE.Vector3(p.at.x, 0, p.at.z + 7), new THREE.Vector3(p.at.x + 7, 0, p.at.z), new THREE.Vector3(p.at.x, 0, p.at.z - 7)];
      for (let i = 0; i < 3; i++) {
        p.fighters.push(this.hooks.spawn(this.deepen(i === 2 ? 'archer' : 'footsoldier'), p.at.x - 7 + i, p.at.z, { patrol: path.slice(i).concat(path.slice(0, i)) }));
      }
    }
  }

  private updatePortal(dt: number, ctx: GameContext) {
    const m = this.portalGlow.material as THREE.MeshBasicMaterial;
    m.opacity = 0.55 + Math.sin(this.time * 3) * 0.15;
    if (Math.random() < dt * 20) {
      const y = heightAt(PORTAL.x, PORTAL.z) + 0.5 + Math.random() * 3.6;
      ctx.fire.burst(new THREE.Vector3(PORTAL.x, y, PORTAL.z + (Math.random() - 0.5) * 2.4), 0xff6a10, 1, 0.8, { gravity: -1, life: 0.6, size: 0.1 });
    }
  }

  // ---------- Travel ----------

  /** The Hellgate: every plane, and whether you can go there. */
  travelDialog(rank: number, level: number): Dialog {
    // The war camp opens when the Abyss is cleared and you're level 50.
    const abyss = PLANES[8];
    const abyssDone = [abyss.missions.war.id, abyss.missions.retrieve.id, abyss.missions.assassinate.id].every((id) => this.progress.done.has(`9:${id}`));
    const cards: Dialog['cards'] = ALL_PLANE_NAMES.map((name, i) => {
      const index = i + 1;
      const here = index === this.plane.index;
      const built = index <= BUILT_PLANES;
      const ranked = index === 10 ? abyssDone && level >= 50 : rank >= index - 1;
      const def = PLANES[i];
      let button = 'Travel';
      let text = built ? `Ruled by ${def.ruler.name}, ${def.ruler.title}. Suggested level ${def.level}.` : 'The way down has not been opened yet.';
      if (here) button = 'You are here';
      else if (!built) button = 'Not yet';
      else if (!ranked) {
        button = 'Locked';
        text += index === 10 ? ' Finish the Abyss’s missions and reach level 50 to go there.' : ` Reach the rank of ${RANKS[index - 1]} to go there.`;
      }
      return {
        title: `${ordinal(index)} Plane: ${name}`,
        tag: built && ranked ? (here ? 'Here' : 'Open') : 'Sealed',
        main: here,
        text,
        reward: '',
        button,
        disabled: here || !built || !ranked,
        act: () => this.hooks.travel(index),
      };
    });
    return { name: 'The Hellgate', title: 'Every plane you have earned is open to you', speech: 'Fire roars through the gate. Choose where it takes you.', cards };
  }

  // ---------- Weapons on the ground ----------

  dropWeapon(w: Weapon, at: THREE.Vector3) {
    const group = new THREE.Group();
    const model = buildWeaponMesh(w.id, w.enchant);
    model.rotation.x = Math.PI / 2;
    model.position.y = 0.15;
    group.add(model);
    // A pillar of light marks it, colored by quality (or enchantment).
    const beam = new THREE.Mesh(
      box,
      new THREE.MeshBasicMaterial({ color: w.enchant ? WEAPON_ENCHANTS[w.enchant].color : QUALITY_GLOW[w.quality], transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    beam.scale.set(0.12, 2.2, 0.12);
    beam.position.y = 1.1;
    group.add(beam);
    const pos = new THREE.Vector3(at.x, groundAt(at.x, at.z, 0.2), at.z);
    group.position.copy(pos);
    this.root.add(group);
    this.drops.push({ weapon: w, group, pos, age: 0 });
  }

  private updateDrops(dt: number) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.group.children[0].rotation.z += dt * 0.8;
      d.group.position.y = d.pos.y + 0.1 + Math.sin(d.age * 2) * 0.05;
      if (d.age > 150) {
        this.root.remove(d.group);
        this.drops.splice(i, 1);
      }
    }
  }

  // ---------- The treasure chest ----------

  private updateChest(dt: number, ctx: GameContext) {
    if (this.chestOpened) {
      this.chestOpenT = Math.min(1, this.chestOpenT + dt * 2);
      this.chestLid.rotation.x = -1.9 * this.chestOpenT;
    } else if (Math.random() < dt * 4) {
      // A golden glint now and then, to catch the eye from below.
      const p = this.chest.position;
      ctx.fire.burst(new THREE.Vector3(p.x, p.y + 0.8, p.z), 0xffd860, 1, 1.5, { gravity: -1, life: 0.8, size: 0.08, spread: 0.4 });
    }
  }

  private openChest() {
    if (this.chestOpened) return;
    this.progress.chests.add(this.plane.index);
    sfx.chestOpen();
    const p = this.chest.position;
    const at = new THREE.Vector3(p.x, p.y + 0.8, p.z);
    // Deeper chests hold more.
    const gold = 150 * this.plane.index;
    this.hooks.dropGold(at, 30, gold / 30);
    const ids: WeaponId[] = ['sword', 'spear', 'axe', 'hammer', 'scythe', 'bow', 'javelin'];
    this.dropWeapon({ id: ids[Math.floor(Math.random() * ids.length)], quality: 2 as Quality, enchant: randomWeaponEnchant() }, new THREE.Vector3(p.x + 0.8, p.y, p.z + 0.4));
    this.hooks.announce('Treasure!', `${gold} gold and an enchanted weapon`);
    this.hooks.save();
  }

  // ---------- Things you can use with E ----------

  interactables(ctx: GameContext, takeWeapon: (w: Weapon, from: THREE.Vector3) => void): Interactable[] {
    const out: Interactable[] = [];
    out.push({ pos: this.ruler.pos.clone().setY(this.ruler.pos.y + 1), label: `Speak with ${this.rulerName}`, range: 6, kind: 'ruler', act: () => {} });
    out.push({ pos: new THREE.Vector3(PORTAL.x, heightAt(PORTAL.x, PORTAL.z) + 1, PORTAL.z), label: 'Enter the Hellgate', range: 3.5, kind: 'portal', act: () => {} });
    for (const d of this.drops) {
      out.push({
        pos: d.pos,
        label: `Take ${weaponName(d.weapon)} (${weaponPower(d.weapon)} damage)`,
        range: 2.4,
        act: () => {
          const i = this.drops.indexOf(d);
          if (i < 0) return;
          this.drops.splice(i, 1);
          this.root.remove(d.group);
          takeWeapon(d.weapon, d.pos);
        },
      });
    }
    const a = this.active;
    if (a?.item && !a.item.carried) {
      const item = a.item;
      out.push({
        pos: item.pos,
        label: `Take the ${item.name}`,
        range: 2.6,
        act: () => {
          item.carried = true;
          this.root.remove(item.mesh);
          sfx.pickup();
          // Every guard knows the moment it's gone.
          for (const f of a.fighters) if (f.alive) f.becomeAlert(ctx, ctx.player, false);
          this.objectiveDone(a, `You have the ${item.name}`);
        },
      });
    }
    if (!this.chestOpened) {
      out.push({ pos: this.chest.position, label: 'Open the treasure chest', range: 2.4, act: () => this.openChest() });
    }
    return out;
  }

  /** The current goal: text at the top of the screen and a marker in the world. */
  objective(): { text: string; at: THREE.Vector3 | null } {
    const name = this.rulerName;
    const ruler = this.ruler.pos.clone().setY(this.ruler.pos.y + 3);
    const a = this.active;
    if (!a) {
      if (!this.progress.talked.has(this.plane.index)) return { text: `Speak with ${name}, ${this.plane.ruler.title}`, at: ruler };
      return { text: `Speak with ${name} for a mission`, at: ruler };
    }
    if (a.phase === 'return') return { text: `Return to ${name}${a.item ? ` with the ${a.item.name}` : ''}`, at: ruler };
    const o = a.offer;
    const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z) + 2, z);
    if (o.main && this.plane.finale) {
      const fin = this.plane.finale;
      const f = fin.fortress;
      if (a.phase === 'go') return { text: 'Storm the war camp: through the south gate', at: v(f.x, f.z - f.half) };
      const g = a.target;
      return { text: `Kill ${fin.general}`, at: g ? g.pos.clone().setY(g.pos.y + 5) : null };
    }
    if (a.war) {
      const d = a.war.defend;
      if (a.phase === 'go') return { text: `Go to the battlefield: ${o.title}`, at: v(d.x, d.z) };
      const left = a.fighters.filter((f) => f.alive).length;
      return { text: left > 0 ? `Hold the line: wave ${a.wave} of 3 (${left} left)` : `Hold the line: wave ${a.wave + 1} of 3 is coming`, at: v(d.x, d.z) };
    }
    if (a.target) {
      const t = a.target;
      return { text: `Kill ${t.label}${a.unseen ? ' (unseen: double pay)' : ''}`, at: t.pos.clone().setY(t.pos.y + 3) };
    }
    if (a.item) return { text: `Take the ${a.item.name}`, at: a.item.pos.clone().setY(a.item.pos.y + 1.5) };
    const left = a.fighters.filter((f) => f.alive);
    const c = left[0]?.pos ?? (o.spot ? v(o.spot.x, o.spot.z) : null);
    return { text: `Destroy the angel patrol (${left.length} left)`, at: c ? c.clone().setY(c.y + 3) : null };
  }

  /** Name of what you're carrying, if anything. */
  get carrying(): string | null {
    return this.active?.item?.carried ? this.active.item.name : null;
  }
}

function rewardText(o: Offer) {
  return `${o.reward.xp} XP · ${o.reward.gold} gold${o.kind === 'assassinate' ? ' (×2 gold unseen)' : ''}`;
}

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
function ordinal(n: number) {
  return ORDINALS[n - 1] ?? `${n}th`;
}
