import type { Player } from './player';
import { WEAPON_ENCHANTS, weaponName } from './weapons';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Player 2's half of the screen in split screen: name, health, hellfire,
 * weapon, crosshair, prompt, damage numbers and the red edges when hurt.
 * Shared things (objective, gold, announcements) stay on Player 1's side.
 */
export class PlayerTwoHud {
  readonly root = document.createElement('div');
  readonly floaterLayer: HTMLDivElement;
  /** Angels' health bars and ? / ! marks in Player 2's view. */
  readonly barLayer: HTMLDivElement;
  /** The size of Player 2's view, for placing damage numbers. */
  readonly size = { w: 1, h: 1 };
  private readonly shown = new Map<string, string>();
  private readonly el: Record<string, HTMLElement> = {};

  constructor() {
    this.root.id = 'hud2';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="status">
        <div class="hero-row"><span class="hero-name" data-k="name"></span><span class="level-badge" data-k="level"></span></div>
        <div class="rank-row"><span class="dog-name" data-k="dog"></span> · <span class="gold2" data-k="gold"></span></div>
        <div class="bar health"><div class="fill" data-k="hp"></div><span data-k="hpText"></span></div>
        <div class="bar energy" data-k="energyBar"><div class="fill" data-k="energy"></div><span>Hellfire</span></div>
      </div>
      <div class="weapon2" data-k="weapon"></div>
      <div class="crosshair"></div>
      <div class="prompt hidden" data-k="prompt"></div>
      <div class="sneak hidden" data-k="sneak">Sneaking</div>
      <div class="down hidden" data-k="down"></div>
      <div class="bars2"></div>
      <div class="floaters"></div>
      <div class="vignette" data-k="vignette"></div>
      <div class="breath-glow" data-k="breath"></div>`;
    for (const e of this.root.querySelectorAll<HTMLElement>('[data-k]')) this.el[e.dataset.k!] = e;
    this.floaterLayer = this.root.querySelector('.floaters')!;
    this.barLayer = this.root.querySelector('.bars2')!;
    document.body.appendChild(this.root);
  }

  show(on: boolean) {
    this.root.classList.toggle('hidden', !on);
  }

  private set(key: string, value: string, apply: (v: string) => void) {
    if (this.shown.get(key) === value) return;
    this.shown.set(key, value);
    apply(value);
  }

  /** "X · Take ..." under the crosshair. */
  setPrompt(text: string | null, assassin = false) {
    this.set('prompt', text ? `${assassin}|${text}` : '', () => {
      const el = this.el.prompt;
      el.classList.toggle('hidden', !text);
      el.classList.toggle('assassin', assassin);
      if (text) el.innerHTML = `<kbd>${assassin ? 'RT' : 'X'}</kbd>${esc(text)}`;
    });
  }

  /** `revive`: seconds until a fallen Player 2 rises beside Player 1, or null. */
  update(p: Player, dogName: string, revive: number | null) {
    this.size.w = this.root.clientWidth || 1;
    this.size.h = this.root.clientHeight || 1;
    this.set('name', p.name, (v) => (this.el.name.textContent = v));
    this.set('level', `Lv ${p.level}`, (v) => (this.el.level.textContent = v));
    this.set('dog', dogName, (v) => (this.el.dog.textContent = v));
    this.set('gold', String(p.gold), (v) => (this.el.gold.textContent = `${v} gold`));
    const hp = Math.ceil(p.hp);
    this.set('hp', `${hp}/${p.maxHp}`, () => {
      this.el.hp.style.width = `${(p.hp / p.maxHp) * 100}%`;
      this.el.hpText.textContent = `${hp} / ${p.maxHp}`;
    });
    this.set('energyBar', String(p.level >= 10), (v) => this.el.energyBar.classList.toggle('hidden', v !== 'true'));
    this.set('energy', (p.energy / p.maxEnergy).toFixed(3), (v) => (this.el.energy.style.width = `${Number(v) * 100}%`));
    const w = p.weapon;
    this.set('weapon', `${w.id}${w.quality}${w.enchant ?? ''}|${p.size}|${p.flying}|${p.potions}`, () => {
      const color = w.enchant ? ` style="color:#${WEAPON_ENCHANTS[w.enchant].color.toString(16).padStart(6, '0')}"` : '';
      const extras = [p.size !== 0 ? p.sizeName : '', p.flying ? 'Flying' : '', p.potions > 0 ? `${p.potions} draughts (D-pad down)` : ''].filter(Boolean).join(' · ');
      this.el.weapon.innerHTML = `<span${color}>${esc(weaponName(w))}</span>${extras ? ` · ${extras}` : ''}`;
    });
    this.set('sneak', String(p.sneaking), (v) => this.el.sneak.classList.toggle('hidden', v !== 'true'));
    this.set('breath', String(p.breathing), (v) => (this.el.breath.style.opacity = v === 'true' ? '1' : '0'));
    const down = revive !== null ? `Rising again in ${Math.max(1, Math.ceil(revive))}…` : '';
    this.set('down', down, (v) => {
      this.el.down.classList.toggle('hidden', !v);
      this.el.down.textContent = v;
    });
    const low = p.alive ? Math.max(0, 0.35 - p.hp / p.maxHp) * 1.5 : 0.8;
    this.el.vignette.style.opacity = String(Math.min(1, p.hurtFlash + low));
  }
}
