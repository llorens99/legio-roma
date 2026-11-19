// Extrae costas reales (Natural Earth 1:10m, vía world-atlas) para cada mapa histórico.
// Uso: npx vite-node tools/geo.ts  → escribe src/core/geo/costas.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { feature } from 'topojson-client';

type P = [number, number];

/** Recuadros [lonMin, latMin, lonMax, latMax] de cada mapa (con margen). */
const TOL: Record<string, number> = { italia: 0.012, sicilia: 0.005, hispania: 0.012, galia: 0.012, africa: 0.007 };

export const BOXES: Record<string, [number, number, number, number]> = {
  italia: [6.0, 37.4, 19.4, 47.0],
  sicilia: [11.9, 36.3, 16.1, 38.7],
  hispania: [-10.0, 35.5, 4.0, 44.2],
  galia: [-5.2, 42.0, 9.0, 51.4],
  africa: [5.2, 33.4, 11.8, 37.7],
};

const topo = JSON.parse(readFileSync('node_modules/world-atlas/land-10m.json', 'utf8'));
const land = feature(topo, topo.objects.land) as any;
const polys: P[][] = [];
for (const f of land.features ?? [land]) {
  const g = f.geometry;
  const list = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of list) polys.push(poly[0] as P[]);
}

// Recorte de un polígono contra un rectángulo (Sutherland–Hodgman).
function clip(poly: P[], [x0, y0, x1, y1]: [number, number, number, number]): P[] {
  const edges: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((b[1] - a[1]) * (x0 - a[0])) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((b[1] - a[1]) * (x1 - a[0])) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + ((b[0] - a[0]) * (y0 - a[1])) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + ((b[0] - a[0]) * (y1 - a[1])) / (b[1] - a[1]), y1]],
  ];
  let out = poly;
  for (const [inside, cut] of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const cur = inp[i];
      const prev = inp[(i + inp.length - 1) % inp.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cut(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cut(prev, cur));
    }
    if (!out.length) break;
  }
  return out;
}

// Simplificación Douglas–Peucker en grados «corregidos» por la latitud.
function simplify(pts: P[], tol: number, k: number): P[] {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bd = tol;
    const ax = pts[a][0] * k, ay = pts[a][1], bx = pts[b][0] * k, by = pts[b][1];
    const dx = bx - ax, dy = by - ay;
    const l = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((pts[i][0] * k - ax) * dy - (pts[i][1] - ay) * dx) / l;
      if (d > bd) {
        bd = d;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

let out = '// Archivo generado por tools/geo.ts a partir de Natural Earth (dominio público). No editar a mano.\n';
out += '// Cada polígono de tierra: [lon, lat, lon, lat, …] con 3 decimales.\n\n';
out += 'export const COSTAS: Record<string, number[][]> = {\n';
for (const [id, box] of Object.entries(BOXES)) {
  const k = Math.cos((((box[1] + box[3]) / 2) * Math.PI) / 180);
  const res: number[][] = [];
  let pts = 0;
  for (const poly of polys) {
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (const [x, y] of poly) {
      minx = Math.min(minx, x); maxx = Math.max(maxx, x); miny = Math.min(miny, y); maxy = Math.max(maxy, y);
    }
    if (maxx < box[0] || minx > box[2] || maxy < box[1] || miny > box[3]) continue;
    const c = clip(poly, box);
    if (c.length < 3) continue;
    // Áreas minúsculas (islotes) fuera.
    let area = 0;
    for (let i = 0; i < c.length; i++) {
      const a = c[i], b = c[(i + 1) % c.length];
      area += (a[0] * b[1] - b[0] * a[1]) * k;
    }
    if (Math.abs(area / 2) < 0.004) continue;
    // Anillo cerrado: partir por el punto más lejano del primero y simplificar cada mitad.
    let m = 1;
    for (let i = 1; i < c.length; i++) if (Math.hypot((c[i][0] - c[0][0]) * k, c[i][1] - c[0][1]) > Math.hypot((c[m][0] - c[0][0]) * k, c[m][1] - c[0][1])) m = i;
    const s1 = simplify(c.slice(0, m + 1), TOL[id], k);
    const s2 = simplify([...c.slice(m), c[0]], TOL[id], k);
    const s = [...s1.slice(0, -1), ...s2.slice(0, -1)];
    if (s.length < 3) continue;
    pts += s.length;
    res.push(s.flatMap(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]));
  }
  console.log(id, res.length, 'polígonos', pts, 'puntos');
  out += `  ${id}: ${JSON.stringify(res)},\n`;
}
out += '};\n';
writeFileSync('/tmp/costas.json', JSON.stringify(Object.fromEntries(Object.keys(BOXES).map((id) => [id, null]))));
writeFileSync('src/core/geo/costas.ts', out);
console.log('bytes', out.length);
