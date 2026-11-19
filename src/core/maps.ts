import { makeRng } from './rng';
import type { Pt, Road, SettlementKind } from './types';

export interface MapNode {
  name: string;
  kind: SettlementKind;
  x: number;
  y: number;
  /** Índice del jugador inicial (0 = independiente, 1…N = jugadores). */
  start: number;
  /** Guarnición inicial: [básicas, tiradores, pesadas]. */
  garrison: [number, number, number];
}

export interface MapDef {
  id: string;
  name: string;
  /** Descripción corta para el menú. */
  desc: string;
  players: number;
  width: number;
  height: number;
  nodes: MapNode[];
  roads: [number, number][];
  /**
   * Simetría: `pre[i]` es el nodo que la transformación T lleva a i. Los caminos se copian
   * transformados para que todas las posiciones sean iguales.
   */
  sym?: { pre: number[]; T: (p: Pt) => Pt };
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
  const pre = nodes.map((_, i) => m(i));
  const river: Pt[] = [
    { x: -20, y: 960 }, { x: 140, y: 900 }, { x: 290, y: 840 }, { x: 430, y: 860 },
    { x: 570, y: 740 }, { x: 710, y: 760 }, { x: 860, y: 700 }, { x: 1020, y: 640 },
  ];
  return { id: 'po', name: 'Valle del Po', desc: 'Dos pueblos frente a frente', players: 2, width: W, height: H, nodes, roads, sym: { pre, T: (p) => ({ x: W - p.x, y: H - p.y }) }, river };
}

/**
 * Mapa con simetría de giro para n jugadores: cada sector es igual al anterior girado.
 * Por sector: fortaleza, dos aldeas propias, un fortín independiente delante, y en la frontera
 * con el sector siguiente una aldea y un fortín independientes. En el centro, una aldea grande.
 */
function buildRotational(
  id: string,
  name: string,
  desc: string,
  n: number,
  size: number,
  base: number,
  geo: { rF: number; rA: number; aA: number; rT: number; rB1: number; rB2: number },
  names: string[][],
  centerName: string,
): MapDef {
  const c = size / 2;
  const deg = Math.PI / 180;
  const at = (r: number, a: number) => ({ x: Math.round(c + Math.cos(a * deg) * r), y: Math.round(c + Math.sin(a * deg) * r) });
  const nodes: MapNode[] = [];
  const idx: { F: number; A1: number; A2: number; T: number; B1: number; B2: number }[] = [];
  for (let k = 0; k < n; k++) {
    const axis = base + (k * 360) / n;
    const half = 180 / n;
    const nm = names[k];
    const add = (node: Omit<MapNode, 'x' | 'y'>, p: { x: number; y: number }) => (nodes.push({ ...node, ...p }), nodes.length - 1);
    idx.push({
      F: add({ name: nm[0], kind: 'fortaleza', start: k + 1, garrison: [3, 2, 0] }, at(geo.rF, axis)),
      A1: add({ name: nm[1], kind: 'aldea', start: k + 1, garrison: [1, 0, 0] }, at(geo.rA, axis - geo.aA)),
      A2: add({ name: nm[2], kind: 'aldea', start: k + 1, garrison: [1, 0, 0] }, at(geo.rA, axis + geo.aA)),
      T: add({ name: nm[3], kind: 'fortin', start: 0, garrison: [3, 2, 0] }, at(geo.rT, axis)),
      B1: add({ name: nm[4], kind: 'aldea', start: 0, garrison: [3, 1, 0] }, at(geo.rB1, axis + half)),
      B2: add({ name: nm[5], kind: 'fortin', start: 0, garrison: [3, 2, 0] }, at(geo.rB2, axis + half)),
    });
  }
  const C = nodes.length;
  nodes.push({ name: centerName, kind: 'aldea', start: 0, garrison: [5, 2, 0], ...at(0, 0) });
  const roads: [number, number][] = [];
  for (let k = 0; k < n; k++) {
    const a = idx[k];
    const b = idx[(k + 1) % n];
    roads.push([a.F, a.A1], [a.F, a.A2], [a.F, a.T], [a.A2, a.B1], [a.B1, b.A1], [a.T, a.B2], [a.B2, b.T], [a.B1, a.B2], [a.T, C]);
  }
  const per = 6;
  const pre = nodes.map((_, i) => (i === C ? C : (i - per + per * n) % (per * n)));
  const rot = (2 * Math.PI) / n;
  const T = (p: Pt): Pt => ({
    x: c + (p.x - c) * Math.cos(rot) - (p.y - c) * Math.sin(rot),
    y: c + (p.x - c) * Math.sin(rot) + (p.y - c) * Math.cos(rot),
  });
  return { id, name, desc, players: n, width: size, height: size, nodes, roads, sym: { pre, T } };
}

const trinacria = buildRotational(
  'trinacria',
  'Trinacria',
  'Sicilia: tres pueblos, un centro',
  3,
  1400,
  90,
  { rF: 560, rA: 520, aA: 24, rT: 370, rB1: 565, rB2: 300 },
  [
    ['Syracusae', 'Helorus', 'Acrae', 'Castra Hyblae', 'Morgantina', 'Turris Aetnae'],
    ['Lilybaeum', 'Mazara', 'Eryx', 'Castra Halyci', 'Segesta', 'Turris Crimisi'],
    ['Panormus', 'Soluntum', 'Himera', 'Castra Cephaloedi', 'Tyndaris', 'Turris Nebrodi'],
  ],
  'Henna',
);

const hispania = buildRotational(
  'hispania',
  'Hispania',
  'Cuatro pueblos se disputan la península',
  4,
  1600,
  135,
  { rF: 620, rA: 590, aA: 20, rT: 420, rB1: 600, rB2: 320 },
  [
    ['Gades', 'Hispalis', 'Malaca', 'Castra Baetis', 'Corduba', 'Turris Anae'],
    ['Olisipo', 'Scallabis', 'Conimbriga', 'Castra Tagi', 'Bracara', 'Turris Durii'],
    ['Numantia', 'Clunia', 'Pompaelo', 'Castra Iberi', 'Caesaraugusta', 'Turris Sicoris'],
    ['Tarraco', 'Saguntum', 'Dertosa', 'Castra Sucronis', 'Carthago Nova', 'Turris Segurae'],
  ],
  'Toletum',
);

export const MAPS: Record<string, MapDef> = { po: buildPo(), trinacria, hispania };

/** Construye la geometría de los caminos (curvas suaves deterministas). */
export function buildRoads(map: MapDef, seed: number): Road[] {
  const rnd = makeRng(seed ^ 0x51ed);
  const out: Road[] = [];
  const byKey = new Map<string, Road>();
  map.roads.forEach(([a, b], id) => {
    const A = map.nodes[a];
    const B = map.nodes[b];
    let pts: Pt[] | null = null;
    if (map.sym) {
      const ma = map.sym.pre[a];
      const mb = map.sym.pre[b];
      const twin = byKey.get(`${ma}-${mb}`) ?? byKey.get(`${mb}-${ma}`);
      if (twin) {
        const T = map.sym.T;
        const mp = twin.pts.map((p) => T(p));
        pts = twin.a === ma ? mp : mp.reverse();
        // Ajustar extremos exactos a los nodos (evita deriva por redondeo).
        pts[0] = { x: A.x, y: A.y };
        pts[pts.length - 1] = { x: B.x, y: B.y };
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
