import { isArmor, isWeapon, STARTING_WEAPON, type Armor, type Weapon } from './weapons';

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
  weapons: Weapon[];
  equipped: number;
  /** Worn armor (milestone 4). */
  armor: Armor | null;
  /** Main missions finished. */
  missionsDone: string[];
  sideDone: number;
  chestOpened: boolean;
  /** Has met Malphas. */
  talked: boolean;
  savedAt: number;
}

/** Fields added after milestone 2, with their starting values. */
const LATER_FIELDS = () => ({ weapons: [{ ...STARTING_WEAPON }], equipped: 0, armor: null as Armor | null, missionsDone: [] as string[], sideDone: 0, chestOpened: false, talked: false });

let key = 'devilization.save';

/** Automated test runs use their own slot so they never touch a real save. */
export function useTestSaveSlot() {
  key = 'devilization.test-save';
}

export function newSave(name: string, dogName: string): SaveData {
  return { version: 1, name, dogName, level: 1, xp: 0, gold: 0, kills: 0, rank: 0, playTime: 0, ...LATER_FIELDS(), savedAt: Date.now() };
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
    if (!valid) return null;
    // Older saves are missing newer fields; fill them in.
    const save = { playTime: 0, ...LATER_FIELDS(), ...d } as SaveData;
    save.weapons = Array.isArray(save.weapons) ? save.weapons.filter(isWeapon) : [];
    if (save.weapons.length === 0) save.weapons = [{ ...STARTING_WEAPON }];
    if (!(save.equipped >= 0 && save.equipped < save.weapons.length)) save.equipped = 0;
    if (!Array.isArray(save.missionsDone)) save.missionsDone = [];
    if (!isArmor(save.armor)) save.armor = null;
    return save;
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
