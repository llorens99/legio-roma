import { appointGeneral, canAppointGeneral, foodBalance, GENERAL_COST, recruit, redirectArmy, sendArmy, startUpgrade } from './game';
import { distancesFrom, neighbors } from './path';
import { nextRandom } from './rng';
import type { Faction, GameState, Settlement, Squad, UnitRole } from './types';
import { KINDS, power, specialOf, statsOf, unitFor, UNITS, upgradeOptions } from './units';

export interface AiParams {
  /** Segundos entre decisiones. */
  interval: number;
  /** Ventaja de fuerza que exige para atacar. */
  margin: number;
  /** Fracción de la guarnición de la fortaleza que guarda. */
  reserve: number;
  /** Proporción deseada [básica, tiradores, pesada, caballería]. */
  mix: [number, number, number, number];
  /** No recluta pesada ni caballería hasta este momento de la partida (s). */
  heavyAfter: number;
  /** Escuadras mínimas para lanzar un ataque. */
  minSend: number;
  /** Lleva tropas de la retaguardia al frente. */
  consolidate: boolean;
  /** Socorre asentamientos asediados. */
  relieve: boolean;
  /** Distancia máxima de ataque. */
  reach: number;
  /** Cuánto de la amenaza cercana cubre con la guarnición de la fortaleza. */
  guard: number;
  guardRadius: number;
  /** Vigila la comida antes de reclutar. */
  foodAware: boolean;
  /** Ajusta la mezcla de tropas a lo que tiene el enemigo. */
  counter: boolean;
  /** Reúne tropas de varias plazas para un mismo ataque. */
  combine: boolean;
  /** Hace volver a los ejércitos en marcha si la fortaleza está amenazada. */
  recall: boolean;
  /** Mejora plazas y nombra generales con el oro que le sobra. */
  upgrades: boolean;
  /** No mejora antes de este momento (s). */
  upgradeAfter: number;
  /** Fracción del coste de la próxima mejora que ahorra antes de reclutar. */
  save: number;
}

const NORMAL: AiParams = { interval: 2, margin: 1.5, reserve: 0.5, mix: [0.4, 0.27, 0.2, 0.13], heavyAfter: 120, minSend: 2, consolidate: true, relieve: true, reach: 650, guard: 0.9, guardRadius: 500, foodAware: true, counter: false, combine: true, recall: true, upgrades: true, upgradeAfter: 120, save: 0.5 };

export const AI_PARAMS: Record<string, AiParams> = {
  // Fácil: decide despacio, no trae refuerzos, deja la fortaleza floja, no usa élite ni caballería,
  // no vigila la comida y no mejora sus plazas.
  facil: { interval: 5, margin: 1.3, reserve: 0.25, mix: [0.65, 0.3, 0.05, 0], heavyAfter: 600, minSend: 3, consolidate: false, relieve: false, reach: 450, guard: 0.3, guardRadius: 350, foodAware: false, counter: false, combine: false, recall: false, upgrades: false, upgradeAfter: 600, save: 0 },
  normal: NORMAL,
  // Difícil: no se estira (ataca solo cerca de su frente), no lanza ataques con escuadras sueltas
  // y antepone el ejército a las mejoras (solo mejora con el oro que le sobra).
  dificil: { ...NORMAL, reach: 550, minSend: 3, save: 0 },
  // Sustituto del jugador humano para las simulaciones de equilibrio (juega como la IA normal).
  jugador: { ...NORMAL },
};

const ROLES: UnitRole[] = ['basica', 'tiradores', 'pesada', 'caballeria'];

export function runAi(state: GameState, dt: number): void {
  for (const f of state.factions) {
    if (!f.ai || !f.alive) continue;
    f.aiTimer -= dt;
    if (f.aiTimer > 0) continue;
    const P = AI_PARAMS[f.ai] ?? AI_PARAMS.normal;
    f.aiTimer += P.interval * (0.75 + 0.5 * nextRandom(state));
    think(state, f, P);
  }
}

function wallMul(s: Settlement): number {
  const k = statsOf(s);
  return s.walls > 0 ? k.wall : k.breached;
}

function defenseOf(s: Settlement): number {
  if (s.garrison.length === 0) return 0;
  const k = statsOf(s);
  return power(s.garrison) * wallMul(s) + (s.walls > 0 ? k.towers * 0.6 + s.walls / 60 : 0);
}

