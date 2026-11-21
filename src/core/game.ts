import { buildRoads, MAPS } from './maps';
import { shortestPath } from './path';
import type { Army, Build, Culture, Difficulty, Faction, GameState, General, Squad } from './types';
import { KINDS, maxHp, recruitable, statsOf, totalMen, unitFor, UNITS, upkeepOf, upgradeOptions } from './units';

export const SAVE_VERSION = 4;
export const TICK = 0.1;
export const START_GOLD = 120;
export const START_FOOD = 120;
export const FOOD_CAP = 400;

export type PlayableCulture = Exclude<Culture, 'independientes'>;
export const CULTURES: PlayableCulture[] = ['roma', 'galos', 'cartago', 'griegos'];

export interface PlayerSetup {
  culture: PlayableCulture;
  /** Nombre de los parámetros de IA, o null si es el jugador humano. */
  ai: string | null;
  /** Nombre y color propios (escenarios); si no, los de `LOOKS`. */
  name?: string;
  color?: string;
  /** Plazas iniciales por nombre (escenarios). La primera fortaleza de la lista es su capital. */
  owns?: string[];
  /** Nivel inicial de sus fortalezas y generales veteranos (campaña). */
  fortLevel?: number;
  generals?: { name: string; level: number; xp: number }[];
  gold?: number;
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
  griegos: [{ name: 'Macedonia', color: '#2a4d9b' }, { name: 'Atenas', color: '#3b8fc0' }, { name: 'Seléucidas', color: '#8a6d1d' }, { name: 'Esparta', color: '#7a1f2b' }],
  independientes: [{ name: 'Independientes', color: '#8a8070' }],
};

export const CULTURE_NAMES: Record<Culture, string> = { roma: 'Roma', galos: 'Galos', cartago: 'Cartago', griegos: 'Griegos', independientes: 'Independientes' };

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
  const custom = players.some((p) => p.owns);
  if (!custom && players.length !== map.players) throw new Error(`El mapa ${map.id} es para ${map.players} jugadores`);
  // Escenario: reasignar las plazas iniciales por nombre.
  let nodes = map.nodes;
  if (custom) {
    const IND: Record<string, [number, number, number]> = { fortaleza: [5, 3, 0], aldea: [2, 1, 0], fortin: [3, 2, 0] };
    nodes = map.nodes.map((n) => ({ ...n, start: 0, garrison: map.geo ? IND[n.kind] : n.garrison }));
    players.forEach((p, i) => {
      for (const name of p.owns ?? []) {
        const n = nodes.find((x) => x.name === name);
        if (!n) throw new Error(`Plaza desconocida ${name} en ${map.id}`);
        n.start = i + 1;
        n.garrison = n.kind === 'fortaleza' ? [3, 2, 0] : [1, 0, 0];
      }
    });
  }
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
  players.forEach((p, i) => {
    const f = mkFaction(i + 1, p.culture, p.ai, p.ai === null);
    if (p.name) f.name = p.name;
    if (p.color) f.color = p.color;
    if (p.gold !== undefined) f.gold = p.gold;
    factions.push(f);
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
    factions,
    nextId: 1,
    winner: null,
    events: [],
  };
  const forts = nodes.filter((n) => n.kind === 'fortaleza' && n.start > 0);
  nodes.forEach((n, id) => {
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
    let nearest = forts[0] ?? n;
    for (const f of forts) if (Math.hypot(f.x - n.x, f.y - n.y) < Math.hypot(nearest.x - n.x, nearest.y - n.y) - 1) nearest = f;
    state.settlements.push({
      id,
      name: n.name,
      kind: n.kind,
      style: n.style ?? state.factions[nearest.start].culture,
      x: n.x,
      y: n.y,
      owner,
      garrison,
      pop: Math.round(KINDS[n.kind].popMax * 0.55),
      queue: [],
      battleId: null,
      walls: KINDS[n.kind].wallHp,
      level: 1,
      building: null,
      build: null,
      generals: [],
    });
  });
  // Cada pueblo empieza con un general en su fortaleza (o con sus veteranos de campaña).
  for (const f of state.factions) {
    if (f.id === 0) continue;
    const setup = players[f.id - 1];
    const capName = setup.owns?.find((n) => nodes.find((x) => x.name === n)?.kind === 'fortaleza');
    const fort = state.settlements.find((x) => x.owner === f.id && x.kind === 'fortaleza' && (!capName || x.name === capName));
    if (!fort) continue;
    if (setup.fortLevel && setup.fortLevel > 1) {
      fort.level = Math.min(3, setup.fortLevel);
      fort.walls = statsOf(fort).wallHp;
    }
    if (setup.generals?.length) for (const g of setup.generals) fort.generals.push({ id: state.nextId++, name: g.name, owner: f.id, level: g.level, xp: g.xp });
    else fort.generals.push(newGeneral(state, f.id));
  }
  return state;
}

// ---------------- Generales ----------------

