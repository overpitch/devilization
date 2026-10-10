import './style.css';
import * as THREE from 'three';
import { Input, PAD } from './input';
import { createWorld, heightAt, isLava, lavaNearness, moveBody, SPAWN, TRAINING, type World } from './world';
import { THRONE } from './layout';
import { plane, setPlane } from './planes';
import { Player } from './player';
import { Dog } from './dog';
import { TrainingAngel } from './trainingAngel';
import { Fighter, FIGHTER_KINDS, type FighterKind, type SpawnOptions } from './fighter';
import { newlyEarned, type TrophyRecord } from './trophies';
import { Campaign, type CampaignHooks, type Interactable, type Progress } from './campaign';
import { Projectiles } from './projectiles';
import { Geysers } from './geysers';
import { FirstPersonCamera } from './camera';
import { ViewModel } from './viewmodel';
import { Hud } from './hud';
import { Particles } from './particles';
import { Floaters } from './floaters';
import { initAudio, setAmbience, setBreathing, setVolumes, sfx } from './audio';
import { Music, type Theme } from './music';
import { DIFFICULTIES, IS_XBOX, loadSettings, saveSettings, type Settings } from './settings';
import { MenuNavigator } from './menuNav';
import { Avatar } from './avatar';
import { PlayerTwoHud } from './hud2';
import { viewport } from './viewport';
import { Minimap, type MapDot } from './minimap';
import { drawWorldMap } from './worldMap';
import { buildStands, STANDS, type StandId, type StandSpot } from './stands';
import { randomDemonName, randomDogName } from './hud';
import { Spikes } from './powers';
import { Pickups } from './pickups';
import { loadSave, newSave, useTestSaveSlot, writeSave, type Player2Save, type SaveData } from './save';
import { MAX_LEVEL, RANKS, unlocksAt, xpToNext } from './progression';
import { weaponName, type Weapon } from './weapons';
import { Armory, type ArmoryTab } from './armory';
import type { Foe, GameContext } from './types';

const params = new URLSearchParams(location.search);
// ?test skips the title and runs without pointer lock (for automated checks).
const testMode = params.has('test');
if (testMode) useTestSaveSlot();
/** ?level=N starts you at that level (for trying out powers). */
const startLevel = Number(params.get('level')) || 0;

const settings = loadSettings();