/** Fuerza enemiga (no neutral) a menos de `radius` de un asentamiento: guarniciones y ejércitos. */
function regionalThreat(state: GameState, s: Settlement, radius: number): number {
  let p = 0;
  for (const o of state.settlements) {
    if (o.owner === s.owner || o.owner === 0) continue;
    if (Math.hypot(o.x - s.x, o.y - s.y) < radius) p += power(o.garrison);
  }
  for (const a of state.armies) {
    if (a.owner === s.owner) continue;
    const t = state.settlements[a.toNode];
    if (Math.hypot(t.x - s.x, t.y - s.y) < radius) p += power(a.squads);
  }
  return p;
}

function incomingPower(state: GameState, sid: number, owner: number, friendly: boolean): number {
  let p = 0;
  for (const a of state.armies) {
    const mine = a.owner === owner;
    if (mine !== friendly) continue;
    if (a.toNode === sid || a.path[a.path.length - 1] === sid) p += power(a.squads);
  }
  return p;
}

function isFrontier(state: GameState, s: Settlement): boolean {
  return neighbors(state, s.id).some((n) => state.settlements[n.node].owner !== s.owner);
}

export function think(state: GameState, f: Faction, P: AiParams): void {
  const own = state.settlements.filter((s) => s.owner === f.id);
  if (own.length === 0) return;

  // 1. Reclutar según la mezcla deseada.
  const counts = [0, 0, 0, 0];
  const countSquads = (sq: { unit: string }[], into = counts) => {
    for (const q of sq) into[ROLES.indexOf(UNITS[q.unit].role)]++;
  };
  for (const s of own) {
    countSquads(s.garrison);
    countSquads(s.queue);
  }
  for (const a of state.armies) if (a.owner === f.id) countSquads(a.squads);
  let mix = P.mix.slice();
  if (P.counter) {
    const enemy = [0, 0, 0, 0];
    for (const s of state.settlements) if (s.owner !== f.id && s.owner !== 0) countSquads(s.garrison, enemy);
    for (const a of state.armies) if (a.owner !== f.id) countSquads(a.squads, enemy);
    const tot = enemy.reduce((x, y) => x + y, 0) || 1;
    const e = enemy.map((x) => x / tot);
    mix[3] += 0.35 * e[1]; // contra tiradores, caballería
    mix[2] += 0.35 * e[3]; // contra caballería, pesada (lanzas)
    mix[0] += 0.15 * e[3];
    mix[1] += 0.3 * e[2]; // contra pesada, tiradores
    const sum = mix.reduce((x, y) => x + y, 0);
    mix = mix.map((x) => x / sum);
  }
  let { prod, upkeep } = foodBalance(state, f.id);
  // Ahorro para la próxima mejora si no hay peligro cerca.
  let savings = 0;
  if (P.upgrades && state.time > P.upgradeAfter && !own.some((x) => x.build) && !own.some((x) => x.battleId !== null)) {
    const fort = own.find((x) => x.kind === 'fortaleza');
    const safe = !fort || defenseOf(fort) > regionalThreat(state, fort, P.guardRadius) * 0.8;
    const next = fort ? upgradeOptions(fort)[0] : undefined;
    if (safe && next) savings = next.cost * P.save;
    else if (safe) {
      const ald = own.find((x) => x.kind === 'aldea' && !x.building);
      if (ald) savings = 120 * P.save;
    }
  }
  const sorted = own.slice().sort((a, b) => KINDS[b.kind].value - KINDS[a.kind].value);
  for (const s of sorted) {
    if (s.kind === 'fortin') continue;
    let guard = 0;
    while (s.queue.length < 2 && guard++ < 3) {
      const total = counts.reduce((x, y) => x + y, 0) + 1;
      let best = 0;
      let bestNeed = -Infinity;
      for (let r = 0; r < 4; r++) {
        const need = mix[r] * total - counts[r];
        if (need > bestNeed) {
          bestNeed = need;
          best = r;
        }
      }
      let role = ROLES[best];
      if ((role === 'pesada' || role === 'caballeria') && (s.kind !== 'fortaleza' || state.time < P.heavyAfter)) role = 'basica';
      let u = unitFor(f.culture, role);
      const sp = specialOf(f.culture);
      if (sp && s.kind === "fortaleza" && s.level >= 3 && f.gold >= sp.cost && nextRandom(state) < 0.35) u = sp;
      if (f.gold - u.cost < savings) break;
      const extra = u.upkeep * u.men;
      if (P.foodAware && prod - upkeep - extra < -0.1 && f.food < 120 + extra * 200) break;
      if (!recruit(state, f.id, s.id, u.key).ok) break;
      upkeep += extra;
      counts[ROLES.indexOf(u.role)]++;
    }
  }

  // 1b. Volver a casa si la fortaleza está amenazada.
  if (P.recall) {
    for (const fort of own) {
      if (fort.kind !== 'fortaleza') continue;
      const threat = incomingPower(state, fort.id, f.id, false);
      if (threat === 0) continue;
      let def = defenseOf(fort) + incomingPower(state, fort.id, f.id, true) * wallMul(fort);
      if (def >= threat * 1.2) continue;
      const dist = distancesFrom(state, fort.id);
      const mine = state.armies
        .filter((a) => a.owner === f.id && a.battleId === null && dist[a.toNode] < 700)
        .filter((a) => (a.path.length ? a.path[a.path.length - 1] : a.toNode) !== fort.id)
        .sort((a, b) => dist[a.toNode] - dist[b.toNode]);
      for (const a of mine) {
        if (def >= threat * 1.2) break;
        if (redirectArmy(state, f.id, a.id, fort.id).ok) def += power(a.squads) * wallMul(fort);
      }
    }
  }

  // 2. Socorro a asentamientos asediados.
  if (P.relieve) {
    for (const s of own) {
      if (s.battleId === null) continue;
      const b = state.battles.find((x) => x.id === s.battleId);
      if (!b) continue;
      let att = 0;
      for (const id of b.sides[1].armies) {
        const a = state.armies.find((x) => x.id === id);
        if (a) att += power(a.squads);
      }
      const def = defenseOf(s) + incomingPower(state, s.id, f.id, true) * wallMul(s);
      if (def >= att * 1.1) continue;
      const dist = distancesFrom(state, s.id, f.id);
      for (const o of own) {
        if (o === s || o.battleId !== null || dist[o.id] > P.reach || o.garrison.length === 0) continue;
        const keep = o.kind === 'fortaleza' ? keepFor(state, o, P) : 0;
        const send = pickSquads(o.garrison, keep);
        if (send.length) sendArmy(state, f.id, o.id, s.id, send.map((q) => q.id));
      }
    }
  }

  // 2b. Mejoras y generales con el oro que sobra.
  if (P.upgrades) {
    const reserve = 20;
    const fb = foodBalance(state, f.id);
    const options: { s: Settlement; what: string; cost: number; score: number }[] = [];
    for (const s of own) {
      if (s.build || s.battleId !== null) continue;
      for (const o of upgradeOptions(s)) {
        let score = 1;
        if (s.kind === 'fortaleza') score = 3 + (s.level === 1 ? 1 : 0);
        else if (s.kind === 'aldea') {
          if (o.what === 'granja') score = fb.prod - fb.upkeep < 1 ? 2.5 : 0.8;
          if (o.what === 'mercado') score = fb.prod - fb.upkeep >= 1 ? 2 : 0.8;
          if (o.what === 'empalizada') score = isFrontier(state, s) ? 1.6 : 0.3;
        } else if (s.kind === 'fortin') score = isFrontier(state, s) ? 1.5 : 0.4;
        options.push({ s, what: o.what, cost: o.cost, score: score * (0.8 + 0.4 * nextRandom(state)) });
      }
    }
    options.sort((a, b) => b.score - a.score);
    const o = options[0];
    if (o && f.gold >= o.cost + reserve && state.time > P.upgradeAfter) startUpgrade(state, f.id, o.s.id, o.what as never);
    const fort = own.find((s) => s.kind === 'fortaleza');
    if (fort && f.gold >= GENERAL_COST + reserve && canAppointGeneral(state, f.id, fort.id).ok) appointGeneral(state, f.id, fort.id);
  }

  // 3. Atacar.
  const pool: { s: Settlement; avail: Squad[]; dist: number[] }[] = [];
  for (const s of own) {
    if (s.battleId !== null || s.garrison.length === 0) continue;
    const keep = keepFor(state, s, P);
    const avail = pickSquads(s.garrison, keep);
    if (avail.length === 0) continue;
    const availPow = power(avail);
    const dist = distancesFrom(state, s.id, f.id);
    let best: Settlement | null = null;
    let bestScore = 0;
    for (const t of state.settlements) {
      if (t.owner === f.id || dist[t.id] > P.reach) continue;
      const enemy = t.owner !== 0;
      const need = (defenseOf(t) + incomingPower(state, t.id, t.owner, true) * wallMul(t)) * (enemy ? 1.15 : 1);
      const helping = incomingPower(state, t.id, f.id, true);
      if (availPow + helping < need * P.margin + 0.5) continue;
      if (avail.length < P.minSend && availPow < need * 2.5) continue;
      let value = KINDS[t.kind].value * (enemy ? 1.4 : 1);
      if (enemy && t.kind === 'fortaleza') value *= 2.5;
      const score = (value / (1 + dist[t.id] / 300) / (1 + need / 12)) * (0.7 + 0.6 * nextRandom(state));
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) sendArmy(state, f.id, s.id, best.id, avail.map((q) => q.id), generalFor(s, avail));
    else if (P.combine) pool.push({ s, avail, dist });
  }

  // 3b. Ataque coordinado desde varias plazas.
  if (P.combine && pool.length >= 2) {
    let best: Settlement | null = null;
    let bestScore = 0;
    let bestFrom: typeof pool = [];
    for (const t of state.settlements) {
      if (t.owner === f.id) continue;
      const from = pool.filter((p) => p.dist[t.id] <= P.reach);
      if (from.length < 2) continue;
      const sum = from.reduce((x, p) => x + power(p.avail), 0);
      const enemy = t.owner !== 0;
      const need = (defenseOf(t) + incomingPower(state, t.id, t.owner, true) * wallMul(t)) * (enemy ? 1.2 : 1);
      if (sum + incomingPower(state, t.id, f.id, true) < need * P.margin * 1.1 + 0.5) continue;
      let value = KINDS[t.kind].value * (enemy ? 1.4 : 1);
      if (enemy && t.kind === 'fortaleza') value *= 2.5;
      const far = Math.max(...from.map((p) => p.dist[t.id]));
      const score = value / (1 + far / 300) / (1 + need / 12);
      if (score > bestScore) {
        bestScore = score;
        best = t;
        bestFrom = from;
      }
    }
    if (best) for (const p of bestFrom) sendArmy(state, f.id, p.s.id, best.id, p.avail.map((q) => q.id), generalFor(p.s, p.avail));
  }

  // 4. Llevar tropas de la retaguardia al frente.
  if (P.consolidate) {
    const frontier = own.filter((s) => isFrontier(state, s));
    if (frontier.length === 0) return;
    const enemyForts = state.settlements.filter((s) => s.kind === 'fortaleza' && s.owner !== f.id && s.owner !== 0);
    for (const s of own) {
      if (s.battleId !== null || frontier.includes(s) || s.garrison.length < 2) continue;
      const keep = s.kind === 'fortaleza' ? keepFor(state, s, P) : 0;
      const send = pickSquads(s.garrison, keep);
      if (send.length < 2) continue;
      const dist = distancesFrom(state, s.id, f.id);
      let target = frontier[0];
      let bestD = Infinity;
      for (const fr of frontier) {
        let d = dist[fr.id];
        if (enemyForts.length) d += Math.min(...enemyForts.map((e) => Math.hypot(fr.x - e.x, fr.y - e.y))) * 0.5;
        if (d < bestD) {
          bestD = d;
          target = fr;
        }
      }
      if (bestD < Infinity) sendArmy(state, f.id, s.id, target.id, send.map((q) => q.id));
    }
  }
}

