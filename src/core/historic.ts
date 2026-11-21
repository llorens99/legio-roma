// Mapas históricos con geografía real: costas de Natural Earth, ciudades antiguas en su
// latitud y longitud, calzadas romanas, ríos y cordilleras. Proyección equirectangular
// corregida por la latitud media de cada mapa.
import { COSTAS } from './geo/costas';
import { inland } from './geoutil';
import type { MapDef, MapNode } from './maps';
import type { Culture, Pt, SettlementKind } from './types';

/** Recuadro [lonMin, latMin, lonMax, latMax] y unidades de mapa por grado de latitud. */
interface Frame {
  box: [number, number, number, number];
  scale: number;
}

interface City {
  name: string;
  lat: number;
  lon: number;
  kind: SettlementKind;
}

export interface HistoricDef {
  id: string;
  name: string;
  desc: string;
  frame: Frame;
  climate: 'med' | 'norte' | 'arido';
  cities: City[];
  roads: [string, string][];
  rivers: [number, number][][];
  ridges: [number, number][][];
  /** Estilo de construcción de cada ciudad según la región (romano, galo o púnico). */
  style: (lat: number, lon: number) => Culture;
  /** Rótulos del mapa: texto, lon, lat, giro en grados y si va sobre tierra. */
  labels: [string, number, number, number, boolean][];
  /** Posiciones de salida por defecto para partidas libres: fortaleza y plazas propias. */
  slots: { fortress: string; owns: string[] }[];
}

const F = (name: string, lat: number, lon: number): City => ({ name, lat, lon, kind: 'fortaleza' });
const A = (name: string, lat: number, lon: number): City => ({ name, lat, lon, kind: 'aldea' });
const T = (name: string, lat: number, lon: number): City => ({ name, lat, lon, kind: 'fortin' });

export function projector(frame: Frame) {
  const [lon0, lat0, lon1, lat1] = frame.box;
  const k = Math.cos((((lat0 + lat1) / 2) * Math.PI) / 180);
  const S = frame.scale;
  return {
    width: Math.round((lon1 - lon0) * k * S),
    height: Math.round((lat1 - lat0) * S),
    p: (lon: number, lat: number): Pt => ({ x: (lon - lon0) * k * S, y: (lat1 - lat) * S }),
  };
}

/** Guarnición independiente por defecto según el tipo de plaza. */
const IND_GARRISON: Record<SettlementKind, [number, number, number]> = {
  fortaleza: [5, 3, 0],
  aldea: [2, 1, 0],
  fortin: [3, 2, 0],
};

export function buildHistoric(def: HistoricDef): MapDef {
  const pr = projector(def.frame);
  const land = (COSTAS[def.id] ?? []).map((flat) => {
    const pts: Pt[] = [];
    for (let i = 0; i < flat.length; i += 2) pts.push(pr.p(flat[i], flat[i + 1]));
    return pts;
  });
  const idx = new Map<string, number>();
  const nodes: MapNode[] = def.cities.map((c, i) => {
    idx.set(c.name, i);
    const p = inland(land, pr.p(c.lon, c.lat), 10);
    return { name: c.name, kind: c.kind, x: Math.round(p.x), y: Math.round(p.y), start: 0, garrison: IND_GARRISON[c.kind], style: def.style(c.lat, c.lon) };
  });
  const id = (n: string) => {
    const i = idx.get(n);
    if (i === undefined) throw new Error(`Ciudad desconocida en ${def.id}: ${n}`);
    return i;
  };
  const line = (l: [number, number][]) => l.map(([lon, lat]) => pr.p(lon, lat));
  // Salidas por defecto: cada posición i+1.
  def.slots.forEach((s, k) => {
    nodes[id(s.fortress)].start = k + 1;
    nodes[id(s.fortress)].garrison = [3, 2, 0];
    for (const o of s.owns) {
      nodes[id(o)].start = k + 1;
      nodes[id(o)].garrison = [1, 0, 0];
    }
  });
  return {
    id: def.id,
    name: def.name,
    desc: def.desc,
    players: def.slots.length,
    width: pr.width,
    height: pr.height,
    nodes,
    roads: def.roads.map(([a, b]) => [id(a), id(b)] as [number, number]),
    bend: 0.35,
    minDist: 100,
    geo: {
      land,
      rivers: def.rivers.map(line),
      ridges: def.ridges.map(line),
      climate: def.climate,
      labels: def.labels.map(([text, lon, lat, rot, onLand]) => ({ text, ...pr.p(lon, lat), rot, land: onLand })),
    },
  };
}

// ---------------------------------------------------------------- Italia

