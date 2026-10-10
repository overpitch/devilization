/**
 * Player options. Stored in this browser, so each player on their own
 * device keeps their own choices.
 */
export type Graphics = 'high' | 'low';

export interface Settings {
  /** Look speed multiplier for mouse and trackpad. */
  sensitivity: number;
  /** Moving the mouse up looks down (flight-sim style). */
  invertY: boolean;
  /** 0..1 */
  sfxVolume: number;
  /** 0..1 */
  musicVolume: number;
  /** 'low' turns off shadows and renders at a lower resolution, for slower computers. */
  graphics: Graphics;
  /** Device-specific defaults (Low on Xbox) have been applied once. */
  deviceDefaults?: boolean;
}

/** Xbox browsers have tight limits, so they start on Low graphics. ?xbox pretends to be one (for testing). */
export const IS_XBOX = /xbox/i.test(navigator.userAgent) || new URLSearchParams(location.search).has('xbox');

const KEY = 'devilization.settings';

export const DEFAULT_SETTINGS: Settings = { sensitivity: 1, invertY: false, sfxVolume: 0.8, musicVolume: 0.6, graphics: 'high' };

export function loadSettings(): Settings {
  const settings = { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings>;
      if (typeof parsed.sensitivity === 'number' && parsed.sensitivity > 0) settings.sensitivity = parsed.sensitivity;
      if (typeof parsed.invertY === 'boolean') settings.invertY = parsed.invertY;
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