// Smoothing edges is costly at TV resolution in an Xbox browser, so it's off there.
const renderer = new THREE.WebGLRenderer({ antialias: !IS_XBOX, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// Drawn once a frame in render(), even with two views.
renderer.shadowMap.autoUpdate = false;
// The arms and weapon are drawn in a second pass on top of the world.
renderer.autoClear = false;
renderer.info.autoReset = false;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
const debris = new Particles(scene, false, 600);
const fire = new Particles(scene, true, 1000);
const spikes = new Spikes(scene);
const pickups = new Pickups(scene);
const projectiles = new Projectiles(scene);
// Lights up the world around you while you breathe fire.
const breathLight = new THREE.PointLight(0xff7a2a, 0, 14, 1.6);
scene.add(breathLight);
const player = new Player();
const dog = new Dog(scene);
const viewModel = new ViewModel();
const cam = new FirstPersonCamera(camera);
const input = new Input(renderer.domElement);
const menuNav = new MenuNavigator();
const hud = new Hud(settings);
const floaters = new Floaters(hud.floaterLayer);

// ----- Player 2 (split screen), idle until a second controller joins -----
const camera2 = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
const cam2 = new FirstPersonCamera(camera2);
// Each camera sees the other player's demon, never its own body.
camera.layers.enable(2);
camera2.layers.enable(1);
const player2 = new Player();
player2.slot = 1;
const dog2 = new Dog(scene);
dog2.owner = player2;
dog2.visible = false;
const viewModel2 = new ViewModel();
const input2 = new Input(renderer.domElement, false);
const avatars = [new Avatar(scene, 0), new Avatar(scene, 1)];
const hud2 = new PlayerTwoHud();
const floaters2 = new Floaters(hud2.floaterLayer, hud2.size);
// A mini map for each player, in the bottom-right corner of their view.
const minimap = new Minimap(document.getElementById('hud')!);
const minimap2 = new Minimap(hud2.root);
let twoPlayer = false;
/** "Add Player 2" was chosen: the next controller to press A joins. */
let waitingForP2 = false;
/** Seconds a fallen demon waits before rising beside the other one. */
const REVIVE_TIME = 8;
player2.ballAt = () => viewModel2.ballWorld;
player2.onLand = (speed) => cam2.addShake(Math.min(speed / 50, 0.3));
player2.onHurt = () => input2.rumble(0.7, 180);
const armory = new Armory();
const music = new Music();
/** Seconds the battle music holds on after the last angel stops hunting you. */
let battleHold = 0;
let armoryTab: ArmoryTab = 'weapons';
/** The trading stand being browsed (null: the armory from the pause menu), and who is shopping. */
let armoryStand: StandId | null = null;
let shopper: Player = player;
/** The stalls in this plane's lair. */
let stands: StandSpot[] = [];
/** Imps hired at the Imp Pens (saved), and the ones following you on this plane. */
let hiredImps = 0;
let impFollowers: Fighter[] = [];

player.ballAt = () => viewModel.ballWorld;
player.onLand = (speed) => cam.addShake(Math.min(speed / 50, 0.3));
player.onHurt = () => input.rumble(0.7, 180);


/** What you've achieved across every plane. */
const progress: Progress = { done: new Set(), chests: new Set(), talked: new Set(), sideDone: 0 };
/** For the bestiary and trophies. */
let killsByKind: { [kind: string]: number } = {};
let silentKills = 0;
let deepest = 1;
const earned = new Set<string>();
let trophyTimer = 0;
/** Player 2 as they were when they last left (kept in the save). */
let savedP2: Player2Save | null = null;

// The current plane: everything in it hangs from planeRoot, so leaving is just removing it.
let planeRoot = new THREE.Group();
let world: World | null = null;
let geysers: Geysers;
let campaign: Campaign;
/** The dazed angels on the First Plane's training ground. */
let trainingAngels: TrainingAngel[] = [];

/** Every fighter in the world: angels, the traitor, your imps. */
const fighters: Fighter[] = [];
/** Heaven's side, rebuilt each frame: what you can hit. */
const foes: Foe[] = [];

function applySettings(s: Settings) {
  const diff = DIFFICULTIES[s.difficulty];
  for (const p of [player, player2]) {
    p.damageTaken = diff.enemyDamage;
    p.regen = diff.regen;
  }
  minimap.visible = s.minimap;
  minimap2.visible = s.minimap;
  cam.sensitivity = s.sensitivity;
  cam.invertY = s.invertY;
  setVolumes(s.musicVolume, s.sfxVolume);
  const low = s.graphics === 'low';
  // Xbox browsers are slow at filling pixels: on Low they draw at three quarters resolution.
  renderer.setPixelRatio(low ? Math.min(window.devicePixelRatio, 1) * (IS_XBOX ? 0.75 : 1) : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  world?.setShadows(!low);
}
// Browsers only allow sound after the player interacts; start it on the first key or click.
for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, () => initAudio(), { once: true });

/** 'menu' covers the title, naming and intro screens; the world idles behind them. */
let phase: 'menu' | 'playing' = 'menu';
let kills = 0;
let playTime = 0;
let pendingNames = { name: '', dog: '' };
let saveTimer = 0;
let hitStopTimer = 0;
let deathShown = false;
let titleOrbit = 0;

const ctx: GameContext = {
  scene,
  player,
  dog,
  players: [player],
  dogs: [dog],
  foes,
  fighters,
  debris,
  fire,
  geysers: null as unknown as Geysers, // set when a plane is built
  spikes,
  projectiles,
  floatText: (at, text, kind) => {
    floaters.spawn(at, text, kind);
    if (twoPlayer) floaters2.spawn(at, text, kind);
  },
  addShake: (amount) => {
    cam.addShake(amount);
    if (twoPlayer) cam2.addShake(amount);
  },
  hitStop: (seconds) => {
    input.rumble(seconds > 0.08 ? 0.5 : 0.3, 90);
    if (twoPlayer) input2.rumble(seconds > 0.08 ? 0.5 : 0.3, 90);
    hitStopTimer = Math.max(hitStopTimer, seconds);
  },
  onFoeKilled: (foe) => {
    kills++;
    const r = (foe as Foe & { reward: { xp: number; gold: number; drop: Weapon | null } }).reward;
    if (foe instanceof Fighter && foe.side === 'heaven') killsByKind[foe.kind] = (killsByKind[foe.kind] ?? 0) + 1;
    const xp = Math.round(r.xp * DIFFICULTIES[settings.difficulty].xp);
    const chest = new THREE.Vector3(foe.pos.x, foe.pos.y + 1.4, foe.pos.z);
    // Ten coins burst out, whatever they're worth together.
    if (r.gold > 0) pickups.spawnGold(chest, 10, r.gold / 10);
    if (xp > 0) {
      floaters.spawn(chest.clone().setY(chest.y + 1.2), `+${xp} XP`, 'xp');
      awardXp(xp);
    }
    if (r.drop) campaign.dropWeapon(r.drop, foe.pos);
  },
  toast: (text) => hud.toast(text),
  summon: (kind, x, z) => spawnFighter(kind, x, z, { alert: true }),
};

/** Every demon playing gets the gold: each has their own purse (as in Evil One). */
function awardGold(amount: number) {
  for (const p of ctx.players) p.gold += amount;
}

pickups.onCollect = (at, value) => {
  awardGold(value);
  sfx.coin();
  floaters.spawn(at.clone().setY(at.y + 0.6), `+${value}`, 'gold');
};

player.onAssassinate = player2.onAssassinate = (foe) => {
  silentKills++;
  ctx.floatText(new THREE.Vector3(foe.pos.x, foe.pos.y + 2.6, foe.pos.z), 'Silent kill', 'heavy');
};

function spawnFighter(kind: FighterKind, x: number, z: number, opts?: SpawnOptions) {
  // Angels are stronger on deeper planes.
  const toughness = FIGHTER_KINDS[kind].side === 'heaven' ? DIFFICULTIES[settings.difficulty].enemyHealth : 1;
  const f = new Fighter(planeRoot, kind, x, z, hud.barLayer, { power: plane().power, toughness, ...opts });
  fighters.push(f);
  return f;
}

const campaignHooks: CampaignHooks = {
  spawn: spawnFighter,
  reward: (xp, gold) => {
    awardGold(gold);
    sfx.coin();
    awardXp(xp);
    // The weaponsmith and armorer get new enchanted goods after every mission.
    armory.restock();
  },
  announce: (title, detail) => hud.announce(title, detail),
  toast: (text) => hud.toast(text),
  promoted: (rank) => {
    player.rank = rank;
    sfx.unlock();
    hud.announce(`Promoted: ${RANKS[rank]}`, `${plane().ruler.name} has raised you up. The Hellgate leads deeper.`);
    saveGame();
  },
  dropGold: (at, coins, each) => pickups.spawnGold(at, coins, each),
  refreshDialog: () => {
    if (hud.rulerOpen) hud.showRuler(campaign.dialog(player.level, player.rank));
  },
  travel: (index) => travel(index),
  victory: () => {
    // Heaven's general is dead: you are Demon Lord.
    player.rank = RANKS.length - 1;
    sfx.unlock();
    saveGame();
    setTimeout(() => {
      player.stopPowers(ctx);
      if (document.pointerLockElement) document.exitPointerLock();
      hud.showPause(false);
      sfx.levelUp();
      hud.showEnding({ name: player.name, dog: dog.name, level: player.level, kills, seconds: playTime });
    }, 4000);
  },
  save: () => saveGame(),
};

/** Tears down the plane you're on (if any) and builds another in its place. */
function buildPlane(index: number) {
  if (world) {
    campaign.cancel();
    scene.remove(planeRoot);
    world.dispose();
    for (const t of trainingAngels) t.dispose();
  }
  clearFighters();
  projectiles.clear();
  pickups.clear();
  floaters.clear();
  setPlane(index);
  deepest = Math.max(deepest, index);
  planeRoot = new THREE.Group();
  scene.add(planeRoot);
  world = createWorld(scene, planeRoot);
  stands = buildStands(planeRoot);
  impFollowers = [];
  world.setShadows(settings.graphics !== 'low');
  geysers = new Geysers(planeRoot);
  ctx.geysers = geysers;
  trainingAngels =
    index === 1
      ? [
          [TRAINING.x - 4.5, TRAINING.z + 1],
          [TRAINING.x, TRAINING.z + 3],
          [TRAINING.x + 4.5, TRAINING.z + 1],
        ].map(([x, z]) => new TrainingAngel(planeRoot, x, z, Math.atan2(SPAWN.x - x, SPAWN.z - z), hud.barLayer))
      : [];
  campaign = new Campaign(planeRoot, progress, campaignHooks);
  minimap.paintPlane();
  minimap2.paintPlane();
}

/** Through the Hellgate: to another plane, arriving before its ruler. */
function travel(index: number) {
  if (index === plane().index) return;
  hud.showRuler(null);
  buildPlane(index);
  spawn();
  sfx.warHorn();
  hud.announce(plane().name, `${plane().title} · suggested level ${plane().level}`);
  saveGame();
  lockPointer();
}

/** Picks up a weapon; with your hands full, the one you hold drops where you stand. */
function takeWeapon(w: Weapon, p: Player = player) {
  const dropped = p.takeWeapon(w);
  sfx.pickup();
  const who = twoPlayer ? `${p.name}: ` : '';
  hud.toast(who + (dropped ? `Took ${weaponName(w)}, dropped ${weaponName(dropped)}` : `Took ${weaponName(w)}`));
  if (dropped) campaign.dropWeapon(dropped, p.pos);
  saveGame();
}

function awardXp(amount: number) {
  const before = player.level;
  const gained = player.gainXp(amount);
  // Player 2 shares Player 1's level and XP.
  if (twoPlayer) {
    player2.loadHero(player2.name, player.level, player.xp, player2.gold, player.rank);
    if (gained > 0 && player2.alive) {
      player2.hp = player2.maxHp;
      player2.energy = player2.maxEnergy;
    }
  }
  if (gained === 0) return;
  const at = new THREE.Vector3(player.pos.x, player.pos.y + 1, player.pos.z);
  fire.burst(at, 0xffb040, 40, 7, { gravity: -2, life: 1, size: 0.15 });
  fire.burst(at, 0xff4010, 25, 5, { life: 0.8, size: 0.12 });
  cam.addShake(0.2);
  sfx.levelUp();
  hud.announce(`Level ${player.level}`, 'Health and hellfire restored', true);
  // Announce anything new a moment later, so it doesn't cover the level-up.
  const news = [];
  for (let l = before + 1; l <= player.level; l++) news.push(...unlocksAt(l, dog.name));
  news.forEach((n, i) =>
    setTimeout(() => {
      sfx.unlock();
      hud.announce(n.title, n.detail);
    }, 2600 * (i + 1)),
  );
  saveGame();
}

function saveGame() {
  if (phase !== 'playing') return;
  writeSave({
    version: 1,
    name: player.name,
    dogName: dog.name,
    level: player.level,
    xp: player.xp,
    gold: player.gold,
    kills,
    rank: player.rank,
    playTime: Math.round(playTime),
    weapons: player.weapons,
    equipped: player.equipped,
    armor: player.armor,
    plane: plane().index,
    missionsDone: [...progress.done],
    sideDone: progress.sideDone,
    chests: [...progress.chests],
    talkedPlanes: [...progress.talked],
    killsByKind,
    silentKills,
    trophies: [...earned],
    deepest,
    player2: twoPlayer ? player2Save() : savedP2,
    potions: player.potions,
    imps: hiredImps,
    savedAt: Date.now(),
  });
}

/** Removes every fighter from the world (a new game or a loaded save). */
function clearFighters() {
  for (const f of fighters) if (!f.gone) f.dispose();
  fighters.length = 0;
}

/** Starts play from a save (or a fresh demon). */
function enterWorld(save: SaveData) {
  if (startLevel > save.level) {
    // Testing: jump straight to a level.
    save.level = Math.min(startLevel, MAX_LEVEL);
    save.xp = 0;
  }
  player.loadHero(save.name, save.level, Math.min(save.xp, xpToNext(save.level)), save.gold, save.rank);
  player.weapons = save.weapons.map((w) => ({ ...w }));
  player.equipped = save.equipped;
  player.armor = save.armor ? { ...save.armor } : null;
  player.potions = save.potions;
  hiredImps = save.imps;
  armory.restock();
  dog.name = save.dogName;
  kills = save.kills;
  playTime = save.playTime;
  progress.done = new Set(save.missionsDone);
  progress.chests = new Set(save.chests);
  progress.talked = new Set(save.talkedPlanes);
  progress.sideDone = save.sideDone;
  killsByKind = { ...save.killsByKind };
  silentKills = save.silentKills;
  deepest = save.deepest;
  earned.clear();
  for (const id of save.trophies) earned.add(id);
  savedP2 = save.player2;
  // You can't be on a plane your rank hasn't opened.
  buildPlane(Math.min(save.plane, player.rank + 1));
  phase = 'playing';
  hud.showScreen('none');
  spawn();
  hud.announce(plane().name, plane().title);
  saveGame();
}

/** Puts you (and your dog) at the foot of the ruler's throne. */
function spawn() {
  player.reset(SPAWN.x, SPAWN.z);
  cam.yaw = Math.atan2(THRONE.x - SPAWN.x, THRONE.z - SPAWN.z);
  cam.pitch = 0.05;
  player.facing = cam.yaw;
  dog.reset(SPAWN.x, SPAWN.z, cam.yaw);
  viewModel.reset();
  player.stopPowers(ctx);
  if (twoPlayer) placePlayer2Beside();
  gatherImps();
  projectiles.clear();
  floaters.clear();
  floaters2.clear();
  hitStopTimer = 0;
  deathShown = false;
  hud.showDeath(false);
  hud.fadeIn();
}

// ---------- Two players ----------

/** Puts Player 2 (and their dog) at Player 1's side, looking the same way. */
function placePlayer2Beside() {
  const yaw = cam.yaw;
  player2.stopPowers(ctx);
  player2.reset(player.pos.x - Math.cos(yaw) * 1.6, player.pos.z + Math.sin(yaw) * 1.6);
  cam2.yaw = yaw;
  cam2.pitch = cam.pitch;
  player2.facing = yaw;
  dog2.reset(player2.pos.x, player2.pos.z, yaw);
  viewModel2.reset();
}

/** Each view's size and shape: the whole window, or half each side by side. */
function updateAspect() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  viewport.w = twoPlayer ? Math.floor(w / 2) : w;
  viewport.h = h;
  for (const c of [camera, camera2]) {
    c.aspect = viewport.w / h;
    c.updateProjectionMatrix();
  }
}

/** Player 2 joins on controller `padIndex`, at Player 1's side, with a dog of their own. */
function joinPlayer2(padIndex: number) {
  twoPlayer = true;
  waitingForP2 = false;
  input2.padIndex = padIndex;
  input2.lastPadIndex = padIndex;
  input.exclude = padIndex;
  if (input.lastPadIndex === padIndex) input.lastPadIndex = null;
  ctx.players = [player, player2];
  ctx.dogs = [dog, dog2];
  // Same level and rank as Player 1, and a copy of their gear.
  // Same level and rank as Player 1. A returning Player 2 keeps their name, dog and gear;
  // a new one gets a name and a copy of Player 1's gear.
  const back = savedP2;
  player2.loadHero(back?.name ?? randomDemonName(player.name), player.level, player.xp, back?.gold ?? 0, player.rank);
  player2.weapons = (back?.weapons ?? player.weapons).map((w) => ({ ...w }));
  player2.equipped = back ? back.equipped : player.equipped;
  const armor = back ? back.armor : player.armor;
  player2.armor = armor ? { ...armor } : null;
  dog2.name = back?.dogName ?? randomDogName(dog.name);
  player2.potions = back?.potions ?? 0;
  dog2.visible = true;
  for (const a of avatars) a.visible = true;
  placePlayer2Beside();
  document.getElementById('hud')!.classList.add('split');
  hud2.show(true);
  hud.setPlayer2(true);
  updateAspect();
  sfx.warHorn();
  hud.announce(back ? `${player2.name} is back!` : `${player2.name} has joined!`, `With ${dog2.name} at their side · Pause · Remove Player 2`);
  saveGame();
}

/** Player 2's name, dog and gear, for the save. */
function player2Save(): Player2Save {
  return {
    name: player2.name,
    dogName: dog2.name,
    weapons: player2.weapons.map((w) => ({ ...w })),
    equipped: player2.equipped,
    armor: player2.armor ? { ...player2.armor } : null,
    potions: player2.potions,
    gold: player2.gold,
  };
}

function leavePlayer2() {
  if (!twoPlayer) return;
  savedP2 = player2Save();
  saveGame();
  twoPlayer = false;
  waitingForP2 = false;
  player2.stopPowers(ctx);
  input.exclude = null;
  input2.padIndex = null;
  ctx.players = [player];
  ctx.dogs = [dog];
  dog2.visible = false;
  for (const a of avatars) a.visible = false;
  floaters2.clear();
  document.getElementById('hud')!.classList.remove('split');
  hud2.show(false);
  hud.setPlayer2(false);
  hud.setDown(null);
  updateAspect();
  // Player 1 can't stay down waiting for a partner who has gone.
  if (!player.alive) player.deadTime = Math.max(player.deadTime, 1.6);
  hud.announce(`${player2.name} has left`, '');
}

/** Each controller's A button last frame, to catch a fresh press. */
const padA = new Map<number, boolean>();

/**
 * A second controller pressing A brings in Player 2: any time, if Player 1
 * is already on a controller, or after "Add Player 2" (so a keyboard player
 * can be joined by someone with a controller).
 */
function checkJoin() {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) {
    if (!p?.connected) continue;
    const down = !!(p.buttons[PAD.A]?.pressed || (p.buttons[PAD.A]?.value ?? 0) > 0.5);
    const fresh = down && !padA.get(p.index);
    padA.set(p.index, down);
    if (!fresh || twoPlayer || phase !== 'playing' || hud.endingOpen || menuNav.menuOpen) continue;
    const p1Pad = input.lastPadIndex;
    const p1OnKeyboard = input.mode === 'mouse' || p1Pad === null;
    if ((waitingForP2 && (p1OnKeyboard || p.index !== p1Pad)) || (p1Pad !== null && input.mode === 'gamepad' && p.index !== p1Pad)) {
      joinPlayer2(p.index);
      return;
    }
  }
}

