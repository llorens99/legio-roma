// Campañas históricas: capítulos encadenados en mapas reales. El primer bando de cada
// capítulo es el jugador; los demás, la IA con la dificultad elegida.
import type { PlayableCulture, PlayerSetup } from './game';

export interface ChapterSide {
  culture: PlayableCulture;
  name?: string;
  color?: string;
  owns: string[];
  /** Oro inicial (120 por defecto). */
  gold?: number;
}

export interface Chapter {
  title: string;
  year: string;
  mapId: string;
  intro: string;
  goal: string;
  sides: ChapterSide[];
}

export interface Campaign {
  culture: PlayableCulture;
  name: string;
  desc: string;
  chapters: Chapter[];
}

export const CAMPAIGNS: Record<PlayableCulture, Campaign> = {
  roma: {
    culture: 'roma',
    name: 'Las guerras de Roma',
    desc: 'De la llanura del Po a las Galias',
    chapters: [
      {
        title: 'Los ínsubres',
        year: '225 a. C.',
        mapId: 'italia',
        intro: 'Los galos ínsubres han cruzado el Po y amenazan Etruria. El Senado te confía las legiones.',
        goal: 'Toma Mediolanum, la capital ínsubre.',
        sides: [
          { culture: 'roma', owns: ['Roma', 'Capua', 'Volsinii', 'Arretium', 'Asculum'] },
          { culture: 'galos', name: 'Ínsubres', owns: ['Mediolanum', 'Verona', 'Cremona', 'Genua'], gold: 320 },
        ],
      },
      {
        title: 'Sicilia',
        year: '264 a. C.',
        mapId: 'sicilia',
        intro: 'Los mamertinos de Messana piden ayuda a Roma contra Cartago y Hierón de Siracusa se alía contigo. Empieza la Primera Guerra Púnica.',
        goal: 'Expulsa a Cartago de Lilybaeum y Panormus.',
        sides: [
          { culture: 'roma', owns: ['Messana', 'Syracusae', 'Tyndaris', 'Tauromenium', 'Catana'], gold: 220 },
          { culture: 'cartago', owns: ['Lilybaeum', 'Panormus', 'Segesta', 'Selinus', 'Macella'] },
        ],
      },
      {
        title: 'Hispania',
        year: '211 a. C.',
        mapId: 'hispania',
        intro: 'Desde Tarraco, los Escipiones deben arrebatar Hispania a los Barca. Numancia y los celtíberos esperan al vencedor.',
        goal: 'Toma Carthago Nova, la capital de los Barca.',
        sides: [
          { culture: 'roma', owns: ['Tarraco', 'Emporiae', 'Dertosa', 'Ilerda', 'Saguntum'], gold: 300 },
          { culture: 'cartago', owns: ['Carthago Nova', 'Ilici', 'Basti', 'Malaca'] },
        ],
      },
      {
        title: 'Zama',
        year: '204 a. C.',
        mapId: 'africa',
        intro: 'Escipión desembarca en África y el príncipe númida Masinisa se une a Roma. Cartago llama a Aníbal.',
        goal: 'Toma Carthago.',
        sides: [
          { culture: 'roma', owns: ['Castra Cornelia', 'Thabraca', 'Bulla Regia', 'Thugga', 'Hippo Regius', 'Zama'], gold: 500 },
          { culture: 'cartago', owns: ['Carthago', 'Clupea', 'Neapolis', 'Hadrumetum', 'Thysdrus'] },
        ],
      },
      {
        title: 'Alesia',
        year: '52 a. C.',
        mapId: 'galia',
        intro: 'Toda la Galia se alza contra Roma. Desde la Narbonense, somete a arvernos, eduos y belgas.',
        goal: 'Derrota a los tres pueblos galos.',
        sides: [
          { culture: 'roma', owns: ['Narbo', 'Massilia', 'Tolosa', 'Nemausus'] },
          { culture: 'galos', name: 'Arvernos', owns: ['Gergovia', 'Avaricum', 'Aginnum'] },
          { culture: 'galos', name: 'Eduos', color: '#1f6f8b', owns: ['Bibracte', 'Alesia', 'Lugdunum'] },
          { culture: 'galos', name: 'Belgas', color: '#7a8a1f', owns: ['Durocortorum', 'Samarobriva', 'Treveri'] },
        ],
      },
    ],
  },
  cartago: {
    culture: 'cartago',
    name: 'La guerra de Aníbal',
    desc: 'De Sicilia a las puertas de Roma',
    chapters: [
      {
        title: 'Sicilia púnica',
        year: '264 a. C.',
        mapId: 'sicilia',
        intro: 'Roma ha cruzado el estrecho, ocupa Messana y se ha aliado con Siracusa. Defiende la Sicilia púnica.',
        goal: 'Toma Messana y Syracusae.',
        sides: [
          { culture: 'cartago', owns: ['Lilybaeum', 'Panormus', 'Segesta', 'Selinus', 'Macella', 'Agrigentum'], gold: 300 },
          { culture: 'roma', owns: ['Messana', 'Syracusae', 'Tyndaris', 'Tauromenium'] },
        ],
      },
      {
        title: 'Los Barca en Hispania',
        year: '221 a. C.',
        mapId: 'hispania',
        intro: 'Desde Carthago Nova, Aníbal quiere toda Hispania antes de marchar sobre Italia.',
        goal: 'Somete a los celtíberos y a Roma.',
        sides: [
          { culture: 'cartago', owns: ['Carthago Nova', 'Ilici'] },
          { culture: 'galos', name: 'Celtíberos', color: '#7a5a2a', owns: ['Numantia', 'Clunia', 'Salduie', 'Segobriga', 'Pompaelo'] },
          { culture: 'roma', owns: ['Tarraco', 'Emporiae', 'Dertosa', 'Ilerda'] },
        ],
      },
      {
        title: 'Aníbal en Italia',
        year: '218 a. C.',
        mapId: 'italia',
        intro: 'Has cruzado los Alpes con tus elefantes y los galos del Po se unen a ti. Roma te espera.',
        goal: 'Toma Roma.',
        sides: [
          { culture: 'cartago', owns: ['Augusta Taurinorum', 'Mediolanum', 'Genua', 'Cremona'] },
          { culture: 'roma', owns: ['Roma', 'Capua', 'Volsinii', 'Arretium', 'Asculum', 'Ariminum'] },
        ],
      },
      {
        title: 'Defender Cartago',
        year: '204 a. C.',
        mapId: 'africa',
        intro: 'Escipión ha desembarcado en Utica y Numidia se ha pasado a Roma. Salva la ciudad.',
        goal: 'Derrota a Roma y a Numidia.',
        sides: [
          { culture: 'cartago', owns: ['Carthago', 'Clupea', 'Neapolis', 'Hadrumetum'] },
          { culture: 'roma', owns: ['Castra Cornelia', 'Thabraca', 'Thugga'] },
          { culture: 'cartago', name: 'Numidia', color: '#b0892a', owns: ['Cirta', 'Calama', 'Sitifis', 'Hippo Regius'] },
        ],
      },
    ],
  },
  galos: {
    culture: 'galos',
    name: 'La furia de los galos',
    desc: 'De Breno a Vercingétorix',
    chapters: [
      {
        title: 'Breno',
        year: '390 a. C.',
        mapId: 'italia',
        intro: 'Los senones de Breno bajan hacia Roma. ¡Ay de los vencidos!',
        goal: 'Toma Roma.',
        sides: [
          { culture: 'galos', name: 'Senones', owns: ['Mediolanum', 'Verona', 'Cremona', 'Genua'] },
          { culture: 'roma', owns: ['Roma', 'Capua', 'Volsinii', 'Arretium'] },
        ],
      },
      {
        title: 'Numancia',
        year: '153 a. C.',
        mapId: 'hispania',
        intro: 'Los celtíberos de Numancia resisten a Roma, mientras Cartago aún domina el sur.',
        goal: 'Derrota a Roma y a Cartago.',
        sides: [
          { culture: 'galos', name: 'Celtíberos', owns: ['Numantia', 'Clunia', 'Salduie', 'Pompaelo', 'Segobriga', 'Pallantia'] },
          { culture: 'roma', owns: ['Tarraco', 'Emporiae', 'Dertosa'] },
          { culture: 'cartago', owns: ['Carthago Nova', 'Ilici', 'Basti'] },
        ],
      },
      {
        title: 'Vercingétorix',
        year: '52 a. C.',
        mapId: 'galia',
        intro: 'Desde Gergovia llamas a toda la Galia a levantarse contra César. Los eduos dudan.',
        goal: 'Expulsa a Roma y somete a los eduos.',
        sides: [
          { culture: 'galos', name: 'Arvernos', owns: ['Gergovia', 'Avaricum', 'Aginnum', 'Limonum', 'Cenabum', 'Lugdunum'], gold: 400 },
          { culture: 'roma', owns: ['Narbo', 'Tolosa', 'Nemausus'] },
          { culture: 'galos', name: 'Eduos', color: '#1f6f8b', owns: ['Bibracte'] },
        ],
      },
    ],
  },
};

/** Jugadores de un capítulo: el primero es el humano (o la IA indicada para simular). */
export function chapterPlayers(
  ch: Chapter,
  difficulty: string,
  carry?: { fortLevel?: number; generals?: { name: string; level: number; xp: number }[] },
  humanAi: string | null = null,
): PlayerSetup[] {
  return ch.sides.map((s, i) => ({
    culture: s.culture,
    ai: i === 0 ? humanAi : difficulty,
    name: s.name,
    color: s.color,
    owns: s.owns,
    gold: s.gold,
    ...(i === 0 && carry ? { fortLevel: carry.fortLevel, generals: carry.generals } : {}),
  }));
}