const italia: HistoricDef = {
  id: 'italia',
  name: 'Italia',
  desc: 'La península entera, de los Alpes a Regio',
  frame: { box: [6.0, 37.4, 19.4, 47.0], scale: 170 },
  climate: 'med',
  style: (lat) => (lat > 44.3 ? 'galos' : 'roma'),
  cities: [
    F('Augusta Taurinorum', 45.07, 7.69), A('Genua', 44.41, 8.93), F('Mediolanum', 45.46, 9.19), T('Cremona', 45.13, 10.02),
    A('Verona', 45.44, 10.99), A('Patavium', 45.41, 11.88), T('Aquileia', 45.77, 13.37), A('Mutina', 44.65, 10.93),
    T('Ariminum', 44.06, 12.57), A('Pisae', 43.72, 10.4), A('Arretium', 43.46, 11.88), A('Ancona', 43.62, 13.52),
    T('Volsinii', 42.64, 11.99), A('Asculum', 42.85, 13.58), F('Roma', 41.9, 12.5), T('Corfinium', 42.12, 13.84),
    A('Capua', 41.08, 14.25), A('Luceria', 41.51, 15.34), T('Venusia', 40.96, 15.82), A('Paestum', 40.42, 15.01),
    F('Tarentum', 40.47, 17.24), A('Barium', 41.12, 16.87), A('Thurii', 39.71, 16.5), A('Croton', 39.08, 17.13),
    T('Vibo', 38.67, 16.1), A('Rhegium', 38.11, 15.65),
  ],
  roads: [
    ['Augusta Taurinorum', 'Mediolanum'], ['Augusta Taurinorum', 'Genua'], ['Genua', 'Mediolanum'], ['Mediolanum', 'Cremona'],
    ['Cremona', 'Verona'], ['Cremona', 'Mutina'], ['Verona', 'Patavium'], ['Patavium', 'Aquileia'], ['Verona', 'Mutina'],
    ['Patavium', 'Ariminum'], ['Mutina', 'Ariminum'], ['Mutina', 'Arretium'], ['Genua', 'Pisae'], ['Pisae', 'Arretium'],
    ['Pisae', 'Volsinii'], ['Arretium', 'Volsinii'], ['Ariminum', 'Ancona'], ['Ancona', 'Asculum'],
    ['Volsinii', 'Roma'], ['Asculum', 'Corfinium'], ['Asculum', 'Roma'], ['Roma', 'Corfinium'], ['Roma', 'Capua'],
    ['Corfinium', 'Luceria'], ['Capua', 'Luceria'], ['Capua', 'Paestum'], ['Luceria', 'Venusia'], ['Luceria', 'Barium'],
    ['Venusia', 'Barium'], ['Venusia', 'Tarentum'], ['Barium', 'Tarentum'], ['Venusia', 'Paestum'], ['Paestum', 'Thurii'],
    ['Tarentum', 'Thurii'], ['Thurii', 'Croton'], ['Thurii', 'Vibo'], ['Croton', 'Vibo'], ['Vibo', 'Rhegium'],
  ],
  rivers: [
    [[7.6, 44.9], [8.6, 45.1], [9.7, 45.05], [10.4, 45.0], [11.2, 45.0], [11.9, 44.95], [12.45, 44.95]],
    [[12.0, 43.8], [12.25, 43.3], [12.4, 42.8], [12.5, 42.3], [12.47, 41.9], [12.25, 41.73]],
    [[11.8, 43.8], [11.25, 43.77], [10.75, 43.7], [10.3, 43.68]],
    [[11.1, 46.3], [11.0, 45.6], [11.3, 45.2], [12.3, 45.15]],
  ],
  ridges: [
    [[6.9, 44.2], [7.0, 45.0], [7.3, 45.8], [8.5, 46.2], [10.0, 46.4], [11.5, 46.5], [13.0, 46.4], [13.8, 46.2]],
    [[8.4, 44.4], [9.5, 44.5], [10.5, 44.2], [11.6, 43.95], [12.4, 43.5], [13.0, 42.9], [13.6, 42.3], [14.2, 41.8], [15.0, 41.2], [15.6, 40.6], [16.0, 40.0], [16.2, 39.4], [16.1, 38.7]],
  ],
  labels: [
    ['MARE TYRRHENUM', 11.4, 40.2, 0, false], ['MARE ADRIATICUM', 15.0, 43.1, -38, false], ['MARE IONIUM', 18.2, 38.4, 0, false],
    ['ALPES', 9.6, 46.75, 0, true], ['CORSICA', 9.1, 42.2, 0, true], ['SARDINIA', 9.0, 40.0, 0, true], ['APENNINUS', 13.25, 42.55, -50, true],
  ],
  slots: [
    { fortress: 'Roma', owns: ['Capua', 'Volsinii'] },
    { fortress: 'Mediolanum', owns: ['Verona', 'Genua'] },
    { fortress: 'Tarentum', owns: ['Barium', 'Thurii'] },
  ],
};

// ---------------------------------------------------------------- Sicilia

