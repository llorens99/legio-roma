import { SAVE_VERSION, START_FOOD } from './game';
import type { GameState } from './types';

export function serialize(state: GameState): string {
  return JSON.stringify({ ...state, events: [] });
}

/** Lee una partida guardada y la actualiza a la versión actual. Null si no es válida. */
export function deserialize(text: string | null): GameState | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text);
    return migrate(raw);
  } catch {
    return null;
  }
}

export function migrate(raw: any): GameState | null {
  if (!raw || typeof raw !== 'object' || typeof raw.version !== 'number') return null;
  if (raw.version > SAVE_VERSION) return null;
  if (!Array.isArray(raw.settlements) || !Array.isArray(raw.factions)) return null;
  // v2 → v3: mejoras, generales y moral.
  if (raw.version < 3) {
    for (const s of raw.settlements) {
      s.level ??= 1;
      s.building ??= null;
      s.build ??= null;
      s.generals ??= [];
    }
    for (const a of raw.armies ?? []) {
      a.general ??= null;
      a.retreating ??= false;
    }
    for (const b of raw.battles ?? []) for (const side of b.sides) side.peak ??= 0;
  }
  // v1 → v2: comida y hambre.
  if (raw.version < 2) {
    for (const f of raw.factions) {
      f.food = f.id === 0 ? 0 : START_FOOD;
      f.starving = false;
    }
  }
  raw.events = [];
  raw.version = SAVE_VERSION;
  return raw as GameState;
}
