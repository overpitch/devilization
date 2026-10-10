/**
 * Places that are the same on every plane: the ruler's lair, where you
 * arrive, and the Hellgate. Positions are world meters; each plane spans
 * -80..80 on x and z, and +z is "north". Everything else lives in planes.ts.
 */

/** The ruler's lair: a raised obsidian dais with the throne at the back. */
export const LAIR = { x: 0.5, z: -28, halfWidth: 6, depth: 6 };
/** Kept flat around the lair, the spawn point and the Hellgate: [x, z, radius]. */
export const LAIR_ZONE: [number, number, number] = [0.5, -12, 19];
/** Where the ruler sits. */
export const THRONE = { x: 0.5, z: -30.2 };
/** Where you arrive (and return when banished), facing the throne. */
export const SPAWN = { x: 0.5, z: -17.5 };
/** The training ground with the dazed captured angels (the First Plane only). */
export const TRAINING = { x: 0.5, z: 3 };
/** The Hellgate: the way between the planes. */
export const PORTAL = { x: 13, z: -20 };
