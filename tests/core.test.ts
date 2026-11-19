import { describe, expect, it } from 'vitest';
import { newGame, recruit, sendArmy, redirectArmy, cancelRecruit, newSquad, disband, foodBalance, startUpgrade, appointGeneral, generalsOf, TICK } from '../src/core/game';
import { orderRetreat } from '../src/core/combat';
import { statsOf, recruitable } from '../src/core/units';
import { step } from '../src/core/sim';
import { MAPS } from '../src/core/maps';
import { validateMap } from '../src/core/validate';
import { serialize, deserialize, migrate } from '../src/core/save';
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
    it(`${m.name} es justo: cada fortaleza a la misma distancia de su rival más cercano`, () => {
      const s = newGame({ seed: 3, mapId: m.id });
      const forts = s.settlements.filter((x) => x.kind === 'fortaleza' && x.owner > 0);
      expect(forts.length).toBe(m.players);
      const nearest = forts.map((f) => Math.min(...forts.filter((o) => o !== f).map((o) => shortestPath(s, f.id, o.id)!.dist)));
      for (const d of nearest) expect(Math.abs(d - nearest[0])).toBeLessThan(1);
      // y el mismo número de plazas iniciales
      const counts = forts.map((f) => s.settlements.filter((x) => x.owner === f.owner).length);
      expect(new Set(counts).size).toBe(1);
    });
    it(`${m.name}: cada jugador tiene color propio`, () => {
      const s = newGame({ seed: 3, mapId: m.id, players: Array.from({ length: m.players }, () => ({ culture: 'galos' as const, ai: 'normal' })) });
      const colors = s.factions.map((f) => f.color);
      expect(new Set(colors).size).toBe(colors.length);
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

describe('comida y caballería', () => {
  it('las tropas comen y la comida baja si hay demasiadas', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    for (let i = 0; i < 25; i++) fort.garrison.push(newSquad(s, 'roma_legionarios'));
    const { prod, upkeep } = foodBalance(s, 1);
    expect(upkeep).toBeGreaterThan(prod);
    const f0 = s.factions[1].food;
    run(s, 10);
    expect(s.factions[1].food).toBeLessThan(f0);
  });
  it('sin comida: no se recluta y las tropas desertan', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    for (let i = 0; i < 30; i++) fort.garrison.push(newSquad(s, 'roma_legionarios'));
    s.factions[1].food = 1;
    s.factions[1].gold = 1000;
    run(s, 2);
    expect(s.factions[1].starving).toBe(true);
    expect(recruit(s, 1, fort.id, 'roma_hastati').ok).toBe(false);
    const hp0 = fort.garrison.reduce((a, q) => a + q.hp, 0);
    run(s, 20);
    expect(fort.garrison.reduce((a, q) => a + q.hp, 0)).toBeLessThan(hp0);
  });
  it('licenciar devuelve los hombres a la población', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    fort.pop = 50;
    const id = fort.garrison[0].id;
    expect(disband(s, 1, fort.id, [id]).ok).toBe(true);
    expect(fort.pop).toBe(60);
    expect(fort.garrison.some((q) => q.id === id)).toBe(false);
  });
  it('la caballería destroza a los tiradores y las lanzas frenan a la caballería', () => {
    const duel = (a: string, b: string) => {
      const s = newGame({ seed: 7, players: [{ culture: 'roma', ai: null }, { culture: 'cartago', ai: null }] });
      const x = s.settlements.find((q) => q.name === 'Castra Rubra')!;
      const y = s.settlements.find((q) => q.name === 'Turris Vada')!;
      x.owner = 1; x.garrison = [0, 1, 2].map(() => newSquad(s, a));
      y.owner = 2; y.garrison = [0, 1, 2].map(() => newSquad(s, b));
      sendArmy(s, 1, x.id, y.id);
      sendArmy(s, 2, y.id, x.id);
      run(s, 120);
      return s.events.find((e) => e.type === 'field-win') as any;
    };
    expect(duel('roma_equites', 'cartago_honderos')?.faction).toBe(1);
    expect(duel('roma_equites', 'cartago_lanceros')?.faction).toBe(2);
  });
});

