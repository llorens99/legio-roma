import { pointOnRoad } from './maps';
import type { Army, Battle, GameState, Squad } from './types';
import { KINDS, menOf, UNITS } from './units';

/** Constante global de daño (ritmo de las batallas). */
export const DMG_K = 0.3;
/** Bonificación de los tiradores que defienden desde murallas. */
export const WALL_RANGED_BONUS = 1.3;
/** Distancia a la que dos ejércitos se encuentran en un camino. */
export const MEET_DIST = 14;

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
      { faction: s.owner, armies: [], garrison: true },
      { faction: a.owner, armies: [a.id], garrison: false },
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
      { faction: a.owner, armies: [a.id], garrison: false },
      { faction: o.owner, armies: [o.id], garrison: false },
    ],
    time: 0,
  };
  a.battleId = b.id;
  o.battleId = b.id;
  state.battles.push(b);
  state.events.push({ type: 'battle', battle: b.id, x: b.x, y: b.y, factions: [a.owner, o.owner] });
  return b;
}

/** Une un ejército a una batalla en la que participa su bando. Devuelve false si no puede. */
export function joinBattle(state: GameState, b: Battle, a: Army): boolean {
  const side = b.sides.find((s) => s.faction === a.owner);
  if (!side) return false;
  if (side.garrison && b.settlement !== null) {
    state.settlements[b.settlement].garrison.push(...a.squads);
    removeArmy(state, a.id);
    return true;
  }
  side.armies.push(a.id);
  a.battleId = b.id;
  a.waiting = false;
  return true;
}

export function removeArmy(state: GameState, id: number): void {
  const i = state.armies.findIndex((x) => x.id === id);
  if (i >= 0) state.armies.splice(i, 1);
  for (const b of state.battles) for (const s of b.sides) s.armies = s.armies.filter((x) => x !== id);
}

/** Daño a la muralla por hombre cuerpo a cuerpo y segundo. */
export const WALL_DMG = 0.12;
/** Eficacia de la guarnición cuerpo a cuerpo mientras los muros aguantan (tiran piedras). */
export const WALL_MELEE_DEF = 0.3;

export function stepBattle(state: GameState, b: Battle, dt: number): void {
  const lists = [sideSquads(state, b, 0), sideSquads(state, b, 1)];
  if (lists[0].length === 0 || lists[1].length === 0) {
    resolveBattle(state, b, lists[1].length === 0 ? 0 : 1);
    return;
  }
  const sett = b.settlement !== null ? state.settlements[b.settlement] : null;
  const di = sett ? (b.sides[0].garrison ? 0 : 1) : -1;
  const k = sett ? KINDS[sett.kind] : null;
  const wallsUp = !!sett && sett.walls > 0;
  const mul = [1, 1];
  if (sett && k) mul[di] = wallsUp ? k.wall : k.breached;
  const acc = new Map<Squad, number>();
  const killer = new Map<Squad, number>();
  let wallDmg = 0;
  for (let i = 0; i < 2; i++) {
    const enemies = lists[1 - i];
    const front = enemies.filter((q) => !UNITS[q.unit].ranged);
    let meleeIdx = 0;
    for (const sq of lists[i]) {
      const u = UNITS[sq.unit];
      const men = menOf(sq);
      if (men <= 0) continue;
      if (wallsUp && i !== di && !u.ranged) {
        // Los asaltantes cuerpo a cuerpo golpean la muralla.
        wallDmg += men * WALL_DMG * dt * (u.role === 'pesada' ? 1.5 : 1);
        continue;
      }
      let pool: Squad[];
      let idx: number;
      if (u.ranged) {
        pool = enemies;
        idx = (sq.id * 7 + Math.floor(b.time / 3)) % pool.length;
      } else {
        pool = front.length ? front : enemies;
        idx = meleeIdx++ % pool.length;
      }
      const tgt = pool[idx];
      const tu = UNITS[tgt.unit];
      let a = men * u.atk * DMG_K * dt;
      if (wallsUp && i === di) a *= u.ranged ? WALL_RANGED_BONUS : WALL_MELEE_DEF;
      acc.set(tgt, (acc.get(tgt) ?? 0) + a / (tu.def * mul[1 - i]));
      killer.set(tgt, i);
    }
  }
  // Torres de la muralla: disparan mientras la muralla aguanta.
  if (sett && k && wallsUp && k.towers > 0) {
    const targets = lists[1 - di];
    const tgt = targets[Math.floor(b.time / 2) % targets.length];
    const a = k.towers * DMG_K * dt * WALL_RANGED_BONUS;
    acc.set(tgt, (acc.get(tgt) ?? 0) + a / UNITS[tgt.unit].def);
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
    }
  }
  // Retirar muertos.
  if (b.settlement !== null) {
    const s = state.settlements[b.settlement];
    s.garrison = s.garrison.filter((q) => q.hp > 0.01);
  }
  for (const side of b.sides) {
    for (const id of side.armies.slice()) {
      const a = state.armies.find((x) => x.id === id);
      if (!a) continue;
      a.squads = a.squads.filter((q) => q.hp > 0.01);
      if (a.squads.length === 0) removeArmy(state, id);
    }
  }
  b.time += dt;
}

export function resolveBattle(state: GameState, b: Battle, winner: number): void {
  const wSide = b.sides[winner];
  if (b.settlement !== null) {
    const s = state.settlements[b.settlement];
    if (!wSide.garrison) {
      const from = s.owner;
      const squads: Squad[] = [];
      for (const id of wSide.armies) {
        const a = state.armies.find((x) => x.id === id);
        if (a) squads.push(...a.squads);
      }
      for (const id of wSide.armies.slice()) removeArmy(state, id);
      s.owner = wSide.faction;
      s.garrison = squads;
      s.pop = Math.floor(s.pop * 0.5);
      s.queue = [];
      state.factions[wSide.faction].stats.captured++;
      state.events.push({ type: 'capture', settlement: s.id, faction: wSide.faction, from });
    } else {
      // Los atacantes que queden (si los hay) se retiran destruidos.
      for (const id of b.sides[1 - winner].armies.slice()) removeArmy(state, id);
      state.events.push({ type: 'repelled', settlement: s.id, faction: s.owner, attacker: b.sides[1 - winner].faction });
    }
    s.battleId = null;
  } else {
    for (const id of wSide.armies) {
      const a = state.armies.find((x) => x.id === id);
      if (a) a.battleId = null;
    }
    for (const id of b.sides[1 - winner].armies.slice()) removeArmy(state, id);
    state.events.push({ type: 'field-win', battle: b.id, faction: wSide.faction, loser: b.sides[1 - winner].faction, x: b.x, y: b.y });
  }
  const i = state.battles.indexOf(b);
  if (i >= 0) state.battles.splice(i, 1);
}
