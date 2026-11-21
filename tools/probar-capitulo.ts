// Prueba rápida de variantes de un capítulo: npx vite-node tools/probar-capitulo.ts
// Edita VARIANTES y compara el porcentaje de victorias del sustituto del jugador.
import { newGame, TICK } from '../src/core/game';
import { chapterPlayers, type Chapter } from '../src/core/campaign';
import { step } from '../src/core/sim';

const N = Number(process.argv[2] ?? 20);
const VARIANTES: Record<string, Chapter> = JSON.parse(process.env.VARIANTES ?? '{}');

for (const [name, ch] of Object.entries(VARIANTES)) {
  let wins = 0, draws = 0;
  const mins: number[] = [];
  for (let k = 0; k < N; k++) {
    const s = newGame({ seed: 5000 + k * 7919, mapId: ch.mapId, players: chapterPlayers(ch, 'normal', undefined, 'jugador') });
    for (let i = 0; i < (70 * 60) / TICK && s.winner === null; i++) { step(s); if (s.events.length > 50) s.events.length = 0; }
    if (!s.winner) draws++; else { if (s.winner === 1) wins++; mins.push(s.time / 60); }
  }
  mins.sort((a, b) => a - b);
  console.log(`${name.padEnd(12)} jugador ${((100 * wins) / N).toFixed(0)} % | sin final ${((100 * draws) / N).toFixed(0)} % | mediana ${(mins[mins.length >> 1] ?? NaN).toFixed(1)} min`);
}
