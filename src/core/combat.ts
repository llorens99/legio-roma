import { generalBonus, GENERAL_XP, routeFor } from './game';
import { pointOnRoad } from './maps';
import { distancesFrom } from './path';
import type { Army, Battle, GameState, General, Squad } from './types';
import { menOf, statsOf, UNITS } from './units';

/** Constante global de daño (ritmo de las batallas). */
export const DMG_K = 0.3;
/** Bonificación de los tiradores que defienden desde murallas. */
export const WALL_RANGED_BONUS = 1.3;
/** Distancia a la que dos ejércitos se encuentran en un camino. */
export const MEET_DIST = 14;
/** Daño a la muralla por hombre cuerpo a cuerpo y segundo. */
export const WALL_DMG = 0.12;
/** Eficacia de la guarnición cuerpo a cuerpo mientras los muros aguantan (tiran piedras). */
export const WALL_MELEE_DEF = 0.3;
/** Un ejército huye si le queda menos de esta fracción de su fuerza máxima en la batalla… */
export const ROUT_FRAC = 0.38;
/** …y el enemigo es al menos tantas veces más fuerte. */
export const ROUT_RATIO = 1.5;
/** Vida que pierde cada escuadra al huir (persecución). */
export const PURSUIT = 0.12;

export function armyS(state: GameState, a: Army): number {
  const r = state.roads[a.road];
  return a.fromNode === r.a ? a.d : r.len - a.d;
}

export function sideSquads(state: GameState, b: Battle, i: number): Squad[] {
  const side = b.sides[i];
  const out: Squad[] = [];
  if (side.garrison && b.settlement !== null) out.push(...state.settlements[b.settlement].garrison);
  for (const id of side.armies) {
    const a = state.armies.find((x) => x.id === id);
    if (a) out.push(...a.squads);
  }
  return out;
}

/** Generales presentes en un bando de la batalla. */
export function sideGenerals(state: GameState, b: Battle, i: number): General[] {
  const side = b.sides[i];
  const out: General[] = [];
  if (side.garrison && b.settlement !== null) out.push(...state.settlements[b.settlement].generals);
  for (const id of side.armies) {
    const a = state.armies.find((x) => x.id === id);
    if (a?.general) out.push(a.general);
  }
  return out;
}

function hpOf(list: Squad[]): number {
  let h = 0;
  for (const q of list) h += q.hp;
  return h;
}

export function startSiege(state: GameState, a: Army, sid: number): Battle {
  const s = state.settlements[sid];
  const b: Battle = {
    id: state.nextId++,
    x: s.x,
    y: s.y,
    settlement: sid,
    road: null,
    s: 0,
    sides: [
      { faction: s.owner, armies: [], garrison: true, peak: 0 },
      { faction: a.owner, armies: [a.id], garrison: false, peak: 0 },
    ],
    time: 0,
  };
  s.battleId = b.id;
  a.battleId = b.id;
  a.waiting = false;
  state.battles.push(b);
  state.events.push({ type: 'battle', battle: b.id, x: b.x, y: b.y, factions: [s.owner, a.owner] });
  return b;
}

export function startFieldBattle(state: GameState, a: Army, o: Army): Battle {
  const r = state.roads[a.road];
  const s = (armyS(state, a) + armyS(state, o)) / 2;
  const p = pointOnRoad(r, s);
  const b: Battle = {
    id: state.nextId++,
    x: p.x,
    y: p.y,
    settlement: null,
    road: r.id,
    s,
    sides: [
      { faction: a.owner, armies: [a.id], garrison: false, peak: 0 },
      { faction: o.owner, armies: [o.id], garrison: false, peak: 0 },
    ],
    time: 0,
  };
  a.battleId = b.id;
  o.battleId = b.id;
  state.battles.push(b);
  state.events.push({ type: 'battle', battle: b.id, x: b.x, y: b.y, factions: [a.owner, o.owner] });
  return b;
}

/** Mete un ejército en la guarnición de un asentamiento propio (con su general). */
export function mergeIntoGarrison(state: GameState, a: Army, sid: number): void {
  const s = state.settlements[sid];
  s.garrison.push(...a.squads);
  if (a.general) s.generals.push(a.general);
  a.general = null;
  removeArmy(state, a.id);
}

/** Une un ejército a una batalla en la que participa su bando. Devuelve false si no puede. */
export function joinBattle(state: GameState, b: Battle, a: Army): boolean {
  const side = b.sides.find((s) => s.faction === a.owner);
  if (!side) return false;
  if (side.garrison && b.settlement !== null) {
    mergeIntoGarrison(state, a, b.settlement);
    return true;
  }
  side.armies.push(a.id);
  a.battleId = b.id;
  a.waiting = false;
  a.retreating = false;
  return true;
}

export function removeArmy(state: GameState, id: number): void {
  const i = state.armies.findIndex((x) => x.id === id);
  if (i >= 0) state.armies.splice(i, 1);
  for (const b of state.battles) for (const s of b.sides) s.armies = s.armies.filter((x) => x !== id);
}

