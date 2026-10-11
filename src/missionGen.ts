import type { FighterKind } from './fighter';
import type { MissionText, PlaneDef } from './planes';
import { SPAWN } from './layout';

/**
 * Randomly made main missions. A new game picks a mission seed, and every
 * plane's three main missions come from it: what was stolen, who must
 * die, what the ruler says, who stands guard and how the battle goes. The
 * places stay the plane's own (the crossing to hold, the angel camp, the
 * watchpost), so the same seed always gives the same missions and a new
 * game gives new ones.
 */

type XZ = { x: number; z: number };

export interface Guards {
  footsoldiers: number;
  archers: number;
  priests: number;
  officers: number;
}

export interface MissionSet {
  war: MissionText & { defend: XZ; from: XZ; waves?: FighterKind[][]; imps?: number; captain?: string };
  retrieve: MissionText & { camp: XZ; item: { name: string; look: 'crown' | 'gem'; color: number }; guards?: Guards };
  assassinate: MissionText & { post: XZ; target: { kind: FighterKind; label: string }; guards?: Guards };
}

/** A small seeded random number generator (mulberry32), so a seed always makes the same missions. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITEMS: { name: string; look: 'crown' | 'gem'; color: number }[] = [
  { name: 'Brimstone Crown', look: 'crown', color: 0xe0a020 },
  { name: 'Obsidian Crown', look: 'crown', color: 0x4a3a6a },
  { name: 'Crown of Cinders', look: 'crown', color: 0xff6a20 },
  { name: 'Iron Diadem', look: 'crown', color: 0x9a9aa8 },
  { name: 'Bloodstone Circlet', look: 'crown', color: 0xc01828 },
  { name: 'Soul Lantern', look: 'gem', color: 0xff9a30 },
  { name: 'Heart of the Pit', look: 'gem', color: 0xff2030 },
  { name: 'Eye of Malice', look: 'gem', color: 0x40ff60 },
  { name: 'Infernal Seal', look: 'gem', color: 0xffd040 },
  { name: 'Hellstone', look: 'gem', color: 0xc040ff },
  { name: 'Ember of the First Fire', look: 'gem', color: 0xff5010 },
  { name: 'Shard of Night', look: 'gem', color: 0x3060ff },
];

const ANGEL_NAMES = ['Auriel', 'Seraphon', 'Caelum', 'Halazel', 'Ithuriel', 'Zophiel', 'Barachiel', 'Raguel', 'Sariel', 'Jophiel', 'Azarel', 'Cassiel', 'Lumiel', 'Orifiel', 'Phanuel', 'Tzaphiel'];
const TRAITOR_NAMES = ['Vargash', 'Skarnak', 'Gorvath', 'Xulthar', 'Mordrel', 'Kazrul', 'Vethis', 'Grulk', 'Ashmedar', 'Thrask'];

const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)];
const between = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));

/** "north", "south-east"… from the lair (+z is north, +x is west on every plane). */
function direction(at: XZ) {
  const dx = at.x - SPAWN.x;
  const dz = at.z - SPAWN.z;
  const ns = Math.abs(dz) > Math.abs(dx) * 0.5 ? (dz > 0 ? 'north' : 'south') : '';
  const ew = Math.abs(dx) > Math.abs(dz) * 0.5 ? (dx > 0 ? 'west' : 'east') : '';
  return ns && ew ? `${ns}-${ew}` : ns || ew;
}

