/**
 * Levels, ranks and powers. Level comes from XP and unlocks powers; rank is
 * a promotion from the plane rulers (missions arrive in milestone 3).
 *
 * The XP curve totals about 61,000 XP from level 1 to 50, to be spread over
 * a 3–5 hour playthrough once missions and real angels give XP.
 */
export const MAX_LEVEL = 50;

/** XP needed to go from `level` to the next. */
export const xpToNext = (level: number) => 50 + 15 * level + level * level;

export function statsForLevel(level: number) {
  const n = level - 1;
  return {
    maxHp: 100 + 10 * n,
    /** Hellfire: the energy that fire breath and ground spikes burn. */
    maxEnergy: 100 + 2 * n,
    /** Multiplies all damage you and your dog deal. */
    damage: 1 + 0.04 * n,
  };
}

export const RANKS = ['Imp', 'Fiend', 'Hellguard', 'Pit Captain', 'Hellknight', 'Warlord', 'Archfiend', 'Duke of Hell', 'Prince of Hell', 'Demon Lord'];

/** Levels at which powers unlock. */
export const UNLOCK = {
  dogCharge: 5,
  fireBreath: 10,
  dogFireBreath: 10,
  spikes: 15,
  size: 30,
  flight: 40,
  naturalArmor: 50,
} as const;

/** The messages shown when a level unlocks something. */
export function unlocksAt(level: number, dogName: string): { title: string; detail: string }[] {
  const out: { title: string; detail: string }[] = [];
  if (level === UNLOCK.dogCharge) out.push({ title: 'Horn charge', detail: `${dogName} can now charge with its horns` });
  if (level === UNLOCK.fireBreath) out.push({ title: 'Fire breath', detail: `Hold F to breathe fire. ${dogName} breathes fire too` });
  if (level === UNLOCK.spikes) out.push({ title: 'Ground spikes', detail: 'Hold R to aim, let go to impale' });
  return out;
}
