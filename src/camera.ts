import * as THREE from 'three';
import type { Input } from './input';
import { clamp, smoothing } from './util';

const BASE_SENSITIVITY = 0.0022; // radians per pixel of mouse/trackpad movement
const FOV = 75;
const SPRINT_FOV = 83;

/**
 * First-person camera at the demon's eyes. yaw 0 looks toward +Z;
 * positive pitch looks up.
 */
export class FirstPersonCamera {
  yaw = 0;
  pitch = 0;
  sensitivity = 1;
  /** Mouse up looks down. */
  invertY = false;

  private trauma = 0;
  private time = 0;
  private fov = FOV;

  constructor(readonly camera: THREE.PerspectiveCamera) {
    camera.rotation.order = 'YXZ';
    camera.fov = FOV;
  }

  /** Screen shake; amounts stack up to a cap and fade out quickly. */
  addShake(amount: number) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  applyInput(input: Input) {
    const s = BASE_SENSITIVITY * this.sensitivity;
    this.yaw -= input.mouseDX * s;
    this.pitch = clamp(this.pitch - input.mouseDY * s * (this.invertY ? -1 : 1), -1.45, 1.45);
  }

  /** Flat forward direction (where W walks). */
  forward(out: THREE.Vector3) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  /** Where the camera looks, including pitch. */
  lookDir(out: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    return out.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
  }

  /**
   * Places the camera at the eye. `bob` (0..1) is how strongly walking
   * sways the head; `phase` is the walk cycle.
   */
  update(dt: number, eye: THREE.Vector3, bob: number, phase: number, sprinting: boolean) {
    this.time += dt;
    const cam = this.camera;
    cam.position.copy(eye);
    // Walking: the head dips with each step and sways side to side.
    cam.position.y += Math.abs(Math.sin(phase)) * 0.07 * bob - 0.035 * bob;
    const sway = Math.sin(phase) * 0.035 * bob;
    cam.position.x += -Math.cos(this.yaw) * sway;
    cam.position.z += Math.sin(this.yaw) * sway;

    const shake = this.trauma * this.trauma;
    const t = this.time;
    cam.position.x += Math.sin(t * 47) * 0.15 * shake;
    cam.position.y += Math.sin(t * 53 + 1.7) * 0.15 * shake;
    cam.position.z += Math.sin(t * 59 + 3.1) * 0.15 * shake;

    cam.rotation.set(this.pitch + Math.sin(t * 43) * 0.03 * shake, this.yaw + Math.PI, Math.sin(t * 37) * 0.05 * shake + Math.sin(phase) * 0.006 * bob);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);

    // Widen the view a little when sprinting.
    const fov = this.fov + ((sprinting ? SPRINT_FOV : FOV) - this.fov) * smoothing(6, dt);
    if (Math.abs(fov - cam.fov) > 0.01) {
      this.fov = fov;
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }
}
