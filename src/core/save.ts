import { SAVE_VERSION } from './game';
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
  // v1 es la primera versión; aquí irán los pasos v1→v2, v2→v3…
  if (!Array.isArray(raw.settlements) || !Array.isArray(raw.factions)) return null;
  raw.events = [];
  raw.version = SAVE_VERSION;
  return raw as GameState;
}
