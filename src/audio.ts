// Sonido sintetizado con WebAudio (sin archivos). Se activa tras el primer toque.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let muted = false;

export function initAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.05);
}

export function isMuted(): boolean {
  return muted;
}

export function suspendAudio(): void {
  if (ctx && ctx.state === 'running') void ctx.suspend();
}

export function resumeAudio(): void {
  if (ctx && ctx.state === 'suspended') void ctx.resume();
}

function tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, slide = 0): void {
  if (!ctx || !master || muted) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(dur: number, vol: number, freq: number, q = 1, delay = 0): void {
  if (!ctx || !master || !noiseBuf || muted) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export const sfx = {
  tap() {
    tone(660, 0.06, 'triangle', 0.08);
  },
  select() {
    tone(520, 0.07, 'triangle', 0.1);
    tone(780, 0.08, 'triangle', 0.08, 0.05);
  },
  deny() {
    tone(180, 0.15, 'square', 0.05, 0, 0.8);
  },
  recruit() {
    tone(392, 0.12, 'triangle', 0.1);
    tone(523, 0.16, 'triangle', 0.1, 0.09);
  },
  march() {
    for (let i = 0; i < 3; i++) noise(0.08, 0.12, 300, 2, i * 0.12);
    tone(147, 0.25, 'sawtooth', 0.04, 0, 1.02);
  },
  horn() {
    // cuerno de guerra
    tone(110, 0.9, 'sawtooth', 0.07, 0, 1.03);
    tone(165, 0.9, 'sawtooth', 0.04, 0.02, 1.02);
  },
  clash() {
    noise(0.07, 0.07, 2500 + Math.random() * 2500, 6);
    if (Math.random() < 0.4) tone(1800 + Math.random() * 900, 0.09, 'square', 0.015);
  },
  breach() {
    noise(0.8, 0.35, 120, 0.7);
    noise(0.5, 0.2, 400, 1, 0.1);
  },
  capture() {
    const n = [392, 494, 587, 784];
    n.forEach((f, i) => tone(f, 0.25, 'triangle', 0.1, i * 0.11));
  },
  lost() {
    const n = [392, 349, 311, 262];
    n.forEach((f, i) => tone(f, 0.3, 'triangle', 0.09, i * 0.14));
  },
  victory() {
    const n = [262, 330, 392, 523, 659, 784];
    n.forEach((f, i) => tone(f, 0.45, 'triangle', 0.1, i * 0.13));
    tone(131, 1.6, 'sawtooth', 0.04, 0.2);
  },
  defeat() {
    const n = [330, 294, 262, 247, 196];
    n.forEach((f, i) => tone(f, 0.55, 'sine', 0.1, i * 0.22));
  },
};

// ---------------- Música generativa ----------------
// Dórico en re: bordón grave, lira punteada y tambor de marco. Con batallas, más tambor.

let musicGain: GainNode | null = null;
let musicOn = true;
let musicTimer: ReturnType<typeof setInterval> | null = null;
let nextNote = 0;
let stepIdx = 0;
let intensity = 0;
let melodyDeg = 4;
let droneNodes: { stop: () => void } | null = null;

const SCALE = [146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63, 293.66, 329.63, 349.23, 392.0];
const TEMPO = 76;

export function setMusicOn(on: boolean): void {
  musicOn = on;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.22 : 0, ctx.currentTime, 0.3);
  if (on) startMusic();
}

export function isMusicOn(): boolean {
  return musicOn;
}

/** 0 = calma, 1 = batalla. */
export function setMusicIntensity(v: number): void {
  intensity = v;
}

function pluck(freq: number, t: number, vol: number): void {
  if (!ctx || !musicGain) return;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 2400;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  for (const [mul, type, v] of [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12]] as [number, OscillatorType, number][]) {
    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * mul;
    og.gain.value = v;
    o.connect(og).connect(f);
    o.start(t);
    o.stop(t + 1.5);
  }
  f.connect(g).connect(musicGain);
}

function drum(t: number, vol: number, low = true): void {
  if (!ctx || !musicGain || !noiseBuf) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(low ? 95 : 160, t);
  o.frequency.exponentialRampToValueAtTime(low ? 50 : 90, t + 0.25);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  o.connect(g).connect(musicGain);
  o.start(t);
  o.stop(t + 0.4);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const nf = ctx.createBiquadFilter();
  nf.type = 'bandpass';
  nf.frequency.value = low ? 700 : 1600;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vol * 0.35, t);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  n.connect(nf).connect(ng).connect(musicGain);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.1);
}

function startDrone(): void {
  if (!ctx || !musicGain || droneNodes) return;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 380;
  const g = ctx.createGain();
  g.gain.value = 0.05;
  const lfo = ctx.createOscillator();
  const lg = ctx.createGain();
  lfo.frequency.value = 0.07;
  lg.gain.value = 0.025;
  lfo.connect(lg).connect(g.gain);
  const oscs = [73.42, 110, 73.42 * 1.003].map((fr) => {
    const o = ctx!.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = fr;
    o.connect(f);
    o.start();
    return o;
  });
  f.connect(g).connect(musicGain);
  lfo.start();
  droneNodes = {
    stop: () => {
      for (const o of oscs) o.stop();
      lfo.stop();
    },
  };
}

function schedule(): void {
  if (!ctx || !musicGain || !musicOn) return;
  const spb = 60 / TEMPO / 2; // corcheas
  while (nextNote < ctx.currentTime + 0.25) {
    const t = Math.max(nextNote, ctx.currentTime + 0.02);
    const beat = stepIdx % 16;
    // Tambor: pulso lento en calma, ritmo de marcha en batalla.
    if (beat % 8 === 0) drum(t, 0.16 + 0.1 * intensity);
    if (intensity > 0.5 && (beat % 4 === 2 || beat === 7 || beat === 15)) drum(t, 0.1, false);
    // Lira: frases de 16 corcheas con silencios.
    const phrase = Math.floor(stepIdx / 16) % 4;
    const play = beat % 2 === 0 ? Math.random() < 0.62 : Math.random() < 0.18 + 0.2 * intensity;
    if (play && !(phrase === 3 && beat > 10)) {
      const move = [-2, -1, -1, 0, 1, 1, 2][Math.floor(Math.random() * 7)];
      melodyDeg = Math.max(0, Math.min(SCALE.length - 1, melodyDeg + move));
      if (beat === 0) melodyDeg = [4, 0, 3, 4][phrase];
      pluck(SCALE[melodyDeg], t, 0.11);
      if (beat === 0 && Math.random() < 0.6) pluck(SCALE[Math.max(0, melodyDeg - 4)], t, 0.06);
    }
    nextNote = t + spb;
    stepIdx++;
  }
}

export function startMusic(): void {
  if (!ctx || !master) return;
  if (!musicGain) {
    musicGain = ctx.createGain();
    musicGain.gain.value = musicOn ? 0.22 : 0;
    musicGain.connect(master);
  }
  if (!musicOn) return;
  startDrone();
  if (!musicTimer) {
    nextNote = ctx.currentTime + 0.1;
    musicTimer = setInterval(schedule, 60);
  }
}