describe('mejoras, generales y moral', () => {
  it('subir la fortaleza de nivel cuesta oro, tarda y mejora renta, murallas y tropas', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    s.factions[1].gold = 1000;
    const inc1 = statsOf(fort).income;
    expect(recruitable('roma', 'fortaleza', fort.level).some((u) => u.special)).toBe(false);
    expect(startUpgrade(s, 1, fort.id, 'nivel').ok).toBe(true);
    expect(startUpgrade(s, 1, fort.id, 'nivel').ok).toBe(false); // ya hay obra
    run(s, 46);
    expect(fort.level).toBe(2);
    expect(statsOf(fort).income).toBeGreaterThan(inc1);
    expect(fort.walls).toBe(statsOf(fort).wallHp);
    startUpgrade(s, 1, fort.id, 'nivel');
    run(s, 61);
    expect(fort.level).toBe(3);
    expect(recruitable('roma', 'fortaleza', fort.level).some((u) => u.key === 'roma_pretorianos')).toBe(true);
    expect(recruit(s, 1, fort.id, 'roma_pretorianos').ok).toBe(true);
  });
  it('una aldea solo admite un edificio', () => {
    const s = peaceful();
    const ald = s.settlements.find((x) => x.owner === 1 && x.kind === 'aldea')!;
    s.factions[1].gold = 1000;
    const food0 = statsOf(ald).food;
    expect(startUpgrade(s, 1, ald.id, 'granja').ok).toBe(true);
    run(s, 41);
    expect(ald.building).toBe('granja');
    expect(statsOf(ald).food).toBeGreaterThan(food0);
    expect(startUpgrade(s, 1, ald.id, 'mercado').ok).toBe(false);
  });
  it('cada pueblo empieza con un general y puede nombrar más al mejorar la fortaleza', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    expect(fort.generals.length).toBe(1);
    s.factions[1].gold = 1000;
    expect(appointGeneral(s, 1, fort.id).ok).toBe(false);
    fort.level = 2;
    expect(appointGeneral(s, 1, fort.id).ok).toBe(true);
    expect(generalsOf(s, 1).length).toBe(2);
  });
  it('el general viaja con el ejército, gana experiencia y muere si cae su ejército', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    const g = fort.generals[0];
    for (let i = 0; i < 6; i++) fort.garrison.push(newSquad(s, 'roma_legionarios'));
    const target = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    const r = sendArmy(s, 1, fort.id, target.id, undefined, g.id);
    expect(r.army!.general?.id).toBe(g.id);
    expect(fort.generals.length).toBe(0);
    run(s, 120);
    expect(target.owner).toBe(1);
    expect(target.generals[0]?.id).toBe(g.id);
    expect(g.xp).toBeGreaterThan(0);
  });
  it('un ejército muy castigado huye a casa en vez de morir', () => {
    const s = peaceful();
    const a = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    const b = s.settlements.find((x) => x.name === 'Turris Vada')!;
    a.owner = 1; a.garrison = [0, 1, 2].map(() => newSquad(s, 'roma_hastati'));
    b.owner = 2; b.garrison = [0, 1, 2, 3, 4, 5, 6, 7].map(() => newSquad(s, 'galos_nobles'));
    sendArmy(s, 1, a.id, b.id);
    sendArmy(s, 2, b.id, a.id);
    let routed = false;
    for (let i = 0; i < 900 && !routed; i++) {
      step(s);
      routed = s.events.some((e) => e.type === 'rout' && e.faction === 1);
    }
    expect(routed).toBe(true);
    const mine = s.armies.find((x) => x.owner === 1);
    expect(mine?.retreating).toBe(true);
  });
  it('se puede ordenar la retirada de un ejército en combate', () => {
    const s = peaceful();
    const fort = s.settlements.find((x) => x.owner === 1 && x.kind === 'fortaleza')!;
    const target = s.settlements.find((x) => x.name === 'Castra Rubra')!;
    const r = sendArmy(s, 1, fort.id, target.id);
    run(s, 40);
    expect(r.army!.battleId).not.toBeNull();
    expect(orderRetreat(s, 1, r.army!.id).ok).toBe(true);
    expect(r.army!.battleId).toBeNull();
    run(s, 60);
    expect(s.armies.length).toBe(0);
    expect(fort.garrison.length).toBeGreaterThan(0);
  });
});

describe('varios rivales', () => {
  it('una partida de 4 bandos IA termina con un ganador', () => {
    const s = newGame({ seed: 21, mapId: 'hispania', players: [
      { culture: 'roma', ai: 'normal' }, { culture: 'galos', ai: 'normal' }, { culture: 'cartago', ai: 'normal' }, { culture: 'galos', ai: 'normal' },
    ] });
    for (let i = 0; i < (60 * 60) / TICK && s.winner === null; i++) step(s);
    expect(s.winner).not.toBeNull();
    expect(s.factions.filter((f) => f.id > 0 && f.alive).length).toBe(1);
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
  it('migra partidas de la versión 1 (sin comida)', () => {
    const s = peaceful();
    const raw = JSON.parse(serialize(s));
    raw.version = 1;
    for (const f of raw.factions) { delete f.food; delete f.starving; }
    for (const st of raw.settlements) { delete st.level; delete st.building; delete st.build; delete st.generals; }
    const m = migrate(raw)!;
    expect(m.version).toBe(3);
    expect(m.settlements[0].level).toBe(1);
    expect(m.factions[1].food).toBeGreaterThan(0);
    expect(m.factions[1].starving).toBe(false);
  });
  it('rechaza basura y versiones futuras', () => {
    expect(deserialize('no json')).toBeNull();
    expect(deserialize(JSON.stringify({ version: 999, settlements: [], factions: [] }))).toBeNull();
  });
});