const sicilia: HistoricDef = {
  id: 'sicilia',
  name: 'Sicilia',
  desc: 'La isla de la Primera Guerra Púnica',
  frame: { box: [11.9, 36.3, 16.1, 38.7], scale: 420 },
  climate: 'med',
  style: (_lat, lon) => (lon < 13.9 ? 'cartago' : 'roma'),
  cities: [
    F('Messana', 38.19, 15.55), A('Tauromenium', 37.85, 15.29), A('Tyndaris', 38.14, 15.04), A('Catana', 37.5, 15.09),
    T('Centuripae', 37.62, 14.74), F('Syracusae', 37.08, 15.29), T('Acrae', 37.06, 14.89), A('Gela', 37.07, 14.25),
    T('Henna', 37.57, 14.28), A('Agrigentum', 37.31, 13.58), A('Selinus', 37.58, 12.82), F('Lilybaeum', 37.8, 12.43),
    T('Segesta', 37.94, 12.84), F('Panormus', 38.12, 13.36), A('Cephaloedium', 38.03, 14.02), T('Macella', 37.81, 13.3),
  ],
  roads: [
    ['Messana', 'Tauromenium'], ['Messana', 'Tyndaris'], ['Tauromenium', 'Catana'], ['Catana', 'Syracusae'], ['Catana', 'Centuripae'],
    ['Centuripae', 'Henna'], ['Syracusae', 'Acrae'], ['Acrae', 'Gela'], ['Gela', 'Henna'], ['Gela', 'Agrigentum'],
    ['Agrigentum', 'Selinus'], ['Agrigentum', 'Macella'], ['Selinus', 'Lilybaeum'], ['Lilybaeum', 'Segesta'], ['Segesta', 'Panormus'],
    ['Segesta', 'Macella'], ['Macella', 'Panormus'], ['Panormus', 'Cephaloedium'], ['Cephaloedium', 'Tyndaris'], ['Cephaloedium', 'Henna'],
    ['Tyndaris', 'Centuripae'], ['Agrigentum', 'Henna'],
  ],
  rivers: [
    [[14.6, 37.8], [14.9, 37.5], [15.08, 37.4]],
    [[14.0, 37.7], [14.1, 37.4], [13.95, 37.12]],
    [[13.2, 37.9], [12.95, 37.6], [12.87, 37.58]],
  ],
  ridges: [
    [[13.9, 37.85], [14.4, 37.9], [14.9, 37.92]],
    [[14.95, 37.78], [15.0, 37.74], [15.05, 37.72]],
    [[14.75, 37.12], [14.9, 37.1]],
  ],
  labels: [
    ['MARE TYRRHENUM', 13.6, 38.5, 0, false], ['MARE AFRICUM', 13.0, 36.7, 0, false], ['MARE IONIUM', 15.75, 36.8, -60, false],
    ['AETNA', 14.99, 37.8, 0, true],
  ],
  slots: [
    { fortress: 'Messana', owns: ['Tauromenium', 'Tyndaris'] },
    { fortress: 'Lilybaeum', owns: ['Selinus', 'Segesta'] },
    { fortress: 'Syracusae', owns: ['Acrae', 'Catana'] },
  ],
};

// ---------------------------------------------------------------- Hispania