/** Seconds until a fallen demon rises beside the other (two players, while the other stands). */
function revivingIn(p: Player): number | null {
  if (!twoPlayer || p.alive) return null;
  const other = p === player ? player2 : player;
  return other.alive ? REVIVE_TIME - p.deadTime : null;
}

function updateRevives() {
  if (!twoPlayer) return;
  for (const p of [player, player2]) {
    const left = revivingIn(p);
    if (left === null || left > 0) continue;
    const other = p === player ? player2 : player;
    const otherCam = p === player ? cam2 : cam;
    const yaw = otherCam.yaw;
    p.reset(other.pos.x - Math.cos(yaw) * 1.6, other.pos.z + Math.sin(yaw) * 1.6);
    const myCam = p === player ? cam : cam2;
    myCam.yaw = yaw;
    myCam.pitch = 0;
    p.facing = yaw;
    fire.burst(new THREE.Vector3(p.pos.x, p.pos.y + 1, p.pos.z), 0xff6a10, 30, 5, { life: 0.8, size: 0.15 });
    sfx.unlock();
    hud.toast(`${p.name} claws back out of the pits`);
  }
}

hud.onTogglePlayer2 = () => {
  if (twoPlayer) leavePlayer2();
  else {
    waitingForP2 = true;
    hud.announce('Player 2', 'Press A on the second controller to join');
  }
  lockPointer();
};

