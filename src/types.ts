import type * as THREE from 'three';
import type { Player } from './player';
import type { Dog } from './dog';
import type { Angel } from './angel';
import type { Particles } from './particles';
import type { FloaterKind } from './floaters';
import type { Geysers } from './geysers';

/** Shared game state handed to every entity's update. */
export interface GameContext {
  scene: THREE.Scene;
  player: Player;
  dog: Dog;
  angels: Angel[];
  /** Solid particles: dust, debris, feathers, blood. */
  debris: Particles;
  /** Glowing particles: fire, sparks, holy light. */
  fire: Particles;
  geysers: Geysers;
  floatText(at: THREE.Vector3, text: string, kind: FloaterKind): void;
  addShake(amount: number): void;
  hitStop(seconds: number): void;
  onAngelKilled(angel: Angel): void;
}
