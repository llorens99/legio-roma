// Minimapa: miniatura del terreno con plazas, ejércitos, batallas y el recuadro de la vista.
import type { GameState } from '../core/types';
import type { Camera } from './camera';

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private base: HTMLCanvasElement | null = null;
  private baseKey = '';
  private w = 0;
  private h = 0;
  private scale = 1;

  constructor(
    public el: HTMLElement,
    private canvas: HTMLCanvasElement,
    onPick: (wx: number, wy: number) => void,
  ) {
    this.ctx = canvas.getContext('2d')!;
    const pick = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      onPick(((e.clientX - r.left) / r.width) * (this.w / this.scale), ((e.clientY - r.top) / r.height) * (this.h / this.scale));
    };
    let down = false;
    canvas.addEventListener('pointerdown', (e) => {
      down = true;
      canvas.setPointerCapture(e.pointerId);
      pick(e);
      e.stopPropagation();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (down) pick(e);
    });
    canvas.addEventListener('pointerup', () => (down = false));
    canvas.addEventListener('pointercancel', () => (down = false));
  }

  /** Ajusta el tamaño a un mapa (ancho fijo en CSS, alto proporcional y limitado). */
  private fit(state: GameState): void {
    const maxW = 116;
    const maxH = 150;
    const k = Math.min(maxW / state.width, maxH / state.height);
    const cw = Math.round(state.width * k);
    const ch = Math.round(state.height * k);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(cw * dpr) || this.canvas.height !== Math.round(ch * dpr)) {
      this.canvas.width = Math.round(cw * dpr);
      this.canvas.height = Math.round(ch * dpr);
      this.canvas.style.width = `${cw}px`;
      this.canvas.style.height = `${ch}px`;
    }
    this.w = this.canvas.width;
    this.h = this.canvas.height;
    this.scale = this.w / state.width;
  }

  draw(state: GameState, terrain: HTMLCanvasElement | null, terrainKey: string, cam: Camera, player: number, now: number): void {
    this.fit(state);
    const c = this.ctx;
    const key = `${terrainKey}|${this.w}x${this.h}`;
    if (terrain && this.baseKey !== key) {
      this.base = document.createElement('canvas');
      this.base.width = this.w;
      this.base.height = this.h;
      const bc = this.base.getContext('2d')!;
      bc.imageSmoothingQuality = 'high';
      bc.drawImage(terrain, 0, 0, this.w, this.h);
      this.baseKey = key;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.base) c.drawImage(this.base, 0, 0);
    else {
      c.fillStyle = '#7d8a55';
      c.fillRect(0, 0, this.w, this.h);
    }
    const k = this.scale;
    c.setTransform(k, 0, 0, k, 0, 0);
    // Caminos.
    c.strokeStyle = 'rgba(70,50,25,0.55)';
    c.lineWidth = 4 / k / 2;
    for (const r of state.roads) {
      c.beginPath();
      c.moveTo(r.pts[0].x, r.pts[0].y);
      c.lineTo(r.pts[r.pts.length - 1].x, r.pts[r.pts.length - 1].y);
      c.stroke();
    }
    // Plazas.
    for (const s of state.settlements) {
      const r = (s.kind === 'fortaleza' ? 4.2 : 3) / k;
      c.fillStyle = state.factions[s.owner].color;
      c.strokeStyle = s.owner === player ? '#ffe9a8' : 'rgba(20,12,6,0.8)';
      c.lineWidth = 1.2 / k;
      c.beginPath();
      if (s.kind === 'fortaleza') c.rect(s.x - r, s.y - r, r * 2, r * 2);
      else c.arc(s.x, s.y, r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
    // Ejércitos.
    for (const a of state.armies) {
      const road = state.roads[a.road];
      const t = road.len ? a.d / road.len : 0;
      const A = state.settlements[a.fromNode];
      const B = state.settlements[a.toNode];
      const x = A.x + (B.x - A.x) * t;
      const y = A.y + (B.y - A.y) * t;
      c.fillStyle = state.factions[a.owner].color;
      c.strokeStyle = '#fff';
      c.lineWidth = 1 / k;
      c.beginPath();
      c.moveTo(x, y - 3.4 / k);
      c.lineTo(x + 3 / k, y + 2.4 / k);
      c.lineTo(x - 3 / k, y + 2.4 / k);
      c.closePath();
      c.fill();
      c.stroke();
    }
    // Batallas.
    const pulse = 0.5 + 0.5 * Math.sin(now * 6);
    for (const b of state.battles) {
      c.strokeStyle = `rgba(255,80,50,${0.5 + 0.5 * pulse})`;
      c.lineWidth = 1.6 / k;
      c.beginPath();
      c.arc(b.x, b.y, (5 + pulse * 2) / k, 0, Math.PI * 2);
      c.stroke();
    }
    // Vista actual.
    const [x0, y0] = cam.toWorld(0, 0);
    const [x1, y1] = cam.toWorld(cam.vw, cam.vh);
    c.strokeStyle = 'rgba(255,248,225,0.95)';
    c.lineWidth = 1.5 / k;
    c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  }
}
