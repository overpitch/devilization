import './style.css';
import * as THREE from 'three';
import { Input } from './input';
import { createWorld, lavaNearness, moveBody, SPAWN, TRAINING } from './world';
import { THRONE } from './layout';
import { Player } from './player';
import { Dog } from './dog';
import { TrainingAngel } from './trainingAngel';
import { Fighter, type FighterKind, type SpawnOptions } from './fighter';
import { Campaign, type Interactable } from './campaign';
import { Projectiles } from './projectiles';
import { Geysers } from './geysers';
import { FirstPersonCamera } from './camera';
import { ViewModel } from './viewmodel';
import { Hud } from './hud';
import { Particles } from './particles';
import { Floaters } from './floaters';
import { initAudio, setAmbience, setBreathing, setVolume, sfx } from './audio';
import { loadSettings, saveSettings, type Settings } from './settings';
import { Spikes } from './powers';
import { Pickups } from './pickups';
import { loadSave, newSave, useTestSaveSlot, writeSave, type SaveData } from './save';
import { MAX_LEVEL, RANKS, unlocksAt, xpToNext } from './progression';
import { weaponName, type Weapon } from './weapons';
import type { Foe, GameContext } from './types';

const params = new URLSearchParams(location.search);
// ?test skips the title and runs without pointer lock (for automated checks).
const testMode = params.has('test');
if (testMode) useTestSaveSlot();
/** ?level=N starts you at that level (for trying out powers). */
const startLevel = Number(params.get('level')) || 0;

const settings = loadSettings();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
// The arms and weapon are drawn in a second pass on top of the world.
renderer.autoClear = false;
renderer.info.autoReset = false;
document.getElementById('app')!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 220);
const world = createWorld(scene);
const debris = new Particles(scene, false, 600);
const fire = new Particles(scene, true, 1000);
const geysers = new Geysers(scene);
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
const hud = new Hud(settings);
const floaters = new Floaters(hud.floaterLayer);

player.ballAt = () => viewModel.ballWorld;
player.onLand = (speed) => cam.addShake(Math.min(speed / 50, 0.3));

// Three captured angels standing dazed on the training ground, facing the lair.
const trainingAngels = [
  [TRAINING.x - 4.5, TRAINING.z + 1],
  [TRAINING.x, TRAINING.z + 3],
  [TRAINING.x + 4.5, TRAINING.z + 1],
].map(([x, z]) => new TrainingAngel(scene, x, z, Math.atan2(SPAWN.x - x, SPAWN.z - z), hud.barLayer));

/** Every fighter in the world: angels, the traitor, your imps. */
const fighters: Fighter[] = [];
/** Heaven's side, rebuilt each frame: what you can hit. */
const foes: Foe[] = [];

function applySettings(s: Settings) {
  cam.sensitivity = s.sensitivity;
  cam.invertY = s.invertY;
  setVolume(s.sfxVolume);
  const low = s.graphics === 'low';
  renderer.setPixelRatio(low ? Math.min(window.devicePixelRatio, 1) : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  world.setShadows(!low);
}
applySettings(settings);
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
  foes,
  fighters,
  debris,
  fire,
  geysers,
  spikes,
  projectiles,
  floatText: (at, text, kind) => floaters.spawn(at, text, kind),
  addShake: (amount) => cam.addShake(amount),
  hitStop: (seconds) => {
    hitStopTimer = Math.max(hitStopTimer, seconds);
  },
  onFoeKilled: (foe) => {
    kills++;
    const r = (foe as Foe & { reward: { xp: number; gold: number; drop: Weapon | null } }).reward;
    const chest = new THREE.Vector3(foe.pos.x, foe.pos.y + 1.4, foe.pos.z);
    // Ten coins burst out, whatever they're worth together.
    if (r.gold > 0) pickups.spawnGold(chest, 10, r.gold / 10);
    if (r.xp > 0) {
      floaters.spawn(chest.clone().setY(chest.y + 1.2), `+${r.xp} XP`, 'xp');
      awardXp(r.xp);
    }
    if (r.drop) campaign.dropWeapon(r.drop, foe.pos);
  },
  toast: (text) => hud.toast(text),
};

