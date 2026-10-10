/**
 * Trophies (achievements) and the bestiary: what you've done and what
 * you've slain, shown on a page in the pause menu.
 */

/** Everything the trophies are measured against. */
export interface TrophyRecord {
  kills: number;
  /** Angels slain, by kind. */
  killsByKind: { [kind: string]: number };
  silentKills: number;
  chests: number;
  sideDone: number;
  level: number;
  rank: number;
  gold: number;
  /** The deepest plane you've stood on. */
  deepest: number;
  demonLord: boolean;
}

export interface Trophy {
  id: string;
  name: string;
  text: string;
  goal: number;
  /** Progress toward the goal. */
  value(r: TrophyRecord): number;
}

const kind = (k: string) => (r: TrophyRecord) => r.killsByKind[k] ?? 0;

export const TROPHIES: Trophy[] = [
  { id: 'first-blood', name: 'First Blood', text: 'Slay your first angel.', goal: 1, value: (r) => r.kills },
  { id: 'hundred', name: 'A Hundred Halos', text: 'Slay 100 angels.', goal: 100, value: (r) => r.kills },
  { id: 'thousand', name: 'A Thousand Halos', text: 'Slay 1,000 angels.', goal: 1000, value: (r) => r.kills },
  { id: 'unseen', name: 'Unseen', text: 'Make 10 silent kills.', goal: 10, value: (r) => r.silentKills },
  { id: 'whisper', name: 'Whisper of Death', text: 'Make 50 silent kills.', goal: 50, value: (r) => r.silentKills },
  { id: 'captains', name: 'Officer Hunter', text: 'Slay 10 angel captains.', goal: 10, value: kind('officer') },
  { id: 'priests', name: 'No Prayers Left', text: 'Slay 25 angel priests.', goal: 25, value: kind('priest') },
  { id: 'knights', name: 'Shieldbreaker', text: 'Slay 25 angel knights.', goal: 25, value: kind('knight') },
  { id: 'seraphs', name: 'Wingclipper', text: 'Slay 25 seraphs.', goal: 25, value: kind('seraph') },
  { id: 'traitor', name: "Traitor's End", text: 'Kill Vargash the Traitor.', goal: 1, value: kind('traitor') },
  { id: 'chest', name: 'Finders Keepers', text: 'Open a treasure chest.', goal: 1, value: (r) => r.chests },
  { id: 'chests', name: 'Treasure Hunter', text: 'Open all ten treasure chests.', goal: 10, value: (r) => r.chests },
  { id: 'errands', name: 'Errand Demon', text: 'Finish 25 side missions.', goal: 25, value: (r) => r.sideDone },
  { id: 'rich', name: 'Hoard of Hell', text: 'Carry 5,000 gold.', goal: 5000, value: (r) => r.gold },
  { id: 'level25', name: 'Halfway to the Throne', text: 'Reach level 25.', goal: 25, value: (r) => r.level },
  { id: 'level50', name: 'Unstoppable', text: 'Reach level 50.', goal: 50, value: (r) => r.level },
  { id: 'warlord', name: 'Warlord', text: 'Reach the rank of Warlord.', goal: 5, value: (r) => r.rank },
  { id: 'deepest', name: 'The Deepest Dark', text: 'Set foot on the Tenth Plane.', goal: 10, value: (r) => r.deepest },
  { id: 'demon-lord', name: 'Demon Lord', text: 'Slay Archangel Seraphiel.', goal: 1, value: (r) => (r.demonLord ? 1 : 0) },
];

/** Trophies whose goal `r` meets that aren't in `earned` yet. */
export function newlyEarned(r: TrophyRecord, earned: Set<string>): Trophy[] {
  return TROPHIES.filter((t) => !earned.has(t.id) && t.value(r) >= t.goal);
}

/** The bestiary: each kind of angel, in the order you meet them. */
export const BESTIARY: { kind: string; name: string; text: string }[] = [
  { kind: 'footsoldier', name: 'Angel footsoldier', text: 'Sword and shield. The rank and file of heaven, found on every plane.' },
  { kind: 'archer', name: 'Angel archer', text: 'Keeps its distance and looses holy arrows. Close in fast.' },
  { kind: 'priest', name: 'Angel priest', text: 'Heals other angels and throws bolts of light. Kill it first.' },
  { kind: 'officer', name: 'Angel captain', text: 'Big, quick and hard-hitting, with a spear it sometimes leaves behind.' },
  { kind: 'traitor', name: 'Vargash the Traitor', text: 'A demon who sold himself to heaven, crooked halo and all.' },
  { kind: 'knight', name: 'Angel knight', text: 'Its shield stops most blows from the front. Get behind it, or burn it.' },
  { kind: 'seraph', name: 'Seraph', text: 'Flies above everything and dives to strike. Arrows, javelins, fire and spikes reach it.' },
  { kind: 'general', name: 'Archangel Seraphiel', text: 'General of the heavenly host. Six wings, a flaming sword, and ten angels at its call.' },
];
