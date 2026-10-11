import { newMissionSeed } from './missionGen';
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
  /** Angels slain, by kind (the bestiary). */
  killsByKind: { [kind: string]: number };
  silentKills: number;
  /** Trophy ids earned. */
  trophies: string[];
  /** The deepest plane you've stood on. */
  deepest: number;
  /** Player 2 in split screen, kept so they come back as themselves. */
  player2: Player2Save | null;
  /** Hellfire Draughts carried. */
  potions: number;
  /** Hired imps following you. */
  imps: number;
  /** Main missions are made from this; a new game gets a new one (null: an older save's hand-written missions). */
  missionSeed: number | null;
  savedAt: number;
}

export interface Player2Save {
  name: string;
  dogName: string;
  weapons: Weapon[];
  equipped: number;
  armor: Armor | null;
  potions?: number;
  /** Player 2's own gold (each player has their own purse). */
  gold?: number;
}

/** Fields added after phase 2, with their starting values. */
const LATER_FIELDS = () => ({
  weapons: [{ ...STARTING_WEAPON }],
  equipped: 0,
  armor: null as Armor | null,
  plane: 1,
  missionsDone: [] as string[],
  sideDone: 0,
  chests: [] as number[],
  talkedPlanes: [] as number[],
  killsByKind: {} as { [kind: string]: number },
  silentKills: 0,
  trophies: [] as string[],
  deepest: 1,
  player2: null as Player2Save | null,
  potions: 0,
  imps: 0,
  missionSeed: null as number | null,
});

let key = 'devilization.save';

/** Automated test runs use their own slot so they never touch a real save. */
export function useTestSaveSlot() {
  key = 'devilization.test-save';
}

export function newSave(name: string, dogName: string): SaveData {
  return { version: 1, name, dogName, level: 1, xp: 0, gold: 0, kills: 0, rank: 0, playTime: 0, ...LATER_FIELDS(), missionSeed: newMissionSeed(), savedAt: Date.now() };
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
    if (typeof save.killsByKind !== 'object' || save.killsByKind === null) save.killsByKind = {};
    if (typeof save.silentKills !== 'number') save.silentKills = 0;
    if (!Array.isArray(save.trophies)) save.trophies = [];
    // Saves from before trophies: your rank tells how deep you've been allowed to go.
    if (!Number.isInteger(save.deepest)) save.deepest = Math.min(10, Math.max(save.plane, save.rank + 1));
    save.deepest = Math.max(save.deepest, save.plane);
    save.player2 = cleanPlayer2(save.player2);
    const count = (v: unknown) => (typeof v === 'number' && v >= 0 ? Math.min(5, Math.floor(v)) : 0);
    save.potions = count(save.potions);
    save.imps = count(save.imps);
    if (!Number.isInteger(save.missionSeed)) save.missionSeed = null;
    return save;
  } catch {
    return null;
  }
}

function cleanPlayer2(p: unknown): Player2Save | null {
  const d = p as Partial<Player2Save> | null;
  if (!d || typeof d.name !== 'string' || typeof d.dogName !== 'string' || !Array.isArray(d.weapons)) return null;
  const weapons = d.weapons.filter(isWeapon);
  if (weapons.length === 0) weapons.push({ ...STARTING_WEAPON });
  const equipped = Number.isInteger(d.equipped) && d.equipped! >= 0 && d.equipped! < weapons.length ? d.equipped! : 0;
  const potions = typeof d.potions === 'number' && d.potions >= 0 ? Math.min(5, Math.floor(d.potions)) : 0;
  const gold = typeof d.gold === 'number' && d.gold >= 0 ? Math.floor(d.gold) : 0;
  return { name: d.name, dogName: d.dogName, weapons, equipped, armor: isArmor(d.armor) ? d.armor : null, potions, gold };
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...data, savedAt: Date.now() }));
  } catch {
    /* storage unavailable: the game still plays, it just won't persist */
  }
}