/** Grabs the pointer. If the browser refuses, the pause screen offers Resume. */
function lockPointer() {
  initAudio();
  (document.activeElement as HTMLElement | null)?.blur();
  if (testMode) return;
  // A controller (and any Xbox, where the browser can't capture the mouse) just closes the menu.
  if (input.mode === 'gamepad' || IS_XBOX) {
    hud.showPause(false);
    return;
  }
  input.requestLock();
  setTimeout(() => {
    if (phase === 'playing' && !input.locked && input.mode === 'mouse' && player.alive && !hud.rulerOpen && !hud.sideScreenOpen && !hud.endingOpen) hud.showPause(true);
  }, 1200);
}

/** Shows the armory (from the pause menu) or a trading stand on a tab, with a message about the last purchase. */
function showArmory(message = '') {
  const stand = STANDS.find((d) => d.id === armoryStand);
  const who = twoPlayer ? ` · ${shopper.name}'s gold` : '';
  hud.showArmory({
    tab: armoryTab,
    tabs: stand ? stand.tabs : ['weapons', 'armor', 'gear'],
    title: stand ? stand.name : 'The Armory',
    subtitle: (stand ? stand.pitch : `Weaponsmith and armorer of ${plane().name}`) + who,
    gold: shopper.gold,
    message,
    side: twoPlayer && stand ? (shopper === player ? 'left' : 'right') : undefined,
    rows: armory.rows(
      armoryTab,
      shopper,
      (msg) => {
        sfx.buy();
        saveGame();
        showArmory(msg);
      },
      { purse: shopper, imps: impFollowers.length, hireImp, power: plane().power },
    ),
  });
}

function closeArmory() {
  hud.showArmory(null);
  if (armoryStand) {
    // Back to the game from a stand; back to the pause menu from the armory.
    armoryStand = null;
    saveGame();
    if (shopper === player) lockPointer();
  } else hud.showPause(true);
}

/** Two-player at a stand: the shop covers only the shopper's half, and the other player keeps playing. */
function shopHalf() {
  return twoPlayer && armoryStand !== null && hud.armoryOpen;
}

/** Stands in for the shopper's controller while they browse (it presses nothing). */
const idleInput = new Input(renderer.domElement, false);

/** Walks up to a trading stand's counter: its goods, for whoever is shopping. */
function openStand(id: StandId, who: Player) {
  who.stopPowers(ctx);
  // Player 1 needs the mouse back to shop; Player 2 shopping leaves Player 1 playing.
  if (who === player && document.pointerLockElement) document.exitPointerLock();
  armoryStand = id;
  shopper = who;
  armoryTab = STANDS.find((d) => d.id === id)!.tabs[0];
  showArmory();
}

/** Whoever the hired imps follow: Player 1, or Player 2 while Player 1 is down. */
const impLeader = () => (player.alive || !twoPlayer || !player2.alive ? player.pos : player2.pos);

function spawnImp(slot: number) {
  const lead = impLeader();
  const a = slot * 1.26 + 2.2;
  const imp = spawnFighter('imp', lead.x + Math.sin(a) * 2.6, lead.z + Math.cos(a) * 2.6, { escort: impLeader, escortSlot: slot });
  impFollowers.push(imp);
  return imp;
}

/** Hires one more imp at the Imp Pens. */
function hireImp() {
  hiredImps++;
  spawnImp(impFollowers.length);
}

/** After arriving (a new plane, or back at the lair): every hired imp at your side. */
function gatherImps() {
  impFollowers = impFollowers.filter((f) => f.alive && !f.gone);
  const lead = impLeader();
  impFollowers.forEach((f, i) => {
    const a = i * 1.26 + 2.2;
    f.pos.set(lead.x + Math.sin(a) * 2.6, f.pos.y, lead.z + Math.cos(a) * 2.6);
  });
  while (impFollowers.length < hiredImps) spawnImp(impFollowers.length);
}

