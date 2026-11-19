import { buildRoads, MAPS } from './maps';
import { shortestPath } from './path';
import type { Army, Culture, Difficulty, Faction, GameState, Squad } from './types';
import { KINDS, maxHp, recruitable, totalMen, unitFor, UNITS, upkeepOf } from './units';

export const SAVE_VERSION = 2;
export const TICK = 0.1;
export const START_GOLD = 120;
export const START_FOOD = 120;
export const FOOD_CAP = 400;

export type PlayableCulture = Exclude<Culture, 'independientes'>;
export const CULTURES: PlayableCulture[] = ['roma', 'galos', 'cartago'];

export interface PlayerSetup {
  culture: PlayableCulture;
  /** Nombre de los parámetros de IA, o null si es el jugador humano. */
  ai: string | null;
}

export interface NewGameOptions {
  seed: number;
  mapId?: string;
  difficulty?: Difficulty;
  /** Un jugador por posición inicial del mapa (1…N). */
  players?: PlayerSetup[];
}

/** Colores y nombres por pueblo; si un pueblo se repite, usa el siguiente de la lista. */
const LOOKS: Record<Culture, { name: string; color: string }[]> = {
  roma: [{ name: 'Roma', color: '#b3261e' }, { name: 'Liga Latina', color: '#c9741a' }, { name: 'Campania', color: '#2b5a9b' }, { name: 'Etruria', color: '#8b4a2b' }],
  galos: [{ name: 'Galos', color: '#2f7d3a' }, { name: 'Helvecios', color: '#1f6f8b' }, { name: 'Belgas', color: '#7a8a1f' }, { name: 'Arvernos', color: '#a0522d' }],
  cartago: [{ name: 'Cartago', color: '#6b3fa0' }, { name: 'Numidia', color: '#b0892a' }, { name: 'Mauretania', color: '#2a7f78' }, { name: 'Gétulos', color: '#9b3b6b' }],
  independientes: [{ name: 'Independientes', color: '#8a8070' }],
};

export const CULTURE_NAMES: Record<Culture, string> = { roma: 'Roma', galos: 'Galos', cartago: 'Cartago', independientes: 'Independientes' };

export function newSquad(state: GameState, unit: string): Squad {
  return { id: state.nextId++, unit, hp: maxHp(unit) };
}

/** Jugadores por defecto: el humano con su pueblo y rivales con los demás pueblos en orden. */
export function defaultPlayers(n: number, culture: PlayableCulture, difficulty: string, seed = 0): PlayerSetup[] {
  const others = CULTURES.filter((c) => c !== culture);
  if (n === 2) return [{ culture, ai: null }, { culture: others[Math.abs(seed) % others.length], ai: difficulty }];
  const out: PlayerSetup[] = [{ culture, ai: null }];
  // Primero los otros pueblos; si hacen falta más, otro bando del propio pueblo del jugador y luego repetir.
  const order = [...others, culture];
  for (let i = 1; i < n; i++) out.push({ culture: order[(i - 1) % order.length], ai: difficulty });
  return out;
}

/** Nombres que tendrán los bandos (el segundo de un mismo pueblo usa otro nombre). */
export function factionNames(players: PlayerSetup[]): string[] {
  const used: Record<string, number> = {};
  return players.map((p) => {
    const k = used[p.culture] ?? 0;
    used[p.culture] = k + 1;
    return LOOKS[p.culture][k % LOOKS[p.culture].length].name;
  });
}

export function newGame(opts: NewGameOptions): GameState {
  const map = MAPS[opts.mapId ?? 'po'];
  const difficulty = opts.difficulty ?? 'normal';
  const players = opts.players ?? defaultPlayers(map.players, 'roma', difficulty, opts.seed);
  if (players.length !== map.players) throw new Error(`El mapa ${map.id} es para ${map.players} jugadores`);
  const used: Record<string, number> = {};
  const mkFaction = (id: number, culture: Culture, ai: string | null, isPlayer: boolean): Faction => {
    const k = used[culture] ?? 0;
    used[culture] = k + 1;
    const look = LOOKS[culture][k % LOOKS[culture].length];
    return {
      id,
      name: look.name,
      culture,
      color: look.color,
      gold: culture === 'independientes' ? 0 : START_GOLD,
      food: culture === 'independientes' ? 0 : START_FOOD,
      starving: false,
      isPlayer,
      alive: true,
      ai,
      aiTimer: id * 0.37,
      stats: { recruited: 0, lost: 0, killed: 0, captured: 0 },
    };
  };
  const factions: Faction[] = [mkFaction(0, 'independientes', null, false)];
  players.forEach((p, i) => factions.push(mkFaction(i + 1, p.culture, p.ai, p.ai === null)));
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
    factions,
    nextId: 1,
    winner: null,
    events: [],
  };
  const forts = map.nodes.filter((n) => n.kind === 'fortaleza' && n.start > 0);
  map.nodes.forEach((n, id) => {
    const owner = n.start;
    const culture = state.factions[owner].culture;
    const garrison: Squad[] = [];
    const roles = ['basica', 'tiradores', 'pesada'] as const;
    n.garrison.forEach((count, r) => {
      let role: (typeof roles)[number] = roles[r];
      if (culture === 'independientes' && role === 'pesada') role = 'basica';
      for (let i = 0; i < count; i++) garrison.push(newSquad(state, unitFor(culture, role).key));
    });
    // Estilo: el del pueblo cuya fortaleza inicial está más cerca.
    let nearest = forts[0];
    for (const f of forts) if (Math.hypot(f.x - n.x, f.y - n.y) < Math.hypot(nearest.x - n.x, nearest.y - n.y) - 1) nearest = f;
    state.settlements.push({
      id,
      name: n.name,
      kind: n.kind,
      style: state.factions[nearest.start].culture,
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
  if (f.starving) return fail('Sin comida');
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

/** Comida: producción menos mantenimiento de todas las tropas. */
export function foodBalance(state: GameState, faction: number): { prod: number; upkeep: number } {
  let prod = 0;
  let upkeep = 0;
  for (const s of state.settlements) {
    if (s.owner !== faction) continue;
    prod += KINDS[s.kind].food;
    upkeep += upkeepOf(s.garrison);
  }
  for (const a of state.armies) if (a.owner === faction) upkeep += upkeepOf(a.squads);
  return { prod, upkeep };
}

/** Licencia escuadras de la guarnición: sus hombres vuelven a la población. */
export function disband(state: GameState, faction: number, sid: number, squadIds: number[]): OrderResult {
  const s = state.settlements[sid];
  if (!s || s.owner !== faction) return fail('No es tuyo');
  if (s.battleId !== null) return fail('Está bajo asedio');
  const out = s.garrison.filter((q) => squadIds.includes(q.id));
  if (!out.length) return fail('Nada que licenciar');
  s.garrison = s.garrison.filter((q) => !out.includes(q));
  s.pop = Math.min(KINDS[s.kind].popMax, s.pop + totalMen(out));
  return { ok: true };
}

export function incomeOf(state: GameState, faction: number): number {
  let g = 0;
  for (const s of state.settlements) if (s.owner === faction) g += KINDS[s.kind].income;
  return g;
}
