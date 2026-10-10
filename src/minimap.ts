import type * as THREE from 'three';
import { HALF, heightAt, isLava } from './world';
import { plane } from './planes';

/** Metres from the centre to the edge of the map. */
const RANGE = 42;
/** Redraws a second: enough to feel live, cheap on an Xbox. */
const RATE = 20;

/** Something to show on the map. */
export interface MapDot {
  x: number;
  z: number;
  /** CSS color. */
  color: string;
  size?: number;
  /** Arrow pointing this way (yaw), for the other player. */
  yaw?: number;
  /** Kept on the rim when out of range (the objective). */
  pin?: boolean;
  shape?: 'dot' | 'square' | 'ring' | 'diamond';
}

/**
 * A round map in the bottom-right corner that turns with you (forward is
 * always up): the ground and liquid of the plane around you, angels, your
 * dog, your partner, the ruler, the Hellgate, the chest and the objective.
 */
export class Minimap {
  readonly canvas = document.createElement('canvas');
  private readonly g: CanvasRenderingContext2D;
  /** The whole plane, one pixel per metre, drawn once when the plane is built. */
  private base = document.createElement('canvas');
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.canvas.className = 'minimap';
    this.canvas.width = this.canvas.height = 160;
    this.g = this.canvas.getContext('2d')!;
    parent.appendChild(this.canvas);
  }

  set visible(v: boolean) {
    this.canvas.style.display = v ? '' : 'none';
  }

  /** Paints the current plane's ground (call after the plane is built). */
  paintPlane() {
    const size = HALF * 2;
    const base = document.createElement('canvas');
    base.width = base.height = size;
    const g = base.getContext('2d')!;
    const img = g.createImageData(size, size);
    const p = plane();
    const ground = rgb(p.palette.ground[0]);
    const liquid = hexRgb(p.liquid.colors[Math.min(3, p.liquid.colors.length - 1)]);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const x = i - HALF + 0.5;
        const z = j - HALF + 0.5;
        let c: number[];
        if (isLava(x, z)) c = liquid;
        else {
          // Higher ground is lighter, so cliffs, mesas and walls stand out.
          const h = heightAt(x, z);
          const k = 0.5 + Math.min(1, Math.max(0, (h + 1) / 12)) * 0.75;
          c = ground.map((v) => Math.min(255, v * k));
        }
        const o = (j * size + i) * 4;
        img.data[o] = c[0];
        img.data[o + 1] = c[1];
        img.data[o + 2] = c[2];
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.base = base;
  }

  /** `at`: where you stand; `yaw`: where you face. */
  update(dt: number, at: THREE.Vector3, yaw: number, getDots: () => MapDot[]) {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 1 / RATE;
    const dots = getDots();
    const g = this.g;
    const size = this.canvas.width;
    const c = size / 2;
    const r = c - 3;
    const s = r / RANGE;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // World → map: forward (sin yaw, cos yaw) points up, your right points right.
    const toMap = (x: number, z: number) => {
      const dx = x - at.x;
      const dz = z - at.z;
      return [c + s * (-cos * dx + sin * dz), c - s * (sin * dx + cos * dz)];
    };

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.save();
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0a0404';
    g.fillRect(0, 0, size, size);
    // The plane, turned so you face up. Base pixel (i, j) is world (i - HALF, j - HALF).
    const x0 = -HALF - at.x;
    const z0 = -HALF - at.z;
    g.setTransform(-s * cos, -s * sin, s * sin, -s * cos, c + s * (-cos * x0 + sin * z0), c - s * (sin * x0 + cos * z0));
    g.imageSmoothingEnabled = false;
    g.drawImage(this.base, 0, 0);
    g.setTransform(1, 0, 0, 1, 0, 0);

    for (const d of dots) {
      let [mx, my] = toMap(d.x, d.z);
      const off = Math.hypot(mx - c, my - c);
      if (off > r - 4) {
        if (!d.pin) continue;
        // Out of range: sits on the rim, pointing the way.
        mx = c + ((mx - c) / off) * (r - 6);
        my = c + ((my - c) / off) * (r - 6);
      }
      const size = d.size ?? 3;
      g.fillStyle = d.color;
      g.strokeStyle = d.color;
      if (d.yaw !== undefined) arrow(g, mx, my, d.yaw - yaw, size + 2, d.color);
      else if (d.shape === 'square') g.fillRect(mx - size, my - size, size * 2, size * 2);
      else if (d.shape === 'ring') {
        g.lineWidth = 2;
        g.beginPath();
        g.arc(mx, my, size, 0, Math.PI * 2);
        g.stroke();
      } else if (d.shape === 'diamond') {
        g.beginPath();
        g.moveTo(mx, my - size - 1);
        g.lineTo(mx + size, my);
        g.lineTo(mx, my + size + 1);
        g.lineTo(mx - size, my);
        g.closePath();
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = '#000';
        g.stroke();
      } else {
        g.beginPath();
        g.arc(mx, my, size, 0, Math.PI * 2);
        g.fill();
        // A dark rim so pale dots show on pale ground.
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        g.stroke();
      }
    }
    // You, in the middle, facing up.
    arrow(g, c, c, 0, 6, '#ffd040');
    g.restore();

    // Rim, with N marking north (+Z is north on every plane's layout).
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255, 170, 120, 0.55)';
    g.beginPath();
    g.arc(c, c, r, 0, Math.PI * 2);
    g.stroke();
    const [nx, ny] = toMap(at.x, at.z + 1);
    const nd = Math.hypot(nx - c, ny - c) || 1;
    g.font = 'bold 11px Georgia, serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#ffcfa0';
    g.fillText('N', c + ((nx - c) / nd) * (r - 9), c + ((ny - c) / nd) * (r - 9));
  }
}

/** An arrowhead at (x, y), turned by `turn` radians from straight up (clockwise when positive). */
function arrow(g: CanvasRenderingContext2D, x: number, y: number, turn: number, size: number, color: string) {
  g.save();
  g.translate(x, y);
  g.rotate(-turn);
  g.beginPath();
  g.moveTo(0, -size);
  g.lineTo(size * 0.7, size * 0.7);
  g.lineTo(0, size * 0.3);
  g.lineTo(-size * 0.7, size * 0.7);
  g.closePath();
  g.fillStyle = color;
  g.fill();
  g.lineWidth = 1.5;
  g.strokeStyle = '#000';
  g.stroke();
  g.restore();
}

const rgb = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
const hexRgb = (css: string) => rgb(parseInt(css.slice(1), 16));