const hispania: HistoricDef = {
  id: 'hispania',
  name: 'Hispania',
  desc: 'Cartagineses, romanos, celtíberos y lusitanos',
  frame: { box: [-10.0, 35.5, 4.0, 44.2], scale: 160 },
  climate: 'arido',
  style: (lat, lon) => (lat < 38.4 && lon > -6.6 ? 'cartago' : lat > 40.6 && lon > 0 ? 'roma' : 'galos'),
  cities: [
    F('Gades', 36.53, -6.29), A('Hispalis', 37.39, -5.98), A('Corduba', 37.88, -4.78), A('Malaca', 36.72, -4.42),
    T('Castulo', 38.03, -3.62), A('Basti', 37.5, -2.77), F('Carthago Nova', 37.6, -0.98), A('Ilici', 38.27, -0.7),
    T('Saguntum', 39.68, -0.27), A('Dertosa', 40.81, 0.52), F('Tarraco', 41.12, 1.25), A('Emporiae', 42.13, 3.12),
    T('Ilerda', 41.62, 0.62), A('Salduie', 41.65, -0.88), A('Pompaelo', 42.82, -1.64), F('Numantia', 41.81, -2.44),
    A('Clunia', 41.79, -3.37), A('Pallantia', 42.01, -4.53), T('Asturica', 42.46, -6.06), A('Lucus Augusti', 43.01, -7.56),
    A('Bracara', 41.55, -8.42), A('Conimbriga', 40.1, -8.49), F('Olisipo', 38.72, -9.14), T('Ebora', 38.57, -7.91),
    A('Emerita', 38.92, -6.34), T('Toletum', 39.86, -4.02), A('Segobriga', 39.89, -2.81), T('Salmantica', 40.96, -5.66),
    A('Segovia', 40.95, -4.12),
  ],
  roads: [
    ['Gades', 'Hispalis'], ['Gades', 'Malaca'], ['Hispalis', 'Corduba'], ['Hispalis', 'Emerita'], ['Malaca', 'Basti'],
    ['Corduba', 'Castulo'], ['Castulo', 'Basti'], ['Basti', 'Carthago Nova'], ['Carthago Nova', 'Ilici'], ['Ilici', 'Saguntum'],
    ['Saguntum', 'Dertosa'], ['Dertosa', 'Tarraco'], ['Tarraco', 'Emporiae'], ['Tarraco', 'Ilerda'], ['Dertosa', 'Ilerda'],
    ['Ilerda', 'Salduie'], ['Salduie', 'Pompaelo'], ['Salduie', 'Numantia'], ['Pompaelo', 'Numantia'], ['Numantia', 'Clunia'],
    ['Numantia', 'Segobriga'], ['Clunia', 'Pallantia'], ['Clunia', 'Segovia'], ['Pallantia', 'Asturica'], ['Pallantia', 'Salmantica'],
    ['Asturica', 'Lucus Augusti'], ['Lucus Augusti', 'Bracara'], ['Asturica', 'Bracara'], ['Bracara', 'Conimbriga'], ['Conimbriga', 'Olisipo'],
    ['Olisipo', 'Ebora'], ['Ebora', 'Emerita'], ['Ebora', 'Hispalis'], ['Emerita', 'Salmantica'], ['Emerita', 'Toletum'], ['Salmantica', 'Segovia'],
    ['Segovia', 'Toletum'], ['Toletum', 'Segobriga'], ['Toletum', 'Castulo'], ['Segobriga', 'Saguntum'], ['Emerita', 'Corduba'],
  ],
  rivers: [
    [[-4.1, 43.0], [-2.6, 42.6], [-1.6, 42.1], [-0.9, 41.65], [0.0, 41.3], [0.5, 40.9], [0.85, 40.72]],
    [[-1.9, 40.4], [-3.1, 40.1], [-4.0, 39.86], [-5.4, 39.8], [-6.8, 39.65], [-8.4, 39.45], [-9.0, 38.9]],
    [[-2.9, 37.9], [-3.8, 37.95], [-4.8, 37.88], [-5.5, 37.6], [-6.0, 37.4], [-6.3, 36.85]],
    [[-2.5, 41.8], [-3.7, 41.6], [-5.0, 41.5], [-6.5, 41.1], [-8.6, 41.15]],
    [[-3.0, 39.1], [-5.0, 39.0], [-6.34, 38.9], [-7.2, 38.6], [-7.45, 37.5], [-7.4, 37.2]],
  ],
  ridges: [
    [[-1.8, 43.05], [-0.5, 42.8], [0.7, 42.7], [1.8, 42.5], [3.0, 42.45]],
    [[-7.0, 42.9], [-5.5, 43.0], [-4.0, 43.05], [-3.0, 43.0]],
    [[-7.0, 40.2], [-5.5, 40.3], [-4.3, 40.7], [-3.2, 41.1]],
    [[-3.0, 42.0], [-2.2, 41.6], [-1.5, 41.0], [-1.0, 40.3]],
    [[-6.8, 38.0], [-5.5, 38.2], [-4.2, 38.4], [-3.0, 38.4]],
    [[-5.2, 36.8], [-4.0, 37.0], [-3.3, 37.05], [-2.5, 37.2]],
  ],
  labels: [
    ['OCEANUS ATLANTICUS', -9.75, 40.6, -90, false], ['MARE BALEARICUM', 2.0, 39.2, 0, false], ['MARE CANTABRICUM', -5.0, 43.9, 0, false],
    ['MARE INTERNUM', -2.0, 36.1, 0, false], ['PYRENAEI MONTES', 0.6, 42.95, -8, true], ['LUSITANIA', -7.6, 39.6, 0, true], ['CELTIBERIA', -2.4, 41.1, 0, true],
  ],
  slots: [
    { fortress: 'Tarraco', owns: ['Emporiae', 'Dertosa'] },
    { fortress: 'Carthago Nova', owns: ['Ilici', 'Basti'] },
    { fortress: 'Numantia', owns: ['Clunia', 'Salduie'] },
    { fortress: 'Olisipo', owns: ['Conimbriga', 'Emerita'] },
  ],
};

// ---------------------------------------------------------------- Galia