/** A hired imp that falls is gone for good. */
function updateImps() {
  for (const f of impFollowers) {
    if (!f.alive && hiredImps > 0) {
      hiredImps--;
      hud.toast('One of your imps has fallen');
    }
  }
  impFollowers = impFollowers.filter((f) => f.alive);
}

function openRuler() {
  player.stopPowers(ctx);
  hud.showRuler(campaign.dialog(player.level, player.rank));
  if (document.pointerLockElement) document.exitPointerLock();
}

/** The Hellgate's list of planes (shown in the same window as the ruler's dialog). */
function openPortal() {
  player.stopPowers(ctx);
  hud.showRuler(campaign.travelDialog(player.rank, player.level));
  if (document.pointerLockElement) document.exitPointerLock();
}

function closeRuler() {
  hud.showRuler(null);
  saveGame();
  lockPointer();
}

hud.onContinue = () => {
  const save = loadSave();
  if (!save) {
    hud.showTitle(null);
    return;
  }
  enterWorld(save);
  lockPointer();
};
hud.onNewGame = () => {
  initAudio();
  hud.showScreen('name');
};
hud.onNamesChosen = (name, dogName) => {
  pendingNames = { name, dog: dogName };
  hud.showIntro(name, dogName);
};
hud.onBegin = () => {
  enterWorld(newSave(pendingNames.name, pendingNames.dog));
  lockPointer();
};
hud.onResume = lockPointer;
hud.onQuit = () => {
  saveGame();
  leavePlayer2();
  phase = 'menu';
  player.stopPowers(ctx);
  campaign.cancel();
  hud.showPause(false);
  hud.showDeath(false);
  hud.showRuler(null);
  hud.showArmory(null);
  hud.showTrophies(null);
  hud.showMap(null);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.fadeIn();
  hud.showTitle(loadSave());
};
hud.onKeepPlaying = () => {
  hud.showEnding(null);
  hud.announce('Demon Lord', 'Hell is yours. The rulers still have work for you.');
  lockPointer();
};
hud.onEndingTitle = () => {
  hud.showEnding(null);
  hud.onQuit?.();
};
hud.onReturnToLair = () => {
  const can = campaign.canReturnToLair(ctx);
  if (!can.ok) {
    sfx.denied();
    return;
  }
  hud.showPause(false);
  spawn();
  hud.toast('You return to the lair');
  lockPointer();
};
hud.onRespawn = () => {
  spawn();
  lockPointer();
};
hud.onRulerClose = closeRuler;
hud.onArmoryOpen = () => {
  hud.showPause(false);
  armoryStand = null;
  shopper = player;
  if (armoryTab === 'potions' || armoryTab === 'imps') armoryTab = 'weapons';
  showArmory();
};
hud.onArmoryClose = closeArmory;
hud.onTrophiesOpen = () => {
  hud.showPause(false);
  hud.showTrophies({ record: trophyRecord(), earned });
};
hud.onTrophiesClose = closeTrophies;
hud.onMapClose = closeMap;

/** The full map of this plane, north up. */
function openMap() {
  player.stopPowers(ctx);
  if (twoPlayer) player2.stopPowers(ctx);
  if (document.pointerLockElement) document.exitPointerLock();
  const p = plane();
  const o = campaign.objective();
  hud.showMap({ title: p.name, subtitle: p.title, objective: o.text });
  const marks = campaign.mapMarks();
  // Angels near either of you (as on the mini map), and mission targets wherever they are.
  const near = (x: number, z: number) => ctx.players.some((q) => Math.hypot(q.pos.x - x, q.pos.z - z) < 42);
  const dots: MapDot[] = [];
  for (const f of fighters) {
    if (!f.alive) continue;
    if (f.side === 'hell') {
      if (near(f.pos.x, f.pos.z)) dots.push({ x: f.pos.x, z: f.pos.z, color: '#60d060', size: 2 });
    } else if (f.label !== null || near(f.pos.x, f.pos.z)) {
      dots.push({ x: f.pos.x, z: f.pos.z, color: f.state === 'alert' ? '#ff3a30' : f.suspicion > 0.3 ? '#ffc040' : '#f0ece0', size: f.label !== null ? 3.4 : 2.4 });
    }
  }
  for (const d of ctx.dogs) dots.push({ x: d.pos.x, z: d.pos.z, color: '#ff8a30', size: 2.2 });
  dots.push({ x: marks.portal.x, z: marks.portal.z, color: '#c060ff', size: 4, shape: 'ring' });
  dots.push({ x: marks.ruler.x, z: marks.ruler.z, color: '#ff6030', size: 3.5, shape: 'square' });
  if (marks.chest) dots.push({ x: marks.chest.x, z: marks.chest.z, color: '#ffd040', size: 3, shape: 'square' });
  if (o.at) dots.push({ x: o.at.x, z: o.at.z, color: '#ffd040', size: 5, shape: 'diamond' });
  const labels = [
    { x: marks.ruler.x, z: marks.ruler.z, text: p.ruler.name },
    { x: marks.portal.x, z: marks.portal.z, text: 'Hellgate' },
  ];
  const players = [{ x: player.pos.x, z: player.pos.z, yaw: cam.yaw, color: '#ffd040' }];
  if (twoPlayer) players.push({ x: player2.pos.x, z: player2.pos.z, yaw: cam2.yaw, color: '#b080ff' });
  drawWorldMap(document.getElementById('map-canvas') as HTMLCanvasElement, minimap.ground, players, dots, labels);
}

function closeMap() {
  hud.showMap(null);
  lockPointer();
}
function closeTrophies() {
  hud.showTrophies(null);
  hud.showPause(true);
}
hud.onArmoryTab = (tab) => {
  armoryTab = tab;
  showArmory();
};
hud.onSettings = (s) => {
  applySettings(s);
  saveSettings(s);
};
input.onLockChange = (locked) => {
  if (locked) hud.showPause(false);
  else if (phase === 'playing' && input.mode === 'mouse' && player.alive && !hud.rulerOpen && !hud.sideScreenOpen && !hud.endingOpen) {
    player.stopPowers(ctx);
    saveGame();
    hud.showPause(true);
  }
};
window.addEventListener('beforeunload', saveGame);
// Clicking the game while paused resumes it.
renderer.domElement.addEventListener('click', () => {
  if (phase === 'playing' && !input.locked && player.alive && !hud.rulerOpen && !hud.sideScreenOpen && !hud.endingOpen && !IS_XBOX) {
    input.mode = 'mouse';
    lockPointer();
  }
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && hud.rulerOpen) closeRuler();
  else if (e.code === 'Escape' && hud.armoryOpen) closeArmory();
  else if (e.code === 'Escape' && hud.trophiesOpen) closeTrophies();
  else if (e.code === 'Escape' && hud.mapOpen) closeMap();
});

/** Stops play and shows the pause menu (the Menu button, or a controller player leaving the mouse). */
function pauseGame() {
  player.stopPowers(ctx);
  saveGame();
  if (document.pointerLockElement) document.exitPointerLock();
  hud.showPause(true);
}

