/**
 * The planes of hell. Each is described here as data: its ground, sky,
 * liquid, scenery, ruler and missions. One generator (world.ts) builds any
 * of them. Malphas's lair, the spawn point and the Hellgate sit in the same
 * place on every plane; everything else moves.
 */

export interface River {
  /** 'x' rivers run along x (their center is a z for each x); 'z' rivers the other way. */
  along: 'x' | 'z';
  center: (t: number) => number;
  width: (t: number) => number;
  /** The stretch of the along-axis the river covers. */
  from: number;
  to: number;
  /** Positions along the river where a stone bridge crosses it. */
  bridges: number[];
}

type XZ = { x: number; z: number };

export interface RulerDef {
  name: string;
  title: string;
  skin: number;
  robe: number;
  horns: number;
  eyes: number;
  /** First meeting. */
  greeting: string;
  /** When you come back for more work. */
  again: string;
  /** When every main mission on the plane is done. */
  allDone: string;
  /** The promotion speech, after the last main mission. */
  promotion: string;
  /** A hint about the plane's treasure chest. */
  chestHint: string;
}

export interface MissionText {
  id: string;
  title: string;
  brief: string;
  /** What the ruler says when you report back. */
  praise: string;
}

export interface PlaneDef {
  /** 1 = the First Plane. */
  index: number;
  name: string;
  title: string;
  /** Suggested level when you arrive. */
  level: number;
  /** Multiplies angels' health and XP (and, a little less, their damage). */
  power: number;
  seed: number;
  terrain: {
    /** Height everything sits around, in blocks. */
    base: number;
    /** How tall the hills are. */
    amp: number;
    /** How wide the hills are (higher = narrower). */
    freq: number;
    spires: number;
    boulders: number;
    /** A city of obsidian blocks with streets between. */
    city?: { block: number; street: number; minHeight: number; maxHeight: number };
  };
  rivers: River[];
  lakes: [number, number, number][];
  mesas: [number, number, number, number][];
  geysers: XZ[];
  /** Kept flat and clear: [x, z, radius]. The lair's zone is added automatically. */
  flatZones: [number, number, number][];
  treasure: XZ;
  treasureGeyser: XZ;
  /** The liquid in the rivers and lakes (all harmless to demons; it burns angels). */
  liquid: { colors: string[]; glow: [number, number, number]; brightness: number };
  /** Block colors: [top, side, deep]. `spire` is the tall rock; `vent` glows. */
  palette: { ground: number[]; rock: number[]; vent: number[]; spire: number[]; cliff: number[]; spireGlow: number };
  sky: { top: string; upper: string; near: string; horizon: number; bottom: string };
  fog: [number, number];
  hemi: [number, number, number];
  sun: [number, number];
  /** Drifting motes: embers rise, ash falls. */
  motes: { color: number; rise: number; size: number };
  geyserColors: [number, number, number];
  scenery: { trees?: { count: number; color: number; style: 'dead' | 'bone' | 'swamp' }; bones?: number; crystals?: { count: number; color: number } };
  ruler: RulerDef;
  missions: {
    war: MissionText & { defend: XZ; from: XZ };
    retrieve: MissionText & { camp: XZ; item: { name: string; look: 'crown' | 'gem'; color: number } };
    assassinate: MissionText & { post: XZ; target: { kind: 'officer' | 'traitor'; label: string } };
  };
}

const HALF = 80;
const LAVA = { colors: ['#7a1404', '#b82a04', '#e04a08', '#ff7010', '#ffa020', '#ffd850'], glow: [1.0, 0.22, 0.03] as [number, number, number], brightness: 0.92 };