const galia: HistoricDef = {
  id: 'galia',
  name: 'Galia',
  desc: 'Arvernos, eduos, helvecios y belgas',
  frame: { box: [-5.2, 42.0, 9.0, 51.4], scale: 160 },
  climate: 'norte',
  style: (lat, lon) => (lat < 44 && lon > 2.5 ? 'roma' : 'galos'),
  cities: [
    F('Narbo', 43.18, 3.0), F('Massilia', 43.3, 5.37), A('Nemausus', 43.84, 4.36), A('Tolosa', 43.6, 1.44),
    A('Burdigala', 44.84, -0.58), T('Aginnum', 44.2, 0.62), A('Mediolanum Santonum', 45.75, -0.63), A('Limonum', 46.58, 0.34),
    F('Gergovia', 45.71, 3.12), A('Lugdunum', 45.76, 4.84), T('Alba Helviorum', 44.6, 4.6), A('Genava', 46.2, 6.15),
    F('Aventicum', 46.88, 7.04), A('Vesontio', 47.24, 6.02), F('Bibracte', 46.92, 4.04), T('Alesia', 47.54, 4.5),
    A('Avaricum', 47.08, 2.4), A('Cenabum', 47.9, 1.9), T('Agedincum', 48.2, 3.28), A('Lutetia', 48.85, 2.35),
    F('Durocortorum', 49.26, 4.03), A('Samarobriva', 49.89, 2.3), A('Rotomagus', 49.44, 1.1), A('Divodurum', 49.12, 6.18),
    A('Treveri', 49.75, 6.64), A('Caesarodunum', 47.39, 0.69), T('Condate', 48.11, -1.68), A('Darioritum', 47.66, -2.76),
    T('Andecavi', 47.47, -0.55),
  ],
  roads: [
    ['Narbo', 'Tolosa'], ['Narbo', 'Nemausus'], ['Nemausus', 'Massilia'], ['Nemausus', 'Alba Helviorum'], ['Alba Helviorum', 'Lugdunum'],
    ['Tolosa', 'Aginnum'], ['Aginnum', 'Burdigala'], ['Burdigala', 'Mediolanum Santonum'], ['Mediolanum Santonum', 'Limonum'],
    ['Limonum', 'Caesarodunum'], ['Limonum', 'Andecavi'], ['Andecavi', 'Condate'], ['Condate', 'Darioritum'], ['Andecavi', 'Darioritum'],
    ['Andecavi', 'Caesarodunum'], ['Caesarodunum', 'Cenabum'], ['Cenabum', 'Avaricum'], ['Cenabum', 'Lutetia'], ['Cenabum', 'Agedincum'],
    ['Agedincum', 'Lutetia'], ['Agedincum', 'Alesia'], ['Alesia', 'Bibracte'], ['Bibracte', 'Avaricum'], ['Avaricum', 'Gergovia'],
    ['Gergovia', 'Lugdunum'], ['Gergovia', 'Aginnum'], ['Bibracte', 'Lugdunum'], ['Lugdunum', 'Genava'], ['Genava', 'Aventicum'],
    ['Aventicum', 'Vesontio'], ['Vesontio', 'Alesia'], ['Vesontio', 'Divodurum'], ['Durocortorum', 'Lutetia'], ['Durocortorum', 'Divodurum'],
    ['Durocortorum', 'Samarobriva'], ['Samarobriva', 'Rotomagus'], ['Rotomagus', 'Lutetia'], ['Divodurum', 'Treveri'], ['Treveri', 'Durocortorum'],
    ['Agedincum', 'Durocortorum'],
  ],
  rivers: [
    [[6.15, 46.2], [5.5, 45.8], [4.84, 45.76], [4.85, 45.2], [4.7, 44.4], [4.65, 43.7], [4.65, 43.38]],
    [[5.9, 47.9], [5.0, 47.0], [4.84, 45.76]],
    [[4.0, 45.0], [4.0, 46.2], [3.15, 47.0], [2.3, 47.8], [1.4, 47.5], [0.0, 47.25], [-1.5, 47.2], [-2.1, 47.28]],
    [[4.7, 47.8], [3.9, 48.3], [2.35, 48.85], [1.4, 49.2], [0.4, 49.45]],
    [[0.6, 42.9], [1.44, 43.6], [0.6, 44.2], [-0.58, 44.84], [-1.05, 45.4]],
    [[7.6, 47.6], [7.75, 48.6], [8.2, 49.0], [8.4, 49.9]],
    [[6.4, 48.2], [6.18, 49.12], [6.64, 49.75], [7.6, 50.35]],
  ],
  ridges: [
    [[6.9, 44.2], [7.0, 45.0], [7.0, 45.8], [7.8, 46.1], [8.6, 46.4]],
    [[5.9, 46.3], [6.5, 46.8], [7.2, 47.3]],
    [[2.7, 44.6], [3.0, 45.2], [2.9, 45.5], [3.5, 45.3], [4.0, 45.0]],
    [[-1.8, 43.05], [0.7, 42.7], [3.0, 42.45]],
    [[7.0, 47.9], [7.1, 48.5]],
  ],
  labels: [
    ['OCEANUS', -3.6, 45.6, -80, false], ['FRETUM GALLICUM', 0.6, 50.4, -10, false], ['MARE INTERNUM', 5.4, 42.5, 0, false],
    ['AQUITANIA', 0.2, 44.0, 0, true], ['CELTICA', 2.6, 46.3, 0, true], ['BELGICA', 3.4, 50.3, 0, true], ['ALPES', 7.6, 45.4, -70, true],
  ],
  slots: [
    { fortress: 'Narbo', owns: ['Tolosa', 'Nemausus'] },
    { fortress: 'Gergovia', owns: ['Avaricum', 'Aginnum'] },
    { fortress: 'Bibracte', owns: ['Alesia', 'Lugdunum'] },
    { fortress: 'Durocortorum', owns: ['Treveri', 'Samarobriva'] },
  ],
};

// ---------------------------------------------------------------- África

