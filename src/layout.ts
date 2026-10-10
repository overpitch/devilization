/**
 * Where things are on the First Plane. Positions are world meters; the
 * plane spans -80..80 on x and z, and +z is "north".
 */

/** Malphas's lair: a raised obsidian dais with his throne at the back. */
export const LAIR = { x: 0.5, z: -28, halfWidth: 6, depth: 6 };
/** Where Malphas sits. */
export const THRONE = { x: 0.5, z: -30.2 };
/** Where you arrive (and return when banished), facing the throne. */
export const SPAWN = { x: 0.5, z: -17.5 };
/** The training ground with the dazed captured angels. */
export const TRAINING = { x: 0.5, z: 3 };

/** Kept flat and clear of rocks: [x, z, radius]. Raised to height 1. */
export const FLAT_ZONES: [number, number, number][] = [
  [0.5, -12, 19],
  // The angels' camp east of the river, where the stolen crown is kept.
  [56, -4, 8],
];

/** The camp where the angels keep the Brimstone Crown. */
export const CROWN_CAMP = { x: 56, z: -4 };
/** The angels' watchpost on the northwest mesa, where the traitor hides. */
export const TRAITOR_POST = { x: -52, z: 46 };
/** The western bridge over the great river; the angels try to cross here. */
export const WEST_BRIDGE = { x: -12, south: 11, north: 38 };

/** A pillar too tall to climb; only a geyser can throw you onto it. */
export const TREASURE = { x: 24.5, z: -33.5 };
export const TREASURE_GEYSER = { x: 24.5, z: -30.5 };

/** Where ambient angel patrols roam when no mission is running. */
export const PATROLS: { x: number; z: number }[] = [
  { x: -24, z: -40 },
  { x: 30, z: 52 },
  { x: -55, z: 10 },
];
