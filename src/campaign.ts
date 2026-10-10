import * as THREE from 'three';
import { createHumanoid, setFlash, type Humanoid } from './character';
import { Fighter, type FighterKind, type SpawnOptions } from './fighter';
import { buildWeaponMesh, randomWeaponEnchant, WEAPON_ENCHANTS, weaponName, weaponPower, type Quality, type Weapon, type WeaponId } from './weapons';
import { addCollider, findOpenSpot, groundAt, heightAt } from './world';
import { CROWN_CAMP, LAIR, PATROLS, SPAWN, THRONE, TRAITOR_POST, TREASURE, WEST_BRIDGE } from './layout';
import { sfx } from './audio';
import { RANKS } from './progression';
import type { GameContext } from './types';

/**
 * The First Plane's story: Malphas and his missions, the angels' camps,
 * the treasure chest, ambient patrols, and weapons lying on the ground.
 */

export type MissionKind = 'war' | 'retrieve' | 'assassinate';

export interface Offer {
  id: string;
  title: string;
  kind: MissionKind;
  main: boolean;
  /** What Malphas says about it. */
  brief: string;
  reward: { xp: number; gold: number };
  /** Where a side mission takes place. */
  spot?: { x: number; z: number };
  /** Side missions: which template. */
  template?: 'patrol' | 'captain' | 'gem';
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
}

export interface Interactable {
  pos: THREE.Vector3;
  label: string;
  /** How close you must be. */
  range: number;
  act(): void;
}

/** What the ruler's dialog shows. */
export interface Dialog {
  speech: string;
  cards: { title: string; kind: MissionKind; main: boolean; text: string; reward: string; button: string; act: () => void }[];
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
  save(): void;
}

const MAIN: Offer[] = [
  {
    id: 'bridge',
    title: 'Blood at the Bridge',
    kind: 'war',
    main: true,
    brief: 'Heaven means to cross the great river by the western bridge. Take my imps and hold it. Not one feathered foot sets down on my side.',
    reward: { xp: 150, gold: 120 },
  },
  {
    id: 'crown',
    title: 'The Stolen Crown',
    kind: 'retrieve',
    main: true,
    brief: 'Angels crept into my vault and stole the Brimstone Crown. Their camp lies across the eastern river. Bring it back to me.',
    reward: { xp: 150, gold: 120 },
  },
  {
    id: 'traitor',
    title: 'The Traitor of the Pits',
    kind: 'assassinate',
    main: true,
    brief: 'Vargash, one of my own captains, sold himself to heaven for a halo. He hides in their watchpost on the northwest mesa. Kill him. Do it unseen and I will pay double.',
    reward: { xp: 150, gold: 120 },
  },
];

