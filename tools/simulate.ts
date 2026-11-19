// Simulador de equilibrio: juega cientos de partidas IA contra IA y mide resultados.
// Uso: npm run sim -- [partidas por escenario]
import { newGame, TICK, type PlayableCulture, type PlayerSetup } from '../src/core/game';
import { MAPS } from '../src/core/maps';
import { CAMPAIGNS, chapterPlayers } from '../src/core/campaign';
import { step } from '../src/core/sim';

const N = Number(process.argv[2] ?? 60);
const MODE = process.argv[3] ?? 'equilibrio';
const MAX_MIN = 70;

interface Result {
  winner: number | null;
  minutes: number;
  starvedShare: number;
}

function play(seed: number, mapId: string, players: PlayerSetup[]): Result {
  const s = newGame({ seed, mapId, players });
  const max = (MAX_MIN * 60) / TICK;
  let starved = 0;
  let samples = 0;
  for (let i = 0; i < max && s.winner === null; i++) {
    step(s);
    if (s.events.length > 50) s.events.length = 0;
    if (i % 100 === 0) {
      for (const f of s.factions) if (f.id && f.alive) (samples++, f.starving && starved++);
    }
  }
  return { winner: s.winner, minutes: s.time / 60, starvedShare: samples ? starved / samples : 0 };
}

const median = (xs: number[]) => {
  const a = xs.slice().sort((x, y) => x - y);
  return a.length ? a[Math.floor(a.length / 2)] : NaN;
};
const pct = (x: number) => `${(100 * x).toFixed(0)} %`.padStart(5);

interface Summary {
  /** Victorias por etiqueta (pueblo o papel). */
  wins: Record<string, number>;
  draws: number;
  median: number;
  starved: number;
}

/**
 * Juega N partidas rotando las posiciones: la etiqueta i juega en la posición (i + rot) % n.
 */
function scenario(name: string, mapId: string, setups: { label: string; p: PlayerSetup }[]): Summary {
  const n = MAPS[mapId].players;
  const wins: Record<string, number> = {};
  for (const x of setups) wins[x.label] = 0;
  let draws = 0;
  let starved = 0;
  const mins: number[] = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const rot = i % n;
    const players: PlayerSetup[] = new Array(n);
    const labelAt: string[] = new Array(n);
    setups.forEach((x, k) => {
      players[(k + rot) % n] = x.p;
      labelAt[(k + rot) % n] = x.label;
    });
    const r = play(2000 + i * 7919, mapId, players);
    starved += r.starvedShare;
    if (!r.winner) draws++;
    else {
      wins[labelAt[r.winner - 1]] += 1;
      mins.push(r.minutes);
    }
  }
  for (const k in wins) wins[k] /= N;
  const sum: Summary = { wins, draws: draws / N, median: median(mins), starved: starved / N };
  const parts = Object.entries(wins).map(([k, v]) => `${k} ${pct(v)}`).join(' | ');
  console.log(`${name.padEnd(30)} ${parts} | sin final ${pct(sum.draws)} | mediana ${sum.median.toFixed(1)} min | hambre ${pct(sum.starved)} | ${(Date.now() - t0) / 1000}s`);
  return sum;
}

const P = (culture: PlayableCulture, ai: string): PlayerSetup => ({ culture, ai });

if (MODE === 'campana') {
  campaignSim();
  process.exit(process.exitCode ?? 0);
}