pickups.onCollect = (at, value) => {
  player.gold += value;
  sfx.coin();
  floaters.spawn(at.clone().setY(at.y + 0.6), `+${value}`, 'gold');
};

player.onAssassinate = (foe) => {
  floaters.spawn(new THREE.Vector3(foe.pos.x, foe.pos.y + 2.6, foe.pos.z), 'Silent kill', 'heavy');
};

function spawnFighter(kind: FighterKind, x: number, z: number, opts?: SpawnOptions) {
  const f = new Fighter(scene, kind, x, z, hud.barLayer, opts);
  fighters.push(f);
  return f;
}

const campaign = new Campaign(scene, {
  spawn: spawnFighter,
  reward: (xp, gold) => {
    player.gold += gold;
    sfx.coin();
    awardXp(xp);
  },
  announce: (title, detail) => hud.announce(title, detail),
  toast: (text) => hud.toast(text),
  promoted: (rank) => {
    player.rank = rank;
    sfx.unlock();
    hud.announce(`Promoted: ${RANKS[rank]}`, 'Malphas has raised you up');
    saveGame();
  },
  dropGold: (at, coins, each) => pickups.spawnGold(at, coins, each),
  refreshDialog: () => {
    if (hud.rulerOpen) hud.showRuler(campaign.dialog(player.level, player.rank));
  },
  save: () => saveGame(),
});

/** Picks up a weapon; with your hands full, the one you hold drops where you stand. */
function takeWeapon(w: Weapon) {
  const dropped = player.takeWeapon(w);
  sfx.pickup();
  hud.toast(dropped ? `Took ${weaponName(w)}, dropped ${weaponName(dropped)}` : `Took ${weaponName(w)}`);
  if (dropped) campaign.dropWeapon(dropped, player.pos);
  saveGame();
}

function awardXp(amount: number) {
  const before = player.level;
  if (player.gainXp(amount) === 0) return;
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
    missionsDone: [...campaign.done],
    sideDone: campaign.sideDone,
    chestOpened: campaign.chestOpened,
    talked: campaign.talked,
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
  dog.name = save.dogName;
  kills = save.kills;
  playTime = save.playTime;
  clearFighters();
  campaign.load(save.missionsDone, save.sideDone, save.chestOpened, save.talked);
  phase = 'playing';
  hud.showScreen('none');
  spawn();
  pickups.clear();
  hud.announce('The First Plane', 'The Lava Plains');
  saveGame();
}

/** Puts you (and your dog) at the foot of Malphas's throne. */
function spawn() {
  player.reset(SPAWN.x, SPAWN.z);
  cam.yaw = Math.atan2(THRONE.x - SPAWN.x, THRONE.z - SPAWN.z);
  cam.pitch = 0.05;
  player.facing = cam.yaw;
  dog.reset(SPAWN.x, SPAWN.z, cam.yaw);
  viewModel.reset();
  player.stopPowers(ctx);
  projectiles.clear();
  floaters.clear();
  hitStopTimer = 0;
  deathShown = false;
  hud.showDeath(false);
  hud.fadeIn();
}

/** Grabs the pointer. If the browser refuses, the pause screen offers Resume. */
function lockPointer() {
  initAudio();
  (document.activeElement as HTMLElement | null)?.blur();
  if (testMode) return;
  input.requestLock();
  setTimeout(() => {
    if (phase === 'playing' && !input.locked && player.alive && !hud.rulerOpen) hud.showPause(true);
  }, 1200);
}