function keepFor(state: GameState, s: Settlement, P: AiParams): number {
  const incoming = incomingPower(state, s.id, s.owner, false);
  const wall = wallMul(s);
  if (s.kind === 'fortaleza') {
    const regional = regionalThreat(state, s, P.guardRadius);
    return Math.max(power(s.garrison) * P.reserve, (incoming * 1.2) / wall, (regional * P.guard) / wall, 1.5);
  }
  if (isFrontier(state, s)) return (incoming * 1.1) / wall;
  return 0;
}

/** Elige las escuadras que salen, guardando `keep` de fuerza (prefiere guardar tiradores). */
function pickSquads(garrison: Squad[], keep: number): Squad[] {
  if (keep <= 0) return garrison.slice();
  const order = garrison.slice().sort((a, b) => Number(UNITS[b.unit].ranged) - Number(UNITS[a.unit].ranged));
  const kept: Squad[] = [];
  let kp = 0;
  for (const q of order) {
    if (kp >= keep) break;
    kept.push(q);
    kp += power([q]);
  }
  return garrison.filter((q) => !kept.includes(q));
}

/** El general de la plaza acompaña al ataque si este es grande (al menos 4 escuadras). */
function generalFor(s: Settlement, avail: Squad[]): number | undefined {
  if (!s.generals.length || avail.length < 4) return undefined;
  return s.generals[0].id;
}
