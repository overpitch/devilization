/** Keys the browser should never act on while playing (e.g. Space scrolling the page). */
const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyR', 'KeyC', 'KeyJ', 'KeyM', 'KeyZ', 'KeyX', 'KeyQ',
  'Digit1', 'Digit2', 'Digit3', 'Digit4',
  'Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

/**
 * Keyboard + pointer-locked mouse or trackpad. Nothing needs right-click or
 * click-and-hold, so it plays the same on a trackpad.
 */
export class Input {
  mouseDX = 0;
  mouseDY = 0;
  locked = false;
  onLockChange?: (locked: boolean) => void;

  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private clicked = false;

  constructor(private readonly el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      // Let text fields receive every key.
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    el.addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.clicked = true;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock() {
    try {
      // Browsers refuse a re-lock for ~1s after Esc; the pause screen stays up so the player can click again.
      Promise.resolve(this.el.requestPointerLock()).catch(() => {});
    } catch {
      /* pointer lock unsupported */
    }
  }

  isDown(...codes: string[]) {
    return codes.some((c) => this.down.has(c));
  }

  wasPressed(...codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Movement intent: x = strafe right, z = forward, length up to 1. */
  moveVector() {
    let x = (this.isDown('KeyD', 'ArrowRight') ? 1 : 0) - (this.isDown('KeyA', 'ArrowLeft') ? 1 : 0);
    let z = (this.isDown('KeyW', 'ArrowUp') ? 1 : 0) - (this.isDown('KeyS', 'ArrowDown') ? 1 : 0);
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  get attackPressed() {
    return this.clicked || this.pressed.has('KeyJ');
  }

  get jumpPressed() {
    return this.pressed.has('Space');
  }

  get breathHeld() {
    return this.isDown('KeyF');
  }

  get spikesHeld() {
    return this.isDown('KeyR');
  }

  get sneakHeld() {
    return this.isDown('KeyC');
  }

  get interactPressed() {
    return this.pressed.has('KeyE');
  }

  /** Number keys 1-4 pick a weapon (0-based), or null. */
  get weaponPressed(): number | null {
    for (let i = 0; i < 4; i++) if (this.pressed.has(`Digit${i + 1}`)) return i;
    return null;
  }

  get cyclePressed() {
    return this.pressed.has('KeyQ');
  }

  get sprintHeld() {
    return this.isDown('ShiftLeft', 'ShiftRight');
  }

  /** Clears per-frame state; call once at the end of every frame. */
  endFrame() {
    this.pressed.clear();
    this.clicked = false;
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
