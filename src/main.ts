import './style.css';
import * as THREE from 'three';
import { Input } from './input';
import { createWorld, lavaNearness, SPAWN, TRAINING } from './world';
import { Player } from './player';
import { Dog } from './dog';
import { Angel } from './angel';
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
import { MAX_LEVEL, TRAINING_ANGEL_REWARD, unlocksAt, xpToNext } from './progression';
import type { GameContext } from './types';

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
const debris = new Particles(scene, false, 500);
const fire = new Particles(scene, true, 900);
const geysers = new Geysers(scene);
const spikes = new Spikes(scene);
const pickups = new Pickups(scene);
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

// Three captured angels chained up on the training ground, facing where you arrive.
const angels = [
  [TRAINING.x - 4.5, TRAINING.z + 1],
  [TRAINING.x, TRAINING.z + 3],
  [TRAINING.x + 4.5, TRAINING.z + 1],
].map(([x, z]) => new Angel(scene, x, z, Math.atan2(SPAWN.x - x, SPAWN.z - z), hud.barLayer));

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
  angels,
  debris,
  fire,
  geysers,
  spikes,
  floatText: (at, text, kind) => floaters.spawn(at, text, kind),
  addShake: (amount) => cam.addShake(amount),
  hitStop: (seconds) => {
    hitStopTimer = Math.max(hitStopTimer, seconds);
  },
  onAngelKilled: (angel) => {
    kills++;
    const r = TRAINING_ANGEL_REWARD;
    const chest = new THREE.Vector3(angel.pos.x, angel.pos.y + 1.4, angel.pos.z);
    pickups.spawnGold(chest, r.goldMin + Math.floor(Math.random() * (r.goldMax - r.goldMin + 1)));
    floaters.spawn(chest.clone().setY(chest.y + 1.2), `+${r.xp} XP`, 'xp');
    awardXp(r.xp);
  },
  toast: (text) => hud.toast(text),
};

pickups.onCollect = (at) => {
  player.gold++;
  sfx.coin();
  floaters.spawn(at.clone().setY(at.y + 0.6), '+1', 'gold');
};

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
    savedAt: Date.now(),
  });
}

/** Starts play from a save (or a fresh demon). */
function enterWorld(save: SaveData) {
  if (startLevel > save.level) {
    // Testing: jump straight to a level.
    save.level = Math.min(startLevel, MAX_LEVEL);
    save.xp = 0;
  }
  player.loadHero(save.name, save.level, Math.min(save.xp, xpToNext(save.level)), save.gold, save.rank);
  dog.name = save.dogName;
  kills = save.kills;
  playTime = save.playTime;
  phase = 'playing';
  hud.showScreen('none');
  spawn();
  pickups.clear();
  hud.announce('The First Plane', 'The Lava Plains');
  saveGame();
}

/** Puts you (and your dog) back at the spawn point, facing the training ground. */
function spawn() {
  player.reset(SPAWN.x, SPAWN.z);
  cam.yaw = Math.atan2(TRAINING.x - SPAWN.x, TRAINING.z - SPAWN.z);
  cam.pitch = -0.08;
  player.facing = cam.yaw;
  dog.reset(SPAWN.x, SPAWN.z, cam.yaw);
  viewModel.reset();
  player.stopPowers(ctx);
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
    if (phase === 'playing' && !input.locked && player.alive) hud.showPause(true);
  }, 1200);
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
  hud.showPause(false);
  hud.showDeath(false);
  if (document.pointerLockElement) document.exitPointerLock();
  hud.fadeIn();
  hud.showTitle(loadSave());
};
hud.onRespawn = () => {
  spawn();
  lockPointer();
};
hud.onSettings = (s) => {
  applySettings(s);
  saveSettings(s);
};
input.onLockChange = (locked) => {
  if (locked) hud.showPause(false);
  else if (phase === 'playing' && player.alive) {
    player.stopPowers(ctx);
    saveGame();
    hud.showPause(true);
  }
};
window.addEventListener('beforeunload', saveGame);
// Clicking the game while paused resumes it.
renderer.domElement.addEventListener('click', () => {
  if (phase === 'playing' && !input.locked && player.alive) lockPointer();
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

/** Behind the title: a slow circle around the training ground. */
function updateTitleCamera(dt: number) {
  titleOrbit += dt * 0.04;
  // Kept inside the cleared ground around the training ground, so it never passes through a spire.
  camera.position.set(TRAINING.x + Math.sin(titleOrbit) * 10, 7, TRAINING.z + Math.cos(titleOrbit) * 10);
  camera.lookAt(TRAINING.x, 2, TRAINING.z);
}

/** Advances the game by one frame of `realDt` seconds. */
function tick(realDt: number) {
  const playing = phase === 'playing' && (input.locked || testMode);
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
    for (const a of angels) a.update(dt, ctx);
    geysers.update(dt, ctx);
    spikes.update(dt, ctx);
    pickups.update(dt, player.pos);
    debris.update(dt);
    fire.update(dt);
  } else if (phase === 'menu') {
    // The world stays alive behind the title.
    for (const a of angels) a.update(realDt, ctx);
    geysers.update(realDt, ctx);
    fire.update(realDt);
    debris.update(realDt);
  }

  if (phase === 'menu') {
    updateTitleCamera(realDt);
  } else {
    cam.update(realDt, player.eye(eye), player.bob, player.walkPhase, player.sprinting);
    camera.updateMatrixWorld();
    viewModel.update(playing ? realDt : 0, camera, player.swingInfo, player.bob, player.walkPhase, { x: input.mouseDX, y: input.mouseDY });
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
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showPause(false);
    hud.showDeath(true);
  }

  world.update(realDt, phase === 'menu' ? camera.position : player.pos);
  setAmbience(phase === 'menu' ? 0.3 : 1 - lavaNearness(player.pos.x, player.pos.z) / 4);
  for (const a of angels) a.updateBar(camera);
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
      statsEl.textContent = `${((statFrames * 1000) / (now - statSince)).toFixed(0)} fps · ${renderer.info.render.calls} draws · ${renderer.info.render.triangles} tris`;
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
    angels,
    geysers,
    spikes,
    pickups,
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