const africa: HistoricDef = {
  id: 'africa',
  name: 'África',
  desc: 'Cartago, Numidia y el desembarco romano',
  frame: { box: [5.2, 33.4, 11.8, 37.7], scale: 280 },
  climate: 'arido',
  style: () => 'cartago',
  cities: [
    F('Carthago', 36.85, 10.32), F('Castra Cornelia', 37.2, 10.05), A('Clupea', 36.85, 11.11), T('Neapolis', 36.45, 10.74),
    A('Hadrumetum', 35.83, 10.64), T('Thapsus', 35.62, 11.04), A('Thysdrus', 35.3, 10.71), T('Thugga', 36.42, 9.22),
    A('Zama', 35.96, 9.37), A('Sicca Veneria', 36.18, 8.71), T('Bulla Regia', 36.56, 8.75), A('Thabraca', 36.95, 8.76),
    A('Hippo Regius', 36.88, 7.75), F('Cirta', 36.37, 6.61), T('Calama', 36.46, 7.43), A('Theveste', 35.4, 8.12),
    T('Sufetula', 35.25, 9.13), A('Capsa', 34.42, 8.78), A('Tacape', 33.88, 10.1), A('Thaenae', 34.68, 10.7),
    A('Sitifis', 36.19, 5.41), T('Mascula', 35.43, 7.15),
  ],
  roads: [
    ['Castra Cornelia', 'Carthago'], ['Castra Cornelia', 'Thugga'], ['Carthago', 'Clupea'], ['Carthago', 'Neapolis'], ['Carthago', 'Thugga'],
    ['Clupea', 'Neapolis'], ['Neapolis', 'Hadrumetum'], ['Hadrumetum', 'Thapsus'], ['Hadrumetum', 'Thysdrus'], ['Thapsus', 'Thysdrus'],
    ['Thysdrus', 'Thaenae'], ['Thaenae', 'Tacape'], ['Tacape', 'Capsa'], ['Capsa', 'Sufetula'], ['Sufetula', 'Thysdrus'],
    ['Sufetula', 'Zama'], ['Sufetula', 'Theveste'], ['Zama', 'Thugga'], ['Zama', 'Sicca Veneria'], ['Thugga', 'Bulla Regia'],
    ['Sicca Veneria', 'Bulla Regia'], ['Sicca Veneria', 'Theveste'], ['Bulla Regia', 'Thabraca'], ['Thabraca', 'Hippo Regius'],
    ['Hippo Regius', 'Calama'], ['Calama', 'Cirta'], ['Cirta', 'Sitifis'], ['Cirta', 'Mascula'], ['Mascula', 'Theveste'],
    ['Calama', 'Sicca Veneria'],
  ],
  rivers: [[[7.9, 36.3], [8.7, 36.5], [9.4, 36.6], [9.9, 36.8], [10.15, 37.05]]],
  ridges: [
    [[5.6, 36.35], [6.2, 36.3], [7.0, 36.25], [8.0, 36.05], [8.6, 35.8], [9.0, 35.55]],
    [[6.3, 35.2], [6.9, 35.25]],
    [[8.5, 35.35], [9.3, 35.75], [10.0, 36.2]],
  ],
  labels: [
    ['MARE INTERNUM', 8.6, 37.45, 0, false], ['SYRTIS MINOR', 11.3, 34.2, -60, false], ['NUMIDIA', 6.5, 35.9, 0, true],
    ['GAETULIA', 7.6, 33.9, 0, true], ['AFRICA', 9.9, 35.6, 0, true],
  ],
  slots: [
    { fortress: 'Castra Cornelia', owns: ['Thabraca'] },
    { fortress: 'Carthago', owns: ['Clupea', 'Neapolis'] },
    { fortress: 'Cirta', owns: ['Calama', 'Sitifis'] },
  ],
};

// ---------------------------------------------------------------- Grecia y Macedonia

const grecia: HistoricDef = {
  id: 'grecia',
  name: 'Grecia',
  desc: 'Macedonia, las polis griegas y el Epiro',
  frame: { box: [19.0, 36.2, 27.2, 42.0], scale: 240 },
  climate: 'med',
  style: (lat, lon) => (lon < 20.2 && lat > 40.5 ? 'roma' : 'griegos'),
  cities: [
    F('Pella', 40.76, 22.52), A('Amphipolis', 40.82, 23.85), A('Abdera', 40.94, 24.98), T('Heraclea Lyncestis', 41.01, 21.33),
    T('Stobi', 41.55, 21.97), F('Dyrrachium', 41.32, 19.45), A('Apollonia', 40.72, 19.47), A('Lissus', 41.78, 19.64),
    T('Dium', 40.17, 22.49), A('Larisa', 39.64, 22.42), T('Demetrias', 39.36, 22.94), F('Ambracia', 39.16, 20.98),
    T('Thermopylae', 38.8, 22.54), F('Thebae', 38.32, 23.32), F('Athenae', 37.98, 23.73), A('Corinthus', 37.91, 22.88),
    A('Patrae', 38.25, 21.73), A('Olympia', 37.64, 21.63), T('Mantinea', 37.62, 22.39), F('Sparta', 37.08, 22.43),
    A('Pylos', 36.91, 21.7),
  ],
  roads: [
    ['Dyrrachium', 'Apollonia'], ['Dyrrachium', 'Lissus'], ['Dyrrachium', 'Heraclea Lyncestis'], ['Heraclea Lyncestis', 'Pella'],
    ['Heraclea Lyncestis', 'Stobi'], ['Stobi', 'Pella'], ['Stobi', 'Amphipolis'], ['Pella', 'Amphipolis'], ['Amphipolis', 'Abdera'],
    ['Pella', 'Dium'], ['Dium', 'Larisa'], ['Larisa', 'Demetrias'], ['Larisa', 'Ambracia'], ['Apollonia', 'Ambracia'],
    ['Demetrias', 'Thermopylae'], ['Larisa', 'Thermopylae'], ['Thermopylae', 'Thebae'], ['Thebae', 'Athenae'], ['Thebae', 'Corinthus'],
    ['Athenae', 'Corinthus'], ['Ambracia', 'Patrae'], ['Corinthus', 'Patrae'], ['Patrae', 'Olympia'], ['Olympia', 'Pylos'],
    ['Pylos', 'Sparta'], ['Sparta', 'Mantinea'], ['Mantinea', 'Corinthus'], ['Mantinea', 'Olympia'],
  ],
  rivers: [
    [[21.0, 40.4], [21.8, 40.3], [22.4, 40.45], [22.6, 40.5]],
    [[21.9, 41.6], [22.3, 41.1], [22.6, 40.6]],
    [[21.4, 39.7], [22.0, 39.55], [22.42, 39.64], [22.7, 39.88]],
    [[21.3, 39.6], [21.3, 39.0], [21.2, 38.4]],
    [[23.3, 41.6], [23.5, 41.2], [23.85, 40.8]],
  ],
  ridges: [
    [[20.6, 40.6], [21.0, 40.0], [21.4, 39.4], [21.7, 38.9], [22.1, 38.6]],
    [[22.2, 40.12], [22.38, 40.02]],
    [[22.35, 37.3], [22.35, 36.8]],
    [[23.8, 41.6], [24.8, 41.5], [25.6, 41.4]],
    [[22.4, 38.6], [22.65, 38.5]],
    [[21.9, 37.9], [22.3, 37.72]],
  ],
  labels: [
    ['MARE AEGAEUM', 25.0, 38.6, 0, false], ['MARE IONIUM', 19.9, 37.6, 0, false], ['MACEDONIA', 22.6, 41.15, 0, true],
    ['EPIRUS', 20.55, 39.75, 0, true], ['PELOPONNESUS', 22.1, 37.35, 0, true], ['THRACIA', 24.8, 41.75, 0, true], ['ILLYRICUM', 20.3, 41.8, 0, true],
  ],
  slots: [
    { fortress: 'Pella', owns: ['Amphipolis', 'Dium'] },
    { fortress: 'Athenae', owns: ['Corinthus'] },
    { fortress: 'Sparta', owns: ['Pylos', 'Mantinea'] },
    { fortress: 'Dyrrachium', owns: ['Apollonia', 'Lissus'] },
  ],
};

