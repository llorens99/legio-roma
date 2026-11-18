import { describe, expect, it } from 'vitest';
import { newGame, recruit, sendArmy, redirectArmy, cancelRecruit, newSquad, TICK } from '../src/core/game';
import { step } from '../src/core/sim';
import { MAPS } from '../src/core/maps';
import { validateMap } from '../src/core/validate';
import { serialize, deserialize } from '../src/core/save';
import { shortestPath } from '../src/core/path';
import { UNITS, totalMen } from '../src/core/units';
import type { GameState } from '../src/core/types';

const peaceful = () => newGame({ seed: 7, players: [{ culture: 'roma', ai: null }, { culture: 'galos', ai: null }] });
const run = (s: GameState, secs: number) => { for (let i = 0; i < Math.round(secs / TICK); i++) step(s); };

describe('mapas', () => {
  for (const m of Object.values(MAPS)) {
    it(`${m.name} es válido`, () => {
      expect(validateMap(m)).toEqual([]);
    });
    it(`${m.name} es justo: misma distancia entre fortalezas`, () => {
      const s = newGame({ seed: 3, mapId: m.id });
      const f1 = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
      const f2 = s.settlements.find((x) => x.owner === 2 && x.kind === 'fortaleza')!;
      const a = shortestPath(s, f1.id, f2.id)!.dist;
      const b = shortestPath(s, f2.id, f1.id)!.dist;
      expect(Math.abs(a - b)).toBeLessThan(1);
    });
  }
});

describe('economía y reclutamiento', () => {
  it('produce oro', () => {
    const s = peaceful();
    const g = s.factions[1].gold;
    run(s, 10);
    expect(s.factions[1].gold).toBeGreaterThan(g + 25);
  });
  it('reclutar cuesta oro y población y crea la escuadra', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    const g = s.factions[1].gold;
    const n = fort.garrison.length;
    const pop = fort.pop;
    expect(recruit(s, 1, fort.id, 'roma_hastati').ok).toBe(true);
    expect(s.factions[1].gold).toBe(g - UNITS.roma_hastati.cost);
    expect(fort.pop).toBe(pop - 10);
    run(s, UNITS.roma_hastati.time + 0.2);
    expect(fort.garrison.length).toBe(n + 1);
  });
  it('no recluta tropas de otra cultura ni pesadas en aldeas', () => {
    const s = peaceful();
    const aldea = s.settlements.find((x) => x.owner === 1 && x.kind === 'aldea')!;
    expect(recruit(s, 1, aldea.id, 'galos_guerreros').ok).toBe(false);
    s.factions[1].gold = 1000;
    expect(recruit(s, 1, aldea.id, 'roma_legionarios').ok).toBe(false);
  });
  it('cancelar devuelve el oro', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    const g = s.factions[1].gold;
    recruit(s, 1, fort.id, 'roma_velites');
    cancelRecruit(s, 1, fort.id, 0);
    expect(s.factions[1].gold).toBe(g);
  });
});

describe('marcha y combate', () => {
  it('un ejército marcha y conquista una aldea débil', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    for (let i = 0; i < 6; i++) fort.garrison.push(newSquad(s, 'roma_hastati'));
    const target = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    target.garrison = [newSquad(s, 'ind_milicia')];
    const r = sendArmy(s, 1, fort.id, target.id);
    expect(r.ok).toBe(true);
    run(s, 60);
    expect(target.owner).toBe(1);
    expect(target.garrison.length).toBeGreaterThan(0);
    expect(s.events.some((e) => e.type === 'capture')).toBe(true);
  });
  it('los muros protegen: el mismo ejército pierde contra un fortín bien guarnecido', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    fort.garrison = [0, 1, 2].map(() => newSquad(s, 'roma_hastati'));
    const target = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    target.garrison = [0, 1, 2].map(() => newSquad(s, 'ind_milicia'));
    sendArmy(s, 1, fort.id, target.id);
    run(s, 90);
    expect(target.owner).toBe(0);
  });
  it('dos ejércitos enemigos chocan en el camino y uno gana', () => {
    const s = peaceful();
    const a = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    const b = s.settlements.find((x) => x.name === 'Turris Vada')!;
    a.owner = 1; a.garrison = [0, 1, 2, 3].map(() => newSquad(s, 'roma_hastati'));
    b.owner = 2; b.garrison = [0, 1].map(() => newSquad(s, 'galos_guerreros'));
    sendArmy(s, 1, a.id, b.id);
    sendArmy(s, 2, b.id, a.id);
    run(s, 3);
    run(s, 15);
    expect(s.events.some((e) => e.type === 'battle')).toBe(true);
    run(s, 60);
    expect(s.events.some((e) => e.type === 'field-win' && e.faction === 1)).toBe(true);
  });
  it('se puede redirigir un ejército en marcha (dar media vuelta)', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    const target = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    const n = fort.garrison.length;
    const r = sendArmy(s, 1, fort.id, target.id);
    run(s, 2);
    expect(redirectArmy(s, 1, r.army!.id, fort.id).ok).toBe(true);
    run(s, 10);
    expect(s.armies.length).toBe(0);
    expect(fort.garrison.length).toBe(n);
  });
  it('perder la fortaleza elimina al bando y da la victoria', () => {
    const s = peaceful();
    const f2 = s.settlements.find((x) => x.owner === 2 && x.kind === 'fortaleza')!;
    f2.owner = 1;
    step(s);
    expect(s.factions[2].alive).toBe(false);
    expect(s.winner).toBe(1);
  });
  it('las bajas reducen hombres', () => {
    const s = peaceful();
    const sq = newSquad(s, 'roma_hastati');
    expect(totalMen([sq])).toBe(10);
    sq.hp -= 15;
    expect(totalMen([sq])).toBe(9);
  });
});

describe('IA y determinismo', () => {
  const play = (seed: number, maxMin = 45) => {
    const s = newGame({ seed, players: [{ culture: 'roma', ai: 'normal' }, { culture: 'galos', ai: 'normal' }] });
    const ticks = (maxMin * 60) / TICK;
    for (let i = 0; i < ticks && s.winner === null; i++) step(s);
    return s;
  };
  it('una partida IA contra IA termina con un ganador', () => {
    const s = play(11);
    expect(s.winner).not.toBeNull();
    expect([1, 2]).toContain(s.winner);
  });
  it('es determinista', () => {
    const a = play(5, 6);
    const b = play(5, 6);
    expect(serialize(a)).toBe(serialize(b));
  });
  it('la IA recluta y conquista algo en los primeros minutos', () => {
    const s = play(9, 5);
    expect(s.factions[2].stats.recruited).toBeGreaterThan(3);
    expect(s.factions[1].stats.captured + s.factions[2].stats.captured).toBeGreaterThan(0);
  });
});

describe('guardado', () => {
  it('guarda y carga sin perder nada', () => {
    const s = peaceful();
    run(s, 5);
    const t = serialize(s);
    const l = deserialize(t)!;
    expect(serialize(l)).toBe(t);
  });
  it('rechaza basura y versiones futuras', () => {
    expect(deserialize('no json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, settlements: [], factions: [] }))).toBeNull();
  });
});
