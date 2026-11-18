// Tipos del núcleo. Todo es serializable a JSON (sin clases ni funciones).

export type Culture = 'roma' | 'galos' | 'cartago' | 'independientes';
export type UnitRole = 'basica' | 'tiradores' | 'pesada' | 'caballeria';
export type SettlementKind = 'fortaleza' | 'aldea' | 'fortin';
export type Difficulty = 'facil' | 'normal' | 'dificil';

export interface UnitDef {
  key: string;
  name: string;
  culture: Culture;
  role: UnitRole;
  /** Puntos de vida por hombre. */
  hp: number;
  /** Ataque por hombre y segundo. */
  atk: number;
  def: number;
  ranged: boolean;
  /** Unidades de mapa por segundo. */
  speed: number;
  cost: number;
  /** Segundos de reclutamiento. */
  time: number;
  /** Hombres por escuadra (y población que consume). */
  men: number;
  onlyFortress: boolean;
  /** Comida por hombre y segundo. */
  upkeep: number;
  /** Multiplicador de daño contra cada papel (piedra-papel-tijera). */
  vs: Partial<Record<UnitRole, number>>;
  /** Multiplicador de daño contra murallas. */
  wallDmg: number;
  desc: string;
}

export interface Squad {
  id: number;
  unit: string;
  hp: number;
}

export interface QueueItem {
  unit: string;
  progress: number;
}

export interface Settlement {
  id: number;
  name: string;
  kind: SettlementKind;
  /** Estilo de construcción (cultura del lugar, no cambia al conquistarlo). */
  style: Culture;
  x: number;
  y: number;
  owner: number;
  garrison: Squad[];
  pop: number;
  queue: QueueItem[];
  battleId: number | null;
  /** Vida actual de la muralla. */
  walls: number;
}

export interface Pt {
  x: number;
  y: number;
}

export interface Road {
  id: number;
  a: number;
  b: number;
  pts: Pt[];
  /** Distancia acumulada en cada punto de pts. */
  cum: number[];
  len: number;
}

export interface Army {
  id: number;
  owner: number;
  squads: Squad[];
  road: number;
  fromNode: number;
  toNode: number;
  /** Distancia recorrida desde fromNode. */
  d: number;
  /** Nodos que quedan después de toNode. */
  path: number[];
  battleId: number | null;
  /** Esperando a que acabe una batalla ajena en el asentamiento de llegada. */
  waiting: boolean;
}

export interface BattleSide {
  faction: number;
  armies: number[];
  garrison: boolean;
}

export interface Battle {
  id: number;
  x: number;
  y: number;
  settlement: number | null;
  road: number | null;
  /** Posición canónica en el camino (desde road.a) para batallas de campo. */
  s: number;
  sides: [BattleSide, BattleSide];
  time: number;
}

export interface FactionStats {
  recruited: number;
  lost: number;
  killed: number;
  captured: number;
}

export interface Faction {
  id: number;
  name: string;
  culture: Culture;
  color: string;
  gold: number;
  food: number;
  /** Sin comida: las tropas desertan y no se puede reclutar. */
  starving: boolean;
  isPlayer: boolean;
  alive: boolean;
  /** Parámetros de IA (null = jugador humano o neutral). */
  ai: string | null;
  aiTimer: number;
  stats: FactionStats;
}

export type GameEvent =
  | { type: 'recruited'; faction: number; settlement: number; unit: string }
  | { type: 'battle'; battle: number; x: number; y: number; factions: number[] }
  | { type: 'capture'; settlement: number; faction: number; from: number }
  | { type: 'repelled'; settlement: number; faction: number; attacker: number }
  | { type: 'breach'; settlement: number }
  | { type: 'field-win'; battle: number; faction: number; loser: number; x: number; y: number }
  | { type: 'eliminated'; faction: number }
  | { type: 'starving'; faction: number }
  | { type: 'victory'; faction: number };

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  time: number;
  tick: number;
  mapId: string;
  width: number;
  height: number;
  difficulty: Difficulty;
  settlements: Settlement[];
  roads: Road[];
  armies: Army[];
  battles: Battle[];
  factions: Faction[];
  nextId: number;
  winner: number | null;
  events: GameEvent[];
}
