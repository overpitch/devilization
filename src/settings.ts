/**
 * Player options. Stored in this browser, so each player on their own
 * device keeps their own choices.
 */
export type Graphics = 'high' | 'low';
export type Difficulty = 'easy' | 'normal' | 'hard' | 'nightmare';

export interface DifficultyProfile {
  label: string;
  description: string;
  /** Multiplies the damage angels do to you. */
  enemyDamage: number;
  /** Multiplies angels' health. */
  enemyHealth: number;
  /** Multiplies how fast you heal between fights (and shortens the wait). */
  regen: number;
  /** Multiplies the XP angels give. */
  xp: number;
}

export const DIFFICULTIES: { [d in Difficulty]: DifficultyProfile } = {
  easy: { label: 'Easy', description: 'Angels hit softer and fall faster. You heal quickly.', enemyDamage: 0.6, enemyHealth: 0.75, regen: 1.6, xp: 1 },
  normal: { label: 'Normal', description: 'The intended challenge: angels hit hard and take some killing.', enemyDamage: 1.25, enemyHealth: 1.2, regen: 1, xp: 1 },
  hard: { label: 'Hard', description: 'Angels hit much harder and take far more killing. You heal slowly, but get 25% more XP.', enemyDamage: 1.7, enemyHealth: 1.5, regen: 0.7, xp: 1.25 },
  nightmare: { label: 'Nightmare', description: 'Heaven at its worst: brutal blows, angels twice as tough, and slow healing. 50% more XP.', enemyDamage: 2.3, enemyHealth: 2, regen: 0.5, xp: 1.5 },
};
export const DIFFICULTY_ORDER: Difficulty[] = ['easy', 'normal', 'hard', 'nightmare'];

export interface Settings {
  /** Look speed multiplier for mouse and trackpad. */
  sensitivity: number;
  /** Moving the mouse up looks down (flight-sim style). */
  invertY: boolean;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  musicVolume: number;
  /** The round map in the bottom-right corner. */
  minimap: boolean;
  difficulty: Difficulty;
  /** 'low' turns off shadows and renders at a lower resolution, for slower computers. */
  graphics: Graphics;
  /** Device-specific defaults (Low on Xbox) have been applied once. */
  deviceDefaults?: boolean;
}

/** Xbox browsers have tight limits, so they start on Low graphics. ?xbox pretends to be one (for testing). */
export const IS_XBOX = /xbox/i.test(navigator.userAgent) || new URLSearchParams(location.search).has('xbox');

const KEY = 'devilization.settings';

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, invertY: false, sfxVolume: 0.8, musicVolume: 0.6, minimap: true, difficulty: 'normal', graphics: 'high' };

export function loadSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (typeof parsed.sensitivity === 'number' && parsed.sensitivity > 0) settings.sensitivity = parsed.sensitivity;
      if (typeof parsed.invertY === 'boolean') settings.invertY = parsed.invertY;
      if (typeof parsed.minimap === 'boolean') settings.minimap = parsed.minimap;
      if (parsed.difficulty && DIFFICULTY_ORDER.includes(parsed.difficulty)) settings.difficulty = parsed.difficulty;
      if (parsed.graphics === 'high' || parsed.graphics === 'low') settings.graphics = parsed.graphics;
      if (typeof parsed.sfxVolume === 'number' && parsed.sfxVolume >= 0 && parsed.sfxVolume <= 1) settings.sfxVolume = parsed.sfxVolume;
      if (typeof parsed.musicVolume === 'number' && parsed.musicVolume >= 0 && parsed.musicVolume <= 1) settings.musicVolume = parsed.musicVolume;
      settings.deviceDefaults = parsed.deviceDefaults === true;
    }
  } catch {
    /* storage unavailable or corrupt: use defaults */
  }
  // An Xbox starts on Low once; players can switch back in the pause menu.
  if (!settings.deviceDefaults) {
    if (IS_XBOX) settings.graphics = 'low';
    settings.deviceDefaults = true;
    saveSettings(settings);
  }
  return settings;
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable */
  }
}
