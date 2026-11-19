import { buildRoads, MAPS } from './maps';
import { shortestPath } from './path';
import type { Army, Culture, Difficulty, Faction, GameState, Squad } from './types';
import { KINDS, maxHp, recruitable, unitFor, UNITS } from './units';

export const SAVE_VERSION = 1;
export const TICK = 0.1;

export interface PlayerSetup {
  culture: Exclude<Culture, 'independientes'>;
  /** Nombre de los parámetros de IA, o null si es el jugador humano. */
  ai: string | null;
}

export interface NewGameOptions {
  seed: number;
  mapId?: string;
  difficulty?: Difficulty;
  /** Bando sur (1) y norte (2). */
  players?: [PlayerSetup, PlayerSetup];
}

const COLORS: Record<Culture, string> = {
  roma: '#b3261e',
  galos: '#2f7d3a',
  independientes: '#8a8070',
};
const NAMES: Record<Culture, string> = {
  roma: 'Roma',
  galos: 'Galos',
  independientes: 'Independientes',
};

export function factionColor(c: Culture): string {
  return COLORS[c];
}

export function newSquad(state: GameState, unit: string): Squad {
  return { id: state.nextId++, unit, hp: maxHp(unit) };
}

export function newGame(opts: NewGameOptions): GameState {
  const map = MAPS[opts.mapId ?? 'po'];
  const difficulty = opts.difficulty ?? 'normal';
  const players = opts.players ?? [
    { culture: 'roma', ai: null },
    { culture: 'galos', ai: difficulty },
  ];
  const mkFaction = (id: number, culture: Culture, ai: string | null, isPlayer: boolean): Faction => ({
    id,
    name: NAMES[culture],
    culture,
    color: COLORS[culture],
    gold: culture === 'independientes' ? 0 : 120,
    isPlayer,
    alive: true,
    ai,
    aiTimer: id * 0.37,
    stats: { recruited: 0, lost: 0, killed: 0, captured: 0 },
  });
  const state: GameState = {
    version: SAVE_VERSION,
    seed: opts.seed,
    rng: opts.seed ^ 0x9e3779b9,
    time: 0,
    tick: 0,
    mapId: map.id,
    width: map.width,
    height: map.height,
    difficulty,
    settlements: [],
    roads: buildRoads(map, opts.seed),
    armies: [],
    battles: [],
    factions: [
      mkFaction(0, 'independientes', null, false),
      mkFaction(1, players[0].culture, players[0].ai, players[0].ai === null),
      mkFaction(2, players[1].culture, players[1].ai, players[1].ai === null),
    ],
    nextId: 1,
    winner: null,
    events: [],
  };
  map.nodes.forEach((n, id) => {
    const owner = n.start;
    const culture = state.factions[owner].culture;
    const garrison: Squad[] = [];
    const roles = ['basica', 'tiradores', 'pesada'] as const;
    n.garrison.forEach((count, r) => {
      let role = roles[r];
      if (culture === 'independientes' && role === 'pesada') role = 'basica';
      for (let i = 0; i < count; i++) garrison.push(newSquad(state, unitFor(culture, role).key));
    });
    state.settlements.push({
      id,
      name: n.name,
      kind: n.kind,
      style: state.factions[n.y >= map.height / 2 ? 1 : 2].culture,
      x: n.x,
      y: n.y,
      owner,
      garrison,
      pop: Math.round(KINDS[n.kind].popMax * 0.55),
      queue: [],
      battleId: null,
      walls: KINDS[n.kind].wallHp,
    });
  });
  return state;
}

// ---------------- Órdenes ----------------

export type OrderResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): OrderResult => ({ ok: false, reason });

export function canRecruit(state: GameState, faction: number, sid: number, unit: string): OrderResult {
  const s = state.settlements[sid];
  const f = state.factions[faction];
  if (!s || !f || s.owner !== faction || !f.alive) return fail('No es tuyo');
  const u = UNITS[unit];
  if (!u || !recruitable(f.culture, s.kind).some((x) => x.key === unit)) return fail('No se puede reclutar aquí');
  if (s.queue.length >= 5) return fail('Cola llena');
  if (s.garrison.length + s.queue.length >= KINDS[s.kind].maxGarrison) return fail('Guarnición completa');
  if (f.gold < u.cost) return fail('Falta oro');
  if (s.pop < u.men) return fail('Falta población');
  return { ok: true };
}

