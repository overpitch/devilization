import type { Input } from './input';

/** Menu screens, topmost first: the first visible one gets controller focus. */
const SCREENS = ['ending-screen', 'death-screen', 'armory-screen', 'ruler-screen', 'pause-screen', 'name-screen', 'intro-screen', 'title-screen'];

/** What the B button does on each screen. */
const BACK_BUTTONS: Record<string, string[]> = {
  'armory-screen': ['armory-close-btn'],
  'ruler-screen': ['ruler-close-btn'],
  'pause-screen': ['resume-btn'],
  'title-screen': ['confirm-no-btn'],
};

const FOCUS_CLASS = 'pad-focus';

/** Rendered on screen (fixed-position overlays have no offsetParent, so measure instead). */
function visible(el: HTMLElement) {
  return el.getClientRects().length > 0 && !el.closest('.hidden');
}

/**
 * Lets a controller drive the HTML menus: d-pad or left stick moves a
 * highlight between controls, A presses, B goes back, and left/right
 * adjusts sliders, flips checkboxes, and steps along rows of buttons.
 * (Adapted from Evil One.)
 */
export class MenuNavigator {
  private focused: HTMLElement | null = null;

  /** True when a menu screen is up (so the game shouldn't take controller input). */
  get menuOpen() {
    return SCREENS.some((id) => visible(document.getElementById(id)!));
  }

  /** Player 1's input first; a second player's controller can drive the menus too. */
  update(inputs: Input[]) {
    const pads = inputs.filter((i) => i.mode === 'gamepad' && !i.cursorActive);
    // Pointing with a cursor (mouse, or Edge on Xbox in browser mode): clicks do the work.
    if (pads.length === 0) {
      this.setFocus(null);
      return;
    }
    const screen = SCREENS.map((id) => document.getElementById(id)!).find(visible);
    if (!screen) {
      this.setFocus(null);
      return;
    }
    // Each control is a button (that can be pressed), a slider, a checkbox, or a name field.
    const items = [...screen.querySelectorAll<HTMLElement>('button, input[type="range"], input[type="checkbox"], input:not([type])')].filter(
      (el) => visible(el) && !(el as HTMLButtonElement).disabled && getComputedStyle(el).opacity !== '0',
    );
    if (items.length === 0) {
      this.setFocus(null); // e.g. buttons still fading in
      return;
    }
    if (!this.focused || !items.includes(this.focused)) {
      // A new screen (or the first controller input): just show where the highlight starts.
      this.setFocus(items[0]);
      return;
    }
    const current = this.focused;
    const index = items.indexOf(current);

    const nav = pads.map((i) => i.nav).find((d) => d !== null) ?? null;
    switch (nav) {
      case 'up':
        this.setFocus(items[(index - 1 + items.length) % items.length]);
        break;
      case 'down':
        this.setFocus(items[(index + 1) % items.length]);
        break;
      case 'left':
      case 'right':
        this.adjust(current, nav === 'right' ? 1 : -1, items);
        break;
    }

    if (pads.some((i) => i.confirmPressed)) {
      if (current instanceof HTMLInputElement && !current.type.match(/range|checkbox/)) current.focus();
      else current.click();
    } else if (pads.some((i) => i.backPressed)) {
      const back = (BACK_BUTTONS[screen.id] ?? []).map((id) => document.getElementById(id)).find((el) => el && visible(el));
      back?.click();
    }
  }

  /** Left/right: nudge sliders, flip checkboxes, or move along a row of buttons. */
  private adjust(el: HTMLElement, dir: number, items: HTMLElement[]) {
    if (el instanceof HTMLInputElement && el.type === 'range') {
      const step = Number(el.step) || 0.1;
      el.value = String(Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + dir * step)));
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      el.checked = dir > 0;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // Buttons side by side: left/right steps between them.
      const i = items.indexOf(el);
      const next = items[i + dir];
      if (next && next.parentElement === el.parentElement) this.setFocus(next);
    }
  }

  private setFocus(el: HTMLElement | null) {
    if (this.focused === el) return;
    this.focused?.classList.remove(FOCUS_CLASS);
    this.focused = el;
    el?.classList.add(FOCUS_CLASS);
    // Long lists (the armory, a ruler's missions) scroll to keep the highlight in view.
    el?.scrollIntoView({ block: 'nearest' });
  }
}
