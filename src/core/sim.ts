import { runAi } from './ai';
import { armyS, destroyArmy, joinBattle, mergeIntoGarrison, MEET_DIST, removeArmy, startFieldBattle, startSiege, stepBattle } from './combat';
import { armySpeed, FOOD_CAP, foodBalance, newSquad, TICK } from './game';
import { roadBetween } from './path';
import type { Army, GameState } from './types';
import { maxHp, statsOf, UNITS } from './units';

const MAX_EVENTS = 200;

/** Avanza la simulación un tick fijo. Determinista: mismo estado + mismas órdenes ⇒ mismo resultado. */
export function step(state: GameState, dt: number = TICK): void {
  if (state.winner !== null) return;
  state.time += dt;
  state.tick++;
  economy(state, dt);
  food(state, dt);
  recruiting(state, dt);
  replenish(state, dt);
  moveArmies(state, dt);
  encounters(state);
  for (const b of state.battles.slice()) stepBattle(state, b, dt);
  runAi(state, dt);
  checkVictory(state);
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
}

function economy(state: GameState, dt: number): void {
  for (const s of state.settlements) {
    const k = statsOf(s);
    s.pop = Math.min(k.popMax, s.pop + k.popRegen * dt);
    if (s.battleId === null && s.walls < k.wallHp) s.walls = Math.min(k.wallHp, s.walls + (k.wallHp / 90) * dt);
    if (s.owner === 0) continue;
    const f = state.factions[s.owner];
    if (f.alive) f.gold += k.income * dt;
    // Obras: avanzan si no hay asedio.
    if (s.build && s.battleId === null) {
      s.build.progress += dt;
      if (s.build.progress >= s.build.time) {
        const what = s.build.what;
        if (what === 'nivel') s.level++;
        else s.building = what;
        s.build = null;
        // La muralla nueva sale entera.
        s.walls = statsOf(s).wallHp;
        state.events.push({ type: 'upgraded', settlement: s.id, faction: s.owner, what });
      }
    }
  }
}

/** Hombres por segundo que desertan, en fracción de la escuadra, cuando falta comida. */
export const DESERTION = 0.012;

function food(state: GameState, dt: number): void {
  for (const f of state.factions) {
    if (f.id === 0 || !f.alive) continue;
    const { prod, upkeep } = foodBalance(state, f.id);
    f.food = Math.min(FOOD_CAP, f.food + (prod - upkeep) * dt);
    if (f.food <= 0) {
      f.food = 0;
      if (!f.starving) {
        f.starving = true;
        state.events.push({ type: 'starving', faction: f.id });
      }
    } else if (f.starving && f.food > 20) f.starving = false;
    if (!f.starving) continue;
    const hurt = (q: { unit: string; hp: number }) => (q.hp -= maxHp(q.unit) * DESERTION * dt);
    for (const s of state.settlements) {
      if (s.owner !== f.id) continue;
      s.garrison.forEach(hurt);
      if (s.battleId === null) s.garrison = s.garrison.filter((q) => q.hp > 0.01);
    }
    for (const a of state.armies.slice()) {
      if (a.owner !== f.id) continue;
      a.squads.forEach(hurt);
      if (a.battleId === null) {
        a.squads = a.squads.filter((q) => q.hp > 0.01);
        if (!a.squads.length) destroyArmy(state, a);
      }
    }
  }
}

function recruiting(state: GameState, dt: number): void {
  for (const s of state.settlements) {
    if (s.owner === 0 || s.queue.length === 0) continue;
    const q = s.queue[0];
    q.progress += dt;
    if (q.progress >= UNITS[q.unit].time) {
      s.queue.shift();
      s.garrison.push(newSquad(state, q.unit));
      state.factions[s.owner].stats.recruited++;
      state.events.push({ type: 'recruited', faction: s.owner, settlement: s.id, unit: q.unit });
    }
  }
}