/** Un ejército destruido: su general muere. */
export function destroyArmy(state: GameState, a: Army): void {
  if (a.general) state.events.push({ type: 'general-died', faction: a.owner, name: a.general.name });
  a.general = null;
  removeArmy(state, a.id);
}

/**
 * Saca a un ejército de su batalla y lo hace volver a la plaza propia más cercana.
 * `pursuit` es la fracción de vida que pierde al huir.
 */
export function retreatArmy(state: GameState, a: Army, pursuit: number, ordered: boolean): void {
  const b = state.battles.find((x) => x.id === a.battleId);
  for (const sq of a.squads) sq.hp *= 1 - pursuit;
  a.squads = a.squads.filter((q) => menOf(q) > 0);
  if (b) for (const s of b.sides) s.armies = s.armies.filter((x) => x !== a.id);
  a.battleId = null;
  a.waiting = false;
  if (!a.squads.length) {
    destroyArmy(state, a);
    return;
  }
  // Media vuelta en el camino.
  const r = state.roads[a.road];
  const from = a.fromNode;
  a.fromNode = a.toNode;
  a.toNode = from;
  a.d = Math.max(0, r.len - a.d);
  a.retreating = true;
  // Volver a la plaza propia más cercana desde el nodo al que ahora se dirige.
  const dist = distancesFrom(state, a.toNode, a.owner);
  let best = -1;
  for (const s of state.settlements) if (s.owner === a.owner && dist[s.id] < Infinity && (best < 0 || dist[s.id] < dist[best])) best = s.id;
  a.path = [];
  if (best >= 0 && best !== a.toNode) {
    const nodes = routeFor(state, a.owner, a.toNode, best);
    if (nodes) a.path = nodes.slice(1);
  }
  const p = pointOnRoad(r, armyS(state, a));
  state.events.push({ type: 'rout', faction: a.owner, x: p.x, y: p.y, ordered });
}

export function stepBattle(state: GameState, b: Battle, dt: number): void {
  const lists = [sideSquads(state, b, 0), sideSquads(state, b, 1)];
  if (lists[0].length === 0 || lists[1].length === 0) {
    resolveBattle(state, b, lists[1].length === 0 ? 0 : 1);
    return;
  }
  const sett = b.settlement !== null ? state.settlements[b.settlement] : null;
  const di = sett ? (b.sides[0].garrison ? 0 : 1) : -1;
  const k = sett ? statsOf(sett) : null;
  const wallsUp = !!sett && sett.walls > 0;
  const mul = [1, 1];
  if (sett && k) mul[di] = wallsUp ? k.wall : k.breached;
  // Generales y auras.
  const gens = [sideGenerals(state, b, 0), sideGenerals(state, b, 1)];
  const gb = gens.map((g) => Math.max(1, ...g.map((x) => generalBonus(x))));
  const aura = lists.map((l) => {
    let a = 0;
    for (const q of l) a += (UNITS[q.unit].aura ?? 0) * (menOf(q) > 0 ? 1 : 0);
    return 1 + Math.min(0.3, a);
  });
  const acc = new Map<Squad, number>();
  const killer = new Map<Squad, number>();
  let wallDmg = 0;
  for (let i = 0; i < 2; i++) {
    const enemies = lists[1 - i];
    const front = enemies.filter((q) => !UNITS[q.unit].ranged);
    const back = enemies.filter((q) => UNITS[q.unit].ranged);
    let meleeIdx = 0;
    let cavIdx = 0;
    for (const sq of lists[i]) {
      const u = UNITS[sq.unit];
      const men = menOf(sq);
      if (men <= 0) continue;
      if (wallsUp && i !== di && !u.ranged) {
        // Los asaltantes cuerpo a cuerpo golpean la muralla.
        wallDmg += men * WALL_DMG * dt * u.wallDmg;
        continue;
      }
      let pool: Squad[];
      let idx: number;
      if (u.ranged) {
        pool = enemies;
        idx = (sq.id * 7 + Math.floor(b.time / 3)) % pool.length;
      } else if (u.role === 'caballeria' && back.length && !(sett && i === di)) {
        // La caballería flanquea y busca a los tiradores.
        pool = back;
        idx = (cavIdx++ + sq.id) % pool.length;
      } else {
        pool = front.length ? front : enemies;
        idx = meleeIdx++ % pool.length;
      }
      const tgt = pool[idx];
      const tu = UNITS[tgt.unit];
      let a = men * u.atk * DMG_K * dt * (u.vs[tu.role] ?? 1) * gb[i] * aura[i];
      if (wallsUp && i === di) a *= u.ranged ? WALL_RANGED_BONUS : WALL_MELEE_DEF;
      acc.set(tgt, (acc.get(tgt) ?? 0) + a / (tu.def * mul[1 - i] * gb[1 - i]));
      killer.set(tgt, i);
    }
  }
  // Torres de la muralla: disparan mientras la muralla aguanta.
  if (sett && k && wallsUp && k.towers > 0) {
    const targets = lists[1 - di];
    const tgt = targets[Math.floor(b.time / 2) % targets.length];
    const a = k.towers * DMG_K * dt * WALL_RANGED_BONUS;
    acc.set(tgt, (acc.get(tgt) ?? 0) + a / (UNITS[tgt.unit].def * gb[1 - di]));
    killer.set(tgt, di);
  }
  if (sett && wallsUp && wallDmg > 0) {
    sett.walls = Math.max(0, sett.walls - wallDmg);
    if (sett.walls === 0) state.events.push({ type: 'breach', settlement: sett.id });
  }
  for (const [sq, d] of acc) {
    const before = menOf(sq);
    sq.hp = Math.max(0, sq.hp - d);
    const lost = before - menOf(sq);
    if (lost > 0) {
      const ki = killer.get(sq)!;
      const victimFaction = b.sides[1 - ki].faction;
      const killerFaction = b.sides[ki].faction;
      state.factions[victimFaction].stats.lost += lost;
      state.factions[killerFaction].stats.killed += lost;
      for (const g of gens[ki]) gainXp(state, g, lost);
    }
  }
  // Retirar muertos.
  if (sett) sett.garrison = sett.garrison.filter((q) => q.hp > 0.01);
  for (const side of b.sides) {
    for (const id of side.armies.slice()) {
      const a = state.armies.find((x) => x.id === id);
      if (!a) continue;
      a.squads = a.squads.filter((q) => q.hp > 0.01);
      if (a.squads.length === 0) destroyArmy(state, a);
    }
  }
  b.time += dt;
  // Moral: un bando muy castigado frente a un enemigo mucho más fuerte huye (las guarniciones no).
  const now = [sideSquads(state, b, 0), sideSquads(state, b, 1)];
  const hp = now.map(hpOf);
  for (let i = 0; i < 2; i++) b.sides[i].peak = Math.max(b.sides[i].peak, hp[i]);
  if (b.time < 3) return;
  for (let i = 0; i < 2; i++) {
    const side = b.sides[i];
    if (side.garrison || !side.armies.length || hp[i] <= 0) continue;
    const bestGen = Math.max(0, ...gens[i].map((g) => g.level));
    const frac = ROUT_FRAC - 0.04 * bestGen;
    if (hp[i] < side.peak * frac && hp[1 - i] > hp[i] * ROUT_RATIO) {
      for (const id of side.armies.slice()) {
        const a = state.armies.find((x) => x.id === id);
        if (a) retreatArmy(state, a, PURSUIT, false);
      }
      break;
    }
  }
}

