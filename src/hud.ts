import { SPIKE_COOLDOWN, type Player } from './player';
import type { Settings } from './settings';
import type { SaveData } from './save';
import { sfx } from './audio';
import { RANKS, UNLOCK } from './progression';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Click or J', 'Swing the flail (click again to chain)'],
  ['F (hold)', `Breathe fire (level ${UNLOCK.fireBreath})`],
  ['R (hold)', `Aim ground spikes, let go to strike (level ${UNLOCK.spikes})`],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['Esc', 'Pause'],
];

const DEMON_NAMES = ['Azgoth', 'Morgrath', 'Vexis', 'Grimtooth', 'Belzar', 'Skarn', 'Maldrek', 'Ashgore', 'Nyxra', 'Krull', 'Zagan', 'Vorr', 'Ignarok', 'Sulvane'];
const DOG_NAMES = ['Cinder', 'Brimstone', 'Ember', 'Scorch', 'Fang', 'Ash', 'Hellbark', 'Sulfur', 'Char', 'Blaze', 'Gnash', 'Smolder'];
const MAX_NAME = 16;

/** Trims and checks a name. Returns the clean name, or an error message. */
function cleanName(raw: string, what: string): { name: string } | { error: string } {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (!name) return { error: `${what} needs a name.` };
  if (name.length > MAX_NAME) return { error: `Keep names to ${MAX_NAME} letters or fewer.` };
  if (!/^[\p{L}\p{N}' -]+$/u.test(name)) return { error: 'Use letters, numbers, spaces, hyphens or apostrophes.' };
  return { name };
}

const pick = (list: string[], not: string) => {
  const options = list.filter((n) => n !== not);
  return options[Math.floor(Math.random() * options.length)];
};

/** Escapes a player-chosen name for use inside HTML. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

type Screen = 'title' | 'name' | 'intro' | 'none';

/** The status bars, power slots, and the title, naming, intro, pause and death screens. */
export class Hud {
  onContinue?: () => void;
  onNewGame?: () => void;
  onNamesChosen?: (name: string, dogName: string) => void;
  onBegin?: () => void;
  onResume?: () => void;
  onQuit?: () => void;
  onRespawn?: () => void;
  onSettings?: (s: Settings) => void;

  private readonly hud = $('hud');
  private readonly hpFill = $('hp-fill');
  private readonly hpText = $('hp-text');
  private readonly energyBar = $('energy-bar');
  private readonly energyFill = $('energy-fill');
  private readonly xpFill = $('xp-fill');
  private readonly xpText = $('xp-text');
  private readonly gold = $('gold');
  private readonly kills = $('kills');
  private readonly vignette = $('vignette');
  private readonly lavaGlow = $('lava-glow');
  private readonly breathGlow = $('breath-glow');
  private readonly announceEl = $('announce');
  private readonly toastEl = $('toast');
  private readonly breathSlot = $('power-breath');
  private readonly spikesSlot = $('power-spikes');
  readonly floaterLayer = $('floaters');
  readonly barLayer = $('bars');
  private readonly nameInput = $<HTMLInputElement>('name-input');
  private readonly dogInput = $<HTMLInputElement>('dog-input');
  private readonly nameError = $('name-error');
  private toastTimer = 0;
  /** Cache of text last written, so the DOM is only touched when something changes. */
  private shown = new Map<string, string>();
  private hasSave = false;

  constructor(settings: Settings) {
    for (const dl of document.querySelectorAll('[data-controls]')) {
      dl.innerHTML = CONTROLS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
    this.makeEmbers();

    const click = (id: string, fn: () => void) =>
      $(id).addEventListener('click', () => {
        sfx.click();
        fn();
      });
    click('continue-btn', () => this.onContinue?.());
    click('new-game-btn', () => {
      if (this.hasSave) $('confirm').classList.remove('hidden');
      else this.onNewGame?.();
    });
    click('confirm-yes-btn', () => {
      $('confirm').classList.add('hidden');
      this.onNewGame?.();
    });
    click('confirm-no-btn', () => $('confirm').classList.add('hidden'));
    click('begin-btn', () => this.onBegin?.());
    click('resume-btn', () => this.onResume?.());
    click('quit-btn', () => this.onQuit?.());
    click('respawn-btn', () => this.onRespawn?.());

    click('random-name-btn', () => {
      this.nameInput.value = pick(DEMON_NAMES, this.nameInput.value);
      this.nameError.textContent = '';
    });
    click('random-dog-btn', () => {
      this.dogInput.value = pick(DOG_NAMES, this.dogInput.value);
      this.nameError.textContent = '';
    });
    for (const input of [this.nameInput, this.dogInput]) input.addEventListener('input', () => (this.nameError.textContent = ''));
    $('name-form').addEventListener('submit', (e) => {
      e.preventDefault();
      sfx.click();
      const demon = cleanName(this.nameInput.value, 'Your demon');
      const dog = cleanName(this.dogInput.value, 'Your hellhound');
      const error = 'error' in demon ? demon.error : 'error' in dog ? dog.error : null;
      if (error || 'error' in demon || 'error' in dog) {
        this.nameError.textContent = error;
        return;
      }
      this.onNamesChosen?.(demon.name, dog.name);
    });

    const sens = $<HTMLInputElement>('sens');
    const invert = $<HTMLInputElement>('invert-y');
    const volume = $<HTMLInputElement>('sfx-volume');
    const low = $<HTMLInputElement>('low-graphics');
    const show = () => {
      sens.value = String(settings.sensitivity);
      $('sens-value').textContent = settings.sensitivity.toFixed(1);
      invert.checked = settings.invertY;
      $('invert-value').textContent = settings.invertY ? 'On' : 'Off';
      volume.value = String(settings.sfxVolume);
      $('sfx-volume-value').textContent = `${Math.round(settings.sfxVolume * 100)}%`;
      low.checked = settings.graphics === 'low';
      $('graphics-value').textContent = low.checked ? 'On' : 'Off';
    };
    const changed = () => {
      settings.sensitivity = Number(sens.value);
      settings.invertY = invert.checked;
      settings.sfxVolume = Number(volume.value);
      settings.graphics = low.checked ? 'low' : 'high';
      show();
      this.onSettings?.(settings);
    };
    for (const el of [sens, invert, volume, low]) el.addEventListener('input', changed);
    show();
  }

  private makeEmbers() {
    const box = $('embers');
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('span');
      s.style.left = `${Math.random() * 100}%`;
      s.style.setProperty('--size', `${2 + Math.random() * 4}px`);
      s.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
      s.style.animationDuration = `${6 + Math.random() * 8}s`;
      s.style.animationDelay = `${-Math.random() * 14}s`;
      box.appendChild(s);
    }
  }

  showScreen(screen: Screen) {
    $('title-screen').classList.toggle('hidden', screen !== 'title');
    $('name-screen').classList.toggle('hidden', screen !== 'name');
    $('intro-screen').classList.toggle('hidden', screen !== 'intro');
    this.hud.classList.toggle('hidden', screen !== 'none');
    if (screen === 'name') {
      this.nameError.textContent = '';
      if (!this.nameInput.value) this.nameInput.value = pick(DEMON_NAMES, '');
      if (!this.dogInput.value) this.dogInput.value = pick(DOG_NAMES, '');
      this.nameInput.focus();
      this.nameInput.select();
    }
  }

  /** The title screen, offering Continue when there's a saved game. */
  showTitle(save: SaveData | null) {
    this.hasSave = save !== null;
    $('continue-btn').classList.toggle('hidden', !save);
    $('confirm').classList.add('hidden');
    if (save) {
      $('continue-sub').textContent = `${save.name} · ${RANKS[save.rank]} · Level ${save.level}`;
      $('confirm-text').textContent = `Start a new demon? ${save.name}'s progress will be lost.`;
    }
    this.showScreen('title');
  }

  showIntro(name: string, dogName: string) {
    const n = `<span class="name">${esc(name)}</span>`;
    const d = `<span class="name">${esc(dogName)}</span>`;
    const lines = [
      `You claw your way out of the burning pits: ${n}, the lowliest Imp on the First Plane of hell.`,
      `At your heel pads ${d}, a horned hellhound. It is the only creature in hell that likes you.`,
      'The armies of heaven are pushing into hell. Serve the archdemons well, rise through the ranks, and one day you will be Demon Lord.',
      'First, sharpen your claws on the captured angels chained up on the training ground.',
    ];
    $('story').innerHTML = lines.map((l, i) => `<p style="animation-delay:${i * 0.9}s">${l}</p>`).join('');
    $('begin-btn').style.animationDelay = `${lines.length * 0.9}s`;
    this.showScreen('intro');
  }

  showPause(show: boolean) {
    $('pause-screen').classList.toggle('hidden', !show);
  }

  get pauseOpen() {
    return !$('pause-screen').classList.contains('hidden');
  }

  showDeath(show: boolean) {
    $('death-screen').classList.toggle('hidden', !show);
  }

  announce(title: string, detail = '', levelUp = false) {
    $('announce-title').textContent = title;
    $('announce-detail').textContent = detail;
    this.announceEl.classList.remove('show');
    this.announceEl.classList.toggle('levelup', levelUp);
    void this.announceEl.offsetWidth; // restart the animation
    this.announceEl.classList.add('show');
  }

  toast(text: string) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTimer = 2;
  }

  /** Briefly fades in from black. */
  fadeIn() {
    const fade = $('fade');
    fade.style.transition = 'none';
    fade.style.opacity = '1';
    void fade.offsetWidth;
    fade.style.transition = '';
    fade.style.opacity = '0';
  }

  /** Sets an element's text or style only when it changes. */
  private set(key: string, value: string, apply: (v: string) => void) {
    if (this.shown.get(key) === value) return;
    this.shown.set(key, value);
    apply(value);
  }

  update(dt: number, player: Player, dogName: string, kills: number) {
    this.toastTimer -= dt;
    if (this.toastTimer <= 0) this.toastEl.classList.remove('show');

    this.set('name', player.name, (v) => ($('hero-name').textContent = v));
    this.set('level', `Lv ${player.level}`, (v) => ($('level-badge').textContent = v));
    this.set('rank', player.rankName, (v) => ($('rank-name').textContent = v));
    this.set('dog', dogName, (v) => ($('dog-name').textContent = v));

    const hp = Math.ceil(player.hp);
    this.set('hp', `${hp}/${player.maxHp}`, () => {
      this.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
      this.hpText.textContent = `${hp} / ${player.maxHp}`;
    });

    const hasPowers = player.level >= UNLOCK.fireBreath;
    this.set('energy-shown', String(hasPowers), (v) => this.energyBar.classList.toggle('hidden', v !== 'true'));
    this.set('energy', (player.energy / player.maxEnergy).toFixed(3), (v) => (this.energyFill.style.width = `${Number(v) * 100}%`));

    const needed = player.xpNeeded;
    this.set('xp', `${player.xp}/${needed}`, () => {
      this.xpFill.style.width = needed > 0 ? `${(player.xp / needed) * 100}%` : '100%';
      this.xpText.textContent = needed > 0 ? `${Math.floor(player.xp)} / ${needed} XP` : 'Max level';
    });
    this.set('gold', String(player.gold), (v) => (this.gold.textContent = `${v} gold`));
    this.set('kills', String(kills), (v) => (this.kills.textContent = kills > 0 ? `Angels slain: ${v}` : ''));

    // Power slots: locked (with the level they open at), ready, or in use.
    const breathLocked = player.level < UNLOCK.fireBreath;
    const breathState = breathLocked ? `Level ${UNLOCK.fireBreath}` : player.breathing ? 'Burning' : 'Hold';
    this.set('breath-slot', `${breathLocked}|${player.breathing}|${breathState}`, () => {
      this.breathSlot.classList.toggle('locked', breathLocked);
      this.breathSlot.classList.toggle('active', player.breathing);
      $('power-breath-state').textContent = breathState;
    });
    const spikesLocked = player.level < UNLOCK.spikes;
    const spikesState = spikesLocked ? `Level ${UNLOCK.spikes}` : player.spikesReady ? 'Ready' : player.spikeCooldown > 0 ? '' : 'Need hellfire';
    this.set('spikes-slot', `${spikesLocked}|${spikesState}`, () => {
      this.spikesSlot.classList.toggle('locked', spikesLocked);
      $('power-spikes-state').textContent = spikesState;
    });
    this.set('spikes-cd', player.spikeCooldown.toFixed(2), (v) => ($('power-spikes-cooldown').style.width = `${(Number(v) / SPIKE_COOLDOWN) * 100}%`));

    const low = player.alive ? Math.max(0, 0.35 - player.hp / player.maxHp) * 1.5 : 0.8;
    this.vignette.style.opacity = String(Math.min(1, player.hurtFlash + low));
    this.set('lava', String(player.inLava), (v) => (this.lavaGlow.style.opacity = v === 'true' ? '1' : '0'));
    this.set('breath', String(player.breathing), (v) => (this.breathGlow.style.opacity = v === 'true' ? '1' : '0'));
  }
}