function openRuler() {
  player.stopPowers(ctx);
  hud.showRuler(campaign.dialog(player.level, player.rank));
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
  phase = 'menu';
  player.stopPowers(ctx);
  campaign.cancel();
  hud.showPause(false);
  hud.showDeath(false);
  hud.showRuler(null);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.fadeIn();
  hud.showTitle(loadSave());
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
hud.onSettings = (s) => {
  applySettings(s);
  saveSettings(s);
};
input.onLockChange = (locked) => {
  if (locked) hud.showPause(false);
  else if (phase === 'playing' && player.alive && !hud.rulerOpen) {
    player.stopPowers(ctx);
    saveGame();
    hud.showPause(true);
  }
};
window.addEventListener('beforeunload', saveGame);
// Clicking the game while paused resumes it.
renderer.domElement.addEventListener('click', () => {
  if (phase === 'playing' && !input.locked && player.alive && !hud.rulerOpen) lockPointer();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && hud.rulerOpen) closeRuler();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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
function nearestInteractable(): Interactable | null {
  let best: Interactable | null = null;
  let bestScore = Infinity;
  cam.lookDir(lookDir);
  for (const i of campaign.interactables(ctx, takeWeapon)) {
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

/** Advances the game by one frame of `realDt` seconds. */
function tick(realDt: number) {
  const playing = phase === 'playing' && (input.locked || testMode) && !hud.rulerOpen;
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
    cam.applyInput(input);
    let dt = realDt;
    // Hit-stop: freeze the action for a moment when a blow lands.
    if (hitStopTimer > 0) {
      hitStopTimer -= realDt;
      dt *= 0.05;
    }
    player.update(dt, ctx, input, cam);
    dog.update(dt, ctx);
    for (const a of trainingAngels) a.update(dt, ctx);
    for (const f of fighters) f.update(dt, ctx);
    separateBodies();
    campaign.update(dt, ctx);
    projectiles.update(dt, ctx);
    geysers.update(dt, ctx);
    spikes.update(dt, ctx);
    pickups.update(dt, player.pos);
    debris.update(dt);
    fire.update(dt);

    // Use things with E; a silent kill takes over the prompt when you can make one.
    if (player.alive) {
      const target = nearestInteractable();
      if (player.assassinTarget) hud.setPrompt('Kill silently', true);
      else hud.setPrompt(target?.label ?? null);
      if (target && input.interactPressed) {
        if (campaign.isRuler(target)) openRuler();
        else target.act();
      }
    } else hud.setPrompt(null);
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
    viewModel.update(playing ? realDt : 0, camera, player.weaponId, player.swingInfo, player.bob, player.walkPhase, { x: input.mouseDX, y: input.mouseDY });
  }
  floaters.update(realDt, camera);
  // The breath lights the ground in front of you, flickering.
  const glow = playing && player.breathing ? 3.5 + Math.random() * 1.5 : 0;
  breathLight.intensity += (glow - breathLight.intensity) * Math.min(1, realDt * 20);
  if (breathLight.intensity > 0.01) {
    camera.getWorldDirection(breathLight.position).multiplyScalar(2.5).add(camera.position);
  }
  if (!playing && player.breathing) setBreathing(false);

  if (!player.alive && player.deadTime > 1.6 && !deathShown) {
    deathShown = true;
    campaign.onPlayerDeath();
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showPause(false);
    hud.showDeath(true);
    saveGame();
  }

  world.update(realDt, phase === 'menu' ? camera.position : player.pos);
  setAmbience(phase === 'menu' ? 0.3 : 1 - lavaNearness(player.pos.x, player.pos.z) / 4);
  for (const a of trainingAngels) a.updateBar(camera);
  for (const f of fighters) f.updateBar(camera, player.pos);
  if (phase === 'playing') {
    const o = campaign.objective(player.level);
    hud.setObjective(o.text, o.at, camera, player.pos);
    hud.setWeapons(player.weapons, player.equipped);
    hud.setCarrying(campaign.carrying);
    if (hud.pauseOpen) {
      const can = campaign.canReturnToLair(ctx);
      hud.setLairButton(can.ok, can.reason);
    }
  }
  hud.update(realDt, player, dog.name, kills);
  input.endFrame();
}

function render() {
  renderer.info.reset();
  renderer.clear();
  renderer.render(scene, camera);
  if (phase === 'playing' && player.alive) {
    renderer.clearDepth();
    renderer.render(viewModel.scene, camera);
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
    trainingAngels,
    fighters,
    campaign,
    geysers,
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
