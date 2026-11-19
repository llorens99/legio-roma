import { deserialize, serialize } from './core/save';
import type { GameState } from './core/types';

const GAME_KEY = 'legio-roma:partida';
const SETTINGS_KEY = 'legio-roma:ajustes';

export interface Settings {
  muted: boolean;
  tipsDone: number;
  culture: 'roma' | 'galos' | 'cartago';
  difficulty: 'facil' | 'normal' | 'dificil';
  mapId: string;
  foodTip: boolean;
}

const DEFAULTS: Settings = { muted: false, tipsDone: 0, culture: 'roma', difficulty: 'normal', mapId: 'po', foodTip: false };

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* almacenamiento no disponible */
  }
}

export function saveGame(state: GameState): void {
  if (state.winner !== null) {
    safeSet(GAME_KEY, null);
    return;
  }
  safeSet(GAME_KEY, serialize(state));
}

export function loadGame(): GameState | null {
  return deserialize(safeGet(GAME_KEY));
}

export function clearGame(): void {
  safeSet(GAME_KEY, null);
}

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(safeGet(SETTINGS_KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  safeSet(SETTINGS_KEY, JSON.stringify(s));
}

const CAMPAIGN_KEY = 'legio-roma:campana';

export interface CampaignProgress {
  /** Siguiente capítulo por jugar (0…). */
  chapter: number;
  fortLevel: number;
  generals: { name: string; level: number; xp: number }[];
  done: boolean;
}

export function loadCampaigns(): Record<string, CampaignProgress> {
  try {
    return JSON.parse(safeGet(CAMPAIGN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveCampaigns(c: Record<string, CampaignProgress>): void {
  safeSet(CAMPAIGN_KEY, JSON.stringify(c));
}