/** The three main missions of `p` for this game's `seed`. */
export function generateMissions(p: PlaneDef, seed: number): MissionSet {
  const r = rng(seed * 977 + p.index * 7919);
  const base = p.missions;
  const deep = p.index;

  // ----- Retrieve: something precious, stolen -----
  const item = pick(r, ITEMS);
  const campDir = direction(base.retrieve.camp);
  const retrieve: MissionSet['retrieve'] = {
    id: 'retrieve',
    title: pick(r, [`The Stolen ${item.name}`, `Return the ${item.name}`, 'Thieves of Heaven', `The ${item.name} Taken`, 'Raid on the Angel Camp']),
    brief: `${pick(r, ['Angels crept into my vault and', 'While I feasted, angels', 'A band of angels', 'Heaven’s thieves'])} ${pick(r, ['stole', 'snatched', 'carried off'])} the ${item.name}. Their camp lies to the ${campDir}. ${pick(r, ['Bring it back to me.', 'Take it back before they carry it up to heaven.', 'Get it back, and leave none of them standing if you like.'])}`,
    praise: pick(r, [`The ${item.name}! The angels will regret ever touching it.`, `Back where it belongs. Heaven will learn what it costs to steal from me.`, `You have it! Here is your pay, and well earned.`]),
    camp: base.retrieve.camp,
    item,
    guards: { footsoldiers: between(r, 3, 4), archers: between(r, 1, 3), priests: between(r, 1, 2), officers: deep >= 3 || r() < 0.35 ? 1 : 0 },
  };

  // ----- Assassinate: someone who must die -----
  const kinds: FighterKind[] = deep >= 2 ? ['officer', 'traitor', 'knight', 'priest'] : ['officer', 'traitor', 'priest'];
  const kind = pick(r, kinds);
  const angel = pick(r, ANGEL_NAMES);
  const label = kind === 'traitor' ? pick(r, TRAITOR_NAMES) : kind === 'knight' ? `Sir ${angel}` : kind === 'priest' ? `High Priest ${angel}` : `Captain ${angel}`;
  const postDir = direction(base.assassinate.post);
  const deed =
    kind === 'traitor'
      ? pick(r, ['was one of my own captains, and sold out to heaven for a halo', 'betrayed my lair to the angels', 'opened my gates to heaven for a handful of feathers'])
      : kind === 'priest'
        ? pick(r, ['has been blessing heaven’s soldiers so they rise again', 'is teaching the angels to burn my imps with holy light', 'prays over every angel that marches on my lands'])
        : kind === 'knight'
          ? pick(r, ['has cut down a hundred of my imps', 'leads heaven’s knights against my borders', 'swore an oath to drive me from this plane'])
          : pick(r, ['is scouting my lands for heaven', 'leads the patrols that hunt my imps', 'is drawing maps of my lair for the host']);
  const assassinate: MissionSet['assassinate'] = {
    id: 'assassinate',
    title: pick(r, [`Death to ${label}`, `Silence ${label}`, `Hunt ${label}`, kind === 'traitor' ? 'The Traitor of the Pits' : `A Halo for ${angel}`]),
    brief: `${label} ${deed}. They wait in the watchpost to the ${postDir}. Kill ${label}. Do it unseen and I will pay double.`,
    praise: pick(r, [`${label} is dead. A fine trophy. Here is your pay.`, `No more ${label}. Heaven will feel that.`, `Good. Let heaven find what is left of ${label}.`]),
    post: base.assassinate.post,
    target: { kind, label },
    guards: { footsoldiers: between(r, 2, 3), archers: between(r, 1, 2), priests: deep >= 3 || r() < 0.4 ? 1 : 0, officers: deep >= 5 && r() < 0.5 ? 1 : 0 },
  };

  // ----- War: hold the line against waves -----
  const captain = `Captain ${pick(r, ANGEL_NAMES)}`;
  const waveCount = between(r, 3, 4);
  const waves: FighterKind[][] = [];
  for (let w = 0; w < waveCount; w++) {
    const size = 4 + w + between(r, 0, 1);
    const wave: FighterKind[] = [];
    for (let i = 0; i < size; i++) {
      const roll = r();
      wave.push(w === 0 || roll < 0.6 ? 'footsoldier' : roll < 0.85 ? 'archer' : 'priest');
    }
    // The last wave is led by a captain.
    if (w === waveCount - 1) wave[0] = 'officer';
    waves.push(wave);
  }
  const fromDir = direction(base.war.from);
  const war: MissionSet['war'] = {
    id: 'war',
    title: pick(r, ['Hold the Line', 'Heaven’s Assault', 'Stand Fast', 'Blood on the Border', 'The Host Comes']),
    brief: `${pick(r, ['An angel host', 'A column of angels', 'Heaven’s vanguard', 'A war band of angels'])} is marching in from the ${fromDir} ${pick(r, ['to tear down my shrines', 'to burn my imp pens', 'to take this plane for heaven', 'to drive me from my throne'])}. Meet them with my imps and hold the line until ${waveCount === 4 ? 'all four waves break' : 'every wave breaks'}.`,
    praise: pick(r, ['The line held. Heaven will think twice before it tries that again.', 'Their host is broken. My imps sing of you already.', 'Not one of them got past. Well fought.']),
    defend: base.war.defend,
    from: base.war.from,
    waves,
    imps: between(r, 5, 7),
    captain,
  };

  return { war, retrieve, assassinate };
}

/** A fresh seed for a new game. */
export function newMissionSeed() {
  return Math.floor(Math.random() * 2 ** 31);
}
