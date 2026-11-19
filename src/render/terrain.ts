// Terreno horneado una sola vez en un canvas: hierba, colinas, río, bosques, campos y caminos.
import { MAPS } from '../core/maps';
import { makeRng } from '../core/rng';
import type { GameState, Pt } from '../core/types';
import { RADIUS } from './sprites';

export const TERRAIN_SCALE = 2;

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  const u = s(xf);
  const v = s(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, oct = 4): number {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < oct; i++) {
    f += amp * valueNoise(x * fr, y * fr, seed + i * 17);
    amp *= 0.5;
    fr *= 2.03;
  }
  return f / (1 - Math.pow(0.5, oct));
}

function catmull(pts: Pt[], seg = 10): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function distToPoly(p: Pt, poly: Pt[]): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1];
    const b = poly[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const d = Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
    if (d < best) best = d;
  }
  return best;
}

function segIntersection(a: Pt, b: Pt, c: Pt, d: Pt): Pt | null {
  const den = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / den;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Rejilla espacial simple para preguntar «¿hay algo cerca?» deprisa. */
class Grid {
  cell = 24;
  map = new Map<string, Pt[]>();
  add(p: Pt) {
    const k = `${Math.floor(p.x / this.cell)},${Math.floor(p.y / this.cell)}`;
    (this.map.get(k) ?? this.map.set(k, []).get(k)!).push(p);
  }
  near(p: Pt, r: number): boolean {
    const cx = Math.floor(p.x / this.cell);
    const cy = Math.floor(p.y / this.cell);
    const n = Math.ceil(r / this.cell);
    for (let x = cx - n; x <= cx + n; x++)
      for (let y = cy - n; y <= cy + n; y++) {
        const l = this.map.get(`${x},${y}`);
        if (l) for (const q of l) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 < r * r) return true;
      }
    return false;
  }
}