const XBOX_TIP = 'Hold the ☰ Menu button for a second to switch the controller to game controls';
let xboxTipTimer = 0;

// Console browsers scroll the page with the right stick; there's nothing to scroll, so ignore it.
window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });

if (IS_XBOX) {
  // Edge on Xbox maps the controller's B button to browser Back. Keep an extra
  // history entry on top so Back stays on the game. Browsers ignore entries
  // added without a click or key press, so it's (re)armed on real input.
  let guarded = false;
  const guard = () => {
    if (guarded) return;
    history.pushState({ devilization: true }, '');
    guarded = true;
  };
  for (const type of ['pointerdown', 'keydown'] as const) window.addEventListener(type, guard);
  window.addEventListener('popstate', () => {
    guarded = false;
    guard();
    hud.announce('Still here!', XBOX_TIP);
  });
  document.getElementById('xbox-tip')!.classList.remove('hidden');
}

/** On Xbox, if the demon isn't getting controller input but the cursor is moving, explain how to switch. */
function updateXboxTip(dt: number) {
  if (!IS_XBOX || phase !== 'playing') return;
  xboxTipTimer -= dt;
  const now = performance.now();
  if (xboxTipTimer <= 0 && now - input.lastMouseMove < 1500 && now - input.lastPadInput > 3000) {
    hud.announce('Controller', XBOX_TIP);
    xboxTipTimer = 20;
  }
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateAspect();
});

// The world behind the title is the plane your saved game is on.
buildPlane(loadSave()?.plane ?? 1);
applySettings(settings);
spawn();
if (testMode) enterWorld(loadSave() ?? newSave('Tester', 'Cinder'));
else hud.showTitle(loadSave());

// ---------- Main loop ----------

const eye = new THREE.Vector3();
const lookDir = new THREE.Vector3();

/** Behind the title: a slow circle around the training ground. */
function updateTitleCamera(dt: number) {
  titleOrbit += dt * 0.04;
  // Kept inside the cleared ground around the training ground, so it never passes through a spire.
  camera.position.set(TRAINING.x + Math.sin(titleOrbit) * 10, 7, TRAINING.z + Math.cos(titleOrbit) * 10);
  camera.lookAt(TRAINING.x, 2, TRAINING.z);
}

interface Body {
  pos: THREE.Vector3;
  radius: number;
  mass: number;
}

/** Keeps bodies from overlapping; heavier bodies get pushed less. */
function separateBodies() {
  const bodies: Body[] = [
    { pos: player.pos, radius: player.radius, mass: 3 },
    { pos: dog.pos, radius: dog.radius, mass: 3 },
  ];
  if (twoPlayer) bodies.push({ pos: player2.pos, radius: player2.radius, mass: 3 }, { pos: dog2.pos, radius: dog2.radius, mass: 3 });
  for (const f of fighters) {
    if (f.alive && f.pos.distanceToSquared(player.pos) < 60 * 60) bodies.push({ pos: f.pos, radius: f.radius, mass: f.radius > 0.5 ? 2 : 1 });
  }
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i];
      const b = bodies[j];
      const dx = b.pos.x - a.pos.x;
      const dz = b.pos.z - a.pos.z;
      const min = a.radius + b.radius;
      const d = Math.hypot(dx, dz);
      if (d >= min || d < 1e-6 || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
      const overlap = (min - d) / d;
      const aShare = b.mass / (a.mass + b.mass);
      moveBody(a.pos, -dx * overlap * aShare, -dz * overlap * aShare, a.radius * 0.8, 1.05);
      moveBody(b.pos, dx * overlap * (1 - aShare), dz * overlap * (1 - aShare), b.radius * 0.8, 1.05);
    }
  }
}