// ---------------------------------------------------------------- Britania

const britannia: HistoricDef = {
  id: 'britannia',
  name: 'Britania',
  desc: 'La isla de los britanos al borde del mundo',
  frame: { box: [-6.4, 49.8, 2.2, 56.0], scale: 240 },
  climate: 'norte',
  style: () => 'galos',
  cities: [
    F('Durovernum', 51.28, 1.08), A('Londinium', 51.51, -0.13), F('Camulodunum', 51.89, 0.9), A('Noviomagus', 50.84, -0.78),
    A('Calleva', 51.36, -1.09), T('Sorviodunum', 51.09, -1.8), T('Mai Dun', 50.69, -2.47), A('Isca Dumnoniorum', 50.72, -3.53),
    A('Glevum', 51.86, -2.24), F('Isca Silurum', 51.61, -2.96), A('Moridunum', 51.86, -4.31), A('Viroconium', 52.63, -2.6),
    T('Deva', 53.19, -2.89), A('Segontium', 53.14, -4.27), A('Ratae', 52.63, -1.13), A('Lindum', 53.23, -0.54),
    F('Venta Icenorum', 52.58, 1.29), F('Eboracum', 53.96, -1.08), A('Mamucium', 53.48, -2.24), T('Cataractonium', 54.37, -1.63),
    A('Luguvalium', 54.89, -2.93), T('Coria', 54.97, -2.02), A('Trimontium', 55.59, -2.69),
  ],
  roads: [
    ['Durovernum', 'Londinium'], ['Londinium', 'Camulodunum'], ['Londinium', 'Noviomagus'], ['Londinium', 'Calleva'], ['Londinium', 'Ratae'],
    ['Camulodunum', 'Venta Icenorum'], ['Venta Icenorum', 'Ratae'], ['Noviomagus', 'Sorviodunum'], ['Calleva', 'Sorviodunum'],
    ['Sorviodunum', 'Mai Dun'], ['Mai Dun', 'Isca Dumnoniorum'], ['Calleva', 'Glevum'], ['Glevum', 'Isca Silurum'], ['Isca Silurum', 'Moridunum'],
    ['Glevum', 'Viroconium'], ['Ratae', 'Viroconium'], ['Ratae', 'Lindum'], ['Viroconium', 'Deva'], ['Deva', 'Segontium'], ['Deva', 'Mamucium'],
    ['Mamucium', 'Eboracum'], ['Lindum', 'Eboracum'], ['Eboracum', 'Cataractonium'], ['Cataractonium', 'Coria'], ['Cataractonium', 'Luguvalium'],
    ['Luguvalium', 'Coria'], ['Coria', 'Trimontium'], ['Luguvalium', 'Trimontium'], ['Moridunum', 'Segontium'],
  ],
  rivers: [
    [[-1.9, 51.7], [-1.25, 51.75], [-0.9, 51.55], [-0.4, 51.45], [0.1, 51.5], [0.6, 51.5]],
    [[-3.6, 52.5], [-2.75, 52.7], [-2.25, 52.2], [-2.25, 51.86], [-2.6, 51.6]],
    [[-2.1, 53.0], [-1.5, 52.8], [-0.8, 53.1], [-0.7, 53.6]],
    [[-2.6, 54.98], [-1.6, 54.97]],
  ],
  ridges: [
    [[-2.2, 53.2], [-2.15, 53.8], [-2.3, 54.4], [-2.45, 54.8]],
    [[-3.9, 53.0], [-3.7, 52.4], [-3.6, 51.95]],
    [[-3.25, 54.55], [-3.0, 54.45]],
    [[-3.4, 55.35], [-2.4, 55.4]],
    [[-4.0, 50.62], [-3.85, 50.56]],
  ],
  labels: [
    ['OCEANUS GERMANICUS', 1.0, 54.2, -70, false], ['MARE HIBERNICUM', -5.25, 53.6, -80, false], ['FRETUM GALLICUM', 0.0, 50.2, -8, false],
    ['BRITANNIA', -1.6, 52.2, 0, true], ['CALEDONIA', -3.7, 55.75, 0, true], ['CAMBRIA', -3.85, 52.25, -70, true],
  ],
  slots: [
    { fortress: 'Durovernum', owns: ['Noviomagus'] },
    { fortress: 'Camulodunum', owns: ['Londinium'] },
    { fortress: 'Eboracum', owns: ['Lindum', 'Cataractonium'] },
    { fortress: 'Isca Silurum', owns: ['Moridunum', 'Glevum'] },
  ],
};

