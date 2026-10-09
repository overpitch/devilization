/** The saved game, kept in this browser. */
export interface SaveData {
  version: 1;
  name: string;
  dogName: string;
  level: number;
  xp: number;
  gold: number;
  kills: number;
  /** Index into RANKS. */
  rank: number;
  /** Seconds of play so far. */
  playTime: number;
  savedAt: number;
}

let key = 'devilization.save';

/** Automated test runs use their own slot so they never touch a real save. */
export function useTestSaveSlot() {
  key = 'devilization.test-save';
}

export function newSave(name: string, dogName: string): SaveData {
  return { version: 1, name, dogName, level: 1, xp: 0, gold: 0, kills: 0, rank: 0, playTime: 0, savedAt: Date.now() };
}

export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SaveData>;
    const valid =
      d.version === 1 &&
      typeof d.name === 'string' &&
      typeof d.dogName === 'string' &&
      Number.isInteger(d.level) &&
      typeof d.xp === 'number' &&
      typeof d.gold === 'number' &&
      typeof d.kills === 'number' &&
      Number.isInteger(d.rank);
    return valid ? ({ playTime: 0, ...d } as SaveData) : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    /* storage unavailable: the game still plays, it just won't persist */
  }
}