const GENERAL_NAMES: Record<Culture, string[]> = {
  roma: ['Escipión', 'Marcelo', 'Fabio', 'Emilio Paulo', 'Claudio Nerón', 'Flaminino', 'Catón', 'Mario'],
  galos: ['Breno', 'Vercingétorix', 'Ambiórix', 'Dumnórix', 'Comio', 'Indutiomaro', 'Lucterio', 'Correo'],
  cartago: ['Aníbal', 'Asdrúbal', 'Magón', 'Amílcar', 'Hannón', 'Maharbal', 'Himilcón', 'Bomílcar'],
  griegos: ['Filipo', 'Alejandro', 'Antígono', 'Ptolomeo', 'Seleuco', 'Pirro', 'Demetrio', 'Perseo'],
  independientes: ['Caudillo'],
};

export const GENERAL_COST = 200;
/** Experiencia (enemigos abatidos por su bando) para cada nivel. */
export const GENERAL_XP = [0, 40, 100, 180, 280];

export function newGeneral(state: GameState, owner: number): General {
  const f = state.factions[owner];
  const names = GENERAL_NAMES[f.culture];
  const used = new Set<string>();
  for (const s of state.settlements) for (const g of s.generals) used.add(g.name);
  for (const a of state.armies) if (a.general) used.add(a.general.name);
  let name = names.find((n) => !used.has(n));
  if (!name) name = `${names[state.nextId % names.length]} ${['II', 'III', 'IV'][state.nextId % 3]}`;
  return { id: state.nextId++, name, owner, level: 1, xp: 0 };
}

/** Bonificación de un general: multiplicador de ataque y defensa. */
export function generalBonus(g: General | null | undefined): number {
  return g ? 1.08 + 0.04 * (g.level - 1) : 1;
}

export function generalsOf(state: GameState, faction: number): General[] {
  const out: General[] = [];
  for (const s of state.settlements) for (const g of s.generals) if (g.owner === faction) out.push(g);
  for (const a of state.armies) if (a.general && a.owner === faction) out.push(a.general);
  return out;
}

/** Generales que puede tener un bando: 1 + uno por cada nivel extra de sus fortalezas. */
export function maxGenerals(state: GameState, faction: number): number {
  let n = 1;
  for (const s of state.settlements) if (s.owner === faction && s.kind === 'fortaleza') n += s.level - 1;
  return n;
}

export function canAppointGeneral(state: GameState, faction: number, sid: number): OrderResult {
  const s = state.settlements[sid];
  if (!s || s.owner !== faction || s.kind !== 'fortaleza') return fail('Solo en fortalezas');
  if (generalsOf(state, faction).length >= maxGenerals(state, faction)) return fail('Mejora la fortaleza para tener más');
  if (state.factions[faction].gold < GENERAL_COST) return fail('Falta oro');
  return { ok: true };
}

export function appointGeneral(state: GameState, faction: number, sid: number): OrderResult {
  const r = canAppointGeneral(state, faction, sid);
  if (!r.ok) return r;
  state.factions[faction].gold -= GENERAL_COST;
  state.settlements[sid].generals.push(newGeneral(state, faction));
  return r;
}

// ---------------- Mejoras ----------------

export function canUpgrade(state: GameState, faction: number, sid: number, what: Build['what']): OrderResult {
  const s = state.settlements[sid];
  if (!s || s.owner !== faction) return fail('No es tuyo');
  if (s.build) return fail('Ya hay una obra');
  if (s.battleId !== null) return fail('Está bajo asedio');
  const opt = upgradeOptions(s).find((o) => o.what === what);
  if (!opt) return fail('No disponible');
  if (state.factions[faction].gold < opt.cost) return fail('Falta oro');
  return { ok: true };
}

export function startUpgrade(state: GameState, faction: number, sid: number, what: Build['what']): OrderResult {
  const r = canUpgrade(state, faction, sid, what);
  if (!r.ok) return r;
  const s = state.settlements[sid];
  const opt = upgradeOptions(s).find((o) => o.what === what)!;
  state.factions[faction].gold -= opt.cost;
  s.build = { what, progress: 0, time: opt.time };
  return r;
}

// ---------------- Órdenes ----------------

export type OrderResult = { ok: true } | { ok: false; reason: string };

const fail = (reason: string): OrderResult => ({ ok: false, reason });

export function canRecruit(state: GameState, faction: number, sid: number, unit: string): OrderResult {
  const s = state.settlements[sid];
  const f = state.factions[faction];
  if (!s || !f || s.owner !== faction || !f.alive) return fail('No es tuyo');
  const u = UNITS[unit];
  if (!u || !recruitable(f.culture, s.kind, s.level).some((x) => x.key === unit)) return fail('No se puede reclutar aquí');
  if (s.queue.length >= 5) return fail('Cola llena');
  if (s.garrison.length + s.queue.length >= statsOf(s).maxGarrison) return fail('Guarnición completa');
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
  generalId?: number,
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
    general: null,
    retreating: false,
  };
  if (generalId !== undefined) {
    const gi = s.generals.findIndex((g) => g.id === generalId);
    if (gi >= 0) army.general = s.generals.splice(gi, 1)[0];
  }
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
    prod += statsOf(s).food;
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
  s.pop = Math.min(statsOf(s).popMax, s.pop + totalMen(out));
  return { ok: true };
}

export function incomeOf(state: GameState, faction: number): number {
  let g = 0;
  for (const s of state.settlements) if (s.owner === faction) g += statsOf(s).income;
  return g;
}
