// Tutorial guiado: una partida en el Valle del Po con pasos que se comprueban solos.
import type { App } from './app';
import { newSquad } from './core/game';
import type { GameState } from './core/types';

export interface TutorialStep {
  text: string;
  /** Plaza a señalar en el mapa (por nombre). */
  settlement?: string;
  /** Elemento de la interfaz a resaltar. */
  selector?: string;
  /** Se ejecuta al empezar el paso. */
  enter?: (s: GameState, app: App) => void;
  done: (s: GameState, app: App, t: number) => boolean;
}

const sid = (s: GameState, name: string) => s.settlements.find((x) => x.name === name)!;

export const TUTORIAL: TutorialStep[] = [
  {
    text: 'Bienvenido, legado. Esta es <b>Ariminum</b>, tu fortaleza. Tócala para ver tus tropas.',
    settlement: 'Ariminum',
    done: (s, app) => app.view.selected?.kind === 'settlement' && app.view.selected.id === sid(s, 'Ariminum').id,
  },
  {
    text: 'Con oro reclutas tropas. Pulsa <b>Hastati</b> para reclutar una escuadra.',
    selector: '.rbtn[data-unit=roma_hastati]',
    done: (s) => sid(s, 'Ariminum').queue.length > 0 || s.factions[1].stats.recruited > 0,
  },
  {
    text: 'Ahora pulsa <b>Enviar</b> para sacar un ejército de la fortaleza.',
    selector: '[data-act=send]',
    done: (_s, app) => app.mode === 'target' || _s.armies.some((a) => a.owner === 1),
  },
  {
    text: 'Toca el fortín <b>Castra Rubra</b>: está en manos de unos pocos independientes.',
    settlement: 'Castra Rubra',
    done: (s) => s.armies.some((a) => a.owner === 1),
  },
  {
    text: 'Mientras marchan, acelera el tiempo con <b>×2</b> (arriba a la derecha).',
    selector: '#speed',
    done: (_s, app, t) => app.speed === 2 || t > 8,
  },
  {
    text: 'Tus hombres golpean la muralla hasta abrir brecha y luego asaltan. Espera a que tomen <b>Castra Rubra</b>.',
    settlement: 'Castra Rubra',
    done: (s) => sid(s, 'Castra Rubra').owner === 1,
  },
  {
    text: '¡Bien hecho! Te enviamos oro del Senado. Toca <b>Ariminum</b> y, en <b>Mejoras</b>, súbela a nivel 2.',
    settlement: 'Ariminum',
    selector: '[data-act=up]',
    enter: (s) => {
      s.factions[1].gold = Math.max(s.factions[1].gold, 320);
    },
    done: (s) => !!sid(s, 'Ariminum').build || sid(s, 'Ariminum').level > 1,
  },
  {
    text: 'Los galos despiertan. Cuida tus plazas, vigila la comida y toma <b>Mediolanum</b> para ganar. Puedes pausar (⏸) para pensar.',
    settlement: 'Mediolanum',
    enter: (s) => {
      s.factions[2].ai = 'facil';
    },
    done: () => false,
  },
];

/** Prepara la partida del tutorial: rival dormido y fortín de práctica débil. */
export function setupTutorial(s: GameState): void {
  s.factions[2].ai = null;
  const cr = sid(s, 'Castra Rubra');
  cr.garrison = [newSquad(s, 'ind_milicia')];
  const ar = sid(s, 'Ariminum');
  for (let i = 0; i < 2; i++) ar.garrison.push(newSquad(s, 'roma_hastati'));
}
