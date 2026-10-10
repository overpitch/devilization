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
  /** Worn armor (phase 4). */
  armor: Armor | null;
  /** The plane you're on (1-based). */
  plane: number;
  /** Main missions finished, as "plane:mission". */
  missionsDone: string[];
  sideDone: number;
  /** Planes whose treasure chest is open. */
  chests: number[];
  /** Planes whose ruler you've met. */
  talkedPlanes: number[];
  savedAt: number;
}

/** Fields added after phase 2, with their starting values. */
const LATER_FIELDS = () => ({ weapons: [{ ...STARTING_WEAPON }], equipped: 0, armor: null as Armor | null, plane: 1, missionsDone: [] as string[], sideDone: 0, chests: [] as number[], talkedPlanes: [] as number[] });

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
    // Phase 3-4 saves: First Plane missions had no plane prefix, and one chest flag.
    save.missionsDone = save.missionsDone.map((id) => (id.includes(':') ? id : `1:${id}`));
    const old = d as { chestOpened?: boolean; talked?: boolean };
    if (!Array.isArray(save.chests)) save.chests = [];
    if (!Array.isArray(save.talkedPlanes)) save.talkedPlanes = [];
    if (old.chestOpened && !save.chests.includes(1)) save.chests.push(1);
    if (old.talked && !save.talkedPlanes.includes(1)) save.talkedPlanes.push(1);
    if (!Number.isInteger(save.plane) || save.plane < 1) save.plane = 1;
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