export const PLANES: PlaneDef[] = [
  {
    index: 1,
    name: 'The First Plane',
    title: 'The Lava Plains',
    level: 1,
    power: 1,
    seed: 666,
    terrain: { base: 1, amp: 1, freq: 1, spires: 45, boulders: 70 },
    rivers: [
      { along: 'x', center: (x) => 27 + 7 * Math.sin(x * 0.07) + 3 * Math.sin(x * 0.17 + 1), width: (x) => 5 + 1.5 * Math.sin(x * 0.05), from: -HALF, to: HALF, bridges: [-12, 19, 58] },
      { along: 'z', center: (z) => -36 + 6 * Math.sin(z * 0.08 + 1), width: (z) => 4 + Math.sin(z * 0.11), from: -HALF, to: 28, bridges: [-22, -58] },
      { along: 'z', center: (z) => 38 + 5 * Math.sin(z * 0.09), width: (z) => 4.5 + Math.sin(z * 0.07 + 2), from: -HALF, to: 28, bridges: [-8, -50] },
    ],
    lakes: [
      [58, 56, 9],
      [-60, -52, 7],
    ],
    mesas: [
      [-52, 46, 9, 5],
      [55, -36, 10, 6],
      [-58, -10, 6, 4],
      [16, 54, 7, 4],
    ],
    geysers: [
      { x: 14.5, z: -42.5 }, { x: -15.5, z: -22.5 }, { x: 21.5, z: 9.5 }, { x: -21.5, z: 11.5 }, { x: 54.5, z: -60.5 },
      { x: -56.5, z: -28.5 }, { x: 2.5, z: 46.5 }, { x: -36.5, z: 56.5 }, { x: 62.5, z: 12.5 }, { x: 8.5, z: -48.5 },
    ],
    flatZones: [[56, -4, 8]],
    treasure: { x: 24.5, z: -33.5 },
    treasureGeyser: { x: 24.5, z: -30.5 },
    liquid: LAVA,
    palette: {
      ground: [0x6b4038, 0x7a3022, 0x5a2219],
      rock: [0x3a2e2c, 0x2f2524, 0x251d1c],
      vent: [0x8a2e0c, 0x6a220a, 0x4a1a0a],
      spire: [0x2c2040, 0x241a36, 0x1c142a],
      cliff: [0x55271c, 0x4a2016, 0x3a1a12],
      spireGlow: 0,
    },
    sky: { top: '#070103', upper: '#1e0606', near: '#6a200c', horizon: 0x4a1408, bottom: '#1a0604' },
    fog: [30, 115],
    hemi: [0xc06048, 0x401008, 2.2],
    sun: [0xffb090, 1.6],
    motes: { color: 0xff8a3a, rise: 1, size: 0.13 },
    geyserColors: [0xff4a0a, 0xff8a1a, 0xffd04a],
    scenery: { trees: { count: 60, color: 0x1c1412, style: 'dead' }, bones: 90 },
    ruler: {
      name: 'Malphas',
      title: 'Ruler of the First Plane',
      skin: 0xa02418,
      robe: 0x1c0c0c,
      horns: 0x1a1210,
      eyes: 0xffc020,
      greeting:
        'So the pits coughed up another Imp. I am Malphas, ruler of the First Plane. Heaven’s armies are on my plain, and I need claws. Serve me well and I will raise you up. Fail me and you go back in the pit.',
      again: 'Back for more work? Good.',
      allDone: 'More work, Fiend? Heaven never runs out of angels to kill.',
      promotion: 'You have done everything I asked. Kneel, Imp... and rise a Fiend. The Hellgate beside my lair will now take you down to the Second Plane.',
      chestHint: 'They say the old lords left a chest of gold atop a pillar no imp can climb. Fire carries the bold.',
    },
    missions: {
      war: {
        id: 'bridge',
        title: 'Blood at the Bridge',
        brief: 'Heaven means to cross the great river by the western bridge. Take my imps and hold it. Not one feathered foot sets down on my side.',
        praise: 'The bridge held. Heaven will think twice before it tries that again.',
        defend: { x: -12, z: 11 },
        from: { x: -12, z: 38 },
      },
      retrieve: {
        id: 'crown',
        title: 'The Stolen Crown',
        brief: 'Angels crept into my vault and stole the Brimstone Crown. Their camp lies across the eastern river. Bring it back to me.',
        praise: 'My crown! The angels will regret ever touching it.',
        camp: { x: 56, z: -4 },
        item: { name: 'Brimstone Crown', look: 'crown', color: 0xe0a020 },
      },
      assassinate: {
        id: 'traitor',
        title: 'The Traitor of the Pits',
        brief: 'Vargash, one of my own captains, sold himself to heaven for a halo. He hides in their watchpost on the northwest mesa. Kill him. Do it unseen and I will pay double.',
        praise: 'Vargash’s halo makes a fine trophy. Here is your pay.',
        post: { x: -52, z: 46 },
        target: { kind: 'traitor', label: 'Vargash' },
      },
    },
  },

  {
    index: 2,
    name: 'The Second Plane',
    title: 'The Ash Wastes',
    level: 5,
    power: 1.45,
    seed: 2717,
    terrain: { base: 1.5, amp: 1.9, freq: 0.6, spires: 22, boulders: 55 },
    rivers: [],
    lakes: [
      [-42, 32, 8],
      [46, 42, 7],
      [30, -52, 6],
      [-56, -44, 6],
      [62, -18, 5],
    ],
    mesas: [
      [50, -8, 9, 5],
      [-22, 56, 8, 4],
    ],
    geysers: [
      { x: -15.5, z: -24.5 }, { x: 18.5, z: 8.5 }, { x: -24.5, z: 14.5 }, { x: 40.5, z: 18.5 }, { x: -48.5, z: 2.5 },
      { x: 6.5, z: 42.5 }, { x: -36.5, z: -52.5 }, { x: 58.5, z: -40.5 }, { x: 20.5, z: -44.5 }, { x: -60.5, z: 56.5 },
      { x: 34.5, z: 60.5 }, { x: -6.5, z: 62.5 },
    ],
    flatZones: [
      [-30, 12, 9],
      [44, 6, 8],
      [-46, -20, 7],
    ],
    treasure: { x: 24.5, z: 34.5 },
    treasureGeyser: { x: 24.5, z: 37.5 },
    liquid: LAVA,
    palette: {
      ground: [0x7c7672, 0x5c5652, 0x4a4440],
      rock: [0x3c3836, 0x302c2a, 0x262220],
      vent: [0x8a2e0c, 0x6a220a, 0x4a1a0a],
      spire: [0x2a2828, 0x222020, 0x1a1818],
      cliff: [0x524c48, 0x46403c, 0x3a3430],
      spireGlow: 0,
    },
    sky: { top: '#0a0808', upper: '#262020', near: '#6a5446', horizon: 0x5a4a40, bottom: '#201a18' },
    fog: [22, 100],
    hemi: [0xb0a090, 0x403830, 2.0],
    sun: [0xffc0a0, 1.4],
    motes: { color: 0xc8c0b8, rise: -0.7, size: 0.12 },
    geyserColors: [0xff4a0a, 0xff8a1a, 0xffd04a],
    scenery: { trees: { count: 28, color: 0x3a3634, style: 'dead' }, bones: 70 },
    ruler: {
      name: 'Bael',
      title: 'Lord of the Ash Wastes',
      skin: 0x6a625c,
      robe: 0x2a2420,
      horns: 0x141212,
      eyes: 0xff8a20,
      greeting:
        'Malphas sends me a Fiend. Fine. I am Bael, lord of these ashes. Heaven pours holy fire on my wastes and calls it cleansing. I call it trespassing. Go and teach them the difference.',
      again: 'The wastes are wide and full of angels. Take your pick.',
      allDone: 'Still hungry, Hellguard? There is always more ash to sift.',
      promotion: 'Heaven’s grip on my wastes is broken. Rise, Fiend, a Hellguard of the Third Plane. The Hellgate will take you down to the Bone Forest.',
      chestHint: 'A hoard lies on a pillar out in the dunes. You will need a geyser to reach it.',
    },
    missions: {
      war: {
        id: 'ash-pass',
        title: 'The Ashen Pass',
        brief: 'An angel host is marching down from the northern dunes toward my shrines. Meet them at the pass with my imps and hold it.',
        praise: 'Their host is ash now. As it should be.',
        defend: { x: -30, z: 12 },
        from: { x: -30, z: 56 },
      },
      retrieve: {
        id: 'ember-heart',
        title: 'The Ember Heart',
        brief: 'The Ember Heart keeps my wastes burning, and the angels have carried it to their camp in the east to snuff it out. Bring it home.',
        praise: 'The Heart beats again. Feel the wastes warm.',
        camp: { x: 44, z: 6 },
        item: { name: 'Ember Heart', look: 'gem', color: 0xff3a10 },
      },
      assassinate: {
        id: 'inquisitor',
        title: 'The Pale Inquisitor',
        brief: 'Inquisitor Sariel hunts my demons through the ash and burns them alive. Find the inquisitor at the western watchpost. Silently, if you can: double pay.',
        praise: 'No more burnings. Sariel will not be missed, not even in heaven.',
        post: { x: -46, z: -20 },
        target: { kind: 'officer', label: 'Inquisitor Sariel' },
      },
    },
  },

  {
    index: 3,
    name: 'The Third Plane',
    title: 'The Bone Forest',
    level: 10,
    power: 1.95,
    seed: 3331,
    terrain: { base: 1, amp: 1.2, freq: 1.1, spires: 0, boulders: 30 },
    rivers: [{ along: 'z', center: (z) => 20 + 6 * Math.sin(z * 0.07), width: (z) => 4 + Math.sin(z * 0.13), from: -HALF, to: HALF, bridges: [-30, 25] }],
    lakes: [[-46, -46, 7]],
    mesas: [[-60, 40, 7, 4]],
    geysers: [
      { x: -10.5, z: -26.5 }, { x: -30.5, z: 4.5 }, { x: 46.5, z: 20.5 }, { x: 4.5, z: 40.5 }, { x: -52.5, z: 20.5 },
      { x: 56.5, z: -52.5 }, { x: -24.5, z: -56.5 }, { x: 40.5, z: 56.5 },
    ],
    flatZones: [
      [-34, 22, 9],
      [50, -20, 8],
      [-50, -14, 7],
    ],
    treasure: { x: -18.5, z: -48.5 },
    treasureGeyser: { x: -18.5, z: -45.5 },
    liquid: { colors: ['#3a0206', '#5a0610', '#7a0a18', '#9a1020', '#b81a28', '#d83040'], glow: [0.8, 0.04, 0.1], brightness: 0.85 },
    palette: {
      ground: [0x8a7a6a, 0x6a5a4a, 0x4a3e34],
      rock: [0x4a4038, 0x3a322c, 0x2c2622],
      vent: [0x8a1a1a, 0x6a1414, 0x4a0e0e],
      spire: [0xd6cbb0, 0xb8ad92, 0x9a9078],
      cliff: [0x5a4a40, 0x4a3c34, 0x3a2e28],
      spireGlow: 0,
    },
    sky: { top: '#080208', upper: '#1a0612', near: '#4a0e1e', horizon: 0x3a0a16, bottom: '#14040a' },
    fog: [16, 85],
    hemi: [0xc07088, 0x3a1018, 2.0],
    sun: [0xffa0b0, 1.3],
    motes: { color: 0xff4060, rise: 0.35, size: 0.11 },
    geyserColors: [0xff2a2a, 0xff6a3a, 0xffb080],
    scenery: { trees: { count: 150, color: 0xd6cbb0, style: 'bone' }, bones: 80 },
    ruler: {
      name: 'Morax',
      title: 'The Bone King',
      skin: 0xc8b8a0,
      robe: 0x2a0a10,
      horns: 0xd6cbb0,
      eyes: 0xff2040,
      greeting:
        'A Hellguard, in my forest. Every tree here was grown from the bones of something that crossed me. I am Morax. Heaven wants my forest for kindling. You will make sure it gets nothing but more bones.',
      again: 'The forest whispers of angels. Go and quiet it.',
      allDone: 'The trees are well fed, Pit Captain. But there is always room for more.',
      promotion: 'My forest is safe, and grows taller on their bones. Rise, Hellguard, a Pit Captain. The Hellgate now opens on the Sulfur Swamps.',
      chestHint: 'Somewhere south, a pillar holds a chest no climber has reached. The geysers here run red, but they lift just the same.',
    },
    missions: {
      war: {
        id: 'ossuary',
        title: 'Siege of the Ossuary',
        brief: 'Angels are marching on my ossuary in the west, where the oldest bones are kept. Hold it with my imps until their host breaks.',
        praise: 'The ossuary stands, and it has new bones to keep.',
        defend: { x: -34, z: 22 },
        from: { x: -34, z: 62 },
      },
      retrieve: {
        id: 'marrow-horn',
        title: 'The Marrow Horn',
        brief: 'My Marrow Horn calls the forest to war, and the angels stole it across the river of blood. Fetch it back from their camp in the east.',
        praise: 'Hear it? The forest is listening again.',
        camp: { x: 50, z: -20 },
        item: { name: 'Marrow Horn', look: 'gem', color: 0xf0e6c8 },
      },
      assassinate: {
        id: 'turncoat',
        title: 'Grimbone the Turncoat',
        brief: 'Grimbone, my gravekeeper, now guides angels through my forest for a halo. He camps at their post in the west. End him. Unseen, double pay.',
        praise: 'Grimbone’s bones will make a fine sapling.',
        post: { x: -50, z: -14 },
        target: { kind: 'traitor', label: 'Grimbone' },
      },
    },
  },

  {
    index: 4,
    name: 'The Fourth Plane',
    title: 'The Sulfur Swamps',
    level: 15,
    power: 2.5,
    seed: 4441,
    terrain: { base: 1, amp: 0.7, freq: 1.2, spires: 16, boulders: 40 },
    rivers: [{ along: 'x', center: (x) => -4 + 10 * Math.sin(x * 0.05), width: (x) => 5 + Math.sin(x * 0.09), from: -HALF, to: HALF, bridges: [-44, 10, 50] }],
    lakes: [
      [-50, 30, 6], [-20, 45, 5], [12, 28, 4], [50, 24, 6], [62, 50, 5], [-60, -30, 6], [-28, -30, 4],
      [22, -34, 5], [44, -56, 6], [-6, -58, 4], [-42, 58, 5], [34, 60, 4],
    ],
    mesas: [],
    geysers: [
      { x: -14.5, z: -24.5 }, { x: 18.5, z: 12.5 }, { x: -36.5, z: 14.5 }, { x: 38.5, z: 40.5 }, { x: -52.5, z: -8.5 },
      { x: 4.5, z: 52.5 }, { x: 56.5, z: -24.5 }, { x: -22.5, z: -46.5 }, { x: 26.5, z: -54.5 },
    ],
    flatZones: [
      [30, 36, 9],
      [-46, -40, 8],
      [56, -42, 7],
    ],
    treasure: { x: -30.5, z: 30.5 },
    treasureGeyser: { x: -30.5, z: 33.5 },
    liquid: { colors: ['#2a3a04', '#4a6a08', '#6a9a10', '#8ac018', '#b0e030', '#e0ff60'], glow: [0.45, 0.85, 0.08], brightness: 0.9 },
    palette: {
      ground: [0x5c5a2c, 0x4a4220, 0x3a3218],
      rock: [0x3a3a24, 0x2e2e1c, 0x242414],
      vent: [0x8a8a10, 0x6a6a0c, 0x4a4a08],
      spire: [0xb0b020, 0x909018, 0x707010],
      cliff: [0x4a4a2a, 0x3c3c22, 0x30301a],
      spireGlow: 0.25,
    },
    sky: { top: '#0a0c02', upper: '#24260a', near: '#6a6a18', horizon: 0x5a5a16, bottom: '#181a06' },
    fog: [14, 80],
    hemi: [0xc0c060, 0x30300a, 2.0],
    sun: [0xf0f0a0, 1.3],
    motes: { color: 0xe0e040, rise: 0.4, size: 0.1 },
    geyserColors: [0xa0c010, 0xd0e030, 0xf8ff90],
    scenery: { trees: { count: 70, color: 0x2a2414, style: 'swamp' }, crystals: { count: 50, color: 0xd8d830 } },
    ruler: {
      name: 'Vepar',
      title: 'Queen of the Sulfur Swamps',
      skin: 0x4a6a2a,
      robe: 0x2a3a10,
      horns: 0x141408,
      eyes: 0xe0ff40,
      greeting:
        'A Pit Captain. They grow you small up there. I am Vepar, and these swamps are mine to the last bubble of acid. Heaven is trying to drain them. Make them choke on the fumes instead.',
      again: 'The mire is restless. There is work.',
      allDone: 'Even a Hellknight gets bored in a quiet swamp. Here, have some angels.',
      promotion: 'My swamps bubble undisturbed. Rise, Pit Captain, a Hellknight. The Hellgate opens on the Obsidian City, and the Tyrant who rules it.',
      chestHint: 'A chest of drowned gold sits on a pillar in the northwest pools. The vents beside it will lift you.',
    },
    missions: {
      war: {
        id: 'causeway',
        title: 'The Causeway',
        brief: 'An angel column is coming down the northern causeway to drain my pools. Stand on the causeway with my imps and send them into the acid.',
        praise: 'The acid ate well tonight.',
        defend: { x: 30, z: 36 },
        from: { x: 24, z: 63 },
      },
      retrieve: {
        id: 'venom-chalice',
        title: 'The Venom Chalice',
        brief: 'They took the Venom Chalice, the cup the whole swamp drinks from. Their camp lies in the southwest, past the acid river. Bring it back.',
        praise: 'Ahh. The swamp drinks again.',
        camp: { x: -46, z: -40 },
        item: { name: 'Venom Chalice', look: 'crown', color: 0x80c020 },
      },
      assassinate: {
        id: 'lumiel',
        title: 'Brother Lumiel',
        brief: 'Brother Lumiel blesses the waters, and every blessing kills a pool. The priest hides at their post in the southeast. Silence that voice. Unseen, double pay.',
        praise: 'No more blessings. The pools will heal.',
        post: { x: 56, z: -42 },
        target: { kind: 'officer', label: 'Brother Lumiel' },
      },
    },
  },

  {
    index: 5,
    name: 'The Fifth Plane',
    title: 'The Obsidian City',
    level: 20,
    power: 3.1,
    seed: 5557,
    terrain: { base: 1, amp: 0.3, freq: 1, spires: 0, boulders: 20, city: { block: 9, street: 5, minHeight: 4, maxHeight: 13 } },
    rivers: [
      { along: 'x', center: () => 16, width: () => 4, from: -HALF, to: HALF, bridges: [-42, -14, 14, 42] },
      { along: 'z', center: () => -28, width: () => 4, from: -HALF, to: 14, bridges: [-48, -6] },
    ],
    lakes: [],
    mesas: [],
    geysers: [
      { x: -10.5, z: -40.5 }, { x: 30.5, z: 2.5 }, { x: -46.5, z: 2.5 }, { x: 4.5, z: 34.5 }, { x: 50.5, z: -20.5 }, { x: -56.5, z: -56.5 },
    ],
    flatZones: [
      [-42, 42, 9],
      [44, 36, 8],
      [46, -40, 7],
      // A plaza in the middle of the city.
      [4, 0, 7],
    ],
    treasure: { x: -52.5, z: -40.5 },
    treasureGeyser: { x: -52.5, z: -37.5 },
    liquid: LAVA,
    palette: {
      ground: [0x2c2632, 0x221c28, 0x1a1420],
      rock: [0x34303a, 0x2a2630, 0x201c26],
      vent: [0x8a2e0c, 0x6a220a, 0x4a1a0a],
      spire: [0x2c2040, 0x241a36, 0x1c142a],
      cliff: [0x2a2030, 0x221a28, 0x1a1420],
      spireGlow: 0,
    },
    sky: { top: '#050208', upper: '#140818', near: '#4a1a2a', horizon: 0x3a1220, bottom: '#100610' },
    fog: [20, 95],
    hemi: [0xa06080, 0x30101a, 2.1],
    sun: [0xffa080, 1.4],
    motes: { color: 0xff8a3a, rise: 1, size: 0.13 },
    geyserColors: [0xff4a0a, 0xff8a1a, 0xffd04a],
    scenery: { bones: 40 },
    ruler: {
      name: 'Asmodar',
      title: 'Tyrant of the Obsidian City',
      skin: 0x3a2048,
      robe: 0x0a0610,
      horns: 0xd9b24a,
      eyes: 0xff6020,
      greeting:
        'A Hellknight. I have a thousand. I am Asmodar, and every street of this city bends to me, except the ones heaven has taken. Take them back, and I may remember your name.',
      again: 'My city has too many angels in it. Fix that.',
      allDone: 'The city is quiet, Warlord. Too quiet. Find me more angels.',
      promotion: 'My streets are mine again. Rise, Hellknight, a Warlord of hell. Below this city lie the Chain Canyons. That road opens soon.',
      chestHint: 'An old tyrant’s hoard sits on a pillar in the southwest quarter. A vent beside it breathes hard enough to lift you.',
    },
    missions: {
      war: {
        id: 'burning-gate',
        title: 'The Burning Gate',
        brief: 'Heaven is storming the northwest gate of my city. Hold the gate square with my imps until their legion breaks.',
        praise: 'The gate held. Hang their wings on it.',
        defend: { x: -42, z: 42 },
        from: { x: -42, z: 63 },
      },
      retrieve: {
        id: 'iron-ledger',
        title: 'The Iron Ledger',
        brief: 'The Iron Ledger lists every soul this city owns, and angels have stolen it to set them free. Their camp is in the northeast quarter. Bring it back unread.',
        praise: 'Every name still in its place. Good.',
        camp: { x: 44, z: 36 },
        item: { name: 'Iron Ledger', look: 'gem', color: 0x8090a0 },
      },
      assassinate: {
        id: 'zarael',
        title: 'Archon Zarael',
        brief: 'Archon Zarael commands the angels in my city from a post in the southeast quarter. Cut off the head. Unseen, double pay.',
        praise: 'Without Zarael their legion is just a flock.',
        post: { x: 46, z: -40 },
        target: { kind: 'officer', label: 'Archon Zarael' },
      },
    },
  },
];

/** Planes beyond these are still to be built. */
export const BUILT_PLANES = PLANES.length;

/** Names of all ten planes, for the Hellgate (including ones still to come). */
export const ALL_PLANE_NAMES = [
  'The Lava Plains',
  'The Ash Wastes',
  'The Bone Forest',
  'The Sulfur Swamps',
  'The Obsidian City',
  'The Chain Canyons',
  'Frozen Hell',
  'The Burning Sky',
  'The Abyss',
  "The Angels' War Camp",
];

let active: PlaneDef = PLANES[0];

/** The plane you're on now. */
export function plane(): PlaneDef {
  return active;
}

export function setPlane(index: number) {
  active = PLANES[Math.max(0, Math.min(PLANES.length - 1, index - 1))];
}