export function bakeTerrain(state: GameState): HTMLCanvasElement {
  const W = state.width;
  const H = state.height;
  const S = TERRAIN_SCALE;
  const seed = state.seed;
  const rnd = makeRng(seed ^ 0xa11ce);
  const map = MAPS[state.mapId];
  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = H * S;
  const c = canvas.getContext('2d')!;
  c.scale(S, S);

  // 1. Base de color con ruido (a baja resolución y suavizado al ampliar).
  const LR = 4;
  const lw = Math.ceil(W / LR);
  const lh = Math.ceil(H / LR);
  const low = document.createElement('canvas');
  low.width = lw;
  low.height = lh;
  const lc = low.getContext('2d')!;
  const img = lc.createImageData(lw, lh);
  const meadow = [143, 157, 90];
  const dry = [186, 172, 108];
  const lush = [104, 128, 70];
  for (let y = 0; y < lh; y++)
    for (let x = 0; x < lw; x++) {
      const wx = x * LR;
      const wy = y * LR;
      const n = fbm(wx / 260, wy / 260, seed);
      const m = fbm(wx / 70, wy / 70, seed + 99);
      let col: number[];
      if (n < 0.5) {
        const t = Math.min(1, (0.5 - n) * 3);
        col = meadow.map((v, i) => v + (lush[i] - v) * t);
      } else {
        const t = Math.min(1, (n - 0.5) * 3);
        col = meadow.map((v, i) => v + (dry[i] - v) * t);
      }
      const k = 0.9 + m * 0.2;
      const i4 = (y * lw + x) * 4;
      img.data[i4] = col[0] * k;
      img.data[i4 + 1] = col[1] * k;
      img.data[i4 + 2] = col[2] * k;
      img.data[i4 + 3] = 255;
    }
  lc.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(low, 0, 0, W, H);

  // Moteado fino de hierba.
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    c.fillStyle = rnd() < 0.5 ? 'rgba(60,80,30,0.13)' : 'rgba(230,220,150,0.10)';
    c.fillRect(x, y, 1.5 + rnd() * 2, 0.8 + rnd());
  }

  // Obstáculos para decorados.
  const roadPolys = state.roads.map((r) => r.pts);
  const river = map.river ? catmull(map.river, 12) : [];
  const busy = new Grid();
  for (const poly of roadPolys)
    for (let i = 1; i < poly.length; i++) {
      const a = poly[i - 1];
      const b = poly[i];
      const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 6);
      for (let k = 0; k <= steps; k++) busy.add({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
    }
  const riverGrid = new Grid();
  for (const p of river) riverGrid.add(p);
  const nearSettlement = (p: Pt, extra: number) =>
    state.settlements.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < RADIUS[s.kind] + extra);

  // 2. Campos de cultivo alrededor de las aldeas y fortalezas.
  for (const s of state.settlements) {
    if (s.kind === 'fortin') continue;
    const n = s.kind === 'fortaleza' ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const d = RADIUS[s.kind] + 14 + rnd() * 45;
      const p = { x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d };
      if (busy.near(p, 16) || riverGrid.near(p, 20)) continue;
      const w = 16 + rnd() * 18;
      const h = 10 + rnd() * 12;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(a + (rnd() - 0.5) * 0.6);
      const cols = ['#c9b46a', '#b9a24e', '#a6a85a', '#8f8c4c', '#cdbb7a', '#9a7b4f'];
      c.fillStyle = cols[Math.floor(rnd() * cols.length)];
      c.globalAlpha = 0.75;
      c.fillRect(-w / 2, -h / 2, w, h);
      c.globalAlpha = 0.25;
      c.strokeStyle = '#5a4a28';
      c.lineWidth = 0.5;
      for (let k = -w / 2 + 2; k < w / 2; k += 2.5) {
        c.beginPath();
        c.moveTo(k, -h / 2);
        c.lineTo(k, h / 2);
        c.stroke();
      }
      c.globalAlpha = 1;
      c.restore();
    }
  }

  // 3. Colinas y montañas en los bordes.
  const mountains: Pt[] = [];
  for (let i = 0; i < 700; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const edge = Math.min(x, W - x) / W;
    const n = fbm(x / 180, y / 180, seed + 500);
    if (n + (0.2 - edge) * 1.6 < 0.72) continue;
    const p = { x, y };
    if (busy.near(p, 34) || riverGrid.near(p, 30) || nearSettlement(p, 40)) continue;
    mountains.push(p);
  }
  mountains.sort((a, b) => a.y - b.y);
  for (const m of mountains) {
    const s = 14 + rnd() * 16;
    const h = s * (0.9 + rnd() * 0.5);
    c.fillStyle = 'rgba(40,35,20,0.25)';
    c.beginPath();
    c.ellipse(m.x + s * 0.2, m.y + 2, s * 1.05, s * 0.32, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#9d8f6c';
    c.beginPath();
    c.moveTo(m.x - s, m.y);
    c.lineTo(m.x - s * 0.1, m.y - h);
    c.lineTo(m.x + s, m.y);
    c.closePath();
    c.fill();
    c.fillStyle = '#7b6e52';
    c.beginPath();
    c.moveTo(m.x - s * 0.1, m.y - h);
    c.lineTo(m.x + s, m.y);
    c.lineTo(m.x + s * 0.15, m.y);
    c.closePath();
    c.fill();
    if (h > 22) {
      c.fillStyle = '#efe9da';
      c.beginPath();
      c.moveTo(m.x - s * 0.1, m.y - h);
      c.lineTo(m.x - s * 0.32, m.y - h * 0.72);
      c.lineTo(m.x - s * 0.05, m.y - h * 0.78);
      c.lineTo(m.x + s * 0.16, m.y - h * 0.7);
      c.closePath();
      c.fill();
    }
  }

  // 4. Río.
  if (river.length) {
    const stroke = (w: number, col: string) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      river.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
      c.stroke();
    };
    c.lineCap = 'round';
    c.lineJoin = 'round';
    stroke(24, 'rgba(110,100,60,0.35)');
    stroke(17, '#4d7a8c');
    stroke(11, '#5f8fa2');
    stroke(3, 'rgba(210,235,240,0.35)');
  }

  // 5. Bosques.
  const trees: Pt[] = [];
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const n = fbm(x / 140, y / 140, seed + 77);
    if (n < 0.56) continue;
    const p = { x, y };
    if (busy.near(p, 13) || riverGrid.near(p, 16) || nearSettlement(p, 50)) continue;
    if (mountains.some((m) => Math.abs(m.x - x) < 26 && y < m.y + 6 && y > m.y - 34)) continue;
    trees.push(p);
  }
  trees.sort((a, b) => a.y - b.y);
  for (const t of trees) {
    const r = 3.6 + rnd() * 2.6;
    c.fillStyle = 'rgba(20,30,10,0.3)';
    c.beginPath();
    c.ellipse(t.x + 1.5, t.y + r * 0.7, r, r * 0.45, 0, 0, Math.PI * 2);
    c.fill();
    const dark = rnd() < 0.3;
    c.fillStyle = dark ? '#3c5a2a' : '#4f6e33';
    c.beginPath();
    c.arc(t.x, t.y, r, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = dark ? '#4e6e35' : '#6a8a41';
    c.beginPath();
    c.arc(t.x - r * 0.3, t.y - r * 0.35, r * 0.55, 0, Math.PI * 2);
    c.fill();
  }

  // 6. Caminos.
  c.lineCap = 'round';
  c.lineJoin = 'round';
  const strokePoly = (poly: Pt[], w: number, col: string, dash?: number[]) => {
    c.strokeStyle = col;
    c.lineWidth = w;
    c.setLineDash(dash ?? []);
    c.beginPath();
    poly.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
    c.stroke();
    c.setLineDash([]);
  };
  for (const poly of roadPolys) strokePoly(poly, 11, 'rgba(90,70,40,0.35)');
  for (const poly of roadPolys) strokePoly(poly, 7.5, '#b49a68');
  for (const poly of roadPolys) strokePoly(poly, 4.5, '#ccb486');
  for (const poly of roadPolys) strokePoly(poly, 0.8, 'rgba(110,85,50,0.35)', [3, 5]);

  // Puentes donde un camino cruza el río.
  for (const poly of roadPolys)
    for (let i = 1; i < poly.length; i++)
      for (let k = 1; k < river.length; k++) {
        const p = segIntersection(poly[i - 1], poly[i], river[k - 1], river[k]);
        if (!p) continue;
        const ang = Math.atan2(poly[i].y - poly[i - 1].y, poly[i].x - poly[i - 1].x);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(ang);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(-14, -5, 28, 12);
        c.fillStyle = '#8a6a42';
        c.fillRect(-15, -6, 30, 12);
        c.fillStyle = '#a7845a';
        for (let x = -14; x < 15; x += 3) c.fillRect(x, -5.5, 2.2, 11);
        c.fillStyle = '#5e4428';
        c.fillRect(-15, -7, 30, 1.6);
        c.fillRect(-15, 5.4, 30, 1.6);
        c.restore();
      }

  // 7. Explanada bajo cada asentamiento.
  for (const s of state.settlements) {
    const r = RADIUS[s.kind] + 4;
    const g = c.createRadialGradient(s.x, s.y, r * 0.4, s.x, s.y, r + 10);
    g.addColorStop(0, 'rgba(196,178,135,0.95)');
    g.addColorStop(0.75, 'rgba(176,158,110,0.6)');
    g.addColorStop(1, 'rgba(176,158,110,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(s.x, s.y, r + 10, 0, Math.PI * 2);
    c.fill();
  }

  // 8. Viñeta de los bordes.
  const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.55);
  v.addColorStop(0, 'rgba(60,40,20,0)');
  v.addColorStop(1, 'rgba(60,40,20,0.35)');
  c.fillStyle = v;
  c.fillRect(0, 0, W, H);
  return canvas;
}

export { distToPoly };
