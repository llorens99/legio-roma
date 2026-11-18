import { makeRng } from './rng';
import type { Pt, Road, SettlementKind } from './types';

export interface MapNode {
  name: string;
  kind: SettlementKind;
  x: number;
  y: number;
  /** Índice del jugador inicial (0 = independiente, 1 = sur, 2 = norte). */
  start: number;
  /** Guarnición inicial: [básicas, tiradores, pesadas]. */
  garrison: [number, number, number];
}

export interface MapDef {
  id: string;
  name: string;
  width: number;
  height: number;
  nodes: MapNode[];
  roads: [number, number][];
  /** Si es simétrico respecto al centro: índice del nodo espejo de cada nodo. */
  mirror?: number[];
  /** Río decorativo (puntos de control). */
  river?: Pt[];
}

// Mapa M0: «Valle del Po». Mitad sur definida a mano; la mitad norte es su simétrico
// respecto al centro, para que ambos bandos tengan el mismo terreno.
const W = 1000;
const H = 1600;
const southHalf: MapNode[] = [
  { name: 'Ariminum', kind: 'fortaleza', x: 500, y: 1440, start: 1, garrison: [3, 2, 0] },
  { name: 'Sena', kind: 'aldea', x: 255, y: 1330, start: 1, garrison: [1, 0, 0] },
  { name: 'Pisaurum', kind: 'aldea', x: 765, y: 1295, start: 1, garrison: [1, 0, 0] },
  { name: 'Castra Rubra', kind: 'fortin', x: 525, y: 1150, start: 0, garrison: [3, 2, 0] },
  { name: 'Vicus Silvae', kind: 'aldea', x: 175, y: 1060, start: 0, garrison: [3, 1, 0] },
  { name: 'Fanum', kind: 'aldea', x: 830, y: 1010, start: 0, garrison: [3, 1, 0] },
  { name: 'Turris Vada', kind: 'fortin', x: 370, y: 905, start: 0, garrison: [3, 2, 0] },
];
const northNames = ['Mediolanum', 'Comum', 'Bergomum', 'Dunum Vetus', 'Alauna', 'Brixia', 'Oppidum Padi'];

function buildPo(): MapDef {
  const nodes: MapNode[] = [];
  for (const n of southHalf) nodes.push(n);
  southHalf.forEach((n, i) =>
    nodes.push({ ...n, name: northNames[i], x: W - n.x, y: H - n.y, start: n.start === 1 ? 2 : n.start }),
  );
  const center = nodes.length;
  nodes.push({ name: 'Forum Padi', kind: 'aldea', x: 500, y: 800, start: 0, garrison: [5, 2, 0] });
  const k = southHalf.length;
  const half: [number, number][] = [
    [0, 1], [0, 2], [0, 3], [1, 4], [2, 5], [3, 6], [4, 6], [3, 5],
    [6, center], [5, center],
    [4, 5 + k], // camino del oeste: Vicus Silvae ↔ Brixia
  ];
  const m = (i: number) => (i === center ? center : i < k ? i + k : i - k);
  const roads: [number, number][] = [];
  const seen = new Set<string>();
  for (const [a, b] of half) {
    for (const [x, y] of [[a, b], [m(a), m(b)]] as [number, number][]) {
      const key = x < y ? `${x}-${y}` : `${y}-${x}`;
      if (!seen.has(key)) {
        seen.add(key);
        roads.push([x, y]);
      }
    }
  }
  const mirror = nodes.map((_, i) => m(i));
  const river: Pt[] = [
    { x: -20, y: 960 }, { x: 140, y: 900 }, { x: 290, y: 840 }, { x: 430, y: 860 },
    { x: 570, y: 740 }, { x: 710, y: 760 }, { x: 860, y: 700 }, { x: 1020, y: 640 },
  ];
  return { id: 'po', name: 'Valle del Po', width: W, height: H, nodes, roads, mirror, river };
}

export const MAPS: Record<string, MapDef> = { po: buildPo() };

/** Construye la geometría de los caminos (curvas suaves deterministas). */
export function buildRoads(map: MapDef, seed: number): Road[] {
  const rnd = makeRng(seed ^ 0x51ed);
  const out: Road[] = [];
  const byKey = new Map<string, Road>();
  map.roads.forEach(([a, b], id) => {
    const A = map.nodes[a];
    const B = map.nodes[b];
    let pts: Pt[] | null = null;
    if (map.mirror) {
      const ma = map.mirror[a];
      const mb = map.mirror[b];
      const twin = byKey.get(`${ma}-${mb}`) ?? byKey.get(`${mb}-${ma}`);
      if (twin) {
        const mp = twin.pts.map((p) => ({ x: map.width - p.x, y: map.height - p.y }));
        pts = twin.a === ma ? mp : mp.reverse();
      }
    }
    if (!pts) {
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const off1 = (rnd() - 0.5) * 0.22 * len;
      const off2 = (rnd() - 0.5) * 0.12 * len;
      pts = [];
      const N = Math.max(6, Math.round(len / 28));
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const bend = Math.sin(Math.PI * t) * off1 + Math.sin(2 * Math.PI * t) * off2;
        pts.push({ x: A.x + dx * t + nx * bend, y: A.y + dy * t + ny * bend });
      }
    }
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const road: Road = { id, a, b, pts, cum, len: cum[cum.length - 1] };
    byKey.set(`${a}-${b}`, road);
    out.push(road);
  });
  return out;
}

/** Punto y dirección a distancia s desde road.a. */
export function pointOnRoad(road: Road, s: number): { x: number; y: number; dx: number; dy: number } {
  const c = road.cum;
  s = Math.max(0, Math.min(road.len, s));
  let i = 1;
  while (i < c.length - 1 && c[i] < s) i++;
  const p0 = road.pts[i - 1];
  const p1 = road.pts[i];
  const seg = c[i] - c[i - 1] || 1;
  const t = (s - c[i - 1]) / seg;
  const dx = (p1.x - p0.x) / seg;
  const dy = (p1.y - p0.y) / seg;
  return { x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t, dx, dy };
}
