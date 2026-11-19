import type { GameState, Road } from './types';

export function roadBetween(state: GameState, a: number, b: number): Road | undefined {
  return state.roads.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

export function neighbors(state: GameState, n: number): { node: number; road: Road }[] {
  const out: { node: number; road: Road }[] = [];
  for (const r of state.roads) {
    if (r.a === n) out.push({ node: r.b, road: r });
    else if (r.b === n) out.push({ node: r.a, road: r });
  }
  return out;
}

/**
 * Camino más corto de `from` a `to`. Si `passOwner` se indica, solo se puede pasar
 * por asentamientos de ese dueño (el destino puede ser de cualquiera).
 * Devuelve la lista de nodos incluyendo origen y destino, o null.
 */
export function shortestPath(
  state: GameState,
  from: number,
  to: number,
  passOwner?: number,
): { nodes: number[]; dist: number } | null {
  const n = state.settlements.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) return null;
    if (u === to) break;
    done[u] = true;
    if (u !== from && passOwner !== undefined && state.settlements[u].owner !== passOwner) continue;
    for (const { node, road } of neighbors(state, u)) {
      const nd = dist[u] + road.len;
      if (nd < dist[node]) {
        dist[node] = nd;
        prev[node] = u;
      }
    }
  }
  const nodes: number[] = [];
  for (let v = to; v >= 0; v = prev[v]) nodes.unshift(v);
  return { nodes, dist: dist[to] };
}

/** Distancias desde un nodo a todos (pasando solo por nodos de passOwner, si se da). */
export function distancesFrom(state: GameState, from: number, passOwner?: number): number[] {
  const n = state.settlements.length;
  const dist = new Array<number>(n).fill(Infinity);
  const done = new Array<boolean>(n).fill(false);
  dist[from] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = true;
    if (u !== from && passOwner !== undefined && state.settlements[u].owner !== passOwner) continue;
    for (const { node, road } of neighbors(state, u)) {
      const nd = dist[u] + road.len;
      if (nd < dist[node]) dist[node] = nd;
    }
  }
  return dist;
}