function replenish(state: GameState, dt: number): void {
  for (const s of state.settlements) {
    if (s.battleId !== null || s.garrison.length === 0) continue;
    if (s.owner !== 0 && state.factions[s.owner].starving) continue;
    const k = statsOf(s);
    let worst = null as null | (typeof s.garrison)[number];
    let worstR = 0.999;
    for (const q of s.garrison) {
      const r = q.hp / maxHp(q.unit);
      if (r < worstR) {
        worstR = r;
        worst = q;
      }
    }
    if (!worst) continue;
    const men = k.replenish * dt;
    if (k.popMax > 0) {
      if (s.pop < men) continue;
      s.pop -= men;
    }
    worst.hp = Math.min(maxHp(worst.unit), worst.hp + men * UNITS[worst.unit].hp);
  }
}

function moveArmies(state: GameState, dt: number): void {
  for (const a of state.armies.slice()) {
    if (a.battleId !== null) continue;
    if (a.waiting) {
      if (state.settlements[a.toNode].battleId === null) arrive(state, a, 0);
      continue;
    }
    const road = state.roads[a.road];
    a.d += armySpeed(a) * dt;
    if (a.d >= road.len) arrive(state, a, a.d - road.len);
  }
}

function arrive(state: GameState, a: Army, overflow: number): void {
  const road = state.roads[a.road];
  const s = state.settlements[a.toNode];
  if (s.owner === a.owner) {
    if (s.battleId === null && a.path.length > 0) {
      const next = a.path.shift()!;
      const r = roadBetween(state, s.id, next);
      if (r) {
        a.road = r.id;
        a.fromNode = s.id;
        a.toNode = next;
        a.d = Math.min(overflow, r.len);
        return;
      }
    }
    // Llega a casa (o a reforzar un asentamiento propio asediado): se une a la guarnición.
    mergeIntoGarrison(state, a, s.id);
    return;
  }
  a.d = road.len;
  a.path = [];
  if (s.battleId !== null) {
    const b = state.battles.find((x) => x.id === s.battleId);
    if (b && joinBattle(state, b, a)) return;
    a.waiting = true;
    return;
  }
  startSiege(state, a, s.id);
}

function encounters(state: GameState): void {
  // Los que huyen no se paran a luchar ni se unen a batallas.
  const free = state.armies.filter((a) => a.battleId === null && !a.waiting && !a.retreating);
  // Unirse a batallas de campo cercanas en el mismo camino.
  for (const a of free) {
    if (a.battleId !== null) continue;
    const s = armyS(state, a);
    for (const b of state.battles) {
      if (b.road !== a.road || Math.abs(b.s - s) > MEET_DIST) continue;
      if (joinBattle(state, b, a)) break;
    }
  }
  // Nuevos choques.
  const still = free.filter((a) => a.battleId === null && state.armies.includes(a));
  for (let i = 0; i < still.length; i++) {
    const a = still[i];
    if (a.battleId !== null) continue;
    for (let j = i + 1; j < still.length; j++) {
      const o = still[j];
      if (o.battleId !== null || o.owner === a.owner || o.road !== a.road) continue;
      if (Math.abs(armyS(state, a) - armyS(state, o)) <= MEET_DIST) {
        startFieldBattle(state, a, o);
        break;
      }
    }
  }
}

function checkVictory(state: GameState): void {
  for (const f of state.factions) {
    if (f.id === 0 || !f.alive) continue;
    const hasFortress = state.settlements.some((s) => s.owner === f.id && s.kind === 'fortaleza');
    if (hasFortress) continue;
    f.alive = false;
    for (const s of state.settlements) {
      if (s.owner === f.id) {
        s.owner = 0;
        s.queue = [];
        s.build = null;
      }
      s.generals = s.generals.filter((g) => g.owner !== f.id);
    }
    for (const a of state.armies.filter((x) => x.owner === f.id)) removeArmy(state, a.id);
    for (const b of state.battles) for (const side of b.sides) if (side.faction === f.id && !side.garrison) side.faction = 0;
    state.events.push({ type: 'eliminated', faction: f.id });
  }
  const alive = state.factions.filter((f) => f.id !== 0 && f.alive);
  if (alive.length <= 1) {
    state.winner = alive.length ? alive[0].id : 0;
    state.events.push({ type: 'victory', faction: state.winner });
  }
}
