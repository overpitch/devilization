import { HALF } from './world';
import { arrow, type MapDot } from './minimap';

/** One player's place on the map. */
export interface MapPlayer {
  x: number;
  z: number;
  yaw: number;
  color: string;
}

/** A named place on the map. */
export interface MapLabel {
  x: number;
  z: number;
  text: string;
}

/**
 * The full map of the plane you're on (M, or View on a controller),
 * north up: the ground the mini map uses, scaled up, with landmarks,
 * the objective, nearby angels and every player.
 */
export function drawWorldMap(canvas: HTMLCanvasElement, ground: HTMLCanvasElement, players: MapPlayer[], dots: MapDot[], labels: MapLabel[]) {
  const g = canvas.getContext('2d')!;
  const size = canvas.width;
  const s = size / (HALF * 2);
  // North (+Z) is up, which puts +X on the left (as seen from above).
  const at = (x: number, z: number) => [s * (HALF - x), s * (HALF - z)];

  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, size, size);
  g.imageSmoothingEnabled = false;
  g.setTransform(-s, 0, 0, -s, size, size);
  g.drawImage(ground, 0, 0);
  g.setTransform(1, 0, 0, 1, 0, 0);

  for (const d of dots) {
    const [x, y] = at(d.x, d.z);
    const r = (d.size ?? 3) * 1.6;
    g.fillStyle = d.color;
    g.strokeStyle = d.color;
    if (d.shape === 'square') {
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.lineWidth = 1.5;
      g.strokeStyle = '#000';
      g.strokeRect(x - r, y - r, r * 2, r * 2);
    } else if (d.shape === 'ring') {
      g.lineWidth = 3;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    } else if (d.shape === 'diamond') {
      g.beginPath();
      g.moveTo(x, y - r - 2);
      g.lineTo(x + r, y);
      g.lineTo(x, y + r + 2);
      g.lineTo(x - r, y);
      g.closePath();
      g.fill();
      g.lineWidth = 1.5;
      g.strokeStyle = '#000';
      g.stroke();
    } else {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0, 0, 0, 0.8)';
      g.stroke();
    }
  }

  g.font = 'bold 15px Georgia, serif';
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  g.fillStyle = '#f2e2d0';
  for (const l of labels) {
    const [x, y] = at(l.x, l.z);
    const ty = Math.max(18, y - 10);
    g.strokeText(l.text, x, ty);
    g.fillText(l.text, x, ty);
  }

  for (const p of players) {
    const [x, y] = at(p.x, p.z);
    arrow(g, x, y, p.yaw, 11, p.color);
  }

  // A compass rose in the corner.
  g.font = 'bold 16px Georgia, serif';
  g.textBaseline = 'middle';
  g.strokeText('N', size - 22, 20);
  g.fillStyle = '#ffcfa0';
  g.fillText('N', size - 22, 20);
  arrow(g, size - 22, 42, 0, 7, '#ffcfa0');
}
