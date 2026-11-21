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
  /** Clave del progreso guardado (las tres primeras usan el nombre del pueblo). */
  id: string;
  culture: PlayableCulture;
  name: string;
  desc: string;
  chapters: Chapter[];
}

export const CAMPAIGNS: Record<string, Campaign> = {
  roma: {
    id: 'roma',
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
    id: 'cartago',
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
    id: 'galos',
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
  griegos: {
    id: 'griegos',
    culture: 'griegos',
    name: 'El legado de Alejandro',
    desc: 'De Queronea a Cinoscéfalas',
    chapters: [
      {
        title: 'Queronea',
        year: '338 a. C.',
        mapId: 'grecia',
        intro: 'Filipo de Macedonia quiere la hegemonía sobre Grecia. Atenas y Tebas se alían contra él.',
        goal: 'Toma Athenae y Thebae.',
        sides: [
          { culture: 'griegos', owns: ['Pella', 'Amphipolis', 'Dium', 'Larisa', 'Ambracia'], gold: 200 },
          { culture: 'griegos', name: 'Atenas', color: '#3b8fc0', owns: ['Athenae', 'Corinthus'] },
          { culture: 'griegos', name: 'Tebas', color: '#7a6a1f', owns: ['Thebae', 'Thermopylae'] },
        ],
      },
      {
        title: 'Pirro en Italia',
        year: '280 a. C.',
        mapId: 'italia',
        intro: 'Tarento llama a Pirro, rey del Epiro, contra Roma. Desembarcas con tus falanges y tus elefantes prestados.',
        goal: 'Toma Roma.',
        sides: [
          { culture: 'griegos', name: 'Epiro', color: '#2a4d9b', owns: ['Tarentum', 'Thurii', 'Croton', 'Venusia'] },
          { culture: 'roma', owns: ['Roma', 'Capua', 'Volsinii', 'Asculum', 'Luceria', 'Corfinium'], gold: 300 },
        ],
      },
      {
        title: 'Pirro en Sicilia',
        year: '278 a. C.',
        mapId: 'sicilia',
        intro: 'Siracusa te ofrece la corona de Sicilia si expulsas a los cartagineses de la isla.',
        goal: 'Toma Lilybaeum y Panormus.',
        sides: [
          { culture: 'griegos', name: 'Epiro', color: '#2a4d9b', owns: ['Syracusae', 'Messana', 'Acrae', 'Catana', 'Tauromenium', 'Henna'], gold: 300 },
          { culture: 'cartago', owns: ['Lilybaeum', 'Panormus', 'Segesta'] },
        ],
      },
      {
        title: 'Rafia',
        year: '217 a. C.',
        mapId: 'aegyptus',
        intro: 'Antíoco el Seléucida baja desde Siria para arrebatar Judea y Egipto a los Ptolomeos.',
        goal: 'Toma Damascus, la capital seléucida.',
        sides: [
          { culture: 'griegos', name: 'Ptolomeos', color: '#2a4d9b', owns: ['Alexandria', 'Memphis', 'Naucratis', 'Pelusium', 'Bubastis', 'Sebennytos'] },
          { culture: 'griegos', name: 'Seléucidas', color: '#8a6d1d', owns: ['Damascus', 'Gadara', 'Bostra', 'Tyrus', 'Ioppe'] },
        ],
      },
      {
        title: 'Cinoscéfalas',
        year: '197 a. C.',
        mapId: 'grecia',
        intro: 'Roma desembarca en Iliria y en el Epiro. Filipo V debe defender Macedonia y Tebas de las legiones.',
        goal: 'Toma Dyrrachium y Ambracia, las bases romanas.',
        sides: [
          { culture: 'griegos', owns: ['Pella', 'Amphipolis', 'Dium', 'Larisa', 'Thebae'] },
          { culture: 'roma', owns: ['Ambracia', 'Apollonia', 'Patrae', 'Dyrrachium'] },
        ],
      },
    ],
  },
  roma2: {
    id: 'roma2',
    culture: 'roma',
    name: 'Roma, señora del mundo',
    desc: 'De Grecia a Egipto y Britania',
    chapters: [
      {
        title: 'Cinoscéfalas',
        year: '197 a. C.',
        mapId: 'grecia',
        intro: 'Filipo V de Macedonia amenaza a los griegos. Desembarcas en Dyrrachium y en el Epiro con las legiones.',
        goal: 'Toma Pella y Thebae.',
        sides: [
          { culture: 'roma', owns: ['Ambracia', 'Apollonia', 'Patrae', 'Dyrrachium'] },
          { culture: 'griegos', owns: ['Pella', 'Amphipolis', 'Dium', 'Larisa', 'Thebae'] },
        ],
      },
      {
        title: 'Corinto',
        year: '146 a. C.',
        mapId: 'grecia',
        intro: 'La Liga Aquea se rebela. Desde Macedonia, ya provincia romana, marchas hacia el Peloponeso.',
        goal: 'Toma Athenae y Sparta.',
        sides: [
          { culture: 'roma', owns: ['Pella', 'Dium', 'Larisa', 'Amphipolis', 'Thebae'], gold: 200 },
          { culture: 'griegos', name: 'Liga Aquea', color: '#3b8fc0', owns: ['Athenae', 'Sparta', 'Corinthus', 'Mantinea', 'Patrae'] },
        ],
      },
      {
        title: 'Alejandría',
        year: '30 a. C.',
        mapId: 'aegyptus',
        intro: 'Antonio y Cleopatra se refugian en Egipto. Octavio llega desde Siria para acabar la guerra civil.',
        goal: 'Toma Alexandria y Memphis.',
        sides: [
          { culture: 'roma', owns: ['Tyrus', 'Damascus', 'Gadara', 'Ioppe'], gold: 150 },
          { culture: 'griegos', name: 'Egipto', color: '#2a4d9b', owns: ['Alexandria', 'Memphis', 'Naucratis', 'Bubastis', 'Pelusium'] },
        ],
      },
      {
        title: 'Britania',
        year: '43 d. C.',
        mapId: 'britannia',
        intro: 'Claudio envía cuatro legiones al otro lado del Océano. Desembarcas en Cantium.',
        goal: 'Toma Camulodunum y Eboracum.',
        sides: [
          { culture: 'roma', owns: ['Durovernum', 'Noviomagus', 'Londinium'], gold: 380 },
          { culture: 'galos', name: 'Catuvelaunos', color: '#2f7d3a', owns: ['Camulodunum', 'Calleva'] },
          { culture: 'galos', name: 'Brigantes', color: '#7a8a1f', owns: ['Eboracum', 'Cataractonium', 'Lindum'] },
        ],
      },
    ],
  },
  galos2: {
    id: 'galos2',
    culture: 'galos',
    name: 'Celtas contra el mundo',
    desc: 'De Delfos a la rebelión de Boudica',
    chapters: [
      {
        title: 'Breno en Delfos',
        year: '279 a. C.',
        mapId: 'grecia',
        intro: 'Una gran horda celta baja de los Balcanes hacia Macedonia y los santuarios de Grecia.',
        goal: 'Toma Pella, la capital macedonia.',
        sides: [
          { culture: 'galos', owns: ['Dyrrachium', 'Lissus', 'Apollonia', 'Heraclea Lyncestis', 'Stobi'], gold: 150 },
          { culture: 'griegos', owns: ['Pella', 'Amphipolis', 'Dium', 'Larisa'] },
        ],
      },
      {
        title: 'Carataco',
        year: '47 d. C.',
        mapId: 'britannia',
        intro: 'Las legiones avanzan por Britania. Desde las montañas de los siluros, Carataco resiste.',
        goal: 'Expulsa a Roma de Durovernum y Londinium.',
        sides: [
          { culture: 'galos', name: 'Siluros', owns: ['Isca Silurum', 'Moridunum', 'Viroconium', 'Deva', 'Glevum'], gold: 150 },
          { culture: 'roma', owns: ['Durovernum', 'Londinium', 'Calleva', 'Camulodunum'], gold: 250 },
        ],
      },
      {
        title: 'Boudica',
        year: '60 d. C.',
        mapId: 'britannia',
        intro: 'Roma ha humillado a los icenos. Su reina, Boudica, alza a los pueblos del este.',
        goal: 'Toma Camulodunum, la colonia romana.',
        sides: [
          { culture: 'galos', name: 'Icenos', owns: ['Venta Icenorum', 'Ratae', 'Lindum'], gold: 300 },
          { culture: 'roma', owns: ['Camulodunum', 'Londinium', 'Noviomagus', 'Calleva'], gold: 200 },
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