console.log(`Partidas por escenario: ${N} (rotando posiciones)`);
const res = {
  rg: scenario('Po: Roma vs Galos', 'po', [{ label: 'Roma', p: P('roma', 'normal') }, { label: 'Galos', p: P('galos', 'normal') }]),
  rc: scenario('Po: Roma vs Cartago', 'po', [{ label: 'Roma', p: P('roma', 'normal') }, { label: 'Cartago', p: P('cartago', 'normal') }]),
  gc: scenario('Po: Galos vs Cartago', 'po', [{ label: 'Galos', p: P('galos', 'normal') }, { label: 'Cartago', p: P('cartago', 'normal') }]),
  tri: scenario('Trinacria: 3 pueblos', 'trinacria', [
    { label: 'Roma', p: P('roma', 'normal') },
    { label: 'Galos', p: P('galos', 'normal') },
    { label: 'Cartago', p: P('cartago', 'normal') },
  ]),
  his: scenario('Cuatro reinos: 4 bandos', 'cuatro', [
    { label: 'Roma', p: P('roma', 'normal') },
    { label: 'Galos', p: P('galos', 'normal') },
    { label: 'Cartago', p: P('cartago', 'normal') },
    { label: 'Helvecios', p: P('galos', 'normal') },
  ]),
  // Mismo pueblo en ambos lados para medir solo la dificultad.
  jf: scenario('Po: Jugador vs Fácil', 'po', [{ label: 'Jugador', p: P('roma', 'jugador') }, { label: 'IA', p: P('roma', 'facil') }]),
  jn: scenario('Po: Jugador vs Normal', 'po', [{ label: 'Jugador', p: P('roma', 'jugador') }, { label: 'IA', p: P('roma', 'normal') }]),
  jd: scenario('Po: Jugador vs Difícil', 'po', [{ label: 'Jugador', p: P('roma', 'jugador') }, { label: 'IA', p: P('roma', 'dificil') }]),
  jtn: scenario('Trinacria: Jugador vs 2 Normal', 'trinacria', [
    { label: 'Jugador', p: P('roma', 'jugador') },
    { label: 'IA1', p: P('galos', 'normal') },
    { label: 'IA2', p: P('cartago', 'normal') },
  ]),
};
console.log(JSON.stringify(res));

// Objetivos de equilibrio (ver CLAUDE.md).
const within = (x: number, a: number, b: number) => x >= a && x <= b;
const all = Object.values(res);
const checks: [string, boolean][] = [
  ['Duelos de pueblos (Po) entre 40 % y 60 %', [res.rg, res.rc, res.gc].every((r) => Object.values(r.wins).every((w) => within(w, 0.4, 0.6)))],
  ['Trinacria: ningún pueblo por encima del 45 % ni por debajo del 20 %', Object.values(res.tri.wins).every((w) => within(w, 0.2, 0.45))],
  ['Cuatro reinos: ningún bando por encima del 40 %', Object.values(res.his.wins).every((w) => w <= 0.4)],
  ['Duración mediana en Po entre 8 y 25 min', [res.rg, res.rc, res.gc, res.jn].every((r) => within(r.median, 8, 25))],
  ['Duración mediana en Trinacria e Hispania ≤ 40 min', [res.tri, res.his].every((r) => r.median <= 40)],
  ['Partidas sin final < 10 %', all.every((r) => r.draws < 0.1)],
  ['Jugador vence a Fácil ≥ 75 %', res.jf.wins.Jugador >= 0.75],
  ['Jugador vs Normal entre 35 % y 65 %', within(res.jn.wins.Jugador, 0.35, 0.65)],
  ['Difícil gana más que Normal (Jugador ≤ 42 % y menos que contra Normal)', res.jd.wins.Jugador <= 0.42 && res.jd.wins.Jugador < res.jn.wins.Jugador],
  ['La IA normal casi nunca pasa hambre (< 10 % del tiempo)', [res.rg, res.rc, res.gc, res.tri].every((r) => r.starved < 0.1)],
];
for (const [n, ok] of checks) console.log(`${ok ? '✔' : '✘'} ${n}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;

/** Capítulos de campaña: el sustituto del jugador contra la IA normal. */
function campaignSim(): void {
  console.log(`Campaña: ${N} partidas por capítulo (jugador = IA normal, rivales normal)`);
  const checks: [string, boolean][] = [];
  for (const camp of Object.values(CAMPAIGNS)) {
    camp.chapters.forEach((ch, i) => {
      let wins = 0;
      let draws = 0;
      const mins: number[] = [];
      const t0 = Date.now();
      for (let k = 0; k < N; k++) {
        const r = play(5000 + k * 7919, ch.mapId, chapterPlayers(ch, 'normal', undefined, 'jugador'));
        if (!r.winner) draws++;
        else {
          if (r.winner === 1) wins++;
          mins.push(r.minutes);
        }
      }
      const name = `${camp.name} ${i + 1}. ${ch.title}`;
      const w = wins / N;
      console.log(`${name.padEnd(44)} jugador ${pct(w)} | sin final ${pct(draws / N)} | mediana ${median(mins).toFixed(1)} min | ${(Date.now() - t0) / 1000}s`);
      checks.push([`${name}: jugador entre 25 % y 90 %, mediana ≤ 45 min, sin final < 15 %`, w >= 0.25 && w <= 0.9 && (isNaN(median(mins)) || median(mins) <= 45) && draws / N < 0.15]);
    });
  }
  for (const [n, ok] of checks) console.log(`${ok ? '✔' : '✘'} ${n}`);
  if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
}