// ---------------------------------------------------------------- Egipto y Levante

const aegyptus: HistoricDef = {
  id: 'aegyptus',
  name: 'Egipto',
  desc: 'El Nilo, Judea y Siria',
  frame: { box: [28.6, 29.2, 36.9, 33.9], scale: 230 },
  climate: 'arido',
  style: () => 'cartago',
  cities: [
    F('Alexandria', 31.2, 29.92), A('Naucratis', 30.9, 30.59), F('Memphis', 29.85, 31.25), A('Bubastis', 30.57, 31.51),
    A('Tanis', 30.98, 31.88), A('Sebennytos', 30.97, 31.25), T('Pelusium', 31.04, 32.55), T('Rhinocolura', 31.13, 33.83),
    F('Gaza', 31.5, 34.47), A('Ioppe', 32.05, 34.75), F('Hierosolyma', 31.78, 35.23),
    F('Tyrus', 33.27, 35.2), F('Damascus', 33.51, 36.29), T('Gadara', 32.65, 35.68), F('Petra', 30.33, 35.44),
    A('Philadelphia', 31.95, 35.93), A('Bostra', 32.52, 36.48), T('Clysma', 29.97, 32.55), A('Aila', 29.55, 35.0),
  ],
  roads: [
    ['Alexandria', 'Naucratis'], ['Naucratis', 'Memphis'], ['Naucratis', 'Sebennytos'], ['Sebennytos', 'Bubastis'], ['Sebennytos', 'Tanis'],
    ['Bubastis', 'Memphis'], ['Bubastis', 'Tanis'], ['Tanis', 'Pelusium'], ['Memphis', 'Clysma'], ['Clysma', 'Pelusium'],
    ['Pelusium', 'Rhinocolura'], ['Rhinocolura', 'Gaza'], ['Gaza', 'Ioppe'], ['Gaza', 'Hierosolyma'], ['Ioppe', 'Hierosolyma'],
    ['Ioppe', 'Tyrus'], ['Hierosolyma', 'Gadara'], ['Gadara', 'Tyrus'], ['Tyrus', 'Damascus'], ['Gadara', 'Damascus'],
    ['Gadara', 'Bostra'], ['Bostra', 'Damascus'], ['Hierosolyma', 'Philadelphia'], ['Philadelphia', 'Bostra'], ['Philadelphia', 'Petra'],
    ['Petra', 'Aila'], ['Aila', 'Clysma'], ['Gaza', 'Petra'],
  ],
  rivers: [
    [[31.25, 29.25], [31.25, 29.85], [31.2, 30.15], [30.85, 30.6], [30.5, 31.05], [30.4, 31.42]],
    [[31.2, 30.15], [31.25, 30.6], [31.6, 31.0], [31.8, 31.42]],
    [[35.6, 33.2], [35.6, 32.7], [35.55, 32.2], [35.55, 31.8]],
  ],
  ridges: [
    [[33.8, 29.75], [34.2, 29.45]],
    [[35.6, 33.85], [35.95, 33.6]],
    [[35.12, 31.45], [35.25, 32.0]],
    [[35.5, 30.15], [35.6, 30.9]],
  ],
  labels: [
    ['MARE INTERNUM', 31.8, 32.7, 0, false], ['AEGYPTUS', 30.1, 30.3, 0, true], ['ARABIA', 36.1, 30.3, 0, true],
    ['SINAI', 33.7, 30.1, 0, true], ['IUDAEA', 34.85, 31.2, -70, true], ['SYRIA', 36.45, 33.1, 0, true],
  ],
  slots: [
    { fortress: 'Alexandria', owns: ['Naucratis', 'Sebennytos'] },
    { fortress: 'Damascus', owns: ['Gadara', 'Bostra'] },
    { fortress: 'Petra', owns: ['Aila', 'Philadelphia'] },
  ],
};

export const HISTORIC: HistoricDef[] = [italia, sicilia, hispania, galia, africa, grecia, britannia, aegyptus];