export function recruit(state: GameState, faction: number, sid: number, unit: string): OrderResult {
  const r = canRecruit(state, faction, sid, unit);
  if (!r.ok) return r;
  const s = state.settlements[sid];
  const u = UNITS[unit];
  state.factions[faction].gold -= u.cost;
  s.pop -= u.men;
  s.queue.push({ unit, progress: 0 });
  return r;
}

export function cancelRecruit(state: GameState, faction: number, sid: number, index: number): OrderResult {
  const s = state.settlements[sid];
  if (!s || s.owner !== faction) return fail('No es tuyo');
  const q = s.queue[index];
  if (!q) return fail('No existe');
  const u = UNITS[q.unit];
  s.queue.splice(index, 1);
  state.factions[faction].gold += u.cost;
  s.pop += u.men;
  return { ok: true };
}

/** Ruta: primero solo por asentamientos propios; si no, la más corta (se detendrá en el primer enemigo). */
export function routeFor(state: GameState, faction: number, from: number, to: number): number[] | null {
  const own = shortestPath(state, from, to, faction);
  const p = own ?? shortestPath(state, from, to);
  if (!p || p.nodes.length < 2) return null;
  // Truncar en el primer asentamiento que no sea propio.
  const nodes = [p.nodes[0]];
  for (let i = 1; i < p.nodes.length; i++) {
    nodes.push(p.nodes[i]);
    if (state.settlements[p.nodes[i]].owner !== faction) break;
  }
  return nodes;
}

export function sendArmy(
  state: GameState,
  faction: number,
  from: number,
  to: number,
  squadIds?: number[],
): OrderResult & { army?: Army } {
  const s = state.settlements[from];
  if (!s || s.owner !== faction) return fail('No es tuyo');
  if (from === to) return fail('Mismo lugar');
  if (s.battleId !== null) return fail('Está bajo asedio');
  const squads = squadIds ? s.garrison.filter((q) => squadIds.includes(q.id)) : s.garrison.slice();
  if (squads.length === 0) return fail('Sin tropas');
  const nodes = routeFor(state, faction, from, to);
  if (!nodes) return fail('Sin camino');
  s.garrison = s.garrison.filter((q) => !squads.includes(q));
  const road = state.roads.find((r) => (r.a === nodes[0] && r.b === nodes[1]) || (r.b === nodes[0] && r.a === nodes[1]))!;
  const army: Army = {
    id: state.nextId++,
    owner: faction,
    squads,
    road: road.id,
    fromNode: nodes[0],
    toNode: nodes[1],
    d: 0,
    path: nodes.slice(2),
    battleId: null,
    waiting: false,
  };
  state.armies.push(army);
  return { ok: true, army };
}

export function redirectArmy(state: GameState, faction: number, armyId: number, to: number): OrderResult {
  const a = state.armies.find((x) => x.id === armyId);
  if (!a || a.owner !== faction) return fail('No es tuyo');
  if (a.battleId !== null) return fail('Está combatiendo');
  const road = state.roads[a.road];
  const fwd = a.toNode === to ? { nodes: [to], cost: road.len - a.d } : null;
  const viaTo = fwd ?? routeCost(state, faction, a.toNode, to, road.len - a.d);
  const viaFrom = a.fromNode === to ? { nodes: [to], cost: a.d } : routeCost(state, faction, a.fromNode, to, a.d);
  const best = !viaFrom || (viaTo && viaTo.cost <= viaFrom.cost) ? viaTo : viaFrom;
  if (!best) return fail('Sin camino');
  if (best === viaFrom) {
    const t = a.fromNode;
    a.fromNode = a.toNode;
    a.toNode = t;
    a.d = road.len - a.d;
  }
  a.path = best.nodes.slice(1);
  a.waiting = false;
  return { ok: true };
}

function routeCost(state: GameState, faction: number, from: number, to: number, extra: number) {
  const nodes = routeFor(state, faction, from, to);
  if (!nodes) return null;
  let cost = extra;
  for (let i = 1; i < nodes.length; i++) {
    const r = state.roads.find((x) => (x.a === nodes[i - 1] && x.b === nodes[i]) || (x.b === nodes[i - 1] && x.a === nodes[i]))!;
    cost += r.len;
  }
  return { nodes, cost };
}

export function armySpeed(a: Army): number {
  let v = Infinity;
  for (const s of a.squads) v = Math.min(v, UNITS[s.unit].speed);
  return v === Infinity ? 0 : v;
}

export function incomeOf(state: GameState, faction: number): number {
  let g = 0;
  for (const s of state.settlements) if (s.owner === faction) g += KINDS[s.kind].income;
  return g;
}
