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
import { initAudio, setAmbience, setVolume } from './audio';
import { loadSettings, saveSettings, type Settings } from './settings';
import type { GameContext } from './types';

const params = new URLSearchParams(location.search);
// ?test skips the title and runs without pointer lock (for automated checks).
const testMode = params.has('test');

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

let phase: 'title' | 'playing' = 'title';
let kills = 0;
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
  floatText: (at, text, kind) => floaters.spawn(at, text, kind),
  addShake: (amount) => cam.addShake(amount),
  hitStop: (seconds) => {
    hitStopTimer = Math.max(hitStopTimer, seconds);
  },
  onAngelKilled: () => {
    kills++;
  },
};

/** Puts you (and your dog) back at the spawn point, facing the training ground. */
function spawn() {
  player.reset(SPAWN.x, SPAWN.z);
  cam.yaw = Math.atan2(TRAINING.x - SPAWN.x, TRAINING.z - SPAWN.z);
  cam.pitch = -0.08;
  player.facing = cam.yaw;
  dog.reset(SPAWN.x, SPAWN.z, cam.yaw);
  viewModel.reset();
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

hud.onPlay = () => {
  phase = 'playing';
  hud.showTitle(false);
  spawn();
  hud.announce('The First Plane', 'The Lava Plains');
  lockPointer();
};
hud.onResume = lockPointer;
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
  else if (phase === 'playing' && player.alive) hud.showPause(true);
};
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
if (testMode) {
  phase = 'playing';
  hud.showTitle(false);
}

// ---------- Main loop ----------

const eye = new THREE.Vector3();

/** Behind the title: a slow circle around the training ground. */
function updateTitleCamera(dt: number) {
  titleOrbit += dt * 0.04;
  camera.position.set(TRAINING.x + Math.sin(titleOrbit) * 16, 7, TRAINING.z + Math.cos(titleOrbit) * 16);
  camera.lookAt(TRAINING.x, 2, TRAINING.z);
}

/** Advances the game by one frame of `realDt` seconds. */
function tick(realDt: number) {
  const playing = phase === 'playing' && (input.locked || testMode);
  if (playing) {
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
    debris.update(dt);
    fire.update(dt);
  } else if (phase === 'title') {
    // The world stays alive behind the title.
    for (const a of angels) a.update(realDt, ctx);
    geysers.update(realDt, ctx);
    fire.update(realDt);
    debris.update(realDt);
  }

  if (phase === 'title') {
    updateTitleCamera(realDt);
  } else {
    cam.update(realDt, player.eye(eye), player.bob, player.walkPhase, player.sprinting);
    camera.updateMatrixWorld();
    viewModel.update(playing ? realDt : 0, camera, player.swingInfo, player.bob, player.walkPhase, { x: input.mouseDX, y: input.mouseDY });
  }
  floaters.update(realDt, camera);

  if (!player.alive && player.deadTime > 1.6 && !deathShown) {
    deathShown = true;
    if (document.pointerLockElement) document.exitPointerLock();
    hud.showPause(false);
    hud.showDeath(true);
  }

  world.update(realDt, phase === 'title' ? camera.position : player.pos);
  setAmbience(phase === 'title' ? 0.3 : 1 - lavaNearness(player.pos.x, player.pos.z) / 4);
  for (const a of angels) a.updateBar(camera);
  hud.update(player, kills);
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
