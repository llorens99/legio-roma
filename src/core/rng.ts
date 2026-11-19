// Generador aleatorio con semilla (mulberry32). El estado vive dentro de GameState.rng
// para que la partida sea determinista, se pueda guardar y simular.

export function nextRandom(state: { rng: number }): number {
  let t = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Generador independiente (para terreno, geometría) a partir de una semilla. */
export function makeRng(seed: number): () => number {
  const s = { rng: seed | 0 };
  return () => nextRandom(s);
}

export function randInt(state: { rng: number }, n: number): number {
  return Math.floor(nextRandom(state) * n);
}
