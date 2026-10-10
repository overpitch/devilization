import type * as THREE from 'three';
import type { Player } from './player';
import type { Dog } from './dog';
import type { Particles } from './particles';
import type { FloaterKind } from './floaters';
import type { Geysers } from './geysers';
import type { Spikes } from './powers';
import type { Projectiles } from './projectiles';
import type { Fighter } from './fighter';

/** Anything on heaven's side that you, your dog and your imps can hurt. */
export interface Foe {
  readonly pos: THREE.Vector3;
  readonly radius: number;
  readonly alive: boolean;
  hp: number;
  readonly maxHp: number;
  /** A blow from a weapon, horns or teeth. The attacker shows the damage number. */
  takeHit(damage: number, dir: THREE.Vector3, knockback: number, ctx: GameContext): void;
  /** Fire: `amount` now, and it keeps burning at `afterDps` for a while. */
  burn(amount: number, afterDps: number, ctx: GameContext): void;
  /** Run through by ground spikes. */
  impale(damage: number, seconds: number, ctx: GameContext): void;
  /** True if it hasn't noticed you and you're behind it, close enough to kill it in one blow. */
  canAssassinate(from: THREE.Vector3): boolean;
  /** An instant, silent kill. */
  assassinate(ctx: GameContext): void;
}

/** Anything on hell's side that angels attack: you, your dog, your imps. */
export interface HellBody {
  readonly pos: THREE.Vector3;
  readonly radius: number;
  readonly alive: boolean;
  takeDamage(amount: number, ctx: GameContext): void;
}

/** Shared game state handed to every entity's update. */
export interface GameContext {
  scene: THREE.Scene;
  player: Player;
  dog: Dog;
  /** Everything on heaven's side that's still in the world (alive or dying). */
  foes: Foe[];
  /** Every moving fighter: angels, traitors and your imps. */
  fighters: Fighter[];
  /** Solid particles: dust, debris, feathers, blood. */
  debris: Particles;
  /** Glowing particles: fire, sparks, holy light. */
  fire: Particles;
  geysers: Geysers;
  spikes: Spikes;
  projectiles: Projectiles;
  floatText(at: THREE.Vector3, text: string, kind: FloaterKind): void;
  addShake(amount: number): void;
  hitStop(seconds: number): void;
  onFoeKilled(foe: Foe): void;
  /** A short message near the middle of the screen (e.g. a power that's still locked). */
  toast(text: string): void;
}
