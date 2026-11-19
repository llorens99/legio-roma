// Simulador de equilibrio: juega cientos de partidas IA contra IA y mide resultados.
// Uso: npm run sim -- [partidas por escenario]
import { newGame, TICK, type PlayerSetup } from '../src/core/game';
import { step } from '../src/core/sim';

const N = Number(process.argv[2] ?? 60);
const MAX_MIN = 50;

interface Result { winner: number | null; minutes: number; }

function play(seed: number, south: PlayerSetup, north: PlayerSetup): Result {
  const s = newGame({ seed, players: [south, north] });
  const max = (MAX_MIN * 60) / TICK;
  for (let i = 0; i < max && s.winner === null; i++) {
    step(s);
    if (s.events.length > 50) s.events.length = 0;
  }
  return { winner: s.winner, minutes: s.time / 60 };
}

const median = (xs: number[]) => { const a = xs.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : NaN; };
const pct = (x: number) => `${(100 * x).toFixed(0)} %`;

function scenario(name: string, a: PlayerSetup, b: PlayerSetup) {
  // Cada semilla se juega con a al sur y b al norte, y al revés, para anular la ventaja de lado.
  let winsA = 0, winsB = 0, draws = 0;
  const mins: number[] = [];
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const seed = 1000 + i * 7919;
    const swap = i % 2 === 1;
    const r = swap ? play(seed, b, a) : play(seed, a, b);
    const aId = swap ? 2 : 1;
    if (r.winner === null || r.winner === 0) draws++;
    else if (r.winner === aId) winsA++;
    else winsB++;
    if (r.winner) mins.push(r.minutes);
  }
  console.log(`${name.padEnd(34)} A gana ${pct(winsA / N).padStart(5)} | B gana ${pct(winsB / N).padStart(5)} | sin final ${pct(draws / N).padStart(5)} | mediana ${median(mins).toFixed(1)} min | ${(Date.now() - t0) / 1000}s`);
  return { winsA: winsA / N, winsB: winsB / N, draws: draws / N, median: median(mins) };
}

console.log(`Partidas por escenario: ${N} (alternando lado)`);
const res = {
  rvg: scenario('Roma(normal) vs Galos(normal)', { culture: 'roma', ai: 'normal' }, { culture: 'galos', ai: 'normal' }),
  rvr: scenario('Roma(normal) vs Roma(normal)', { culture: 'roma', ai: 'normal' }, { culture: 'roma', ai: 'normal' }),
  jRf: scenario('Jugador Roma vs Galos fácil', { culture: 'roma', ai: 'jugador' }, { culture: 'galos', ai: 'facil' }),
  jRn: scenario('Jugador Roma vs Galos normal', { culture: 'roma', ai: 'jugador' }, { culture: 'galos', ai: 'normal' }),
  jGn: scenario('Jugador Galos vs Roma normal', { culture: 'galos', ai: 'jugador' }, { culture: 'roma', ai: 'normal' }),
};
console.log(JSON.stringify(res));

// Objetivos de equilibrio (ver CLAUDE.md).
const checks: [string, boolean][] = [
  ['Roma vs Galos entre 40 % y 60 %', res.rvg.winsA >= 0.4 && res.rvg.winsA <= 0.6],
  ['Duración mediana entre 8 y 25 min', [res.rvg, res.jRn, res.jGn].every((r) => r.median >= 8 && r.median <= 25)],
  ['Partidas sin final < 10 %', Object.values(res).every((r) => r.draws < 0.1)],
  ['Jugador vence a Fácil ≥ 75 %', res.jRf.winsA >= 0.75],
  ['Jugador vs Normal entre 35 % y 65 %', [res.jRn, res.jGn].every((r) => r.winsA >= 0.35 && r.winsA <= 0.65)],
];
for (const [n, ok] of checks) console.log(`${ok ? '✔' : '✘'} ${n}`);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
