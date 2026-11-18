import type { Culture, SettlementKind, UnitDef, UnitRole } from './types';

type Base = Omit<UnitDef, 'men' | 'vs' | 'wallDmg' | 'upkeep' | 'onlyFortress'> &
  Partial<Pick<UnitDef, 'vs' | 'wallDmg' | 'upkeep' | 'onlyFortress'>>;

const UPKEEP = { basica: 0.016, tiradores: 0.016, pesada: 0.025, caballeria: 0.035 } as const;
const WALL = { basica: 1, tiradores: 0.5, pesada: 1.5, caballeria: 0.4 } as const;

function u(b: Base): UnitDef {
  return {
    men: 10,
    vs: {},
    wallDmg: WALL[b.role],
    upkeep: UPKEEP[b.role],
    onlyFortress: b.role === 'pesada' || b.role === 'caballeria',
    ...b,
  };
}

const defs: UnitDef[] = [
  // Roma: disciplina y defensa.
  u({ key: 'roma_hastati', name: 'Hastati', culture: 'roma', role: 'basica', hp: 10, atk: 1.0, def: 1.15, ranged: false, speed: 13, cost: 50, time: 12, vs: { caballeria: 1.3 }, desc: 'Infantería de línea, barata y sólida.' }),
  u({ key: 'roma_velites', name: 'Vélites', culture: 'roma', role: 'tiradores', hp: 7, atk: 0.85, def: 0.7, ranged: true, speed: 14, cost: 55, time: 14, vs: { pesada: 1.3 }, desc: 'Lanzan jabalinas a cualquier enemigo.' }),
  u({ key: 'roma_legionarios', name: 'Legionarios', culture: 'roma', role: 'pesada', hp: 14, atk: 1.35, def: 1.6, ranged: false, speed: 11, cost: 115, time: 20, vs: { caballeria: 1.3 }, desc: 'La legión: aguanta lo que le echen.' }),
  u({ key: 'roma_equites', name: 'Equites', culture: 'roma', role: 'caballeria', hp: 13, atk: 1.25, def: 1.1, ranged: false, speed: 22, cost: 95, time: 18, vs: { tiradores: 1.8 }, desc: 'Caballería: rápida y letal contra tiradores.' }),
  // Galos: fuerza bruta y rapidez.
  u({ key: 'galos_guerreros', name: 'Guerreros', culture: 'galos', role: 'basica', hp: 11, atk: 1.12, def: 0.9, ranged: false, speed: 14, cost: 50, time: 12, vs: { caballeria: 1.4 }, desc: 'Feroces y rápidos, pero poco protegidos.' }),
  u({ key: 'galos_arqueros', name: 'Arqueros', culture: 'galos', role: 'tiradores', hp: 7, atk: 0.95, def: 0.6, ranged: true, speed: 14, cost: 60, time: 14, vs: { pesada: 1.3 }, desc: 'Flechas a distancia; frágiles cuerpo a cuerpo.' }),
  u({ key: 'galos_nobles', name: 'Espadachines nobles', culture: 'galos', role: 'pesada', hp: 15, atk: 1.6, def: 1.15, ranged: false, speed: 12, cost: 115, time: 20, desc: 'Élite con espadas largas: golpean muy fuerte.' }),
  u({ key: 'galos_jinetes', name: 'Jinetes galos', culture: 'galos', role: 'caballeria', hp: 13, atk: 1.4, def: 0.95, ranged: false, speed: 22, cost: 90, time: 18, vs: { tiradores: 1.8 }, desc: 'Nobles a caballo: cargan con furia.' }),
  // Cartago: tropas variadas y mercenarias.
  u({ key: 'cartago_libios', name: 'Infantería libia', culture: 'cartago', role: 'basica', hp: 10, atk: 1.05, def: 1.1, ranged: false, speed: 13, cost: 50, time: 12, vs: { caballeria: 1.3 }, desc: 'Veteranos africanos con lanza y escudo.' }),
  u({ key: 'cartago_honderos', name: 'Honderos baleares', culture: 'cartago', role: 'tiradores', hp: 7, atk: 1.05, def: 0.55, ranged: true, speed: 14, cost: 60, time: 14, vs: { pesada: 1.4 }, desc: 'Los mejores honderos del Mediterráneo.' }),
  u({ key: 'cartago_lanceros', name: 'Lanceros íberos', culture: 'cartago', role: 'pesada', hp: 12, atk: 1.25, def: 1.4, ranged: false, speed: 13, cost: 100, time: 18, vs: { caballeria: 2.0 }, desc: 'Muro de lanzas: la pesadilla de los jinetes.' }),
  u({ key: 'cartago_numidas', name: 'Jinetes númidas', culture: 'cartago', role: 'caballeria', hp: 11, atk: 1.15, def: 0.85, ranged: false, speed: 26, cost: 80, time: 16, vs: { tiradores: 1.9 }, desc: 'Los jinetes más rápidos del mundo.' }),
  // Independientes (no se reclutan).
  u({ key: 'ind_milicia', name: 'Milicia', culture: 'independientes', role: 'basica', hp: 9, atk: 0.9, def: 0.9, ranged: false, speed: 12, cost: 40, time: 8, desc: 'Campesinos armados.' }),
  u({ key: 'ind_honderos', name: 'Honderos', culture: 'independientes', role: 'tiradores', hp: 7, atk: 0.8, def: 0.6, ranged: true, speed: 12, cost: 45, time: 9, desc: 'Piedras con honda.' }),
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(defs.map((d) => [d.key, d]));

export function unitsOf(culture: Culture): UnitDef[] {
  return defs.filter((d) => d.culture === culture);
}

export function unitFor(culture: Culture, role: UnitRole): UnitDef {
  const u = defs.find((d) => d.culture === culture && d.role === role) ?? defs.find((d) => d.culture === culture && d.role === 'basica');
  if (!u) throw new Error(`Sin unidad ${culture}/${role}`);
  return u;
}

export function recruitable(culture: Culture, kind: SettlementKind): UnitDef[] {
  if (kind === 'fortin' || culture === 'independientes') return [];
  return unitsOf(culture).filter((u) => kind === 'fortaleza' || !u.onlyFortress);
}

export function menOf(sq: { unit: string; hp: number }): number {
  const u = UNITS[sq.unit];
  return Math.max(0, Math.ceil(sq.hp / u.hp - 1e-6));
}

export function maxHp(unit: string): number {
  const u = UNITS[unit];
  return u.hp * u.men;
}

/** Fuerza aproximada de un conjunto de escuadras (para la IA y la interfaz). */
export function power(squads: { unit: string; hp: number }[]): number {
  let p = 0;
  for (const s of squads) {
    const u = UNITS[s.unit];
    p += (s.hp / u.hp) * Math.sqrt(u.atk * u.def) * Math.sqrt(u.hp / 10);
  }
  return p;
}

export function totalMen(squads: { unit: string; hp: number }[]): number {
  let n = 0;
  for (const s of squads) n += menOf(s);
  return n;
}

// ---- Asentamientos ----

export interface KindDef {
  name: string;
  income: number;
  popMax: number;
  popRegen: number;
  /** Multiplicador de defensa de la guarnición mientras aguantan los muros. */
  wall: number;
  /** Multiplicador tras abrir brecha. */
  breached: number;
  /** Vida de la muralla (empalizada en aldeas). */
  wallHp: number;
  /** Hombres repuestos por segundo a la guarnición. */
  replenish: number;
  /** Comida por segundo. */
  food: number;
  /** Límite de escuadras para reclutar. */
  maxGarrison: number;
  value: number;
  /** Torres: «hombres» tiradores fijos que disparan a los asaltantes. */
  towers: number;
}

export const KINDS: Record<SettlementKind, KindDef> = {
  fortaleza: { name: 'Fortaleza', income: 1.6, popMax: 220, popRegen: 0.6, wall: 2.4, breached: 1.3, wallHp: 1100, replenish: 0.5, food: 1.2, maxGarrison: 20, value: 6, towers: 14 },
  aldea: { name: 'Aldea', income: 0.9, popMax: 90, popRegen: 0.35, wall: 1.3, breached: 1.0, wallHp: 90, replenish: 0.3, food: 1.1, maxGarrison: 10, value: 3, towers: 0 },
  fortin: { name: 'Fortín', income: 0.2, popMax: 0, popRegen: 0, wall: 2.0, breached: 1.2, wallHp: 400, replenish: 0.6, food: 0, maxGarrison: 12, value: 2, towers: 5 },
};

export function upkeepOf(squads: { unit: string; hp: number }[]): number {
  let f = 0;
  for (const s of squads) f += menOf(s) * UNITS[s.unit].upkeep;
  return f;
}
