import { onLand } from './geoutil';
import { buildRoads, type MapDef } from './maps';
import type { Pt } from './types';

function segIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/** Comprueba que un mapa es jugable. Devuelve la lista de problemas (vacía si está bien). */
export function validateMap(map: MapDef, seed = 1): string[] {
  const errs: string[] = [];
  const n = map.nodes.length;
  const forts = map.nodes.filter((x) => x.kind === 'fortaleza');
  for (let p = 1; p <= map.players; p++) {
    const c = map.nodes.filter((x) => x.start === p && x.kind === 'fortaleza').length;
    if (c !== 1) errs.push(`El jugador ${p} tiene ${c} fortalezas`);
  }
  if (forts.length < 2) errs.push('Faltan fortalezas');
  map.nodes.forEach((a, i) => {
    if (a.x < 40 || a.y < 40 || a.x > map.width - 40 || a.y > map.height - 40) errs.push(`${a.name} está fuera del mapa`);
    for (let j = i + 1; j < n; j++) {
      const b = map.nodes[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < (map.minDist ?? 110)) errs.push(`${a.name} y ${b.name} demasiado cerca`);
    }
  });
  const adj: number[][] = map.nodes.map(() => []);
  const seen = new Set<string>();
  for (const [a, b] of map.roads) {
    if (a === b || a < 0 || b < 0 || a >= n || b >= n) errs.push(`Camino inválido ${a}-${b}`);
    const k = a < b ? `${a}-${b}` : `${b}-${a}`;
    if (seen.has(k)) errs.push(`Camino repetido ${k}`);
    seen.add(k);
    adj[a]?.push(b);
    adj[b]?.push(a);
  }
  // Conexo.
  const vis = new Set<number>([0]);
  const st = [0];
  while (st.length) for (const v of adj[st.pop()!]) if (!vis.has(v)) (vis.add(v), st.push(v));
  if (vis.size !== n) errs.push('El mapa no está conectado');
  map.nodes.forEach((x, i) => {
    if (adj[i].length === 0) errs.push(`${x.name} no tiene caminos`);
  });
  // Caminos que se cruzan o pasan por encima de otro asentamiento.
  const roads = buildRoads(map, seed);
  for (let i = 0; i < roads.length; i++) {
    const r = roads[i];
    for (let j = i + 1; j < roads.length; j++) {
      const o = roads[j];
      if (r.a === o.a || r.a === o.b || r.b === o.a || r.b === o.b) continue;
      let hit = false;
      for (let p = 1; p < r.pts.length && !hit; p++)
        for (let q = 1; q < o.pts.length && !hit; q++) if (segIntersect(r.pts[p - 1], r.pts[p], o.pts[q - 1], o.pts[q])) hit = true;
      if (hit) errs.push(`Los caminos ${map.nodes[r.a].name}-${map.nodes[r.b].name} y ${map.nodes[o.a].name}-${map.nodes[o.b].name} se cruzan`);
    }
    map.nodes.forEach((x, k) => {
      if (k === r.a || k === r.b) return;
      for (const p of r.pts) if (Math.hypot(p.x - x.x, p.y - x.y) < 45) {
        errs.push(`El camino ${map.nodes[r.a].name}-${map.nodes[r.b].name} pasa por ${x.name}`);
        return;
      }
    });
    if (r.len < (map.minDist ?? 110)) errs.push(`Camino ${map.nodes[r.a].name}-${map.nodes[r.b].name} demasiado corto`);
    if (map.geo) {
      let wet = 0;
      for (const p of r.pts) if (!onLand(map.geo.land, p)) wet++;
      if (wet > 0) errs.push(`El camino ${map.nodes[r.a].name}-${map.nodes[r.b].name} pasa por el mar (${wet} puntos)`);
    }
  }
  if (map.geo) for (const n of map.nodes) if (!onLand(map.geo.land, n)) errs.push(`${n.name} está en el mar`);
  return errs;
}