/** The closest thing you can use with E that you're facing. */
function nearestInteractable(player: Player, cam: FirstPersonCamera): Interactable | null {
  let best: Interactable | null = null;
  let bestScore = Infinity;
  cam.lookDir(lookDir);
  const standSpots: Interactable[] = stands.map((st) => ({ pos: st.pos, label: `Browse ${st.def.name}`, range: 2.8, kind: 'stand', stand: st.def.id, act: () => {} }));
  for (const i of [...campaign.interactables(ctx, (w) => takeWeapon(w, player)), ...standSpots]) {
    const dx = i.pos.x - player.pos.x;
    const dz = i.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    // Must be about level with it: no opening the chest from the foot of its pillar.
    if (d > i.range || i.pos.y - player.pos.y > 1.8 || player.pos.y - i.pos.y > 2.5) continue;
    // Roughly in front of you (or right at your feet).
    const facing = (dx * lookDir.x + dz * lookDir.z) / (d || 1);
    if (d > 1.2 && facing < 0.5) continue;
    const score = d - facing;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

let p2Roaring = false;

function trophyRecord(): TrophyRecord {
  return {
    kills,
    killsByKind,
    silentKills,
    chests: progress.chests.size,
    sideDone: progress.sideDone,
    level: player.level,
    rank: player.rank,
    gold: player.gold,
    deepest,
    demonLord: player.rank >= RANKS.length - 1,
  };
}

/** Once a second: announces any trophy just earned. */
function checkTrophies(dt: number) {
  trophyTimer -= dt;
  if (trophyTimer > 0) return;
  trophyTimer = 1;
  const fresh = newlyEarned(trophyRecord(), earned);
  if (fresh.length === 0) return;
  fresh.forEach((t, i) => {
    earned.add(t.id);
    setTimeout(() => {
      sfx.unlock();
      hud.announce(`Trophy: ${t.name}`, t.text);
    }, 2200 * i);
  });
  saveGame();
}

/** What the mini map shows from `me`'s point of view: landmarks, the objective, angels, dogs and the other player. */
function mapDots(me: Player): MapDot[] {
  const dots: MapDot[] = [];
  const marks = campaign.mapMarks();
  dots.push({ x: marks.portal.x, z: marks.portal.z, color: '#c060ff', size: 4, shape: 'ring' });
  dots.push({ x: marks.ruler.x, z: marks.ruler.z, color: '#ff6030', size: 3.5, shape: 'square' });
  if (marks.chest) dots.push({ x: marks.chest.x, z: marks.chest.z, color: '#ffd040', size: 3, shape: 'square' });
  for (const f of fighters) {
    if (!f.alive) continue;
    if (f.side === 'hell') dots.push({ x: f.pos.x, z: f.pos.z, color: '#60d060', size: 2 });
    else {
      const color = f.state === 'alert' ? '#ff3a30' : f.suspicion > 0.3 ? '#ffc040' : '#f0ece0';
      dots.push({ x: f.pos.x, z: f.pos.z, color, size: f.kind === 'general' ? 5 : f.kind === 'officer' || f.kind === 'traitor' ? 3.2 : 2.4 });
    }
  }
  for (const d of ctx.dogs) dots.push({ x: d.pos.x, z: d.pos.z, color: '#ff8a30', size: 2.2 });
  if (twoPlayer) {
    const other = me === player ? player2 : player;
    dots.push({ x: other.pos.x, z: other.pos.z, color: other === player2 ? '#b080ff' : '#ff5040', size: 4, yaw: (other === player ? cam : cam2).yaw });
  }
  const at = campaign.objective().at;
  if (at) dots.push({ x: at.x, z: at.z, color: '#ffd040', size: 5, shape: 'diamond', pin: true });
  return dots;
}
let heartTimer = 0;

/** Your heart pounds, faster the closer you are to death (below 30% health). */
function updateHeartbeat(dt: number, playing: boolean) {
  const share = player.hp / player.maxHp;
  if (!playing || !player.alive || share >= 0.3) {
    heartTimer = 0;
    return;
  }
  heartTimer -= dt;
  if (heartTimer <= 0) {
    sfx.heartbeat(0.5 + (0.3 - share) * 2);
    heartTimer = 0.55 + share * 2;
  }
}

/** Picks the soundtrack for what's happening: title, wandering, a fight, the general, the ending. */
function updateMusic(dt: number) {
  let theme: Theme;
  if (hud.endingOpen) theme = 'victory';
  else if (phase === 'menu') theme = 'title';
  else if (!ctx.players.some((p) => p.alive)) theme = 'silence';
  else if (fighters.some((f) => f.kind === 'general' && f.alive && f.state === 'alert')) theme = 'boss';
  else {
    const hunted = fighters.some((f) => f.side === 'heaven' && f.alive && f.state === 'alert' && ctx.players.some((p) => f.pos.distanceToSquared(p.pos) < 32 * 32));
    battleHold = hunted ? 6 : Math.max(0, battleHold - dt);
    theme = battleHold > 0 ? 'battle' : 'explore';
  }
  music.set(theme, plane().index);
}

/** Advances the game by one frame of `realDt` seconds. */
function tick(realDt: number) {
  // A second controller's A press is checked before Player 1 reads it as their own.
  checkJoin();
  input.poll(realDt);
  if (twoPlayer) input2.poll(realDt);
  // The Menu button opens and closes the pause menu; the menus themselves are driven by the d-pad, A and B.
  const inputs = twoPlayer ? [input, input2] : [input];
  // Two-player at a stand: the shopper's controller works their shop and nothing else.
  const shopperInput = shopper === player ? input : input2;
  const halfShop = shopHalf();
  const free = halfShop ? inputs.filter((i) => i !== shopperInput) : inputs;
  if (free.some((i) => i.pausePressed) && phase === 'playing' && !deathShown) {
    if (hud.pauseOpen) lockPointer();
    else if (!menuNav.menuOpen) pauseGame();
  }
  // M or View opens and closes the map.
  if (free.some((i) => i.mapPressed) && phase === 'playing' && !deathShown) {
    if (hud.mapOpen) closeMap();
    else if (!menuNav.menuOpen && !hud.pauseOpen) openMap();
  }
  // A press that works a menu shouldn't also act in the game the moment the menu closes.
  const menuWasOpen = menuNav.menuOpen;
  menuNav.update(halfShop ? [shopperInput] : inputs);
  // With a controller there's no mouse capture: play whenever no menu is open.
  // In two-player the other player keeps playing while one shops at a stand.
  const otherMenus = halfShop ? false : menuWasOpen || menuNav.menuOpen;
  const padPlay = (input.mode === 'gamepad' || IS_XBOX || twoPlayer) && !otherMenus;
  const playing = phase === 'playing' && (input.locked || padPlay || testMode) && !hud.rulerOpen && (halfShop || !hud.sideScreenOpen) && !hud.endingOpen;
  // The shopper stands still at the counter.
  const in1 = halfShop && shopper === player ? idleInput : input;
  const in2 = halfShop && shopper === player2 ? idleInput : input2;
  updateXboxTip(realDt);
  foes.length = 0;
  for (const a of trainingAngels) foes.push(a);
  for (const f of fighters) if (f.side === 'heaven') foes.push(f);

  if (playing) {
    playTime += realDt;
    saveTimer += realDt;
    if (saveTimer > 20) {
      saveTimer = 0;
      saveGame();
    }
    cam.applyInput(in1, realDt);
    if (twoPlayer) cam2.applyInput(in2, realDt);
    let dt = realDt;
    // Hit-stop: freeze the action for a moment when a blow lands.
    if (hitStopTimer > 0) {
      hitStopTimer -= realDt;
      dt *= 0.05;
    }
    player.update(dt, ctx, in1, cam);
    dog.update(dt, ctx);
    if (twoPlayer) {
      player2.update(dt, ctx, in2, cam2);
      dog2.update(dt, ctx);
      updateRevives();
    }
    for (const a of trainingAngels) a.update(dt, ctx);
    for (const f of fighters) f.update(dt, ctx);
    separateBodies();
    campaign.update(dt, ctx);
    projectiles.update(dt, ctx);
    geysers.update(dt, ctx);
    spikes.update(dt, ctx);
    pickups.update(dt, twoPlayer ? [player.pos, player2.pos] : [player.pos]);
    debris.update(dt);
    fire.update(dt);

    // Use things with E; a silent kill takes over the prompt when you can make one.
    const views = [{ p: player, c: cam, i: in1, prompt: (t: string | null, a?: boolean) => hud.setPrompt(t, a) }];
    if (twoPlayer) views.push({ p: player2, c: cam2, i: in2, prompt: (t, a) => hud2.setPrompt(t, a) });
    for (const v of views) {
      if (!v.p.alive || (halfShop && v.p === shopper)) {
        v.prompt(null);
        continue;
      }
      const target = nearestInteractable(v.p, v.c);
      if (v.p.assassinTarget) v.prompt('Kill silently', true);
      else v.prompt(target?.label ?? null);
      if (target && v.i.interactPressed) {
        if (target.kind === 'ruler') openRuler();
        else if (target.kind === 'portal') openPortal();
        else if (target.kind === 'stand') openStand(target.stand!, v.p);
        else target.act();
        break; // a dialog may have opened
      }
    }
  } else if (phase === 'menu') {
    // The world stays alive behind the title.
    for (const a of trainingAngels) a.update(realDt, ctx);
    geysers.update(realDt, ctx);
    fire.update(realDt);
    debris.update(realDt);
  }
  // Fighters that have faded away leave the world.
  for (let i = fighters.length - 1; i >= 0; i--) if (fighters[i].gone) fighters.splice(i, 1);

  if (phase === 'menu') {
    updateTitleCamera(realDt);
  } else {
    cam.update(realDt, player.eye(eye), player.bob, player.walkPhase, player.sprinting);
    camera.updateMatrixWorld();
    viewModel.flying = player.flying;
    viewModel.update(playing ? realDt : 0, camera, player.weapon, player.armor, player.swingInfo, player.bob, player.walkPhase, { x: input.mouseDX, y: input.mouseDY });
    if (twoPlayer) {
      cam2.update(realDt, player2.eye(eye), player2.bob, player2.walkPhase, player2.sprinting);
      camera2.updateMatrixWorld();
      viewModel2.flying = player2.flying;
      const stick = input2.lookStick();
      viewModel2.update(playing ? realDt : 0, camera2, player2.weapon, player2.armor, player2.swingInfo, player2.bob, player2.walkPhase, { x: stick.x * 12, y: stick.y * 8 });
      avatars[0].update(realDt, player);
      avatars[1].update(realDt, player2);
      floaters2.update(realDt, camera2);
    }
  }
  floaters.update(realDt, camera);
  // The breath lights the ground in front of you, flickering.
  const glow = playing && player.breathing ? 3.5 + Math.random() * 1.5 : 0;
  breathLight.intensity += (glow - breathLight.intensity) * Math.min(1, realDt * 20);
  if (breathLight.intensity > 0.01) {
    camera.getWorldDirection(breathLight.position).multiplyScalar(2.5).add(camera.position);
  }
  if (!playing && player.breathing) setBreathing(false);
  // Player 2's fire roars too, when Player 1 isn't already breathing.
  const p2Roar = playing && twoPlayer && player2.breathing && !player.breathing;
  if (p2Roar !== p2Roaring || (p2Roar && Math.random() < realDt * 4)) {
    p2Roaring = p2Roar;
    setBreathing(p2Roar);
  }

  // Banished when every demon is down (in two-player, a fallen one rises beside the other).
  const allDown = !player.alive && (!twoPlayer || !player2.alive);
  const downFor = twoPlayer ? Math.min(player.deadTime, player2.deadTime) : player.deadTime;
  if (allDown && downFor > 1.6 && !deathShown) {
    deathShown = true;
    campaign.onPlayerDeath();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showPause(false);
    hud.showDeath(true);
    saveGame();
  }

  world?.update(realDt, phase === 'menu' ? camera.position : player.pos);
  setAmbience(phase === 'menu' ? 0.3 : 1 - lavaNearness(player.pos.x, player.pos.z) / 4);
  for (const a of trainingAngels) a.updateBar(camera);
  for (const f of fighters) f.updateBar(camera, player.pos);
  if (twoPlayer) {
    // Player 2 sees the same bars and ? / ! marks in their own half.
    for (const a of trainingAngels) a.updateBar(camera2, 1, hud2.barLayer, hud2.size);
    for (const f of fighters) f.updateBar(camera2, player2.pos, 1, hud2.barLayer, hud2.size);
  }
  if (phase === 'playing') {
    const boss = fighters.find((f) => f.kind === 'general' && f.alive && f.state === 'alert');
    hud.setBoss(boss ? boss.label : null, boss ? boss.hp / boss.maxHp : 0);
    const o = campaign.objective();
    hud.setObjective(o.text, o.at, camera, player.pos);
    hud.setWeapons(player.weapons, player.equipped, player.armor, player.armorReduction);
    hud.setPotions(player.potions);
    updateImps();
    hud.setCarrying(campaign.carrying);
    if (hud.pauseOpen) {
      const can = campaign.canReturnToLair(ctx);
      hud.setLairButton(can.ok, can.reason);
    }
  }
  hud.padMode = input.mode === 'gamepad' || IS_XBOX;
  hud.update(realDt, player, dog.name, kills);
  updateMusic(realDt);
  if (phase === 'playing') checkTrophies(realDt);
  if (phase === 'playing' && settings.minimap) {
    minimap.update(realDt, player.pos, cam.yaw, () => mapDots(player));
    if (twoPlayer) minimap2.update(realDt, player2.pos, cam2.yaw, () => mapDots(player2));
  }
  updateHeartbeat(realDt, playing);
  if (twoPlayer) {
    hud2.update(player2, dog2.name, revivingIn(player2));
    const left = revivingIn(player);
    hud.setDown(left !== null ? `Rising again in ${Math.max(1, Math.ceil(left))}…` : null);
  }
  input.endFrame();
}

function render() {
  renderer.info.reset();
  // Shadows are drawn once a frame, however many views there are.
  renderer.shadowMap.needsUpdate = true;
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!twoPlayer || phase !== 'playing') {
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
    drawView(camera, viewModel, player);
    return;
  }
  // Split screen: Player 1 on the left, Player 2 on the right.
  const half = Math.floor(w / 2);
  renderer.setScissorTest(true);
  for (const [i, c, vm, p] of [
    [0, camera, viewModel, player],
    [1, camera2, viewModel2, player2],
  ] as const) {
    renderer.setViewport(i * half, 0, half, h);
    renderer.setScissor(i * half, 0, half, h);
    drawView(c, vm, p);
  }
  renderer.setScissorTest(false);
}

/** The world from one demon's eyes, then their arms and weapon on top. */
function drawView(c: THREE.PerspectiveCamera, vm: ViewModel, p: Player) {
  renderer.clear();
  renderer.render(scene, c);
  if (phase === 'playing' && p.alive && !hud.endingOpen) {
    renderer.clearDepth();
    renderer.render(vm.scene, c);
  }
}

// ?stats shows frame rate and draw calls in the corner.
const statsEl = params.has('stats') ? document.body.appendChild(Object.assign(document.createElement('div'), { className: 'stats' })) : null;
let statFrames = 0;
let statSince = performance.now();

/** Set from the console (__game.frozen = true) to stop the loop and look around with a free camera. */
let frozen = false;
let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  if (frozen) {
    requestAnimationFrame(frame);
    return;
  }
  tick(dt);
  render();
  if (statsEl) {
    statFrames++;
    if (now - statSince > 500) {
      statsEl.textContent = `${((statFrames * 1000) / (now - statSince)).toFixed(0)} fps · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} tris · ${fighters.length} fighters`;
      statFrames = 0;
      statSince = now;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for debugging from the browser console. step() runs the game at a
// fixed 60 fps, even in a background tab where animation frames are paused.
Object.assign(window, {
  __game: {
    player,
    dog,
    player2,
    dog2,
    input2,
    cam2,
    camera2,
    joinPlayer2,
    leavePlayer2,
    music,
    trophyRecord,
    earned,
    get twoPlayer() {
      return twoPlayer;
    },
    get trainingAngels() {
      return trainingAngels;
    },
    fighters,
    get campaign() {
      return campaign;
    },
    progress,
    travel,
    heightAt,
    isLava,
    plane,
    armory,
    showArmory,
    get geysers() {
      return geysers;
    },
    spikes,
    pickups,
    projectiles,
    spawnFighter,
    takeWeapon,
    openRuler,
    closeRuler,
    hud,
    /** Jump to a level (for testing powers). */
    setLevel(level: number) {
      player.loadHero(player.name, level, 0, player.gold, player.rank);
      player.hp = player.maxHp;
      player.energy = player.maxEnergy;
    },
    cam,
    camera,
    renderer,
    input,
    scene,
    get frozen() {
      return frozen;
    },
    set frozen(v: boolean) {
      frozen = v;
    },
    /** While frozen: draws the world from a point, looking at another. */
    look(from: [number, number, number], at: [number, number, number]) {
      camera.position.set(...from);
      camera.lookAt(...at);
      renderer.clear();
      renderer.render(scene, camera);
    },
    step(seconds: number) {
      for (let i = 0; i < Math.round(seconds * 60); i++) tick(1 / 60);
      render();
    },
  },
});
