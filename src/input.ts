// Gestos táctiles: tocar, arrastrar el mapa (con inercia), pellizcar para zoom y arrastrar para enviar tropas.

export interface GestureHandlers {
  tap(sx: number, sy: number): void;
  pan(dx: number, dy: number): void;
  zoom(sx: number, sy: number, factor: number): void;
  /** ¿Empezar un arrastre de órdenes desde aquí? */
  canDragFrom(sx: number, sy: number): boolean;
  dragMove(sx: number, sy: number): void;
  dragEnd(sx: number, sy: number, cancelled: boolean): void;
}

export class Gestures {
  private pts = new Map<number, { x: number; y: number }>();
  private mode: 'idle' | 'pending' | 'pan' | 'pinch' | 'drag' | 'ignore' = 'idle';
  private start = { x: 0, y: 0 };
  private last = { x: 0, y: 0 };
  private dragOk = false;
  private pinchDist = 0;
  private pinchMid = { x: 0, y: 0 };
  vx = 0;
  vy = 0;
  private lastMoveT = 0;

  constructor(el: HTMLElement, private h: GestureHandlers) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.h.zoom(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  private down(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.vx = this.vy = 0;
    if (this.pts.size === 1) {
      this.mode = 'pending';
      this.start = { x: e.clientX, y: e.clientY };
      this.last = { ...this.start };
      this.dragOk = this.h.canDragFrom(e.clientX, e.clientY);
    } else if (this.pts.size === 2) {
      if (this.mode === 'drag') this.h.dragEnd(this.last.x, this.last.y, true);
      this.mode = 'pinch';
      const [a, b] = [...this.pts.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  private move(e: PointerEvent): void {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.mode === 'pinch' && this.pts.size >= 2) {
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (this.pinchDist > 0) this.h.zoom(mid.x, mid.y, d / this.pinchDist);
      this.h.pan(mid.x - this.pinchMid.x, mid.y - this.pinchMid.y);
      this.pinchDist = d;
      this.pinchMid = mid;
      return;
    }
    if (this.pts.size !== 1) return;
    const x = e.clientX;
    const y = e.clientY;
    if (this.mode === 'pending' && Math.hypot(x - this.start.x, y - this.start.y) > 9) {
      this.mode = this.dragOk ? 'drag' : 'pan';
    }
    if (this.mode === 'pan') {
      const now = performance.now();
      const dt = Math.max(1, now - this.lastMoveT);
      const dx = x - this.last.x;
      const dy = y - this.last.y;
      this.h.pan(dx, dy);
      this.vx = this.vx * 0.5 + ((dx / dt) * 1000) * 0.5;
      this.vy = this.vy * 0.5 + ((dy / dt) * 1000) * 0.5;
      this.lastMoveT = now;
    } else if (this.mode === 'drag') {
      this.h.dragMove(x, y);
    }
    this.last = { x, y };
  }

  private up(e: PointerEvent, cancelled = false): void {
    if (!this.pts.has(e.pointerId)) return;
    this.pts.delete(e.pointerId);
    if (this.mode === 'pending' && !cancelled) this.h.tap(e.clientX, e.clientY);
    else if (this.mode === 'drag') this.h.dragEnd(e.clientX, e.clientY, cancelled);
    else if (this.mode === 'pan' && performance.now() - this.lastMoveT > 80) this.vx = this.vy = 0;
    if (this.pts.size === 0) this.mode = 'idle';
    else if (this.mode === 'pinch' && this.pts.size === 1) this.mode = 'ignore';
  }

  /** Inercia tras soltar el mapa. */
  tick(dt: number): void {
    if (this.mode !== 'idle' || (Math.abs(this.vx) < 5 && Math.abs(this.vy) < 5)) return;
    this.h.pan(this.vx * dt, this.vy * dt);
    const k = Math.exp(-dt * 5);
    this.vx *= k;
    this.vy *= k;
  }
}