function gainXp(state: GameState, g: General, xp: number): void {
  g.xp += xp;
  while (g.level < GENERAL_XP.length && g.xp >= GENERAL_XP[g.level]) {
    g.level++;
    state.events.push({ type: 'general-level', faction: g.owner, name: g.name, level: g.level });
  }
}

export function resolveBattle(state: GameState, b: Battle, winner: number): void {
  const wSide = b.sides[winner];
  if (b.settlement !== null) {
    const s = state.settlements[b.settlement];
    if (!wSide.garrison) {
      const from = s.owner;
      // Los generales que defendían caen con la plaza.
      for (const g of s.generals) state.events.push({ type: 'general-died', faction: g.owner, name: g.name });
      s.generals = [];
      s.garrison = [];
      s.owner = wSide.faction;
      for (const id of wSide.armies.slice()) {
        const a = state.armies.find((x) => x.id === id);
        if (a) mergeIntoGarrison(state, a, s.id);
      }
      s.pop = Math.floor(s.pop * 0.5);
      s.queue = [];
      s.build = null;
      state.factions[wSide.faction].stats.captured++;
      state.events.push({ type: 'capture', settlement: s.id, faction: wSide.faction, from });
    } else {
      // Los atacantes que queden (si los hay) se retiran destruidos.
      for (const id of b.sides[1 - winner].armies.slice()) {
        const a = state.armies.find((x) => x.id === id);
        if (a) destroyArmy(state, a);
      }
      state.events.push({ type: 'repelled', settlement: s.id, faction: s.owner, attacker: b.sides[1 - winner].faction });
    }
    s.battleId = null;
  } else {
    for (const id of wSide.armies) {
      const a = state.armies.find((x) => x.id === id);
      if (a) a.battleId = null;
    }
    for (const id of b.sides[1 - winner].armies.slice()) {
      const a = state.armies.find((x) => x.id === id);
      if (a) destroyArmy(state, a);
    }
    state.events.push({ type: 'field-win', battle: b.id, faction: wSide.faction, loser: b.sides[1 - winner].faction, x: b.x, y: b.y });
  }
  const i = state.battles.indexOf(b);
  if (i >= 0) state.battles.splice(i, 1);
}

/** Orden de retirada del jugador: sale de la batalla perdiendo algo menos que en una huida. */
export function orderRetreat(state: GameState, faction: number, armyId: number): { ok: boolean; reason?: string } {
  const a = state.armies.find((x) => x.id === armyId);
  if (!a || a.owner !== faction) return { ok: false, reason: 'No es tuyo' };
  if (a.battleId === null) return { ok: false, reason: 'No está combatiendo' };
  retreatArmy(state, a, PURSUIT * 0.6, true);
  return { ok: true };
}
