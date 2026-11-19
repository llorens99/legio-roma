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
