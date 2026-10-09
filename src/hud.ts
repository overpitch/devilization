import type { Player } from './player';
import type { Settings } from './settings';
import { sfx } from './audio';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const CONTROLS: [string, string][] = [
  ['W A S D', 'Move'],
  ['Mouse', 'Look'],
  ['Click or J', 'Swing the flail (click again to chain)'],
  ['Space', 'Jump'],
  ['Shift', 'Sprint'],
  ['Esc', 'Pause'],
];

/** The status bars and the title, pause and death screens. */
export class Hud {
  onPlay?: () => void;
  onResume?: () => void;
  onRespawn?: () => void;
  onSettings?: (s: Settings) => void;

  private readonly hud = $('hud');
  private readonly hpFill = $('hp-fill');
  private readonly hpText = $('hp-text');
  private readonly kills = $('kills');
  private readonly vignette = $('vignette');
  private readonly lavaGlow = $('lava-glow');
  private readonly announceEl = $('announce');
  readonly floaterLayer = $('floaters');
  readonly barLayer = $('bars');
  private lastHp = -1;
  private lastKills = -1;

  constructor(settings: Settings) {
    for (const dl of document.querySelectorAll('[data-controls]')) {
      dl.innerHTML = CONTROLS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    }
    this.makeEmbers();

    $('play-btn').addEventListener('click', () => {
      sfx.click();
      this.onPlay?.();
    });
    $('resume-btn').addEventListener('click', () => {
      sfx.click();
      this.onResume?.();
    });
    $('respawn-btn').addEventListener('click', () => {
      sfx.click();
      this.onRespawn?.();
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

  showTitle(show: boolean) {
    $('title-screen').classList.toggle('hidden', !show);
    this.hud.classList.toggle('hidden', show);
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

  announce(title: string, detail = '') {
    $('announce-title').textContent = title;
    $('announce-detail').textContent = detail;
    this.announceEl.classList.remove('show');
    void this.announceEl.offsetWidth; // restart the animation
    this.announceEl.classList.add('show');
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

  update(player: Player, kills: number) {
    const hp = Math.ceil(player.hp);
    if (hp !== this.lastHp) {
      this.lastHp = hp;
      this.hpFill.style.width = `${(player.hp / player.maxHp) * 100}%`;
      this.hpText.textContent = `${hp} / ${player.maxHp}`;
    }
    if (kills !== this.lastKills) {
      this.lastKills = kills;
      this.kills.textContent = kills > 0 ? `Angels slain: ${kills}` : '';
    }
    const low = player.alive ? Math.max(0, 0.35 - player.hp / player.maxHp) * 1.5 : 0.8;
    this.vignette.style.opacity = String(Math.min(1, player.hurtFlash + low));
    this.lavaGlow.style.opacity = player.inLava ? '1' : '0';
  }
}
