import { recruit, sendArmy } from './game';
import { distancesFrom, neighbors } from './path';
import { nextRandom } from './rng';
import type { Faction, GameState, Settlement, Squad, UnitRole } from './types';
import { KINDS, power, unitFor, UNITS } from './units';

export interface AiParams {
  /** Segundos entre decisiones. */
  interval: number;
  /** Ventaja de fuerza que exige para atacar. */
  margin: number;
  /** Fracción de la guarnición de la fortaleza que guarda. */
  reserve: number;
  /** Proporción deseada [básica, tiradores, pesada]. */
  mix: [number, number, number];
  /** No recluta pesada hasta este minuto de partida (s). */
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
}

export const AI_PARAMS: Record<string, AiParams> = {
  // Fácil: decide despacio, no trae refuerzos, deja la fortaleza floja y apenas usa tropas de élite.
  facil: { interval: 5, margin: 1.3, reserve: 0.25, mix: [0.65, 0.3, 0.05], heavyAfter: 600, minSend: 3, consolidate: false, relieve: false, reach: 450, guard: 0.3, guardRadius: 350 },
  normal: { interval: 2, margin: 1.5, reserve: 0.5, mix: [0.45, 0.3, 0.25], heavyAfter: 120, minSend: 2, consolidate: true, relieve: true, reach: 650, guard: 0.9, guardRadius: 500 },
  // Sustituto del jugador humano para las simulaciones de equilibrio.
  jugador: { interval: 2, margin: 1.5, reserve: 0.5, mix: [0.45, 0.3, 0.25], heavyAfter: 120, minSend: 2, consolidate: true, relieve: true, reach: 650, guard: 0.9, guardRadius: 500 },
};

const ROLES: UnitRole[] = ['basica', 'tiradores', 'pesada'];

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
  const k = KINDS[s.kind];
  return s.walls > 0 ? k.wall : k.breached;
}

function defenseOf(s: Settlement): number {
  if (s.garrison.length === 0) return 0;
  const k = KINDS[s.kind];
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
  const counts = [0, 0, 0];
  const countSquads = (sq: { unit: string }[]) => {
    for (const q of sq) counts[ROLES.indexOf(UNITS[q.unit].role)]++;
  };
  for (const s of own) {
    countSquads(s.garrison);
    countSquads(s.queue);
  }
  for (const a of state.armies) if (a.owner === f.id) countSquads(a.squads);
  const sorted = own.slice().sort((a, b) => KINDS[b.kind].value - KINDS[a.kind].value);
  for (const s of sorted) {
    if (s.kind === 'fortin') continue;
    let guard = 0;
    while (s.queue.length < 2 && guard++ < 3) {
      const total = counts[0] + counts[1] + counts[2] + 1;
      let best = 0;
      let bestNeed = -Infinity;
      for (let r = 0; r < 3; r++) {
        const need = P.mix[r] * total - counts[r];
        if (need > bestNeed) {
          bestNeed = need;
          best = r;
        }
      }
      let role = ROLES[best];
      if (role === 'pesada' && (s.kind !== 'fortaleza' || state.time < P.heavyAfter)) role = 'basica';
      const u = unitFor(f.culture, role);
      if (!recruit(state, f.id, s.id, u.key).ok) break;
      counts[ROLES.indexOf(role)]++;
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

  // 3. Atacar.
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
    if (best) sendArmy(state, f.id, s.id, best.id, avail.map((q) => q.id));
  }

  // 4. Llevar tropas de la retaguardia al frente.
  if (P.consolidate) {
    const frontier = own.filter((s) => isFrontier(state, s));
    if (frontier.length === 0) return;
    const enemyFort = state.settlements.find((s) => s.kind === 'fortaleza' && s.owner !== f.id && s.owner !== 0);
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
        if (enemyFort) d += Math.hypot(fr.x - enemyFort.x, fr.y - enemyFort.y) * 0.5;
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