const CAPTAIN_NAMES = ['Auriel', 'Seraphon', 'Cassiel', 'Zadkiel', 'Haniel', 'Barachiel', 'Jophiel', 'Raziel'];
const SIDE_TEMPLATES = {
  patrol: { kind: 'war' as const, title: 'Cull the Patrol', brief: 'An angel patrol is sniffing around my plain. Hunt them down, every one.' },
  captain: { kind: 'assassinate' as const, title: 'Silence the Captain', brief: 'An angel captain is scouting my lands. Kill the captain. Unseen pays double.' },
  gem: { kind: 'retrieve' as const, title: 'Recover the Soul Gem', brief: 'One of my soul gems was taken by angels. Bring it back before they carry it off to heaven.' },
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

/** Malphas: a huge horned demon seated on an obsidian throne. */
class Ruler {
  readonly pos: THREE.Vector3;
  readonly h: Humanoid;
  private time = 0;
  private talking = 0;

  constructor(scene: THREE.Scene) {
    const y = heightAt(THRONE.x, THRONE.z);
    this.pos = new THREE.Vector3(THRONE.x, y, THRONE.z);
    const throne = new THREE.Group();
    throne.position.copy(this.pos);
    const obsidian = lambert(0x221830);
    const magma = lambert(0x8a2e0c, 0x9a2a04);
    const bone = lambert(0xd6cbb0);
    part(throne, obsidian, 2.4, 1.0, 1.8, 0, 0.5, -0.2); // seat
    part(throne, obsidian, 2.6, 4.2, 0.5, 0, 2.1, -1.0); // back
    part(throne, magma, 0.12, 3.6, 0.1, 0, 2.2, -0.74); // glowing seam up the back
    for (const s of [1, -1]) {
      part(throne, obsidian, 0.4, 1.6, 1.8, 1.25 * s, 0.8, -0.2); // armrests
      part(throne, obsidian, 0.3, 1.2, 0.3, 1.2 * s, 4.6, -1.0); // spikes on top
      part(throne, bone, 0.32, 0.3, 0.34, 1.25 * s, 1.75, 0.55); // skulls on the armrests
    }
    scene.add(throne);
    addCollider({ x: THRONE.x, z: THRONE.z - 0.3, r: 1.3 });

    this.h = createHumanoid({ skin: 0xa02418, shirt: 0x1c0c0c, pants: 0x1c0c0c, boots: 0x0c0606, eyes: 0xffc020, glowingEyes: true, belt: 0xd9b24a, armor: 0x2a1a14 });
    this.h.root.scale.setScalar(1.9);
    this.h.root.position.set(THRONE.x, y + 0.2, THRONE.z + 0.15);
    // Seated: thighs forward, shins down.
    this.h.hips.position.y = 0.55;
    for (const leg of [this.h.legL, this.h.legR]) leg.rotation.x = -1.45;
    this.h.armL.rotation.set(-0.5, 0, 0.25);
    this.h.armR.rotation.set(-0.5, 0, -0.25);
    // Great curling horns and a crown of gold spikes.
    const horn = lambert(0x1a1210);
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
    scene.add(this.h.root);
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
    setFlash(this.h, new THREE.Color(0xff3010), this.talking > 0 ? 0.3 : 0.12);
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
  /** Main missions finished. */
  readonly done = new Set<string>();
  sideDone = 0;
  chestOpened = false;
  /** Has met Malphas. */
  talked = false;
  active: Running | null = null;
  private offers: Offer[] = [];
  private readonly ruler: Ruler;
  private readonly drops: Drop[] = [];
  private readonly chest: THREE.Group;
  private readonly chestLid: THREE.Group;
  private chestOpenT = 0;
  private readonly ambient: { at: { x: number; z: number }; fighters: Fighter[]; respawn: number }[] = [];
  private time = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly hooks: CampaignHooks,
  ) {
    this.ruler = new Ruler(scene);
    this.buildCamp();
    this.buildWatchpost();
    this.buildBraziers();
    const ch = this.buildChest();
    this.chest = ch.group;
    this.chestLid = ch.lid;
    this.ambient = PATROLS.map((at) => ({ at, fighters: [], respawn: 0 }));
  }

  // ---------- Scenery ----------

  /** The angels' camp: white tents, a holy banner, and the altar where the crown sits. */
  private buildCamp() {
    const g = new THREE.Group();
    const cloth = lambert(0xf2eee2);
    const gold = lambert(0xd9b24a);
    for (const [x, z, r] of [[-4, 3, 0.3], [4, 4, -0.4], [0, -5, 0]]) {
      const tent = new THREE.Group();
      tent.position.set(CROWN_CAMP.x + x, heightAt(CROWN_CAMP.x + x, CROWN_CAMP.z + z), CROWN_CAMP.z + z);
      tent.rotation.y = r;
      // A pitched roof of two slabs over a box.
      part(tent, cloth, 2.4, 1.2, 2.6, 0, 0.6, 0);
      part(tent, cloth, 1.7, 0.12, 2.8, 0.62, 1.55, 0).rotation.z = -0.75;
      part(tent, cloth, 1.7, 0.12, 2.8, -0.62, 1.55, 0).rotation.z = 0.75;
      part(tent, gold, 0.1, 0.1, 2.9, 0, 2.15, 0);
      g.add(tent);
      addCollider({ x: CROWN_CAMP.x + x, z: CROWN_CAMP.z + z, r: 1.4 });
    }
    // Banner of heaven: white and gold on a tall pole.
    const y = heightAt(CROWN_CAMP.x, CROWN_CAMP.z);
    part(g, gold, 0.12, 5, 0.12, CROWN_CAMP.x + 2, y + 2.5, CROWN_CAMP.z);
    part(g, cloth, 0.05, 1.6, 1.1, CROWN_CAMP.x + 2, y + 4, CROWN_CAMP.z + 0.6);
    part(g, gold, 0.06, 0.6, 0.12, CROWN_CAMP.x + 2, y + 4.1, CROWN_CAMP.z + 0.6);
    // The altar.
    part(g, cloth, 1.2, 0.9, 0.8, CROWN_CAMP.x, y + 0.45, CROWN_CAMP.z);
    part(g, gold, 1.3, 0.1, 0.9, CROWN_CAMP.x, y + 0.95, CROWN_CAMP.z);
    this.scene.add(g);
  }

  /** The angels' white stone watchpost on the northwest mesa. */
  private buildWatchpost() {
    const g = new THREE.Group();
    const stone = lambert(0xe8e4da);
    const gold = lambert(0xd9b24a);
    const x = TRAITOR_POST.x - 4;
    const z = TRAITOR_POST.z + 3;
    const y = heightAt(x, z);
    part(g, stone, 2.4, 5, 2.4, x, y + 2.5, z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) part(g, stone, 0.5, 0.6, 0.5, x + dx * 1.1, y + 5.3, z + dz * 1.1);
    part(g, gold, 0.1, 2.2, 0.1, x, y + 6.1, z);
    part(g, lambert(0xf2eee2), 0.05, 0.9, 1.1, x, y + 6.6, z + 0.6);
    this.scene.add(g);
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
      this.scene.add(g);
    }
  }

  private buildChest() {
    const group = new THREE.Group();
    group.position.set(TREASURE.x, heightAt(TREASURE.x, TREASURE.z), TREASURE.z);
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
    this.scene.add(group);
    return { group, lid };
  }

  // ---------- Saving ----------

  load(done: string[], sideDone: number, chestOpened: boolean, talked: boolean) {
    this.cancel();
    this.done.clear();
    for (const d of done) this.done.add(d);
    this.sideDone = sideDone;
    this.chestOpened = chestOpened;
    this.chestOpenT = chestOpened ? 1 : 0;
    this.talked = talked;
    this.offers = [];
    for (const d of this.drops) this.scene.remove(d.group);
    this.drops.length = 0;
  }

  // ---------- Missions ----------

  private sideOffers(level: number): Offer[] {
    if (this.offers.length === 0) {
      const kinds = (['patrol', 'captain', 'gem'] as const).slice().sort(() => Math.random() - 0.5).slice(0, 2);
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
          reward: { xp: 40 + 8 * level, gold: 25 + 5 * level },
          spot,
          template,
        });
      }
    }
    return this.offers;
  }

  /** What Malphas says and offers right now. Claims a finished mission's reward first. */
  dialog(level: number, rank: number): Dialog {
    this.ruler.speak();
    let speech: string;
    const firstTime = !this.talked;
    this.talked = true;
    const a = this.active;
    if (a && a.phase === 'return') {
      speech = this.claim(a, rank);
    } else if (a) {
      return {
        speech: 'Why are you still here? Go and finish what I asked of you.',
        cards: [
          {
            title: a.offer.title,
            kind: a.offer.kind,
            main: a.offer.main,
            text: this.objective(level).text,
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
      speech = `So the pits coughed up another Imp. I am Malphas, ruler of the First Plane. Heaven's armies are on my plain, and I need claws. Serve me well and I will raise you up. Fail me and you go back in the pit.`;
    } else {
      speech = this.done.size === MAIN.length ? 'More work, Fiend? Heaven never runs out of angels to kill.' : 'Back for more work? Good.';
    }
    const cards: Dialog['cards'] = [];
    for (const m of MAIN) {
      if (this.done.has(m.id)) continue;
      cards.push({ title: m.title, kind: m.kind, main: true, text: m.brief, reward: rewardText(m), button: 'Accept', act: () => this.accept(m) });
    }
    for (const o of this.sideOffers(level)) {
      cards.push({ title: o.title, kind: o.kind, main: false, text: o.brief, reward: rewardText(o), button: 'Accept', act: () => this.accept(o) });
    }
    if (!this.chestOpened && this.done.size >= 1) speech += ' And they say the old lords left a chest of gold atop a pillar no imp can climb. Fire carries the bold.';
    return { speech, cards };
  }

  /** Hands over the reward for a finished mission. Returns Malphas's words. */
  private claim(a: Running, rank: number): string {
    const o = a.offer;
    let gold = o.reward.gold;
    let words = 'Well done. Here is your reward.';
    if (o.kind === 'assassinate' && a.unseen) {
      gold *= 2;
      words = 'Not one of them saw you coming. Double pay, as promised.';
    } else if (o.id === 'crown') words = 'My crown! The angels will regret ever touching it.';
    else if (o.id === 'bridge') words = 'The bridge held. Heaven will think twice before it tries that again.';
    else if (o.id === 'traitor') words = "Vargash's halo makes a fine trophy. Here is your pay.";
    this.hooks.reward(o.reward.xp, gold);
    this.hooks.announce('Mission complete', `${o.title} · +${o.reward.xp} XP · +${gold} gold`);
    this.end();
    if (o.main) this.done.add(o.id);
    else {
      this.sideDone++;
      this.offers = [];
    }
    if (o.main && this.done.size === MAIN.length && rank === 0) {
      words += ` You have done everything I asked. Kneel, Imp... and rise a ${RANKS[1]}. The way down to the Second Plane will open for you soon.`;
      setTimeout(() => this.hooks.promoted(1), 2500);
    }
    this.hooks.save();
    return words;
  }

  private accept(o: Offer) {
    if (this.active) return;
    sfx.click();
    this.offers = this.offers.filter((x) => x !== o);
    const run: Running = { offer: o, phase: 'go', fighters: [], target: null, item: null, allies: [], wave: 0, waveTimer: 0, unseen: true };
    this.active = run;
    const spawn = (kind: FighterKind, x: number, z: number, opts?: SpawnOptions) => {
      const f = this.hooks.spawn(kind, x, z, opts);
      run.fighters.push(f);
      return f;
    };
    const ring = (cx: number, cz: number, r: number, n: number, phase = 0) =>
      Array.from({ length: n }, (_, i) => {
        const a = phase + (i / n) * Math.PI * 2;
        return new THREE.Vector3(cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r);
      });

    if (o.id === 'crown') {
      const c = CROWN_CAMP;
      spawn('footsoldier', c.x - 6, c.z, { patrol: ring(c.x, c.z, 7, 4) });
      spawn('footsoldier', c.x + 6, c.z, { patrol: ring(c.x, c.z, 7, 4, Math.PI) });
      spawn('footsoldier', c.x, c.z + 6, { facing: 0 });
      spawn('archer', c.x - 3, c.z - 7, { facing: Math.PI });
      spawn('archer', c.x + 7, c.z + 5, { facing: Math.PI / 2 });
      spawn('priest', c.x + 1.5, c.z - 1.5, { facing: Math.PI });
      run.item = this.makeItem('Brimstone Crown', 'crown', c.x, c.z, 1.0);
    } else if (o.id === 'traitor') {
      const t = TRAITOR_POST;
      run.target = spawn('traitor', t.x, t.z, { facing: Math.PI * 0.75, label: 'Vargash' });
      spawn('footsoldier', t.x + 4, t.z - 4, { patrol: ring(t.x, t.z, 6, 5) });
      spawn('footsoldier', t.x - 3, t.z + 5, { facing: 0.3 });
      spawn('archer', t.x - 4, t.z + 1, { facing: Math.PI });
    } else if (o.id === 'bridge') {
      // The imps and the waves arrive once you reach the bridge.
    } else if (o.spot) {
      const { x, z } = o.spot;
      if (o.template === 'patrol') {
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
        run.item = this.makeItem('Soul Gem', 'gem', x, z, 0.4);
      }
    }
    this.hooks.toast(`Mission: ${o.title}`);
    this.hooks.refreshDialog();
    this.hooks.save();
  }

  /** The crown on its altar, or a soul gem on the ground: glowing, slowly turning. */
  private makeItem(name: string, look: 'crown' | 'gem', x: number, z: number, lift: number): Item {
    const mesh = new THREE.Group();
    if (look === 'crown') {
      const gold = lambert(0xe0a020, 0x6a3a00);
      part(mesh, gold, 0.5, 0.14, 0.5, 0, 0, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        part(mesh, gold, 0.1, 0.22, 0.1, Math.sin(a) * 0.2, 0.15, Math.cos(a) * 0.2);
      }
      part(mesh, lambert(0xff3010, 0xff2000), 0.1, 0.1, 0.1, 0, 0.1, 0.26);
    } else {
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), new THREE.MeshLambertMaterial({ color: 0xc040ff, emissive: 0x6010a0, flatShading: true }));
      mesh.add(gem);
    }
    const pos = new THREE.Vector3(x, heightAt(x, z) + lift, z);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    return { name, mesh, pos, carried: false };
  }

  /** Ends the running mission and clears away what it brought into the world. */
  private end() {
    const a = this.active;
    if (!a) return;
    for (const f of [...a.fighters, ...a.allies]) if (!f.gone) f.dispose();
    if (a.item) this.scene.remove(a.item.mesh);
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
    this.ruler.update(dt, ctx.player.pos);
    this.updateChest(dt, ctx);
    this.updateDrops(dt, ctx);
    this.updateAmbient(dt, ctx);
    const a = this.active;
    if (!a) return;
    if (a.item && !a.item.carried) {
      a.item.mesh.rotation.y += dt * 1.5;
      a.item.mesh.position.y = a.item.pos.y + Math.sin(this.time * 2) * 0.05;
      if (Math.random() < dt * 6) ctx.fire.burst(a.item.pos, 0xffd060, 1, 0.6, { gravity: -1, life: 0.6, size: 0.05, spread: 0.3 });
    }
    // Stealth: once anyone raises the alarm, the kill isn't unseen any more.
    if (a.unseen && a.target?.alive && a.fighters.some((f) => f.everAlerted)) a.unseen = false;

    if (a.offer.id === 'bridge') this.updateBridge(dt, a);
    else if (a.phase === 'go') {
      if (a.target && !a.target.alive) this.objectiveDone(a, a.unseen ? `${a.target.label} is dead, and nobody saw you` : `${a.target.label} is dead`);
      else if (!a.target && !a.item && a.fighters.every((f) => !f.alive)) this.objectiveDone(a, 'The patrol is destroyed');
    }
  }

  private objectiveDone(a: Running, detail: string) {
    a.phase = 'return';
    sfx.missionDone();
    this.hooks.announce('Objective complete', `${detail}. Return to Malphas.`);
    this.hooks.save();
  }

  /** The war at the western bridge: your imps against three waves of angels. */
  private updateBridge(dt: number, a: Running) {
    if (a.phase === 'return') return;
    const b = WEST_BRIDGE;
    if (a.phase === 'go') {
      const p = this.playerPos;
      if (Math.hypot(p.x - b.x, p.z - b.south) > 14) return;
      a.phase = 'fight';
      for (let i = 0; i < 6; i++) {
        const imp = this.hooks.spawn('imp', b.x - 3 + (i % 3) * 3, b.south - 2 - Math.floor(i / 3) * 2, { facing: 0 });
        a.allies.push(imp);
      }
      a.wave = 0;
      a.waveTimer = 3;
      this.hooks.announce('Hold the bridge', 'Your imps stand with you');
      return;
    }
    const left = a.fighters.filter((f) => f.alive).length;
    if (left > 0) return;
    if (a.wave >= 3) {
      this.objectiveDone(a, 'The bridge held');
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
    const goal = new THREE.Vector3(b.x, 0, b.south - 4);
    waves[a.wave - 1].forEach((kind, i) => {
      const x = b.x - 4 + (i % 4) * 2.5;
      const z = b.north + Math.floor(i / 4) * 2.5;
      const f = this.hooks.spawn(kind, x, z, { alert: true, goal, facing: Math.PI, label: kind === 'officer' ? 'Captain Auriel' : undefined });
      a.fighters.push(f);
    });
    this.hooks.toast(`Wave ${a.wave} of 3: angels on the bridge!`);
  }

  private playerPos = new THREE.Vector3();

  /** Angel patrols roaming the plain between missions; they return a while after being wiped out. */
  private updateAmbient(dt: number, ctx: GameContext) {
    this.playerPos.copy(ctx.player.pos);
    for (const p of this.ambient) {
      if (p.fighters.some((f) => f.alive)) continue;
      p.respawn -= dt;
      const far = Math.hypot(ctx.player.pos.x - p.at.x, ctx.player.pos.z - p.at.z) > 45;
      if (p.respawn > 0 || !far) continue;
      p.fighters = [];
      p.respawn = 90;
      const path = [new THREE.Vector3(p.at.x - 7, 0, p.at.z), new THREE.Vector3(p.at.x, 0, p.at.z + 7), new THREE.Vector3(p.at.x + 7, 0, p.at.z), new THREE.Vector3(p.at.x, 0, p.at.z - 7)];
      for (let i = 0; i < 3; i++) {
        p.fighters.push(this.hooks.spawn(i === 2 ? 'archer' : 'footsoldier', p.at.x - 7 + i, p.at.z, { patrol: path.slice(i).concat(path.slice(0, i)) }));
      }
    }
  }

  // ---------- Weapons on the ground ----------

  dropWeapon(w: Weapon, at: THREE.Vector3) {
    const group = new THREE.Group();
    const model = buildWeaponMesh(w.id, w.enchant);
    model.rotation.x = Math.PI / 2;
    model.position.y = 0.15;
    group.add(model);
    // A pillar of light marks it, colored by quality.
    const beam = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: w.enchant ? WEAPON_ENCHANTS[w.enchant].color : QUALITY_GLOW[w.quality], transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    beam.scale.set(0.12, 2.2, 0.12);
    beam.position.y = 1.1;
    group.add(beam);
    const pos = new THREE.Vector3(at.x, groundAt(at.x, at.z, 0.2), at.z);
    group.position.copy(pos);
    this.scene.add(group);
    this.drops.push({ weapon: w, group, pos, age: 0 });
  }

  private updateDrops(dt: number, _ctx: GameContext) {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      d.group.children[0].rotation.z += dt * 0.8;
      d.group.position.y = d.pos.y + 0.1 + Math.sin(d.age * 2) * 0.05;
      if (d.age > 150) {
        this.scene.remove(d.group);
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
    this.chestOpened = true;
    sfx.chestOpen();
    const p = this.chest.position;
    const at = new THREE.Vector3(p.x, p.y + 0.8, p.z);
    this.hooks.dropGold(at, 30, 5);
    const ids: WeaponId[] = ['sword', 'spear', 'axe', 'hammer', 'scythe', 'bow', 'javelin'];
    this.dropWeapon({ id: ids[Math.floor(Math.random() * ids.length)], quality: 2 as Quality, enchant: randomWeaponEnchant() }, new THREE.Vector3(p.x + 0.8, p.y, p.z + 0.4));
    this.hooks.announce('Treasure!', 'The old lords’ chest: 150 gold and an enchanted weapon');
    this.hooks.save();
  }

  // ---------- Things you can use with E ----------

  interactables(ctx: GameContext, takeWeapon: (w: Weapon, from: THREE.Vector3) => void): Interactable[] {
    const out: Interactable[] = [];
    out.push({ pos: this.ruler.pos.clone().setY(this.ruler.pos.y + 1), label: 'Speak with Malphas', range: 6, act: () => {} });
    for (const d of this.drops) {
      out.push({
        pos: d.pos,
        label: `Take ${weaponName(d.weapon)} (${weaponPower(d.weapon)} damage)`,
        range: 2.4,
        act: () => {
          const i = this.drops.indexOf(d);
          if (i < 0) return;
          this.drops.splice(i, 1);
          this.scene.remove(d.group);
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
          this.scene.remove(item.mesh);
          sfx.pickup();
          // Every guard knows the moment it's gone.
          for (const f of a.fighters) if (f.alive) f.becomeAlert(ctx, ctx.player, false);
          this.objectiveDone(a, `You have the ${item.name}`);
        },
      });
    }
    if (!this.chestOpened) {
      out.push({ pos: this.chest.position, label: 'Open the old lords’ chest', range: 2.4, act: () => this.openChest() });
    }
    return out;
  }

  /** Whether the "speak" interactable is Malphas (the dialog opens through main). */
  isRuler(i: Interactable) {
    return i.label === 'Speak with Malphas';
  }

  /** The current goal: text at the top of the screen and a marker in the world. */
  objective(level: number): { text: string; at: THREE.Vector3 | null } {
    void level;
    const ruler = this.ruler.pos.clone().setY(this.ruler.pos.y + 3);
    const a = this.active;
    if (!a) return { text: this.talked ? 'Speak with Malphas for a mission' : 'Speak with Malphas, ruler of the First Plane', at: ruler };
    if (a.phase === 'return') return { text: `Return to Malphas${a.item ? ` with the ${a.item.name}` : ''}`, at: ruler };
    const o = a.offer;
    const v = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z) + 2, z);
    if (o.id === 'bridge') {
      if (a.phase === 'go') return { text: 'Go to the western bridge over the great river', at: v(WEST_BRIDGE.x, WEST_BRIDGE.south) };
      const left = a.fighters.filter((f) => f.alive).length;
      return { text: left > 0 ? `Hold the bridge: wave ${a.wave} of 3 (${left} left)` : `Hold the bridge: wave ${a.wave + 1} of 3 is coming`, at: v(WEST_BRIDGE.x, WEST_BRIDGE.south + 6) };
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
