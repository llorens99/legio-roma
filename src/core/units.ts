import type { Culture, SettlementKind, UnitDef, UnitRole } from './types';

const defs: UnitDef[] = [
  // Roma: disciplina y defensa.
  { key: 'roma_hastati', name: 'Hastati', culture: 'roma', role: 'basica', hp: 10, atk: 1.0, def: 1.15, ranged: false, speed: 13, cost: 50, time: 12, men: 10, onlyFortress: false, desc: 'Infantería de línea, barata y sólida.' },
  { key: 'roma_velites', name: 'Vélites', culture: 'roma', role: 'tiradores', hp: 7, atk: 0.85, def: 0.7, ranged: true, speed: 14, cost: 55, time: 14, men: 10, onlyFortress: false, desc: 'Lanzan jabalinas a cualquier enemigo.' },
  { key: 'roma_legionarios', name: 'Legionarios', culture: 'roma', role: 'pesada', hp: 14, atk: 1.35, def: 1.6, ranged: false, speed: 11, cost: 115, time: 20, men: 10, onlyFortress: true, desc: 'La legión: aguanta lo que le echen.' },
  // Galos: fuerza bruta y rapidez.
  { key: 'galos_guerreros', name: 'Guerreros', culture: 'galos', role: 'basica', hp: 11, atk: 1.2, def: 0.9, ranged: false, speed: 14, cost: 50, time: 12, men: 10, onlyFortress: false, desc: 'Feroces y rápidos, pero poco protegidos.' },
  { key: 'galos_arqueros', name: 'Arqueros', culture: 'galos', role: 'tiradores', hp: 7, atk: 0.95, def: 0.6, ranged: true, speed: 14, cost: 60, time: 14, men: 10, onlyFortress: false, desc: 'Flechas a distancia; frágiles cuerpo a cuerpo.' },
  { key: 'galos_nobles', name: 'Espadachines nobles', culture: 'galos', role: 'pesada', hp: 15, atk: 1.7, def: 1.15, ranged: false, speed: 12, cost: 115, time: 20, men: 10, onlyFortress: true, desc: 'Élite con espadas largas: golpean muy fuerte.' },
  // Independientes (no se reclutan).
  { key: 'ind_milicia', name: 'Milicia', culture: 'independientes', role: 'basica', hp: 9, atk: 0.9, def: 0.9, ranged: false, speed: 12, cost: 40, time: 8, men: 10, onlyFortress: false, desc: 'Campesinos armados.' },
  { key: 'ind_honderos', name: 'Honderos', culture: 'independientes', role: 'tiradores', hp: 7, atk: 0.8, def: 0.6, ranged: true, speed: 12, cost: 45, time: 9, men: 10, onlyFortress: false, desc: 'Piedras con honda.' },
];

export const UNITS: Record<string, UnitDef> = Object.fromEntries(defs.map((d) => [d.key, d]));

export function unitsOf(culture: Culture): UnitDef[] {
  return defs.filter((d) => d.culture === culture);
}

export function unitFor(culture: Culture, role: UnitRole): UnitDef {
  const u = defs.find((d) => d.culture === culture && d.role === role);
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
  /** Límite de escuadras para reclutar. */
  maxGarrison: number;
  value: number;
  /** Torres: «hombres» tiradores fijos que disparan a los asaltantes. */
  towers: number;
}

export const KINDS: Record<SettlementKind, KindDef> = {
  fortaleza: { name: 'Fortaleza', income: 1.6, popMax: 220, popRegen: 0.6, wall: 2.4, breached: 1.3, wallHp: 1100, replenish: 0.5, maxGarrison: 20, value: 6, towers: 14 },
  aldea: { name: 'Aldea', income: 0.9, popMax: 90, popRegen: 0.35, wall: 1.3, breached: 1.0, wallHp: 90, replenish: 0.3, maxGarrison: 10, value: 3, towers: 0 },
  fortin: { name: 'Fortín', income: 0.2, popMax: 0, popRegen: 0, wall: 2.0, breached: 1.2, wallHp: 400, replenish: 0.6, maxGarrison: 12, value: 2, towers: 5 },
};
