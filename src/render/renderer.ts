import { armySpeed } from '../core/game';
import { pointOnRoad } from '../core/maps';
import type { Army, Battle, GameState, Pt, Squad } from '../core/types';
import { KINDS, maxHp, menOf, totalMen, UNITS } from '../core/units';
import type { Camera } from './camera';
import { fallenSprite, RADIUS, settlementSprite, soldierSprite, type Sprite } from './sprites';
import { bakeTerrain, TERRAIN_SCALE } from './terrain';

export type Selection = { kind: 'settlement'; id: number } | { kind: 'army'; id: number } | null;

export interface ViewState {
  player: number;
  selected: Selection;
  targeting: boolean;
  drag: { from: number; to: Pt; hover: number | null } | null;
}

interface Fig {
  x: number;
  y: number;
  unit: string;
  color: string;
  flip: boolean;
  /** Desplazamiento de animación (lucha / marcha). */
  ox: number;
  oy: number;
  squad: number;
  side: number;
}

interface Arrow {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t0: number;
  dur: number;
  h: number;
  stone: boolean;
}

interface Corpse {
  x: number;
  y: number;
  sprite: Sprite;
  t0: number;
}

const CORPSE_LIFE = 25;

export class Renderer {
  ctx: CanvasRenderingContext2D;
  terrain: HTMLCanvasElement | null = null;
  terrainKey = '';
  dpr = 1;
  arrows: Arrow[] = [];
  corpses: Corpse[] = [];
  prevMen = new Map<number, number>();
  prevPos = new Map<number, Pt[]>();
  /** Frente de cada ejército dibujado (para tocarlo). */
  armyFront = new Map<number, Pt>();
  lastTime = 0;

  constructor(public canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  resize(cam: Camera): void {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    cam.vw = w;
    cam.vh = h;
    cam.clamp();
  }

  ensureTerrain(state: GameState): void {
    const key = `${state.mapId}|${state.seed}`;
    if (this.terrainKey === key) return;
    this.terrain = bakeTerrain(state);
    this.terrainKey = key;
    this.arrows = [];
    this.corpses = [];
    this.prevMen.clear();
    this.prevPos.clear();
  }

  // ---------------- Distribución de figuras ----------------

  private marchFigures(state: GameState, a: Army, lag: number, now: number, out: Fig[]): void {
    const road = state.roads[a.road];
    const sign = a.fromNode === road.a ? 1 : -1;
    let d = a.d;
    if (a.battleId === null && !a.waiting) d = Math.min(road.len, d + armySpeed(a) * lag);
    const front = sign > 0 ? d : road.len - d;
    const color = state.factions[a.owner].color;
    const fp = pointOnRoad(road, front);
    this.armyFront.set(a.id, { x: fp.x, y: fp.y });
    const walking = a.battleId === null && !a.waiting;
    let base = 0;
    a.squads.forEach((sq, k) => {
      const men = menOf(sq);
      const cav = UNITS[sq.unit].role === 'caballeria';
      const perRow = cav ? 2 : 3;
      const rowD = cav ? 7.5 : 4.6;
      const lat = cav ? 5.5 : 4;
      for (let m = 0; m < men; m++) {
        const row = Math.floor(m / perRow);
        const col = (m % perRow) - (perRow - 1) / 2;
        const back = base + row * rowD + 2;
        const p = pointOnRoad(road, front - sign * back);
        const dx = p.dx * sign;
        const dy = p.dy * sign;
        const bob = walking ? Math.abs(Math.sin(now * (cav ? 11 : 7) + m * 1.3 + k)) * -0.9 : 0;
        out.push({ x: p.x - dy * col * lat, y: p.y + dx * col * lat, unit: sq.unit, color, flip: dx < 0, ox: 0, oy: bob, squad: sq.id, side: -1 });
      }
      base += Math.ceil(10 / perRow) * rowD + 4;
    });
  }

  private blockFigures(sq: Squad, cx: number, cy: number, fx: number, fy: number, color: string, side: number, fight: number, now: number, out: Fig[]): void {
    // Bloque de 3 en fondo mirando hacia (fx, fy).
    const men = menOf(sq);
    const lx = -fy;
    const ly = fx;
    const cav = UNITS[sq.unit].role === 'caballeria';
    const perRow = cav ? 3 : 4;
    const latS = cav ? 5.2 : 3.6;
    const rowS = cav ? 6.5 : 4.2;
    for (let m = 0; m < men; m++) {
      const col = (m % perRow) - (perRow - 1) / 2;
      const row = Math.floor(m / perRow);
      const x = cx + lx * col * latS - fx * row * rowS;
      const y = cy + ly * col * latS - fy * row * rowS;
      const lunge = fight * (row === 0 ? Math.max(0, Math.sin(now * 9 + m * 2.1 + sq.id)) * 2.2 : Math.sin(now * 3 + m) * 0.4);
      out.push({ x, y, unit: sq.unit, color, flip: fx < 0, ox: fx * lunge, oy: fy * lunge, squad: sq.id, side });
    }
  }

  private battleFigures(state: GameState, b: Battle, now: number, out: Fig[]): void {
    if (b.settlement !== null) {
      const s = state.settlements[b.settlement];
      const R = RADIUS[s.kind];
      const di = b.sides[0].garrison ? 0 : 1;
      const breached = s.walls <= 0;
      let mainAngle = 0;
      let first = true;
      for (const id of b.sides[1 - di].armies) {
        const a = state.armies.find((x) => x.id === id);
        if (!a) continue;
        const from = state.settlements[a.fromNode];
        const ang = Math.atan2(from.y - s.y, from.x - s.x);
        if (first) mainAngle = ang;
        first = false;
        const color = state.factions[a.owner].color;
        const melee = a.squads.filter((q) => !UNITS[q.unit].ranged);
        const ranged = a.squads.filter((q) => UNITS[q.unit].ranged);
        const place = (list: Squad[], r: number) => {
          const step = 16 / r;
          list.forEach((sq, i) => {
            const k = i - (list.length - 1) / 2;
            const t = ang + k * step;
            const cx = s.x + Math.cos(t) * r;
            const cy = s.y + Math.sin(t) * r;
            this.blockFigures(sq, cx, cy, -Math.cos(t), -Math.sin(t), color, 1 - di, UNITS[sq.unit].ranged ? 0.2 : 1, now, out);
          });
        };
        place(melee, R + (breached ? 6 : 9));
        place(ranged, R + 34);
        const fp = { x: s.x + Math.cos(ang) * (R + 30), y: s.y + Math.sin(ang) * (R + 30) };
        this.armyFront.set(a.id, fp);
      }
      // Defensores sobre la muralla (o en la brecha).
      const color = state.factions[s.owner].color;
      const g = s.garrison;
      const n = Math.min(22, g.length * 2);
      for (let i = 0; i < n; i++) {
        const sq = g[i % g.length];
        const k = i - (n - 1) / 2;
        const r = breached ? R + 1 : R - 5;
        const t = mainAngle + (k * 7) / r;
        const fx = Math.cos(t);
        const fy = Math.sin(t);
        const lunge = breached ? Math.max(0, Math.sin(now * 9 + i * 1.7)) * 2 : 0;
        out.push({ x: s.x + fx * r, y: s.y + fy * r, unit: sq.unit, color, flip: fx < 0, ox: fx * lunge, oy: fy * lunge, squad: sq.id, side: di });
      }
      return;
    }
    // Batalla de campo.
    const road = state.roads[b.road!];
    const p = pointOnRoad(road, b.s);
    b.sides.forEach((side, si) => {
      const armies = side.armies.map((id) => state.armies.find((x) => x.id === id)).filter((x): x is Army => !!x);
      if (!armies.length) return;
      const a0 = armies[0];
      const sign = a0.fromNode === road.a ? 1 : -1;
      // Mira en su dirección de marcha (hacia la batalla).
      const fx = p.dx * sign;
      const fy = p.dy * sign;
      const lx = -fy;
      const ly = fx;
      const color = state.factions[side.faction].color;
      const squads = armies.flatMap((a) => a.squads);
      const melee = squads.filter((q) => !UNITS[q.unit].ranged);
      const ranged = squads.filter((q) => UNITS[q.unit].ranged);
      const ordered = [...melee, ...ranged];
      const perRank = 4;
      ordered.forEach((sq, i) => {
        const rank = Math.floor(i / perRank);
        const inRank = Math.min(perRank, ordered.length - rank * perRank);
        const k = (i % perRank) - (inRank - 1) / 2;
        const back = 6 + rank * 16 + (UNITS[sq.unit].ranged && rank === 0 ? 10 : 0);
        const cx = p.x - fx * back + lx * k * 16;
        const cy = p.y - fy * back + ly * k * 16;
        this.blockFigures(sq, cx, cy, fx, fy, color, si, rank === 0 && !UNITS[sq.unit].ranged ? 1 : 0.15, now, out);
      });
      for (const a of armies) this.armyFront.set(a.id, { x: p.x - fx * 20, y: p.y - fy * 20 });
    });
  }

  // ---------------- Dibujo ----------------

  draw(state: GameState, cam: Camera, view: ViewState, lag: number, now: number): void {
    const ctx = this.ctx;
    const dt = Math.min(0.1, Math.max(0, now - this.lastTime));
    this.lastTime = now;
    this.ensureTerrain(state);
    const dpr = this.dpr;
    const z = cam.z;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#5b4a33';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cam.vw / 2 - cam.x * z), dpr * (cam.vh / 2 - cam.y * z));
    ctx.imageSmoothingEnabled = true;

    // Terreno: solo la parte visible.
    const [x0, y0] = cam.toWorld(0, 0);
    const [x1, y1] = cam.toWorld(cam.vw, cam.vh);
    const sx = Math.max(0, x0);
    const sy = Math.max(0, y0);
    const ex = Math.min(state.width, x1);
    const ey = Math.min(state.height, y1);
    if (this.terrain && ex > sx && ey > sy) {
      const S = TERRAIN_SCALE;
      ctx.drawImage(this.terrain, sx * S, sy * S, (ex - sx) * S, (ey - sy) * S, sx, sy, ex - sx, ey - sy);
    }
    const visible = (x: number, y: number, m = 60) => x > x0 - m && x < x1 + m && y > y0 - m && y < y1 + m;

    // Anillos de dueño.
    for (const s of state.settlements) {
      if (!visible(s.x, s.y)) continue;
      const R = RADIUS[s.kind];
      if (s.owner !== 0) {
        ctx.fillStyle = hexA(state.factions[s.owner].color, 0.28);
        ctx.beginPath();
        ctx.arc(s.x, s.y, R + 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexA(state.factions[s.owner].color, 0.85);
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Muertos.
    this.corpses = this.corpses.filter((c) => now - c.t0 < CORPSE_LIFE);
    for (const c of this.corpses) {
      if (!visible(c.x, c.y)) continue;
      const age = (now - c.t0) / CORPSE_LIFE;
      ctx.globalAlpha = Math.min(0.85, (1 - age) * 1.4);
      ctx.drawImage(c.sprite.canvas, c.x - c.sprite.ax, c.y - c.sprite.ay, c.sprite.w, c.sprite.h);
    }
    ctx.globalAlpha = 1;

    // Asentamientos.
    const sorted = state.settlements.slice().sort((a, b) => a.y - b.y);
    for (const s of sorted) {
      if (!visible(s.x, s.y)) continue;
      const sp = settlementSprite(s.kind, s.style);
      ctx.drawImage(sp.canvas, s.x - sp.ax, s.y - sp.ay, sp.w, sp.h);
      const k = KINDS[s.kind];
      if (s.walls < k.wallHp * 0.5) {
        // Daños: humo y escombros.
        const dmg = 1 - s.walls / k.wallHp;
        ctx.fillStyle = `rgba(60,50,40,${0.25 * dmg})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, RADIUS[s.kind], 0, Math.PI * 2);
        ctx.fill();
        if (s.battleId !== null) {
          for (let i = 0; i < 3; i++) {
            const t = (now * 0.4 + i / 3) % 1;
            ctx.fillStyle = `rgba(90,85,80,${0.35 * (1 - t)})`;
            ctx.beginPath();
            ctx.arc(s.x + Math.sin(i * 2.3) * 12 + t * 8, s.y - 8 - t * 30, 5 + t * 10, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Figuras de ejércitos y batallas.
    this.armyFront.clear();
    const figs: Fig[] = [];
    for (const a of state.armies) if (a.battleId === null) this.marchFigures(state, a, lag, now, figs);
    for (const b of state.battles) this.battleFigures(state, b, now, figs);
    this.trackLosses(state, figs, now);
    this.spawnArrows(state, figs, dt, now);
    figs.sort((a, b) => a.y - b.y);
    for (const f of figs) {
      if (!visible(f.x, f.y, 20)) continue;
      const sp = soldierSprite(f.unit, f.color, f.flip);
      ctx.drawImage(sp.canvas, f.x + f.ox - sp.ax, f.y + f.oy - sp.ay, sp.w, sp.h);
    }

    // Proyectiles.
    this.arrows = this.arrows.filter((a) => now - a.t0 < a.dur);
    ctx.lineCap = 'round';
    for (const a of this.arrows) {
      const t = (now - a.t0) / a.dur;
      const x = a.x0 + (a.x1 - a.x0) * t;
      const y = a.y0 + (a.y1 - a.y0) * t - Math.sin(Math.PI * t) * a.h;
      if (!visible(x, y, 10)) continue;
      if (a.stone) {
        ctx.fillStyle = '#3b3329';
        ctx.fillRect(x - 0.7, y - 0.7, 1.4, 1.4);
      } else {
        const vx = a.x1 - a.x0;
        const vy = a.y1 - a.y0 - Math.cos(Math.PI * t) * Math.PI * a.h;
        const l = Math.hypot(vx, vy) || 1;
        ctx.strokeStyle = '#2b2116';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x - (vx / l) * 2.6, y - (vy / l) * 2.6);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    }

    // Banderas.
    for (const s of state.settlements) {
      if (!visible(s.x, s.y)) continue;
      const R = RADIUS[s.kind];
      const px = s.x + R * 0.45;
      const py = s.y - R * 0.55;
      ctx.strokeStyle = '#3d2c1a';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px, py - 17);
      ctx.stroke();
      const col = state.factions[s.owner].color;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(px, py - 17);
      for (let i = 0; i <= 6; i++) {
        const x = px + i * 1.7;
        ctx.lineTo(x, py - 17 + Math.sin(now * 4 + i * 0.8 + s.id) * 0.9 * (i / 6));
      }
      for (let i = 6; i >= 0; i--) {
        const x = px + i * 1.7;
        ctx.lineTo(x, py - 10.5 + Math.sin(now * 4 + i * 0.8 + s.id) * 0.9 * (i / 6));
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.lineWidth = 0.4;
      ctx.stroke();
    }

    // Selección y objetivos (en mundo).
    const pulse = 0.5 + 0.5 * Math.sin(now * 5);
    if (view.selected?.kind === 'settlement') {
      const s = state.settlements[view.selected.id];
      ctx.strokeStyle = `rgba(255,214,120,${0.6 + 0.4 * pulse})`;
      ctx.lineWidth = 2.5 / Math.min(1.5, z) + 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, RADIUS[s.kind] + 12 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (view.targeting || view.drag) {
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -now * 20;
      for (const s of state.settlements) {
        if (view.selected?.kind === 'settlement' && view.selected.id === s.id) continue;
        if (!visible(s.x, s.y)) continue;
        const enemy = s.owner !== view.player;
        const hover = view.drag?.hover === s.id;
        ctx.strokeStyle = enemy ? `rgba(255,120,90,${hover ? 1 : 0.85})` : `rgba(255,245,215,${hover ? 1 : 0.8})`;
        ctx.lineWidth = hover ? 4 : 2.2;
        ctx.beginPath();
        ctx.arc(s.x, s.y, RADIUS[s.kind] + 14, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
    if (view.drag) {
      const s = state.settlements[view.drag.from];
      const t = view.drag.hover !== null ? state.settlements[view.drag.hover] : view.drag.to;
      drawArrow(ctx, s.x, s.y, t.x, t.y, z);
    }

    // ---------- Capa de pantalla (tamaño constante) ----------
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelScale = Math.max(0.8, Math.min(1.1, z));
    for (const s of state.settlements) {
      if (!visible(s.x, s.y)) continue;
      const [px, py] = cam.toScreen(s.x, s.y);
      const R = RADIUS[s.kind] * z;
      const col = state.factions[s.owner].color;
      // Nombre
      ctx.font = `600 ${Math.round(11 * labelScale)}px Cinzel, serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(30,20,10,0.75)';
      ctx.fillStyle = '#f6ecd2';
      ctx.strokeText(s.name, px, py + R + 13);
      ctx.fillText(s.name, px, py + R + 13);
      // Insignia de guarnición
      const men = totalMen(s.garrison);
      const bx = px + R * 0.62 + 6;
      const by = py + R * 0.45;
      drawBadge(ctx, bx, by, String(men), col, labelScale);
      // Reclutamiento (solo los propios)
      if (s.owner === view.player && s.queue.length) {
        const q = s.queue[0];
        const t = q.progress / UNITS[q.unit].time;
        ctx.strokeStyle = 'rgba(20,14,8,0.6)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(bx, by, 14 * labelScale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#f2c35b';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(bx, by, 14 * labelScale, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
        ctx.stroke();
      }
      // Muralla dañada
      const k = KINDS[s.kind];
      if (s.walls < k.wallHp - 0.5) {
        const w = 44;
        const y = py - R - 12;
        ctx.fillStyle = 'rgba(20,14,8,0.7)';
        ctx.fillRect(px - w / 2 - 1, y - 1, w + 2, 6);
        ctx.fillStyle = s.walls > 0 ? '#d8cfb8' : '#7a2a1a';
        ctx.fillRect(px - w / 2, y, (w * s.walls) / k.wallHp, 4);
        if (s.walls <= 0) {
          ctx.font = `700 ${Math.round(10 * labelScale)}px Cinzel, serif`;
          ctx.fillStyle = '#ffb199';
          ctx.strokeText('BRECHA', px, y - 8);
          ctx.fillText('BRECHA', px, y - 8);
        }
      }
      // Batalla en curso: espadas cruzadas
      if (s.battleId !== null) drawSwords(ctx, px - R * 0.62 - 6, py + R * 0.45, now);
    }
    // Estandartes de los ejércitos.
    for (const a of state.armies) {
      const fp = this.armyFront.get(a.id);
      if (!fp || !visible(fp.x, fp.y)) continue;
      const [px, py] = cam.toScreen(fp.x, fp.y);
      const sel = view.selected?.kind === 'army' && view.selected.id === a.id;
      const men = totalMen(a.squads);
      drawStandard(ctx, px, py - 20 * Math.min(1.2, z) - 10, String(men), state.factions[a.owner].color, sel, pulse);
    }
    for (const b of state.battles) {
      if (b.settlement !== null) continue;
      const [px, py] = cam.toScreen(b.x, b.y);
      drawSwords(ctx, px, py - 34 * Math.min(1.2, z), now);
    }
  }

  private trackLosses(state: GameState, figs: Fig[], now: number): void {
    const pos = new Map<number, Pt[]>();
    for (const f of figs) {
      let l = pos.get(f.squad);
      if (!l) pos.set(f.squad, (l = []));
      l.push({ x: f.x, y: f.y });
    }
    const alive = new Map<number, Squad>();
    for (const b of state.battles) {
      for (let i = 0; i < 2; i++) {
        const side = b.sides[i];
        const list: Squad[] = [];
        if (side.garrison && b.settlement !== null) list.push(...state.settlements[b.settlement].garrison);
        for (const id of side.armies) {
          const a = state.armies.find((x) => x.id === id);
          if (a) list.push(...a.squads);
        }
        for (const q of list) alive.set(q.id, q);
      }
    }
    const existing = new Map<number, Squad>();
    for (const a of state.armies) for (const q of a.squads) existing.set(q.id, q);
    for (const st of state.settlements) for (const q of st.garrison) existing.set(q.id, q);
    // Escuadras en batalla: comparar hombres con el fotograma anterior.
    for (const [id, prev] of this.prevMen) {
      const q = alive.get(id) ?? existing.get(id);
      const men = q ? menOf(q) : 0;
      if (men < prev) {
        const pp = this.prevPos.get(id) ?? [];
        const unit = q?.unit ?? this.unitOf.get(id);
        const color = this.colorOf.get(id);
        if (unit && color)
          for (let m = men; m < prev && this.corpses.length < 500; m++) {
            const p = pp[m % Math.max(1, pp.length)];
            if (p) this.corpses.push({ x: p.x + (Math.random() - 0.5) * 3, y: p.y + (Math.random() - 0.5) * 3, sprite: fallenSprite(unit, color), t0: now });
          }
      }
    }
    this.prevMen.clear();
    for (const [id, q] of alive) this.prevMen.set(id, menOf(q));
    for (const [id, l] of pos) if (alive.has(id)) this.prevPos.set(id, l);
    for (const f of figs) {
      this.unitOf.set(f.squad, f.unit);
      this.colorOf.set(f.squad, f.color);
    }
    if (this.unitOf.size > 3000) {
      this.unitOf.clear();
      this.colorOf.clear();
    }
  }
  unitOf = new Map<number, string>();
  colorOf = new Map<number, string>();

  private spawnArrows(state: GameState, figs: Fig[], dt: number, now: number): void {
    if (dt <= 0) return;
    const bySide: Fig[][] = [[], []];
    const inBattle = new Set<number>();
    for (const f of figs) if (f.side >= 0) {
      bySide[f.side].push(f);
      inBattle.add(f.squad);
    }
    if (!bySide[0].length || !bySide[1].length || this.arrows.length > 400) return;
    // Por figura de tiradores, ~0,7 disparos por segundo.
    for (const f of figs) {
      if (f.side < 0 || !UNITS[f.unit].ranged) continue;
      if (Math.random() > dt * 0.7) continue;
      const targets = bySide[1 - f.side];
      const t = targets[Math.floor(Math.random() * targets.length)];
      if (Math.hypot(t.x - f.x, t.y - f.y) > 140) continue;
      this.arrows.push({ x0: f.x, y0: f.y - 7, x1: t.x, y1: t.y - 3, t0: now, dur: 0.5 + Math.random() * 0.3, h: 14 + Math.random() * 10, stone: f.unit.includes('honderos') });
    }
    // Torres.
    for (const b of state.battles) {
      if (b.settlement === null) continue;
      const s = state.settlements[b.settlement];
      const k = KINDS[s.kind];
      if (k.towers === 0 || s.walls <= 0) continue;
      const di = b.sides[0].garrison ? 0 : 1;
      const targets = bySide[1 - di].filter((f) => Math.hypot(f.x - s.x, f.y - s.y) < 120);
      if (!targets.length) continue;
      if (Math.random() > dt * k.towers * 0.35) continue;
      const t = targets[Math.floor(Math.random() * targets.length)];
      const a = Math.random() * Math.PI * 2;
      const R = RADIUS[s.kind];
      this.arrows.push({ x0: s.x + Math.cos(a) * R * 0.8, y0: s.y + Math.sin(a) * R * 0.8 - 8, x1: t.x, y1: t.y - 3, t0: now, dur: 0.55, h: 16, stone: false });
    }
    void maxHp;
  }

  hitSettlement(state: GameState, cam: Camera, sx: number, sy: number): number | null {
    const [wx, wy] = cam.toWorld(sx, sy);
    let best: number | null = null;
    let bestD = Infinity;
    for (const s of state.settlements) {
      const r = Math.max(RADIUS[s.kind] + 10, 30 / cam.z);
      const d = Math.hypot(s.x - wx, s.y - wy);
      if (d < r && d < bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
  }

  hitArmy(state: GameState, cam: Camera, sx: number, sy: number, owner: number): number | null {
    let best: number | null = null;
    let bestD = 34;
    for (const a of state.armies) {
      if (a.owner !== owner) continue;
      const fp = this.armyFront.get(a.id);
      if (!fp) continue;
      const [px, py] = cam.toScreen(fp.x, fp.y);
      // El estandarte está por encima del frente: aceptar ambos.
      const d = Math.min(Math.hypot(px - sx, py - sy), Math.hypot(px - sx, py - 20 * Math.min(1.2, cam.z) - 10 - sy));
      if (d < bestD) {
        bestD = d;
        best = a.id;
      }
    }
    return best;
  }
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, k: number): void {
  const w = Math.max(22, 8 + text.length * 8) * k;
  const h = 18 * k;
  ctx.fillStyle = 'rgba(20,14,8,0.55)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2 + 1, y - h / 2 + 2, w, h, 5 * k);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 5 * k);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,190,0.85)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = '#fff8e8';
  ctx.font = `700 ${Math.round(11 * k)}px Cinzel, serif`;
  ctx.fillText(text, x, y + 1);
}

function drawStandard(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string, sel: boolean, pulse: number): void {
  ctx.strokeStyle = '#3d2c1a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - 12);
  ctx.lineTo(x, y + 16);
  ctx.stroke();
  const w = Math.max(26, 10 + text.length * 8);
  if (sel) {
    ctx.strokeStyle = `rgba(255,214,120,${0.6 + 0.4 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 - 4, y - 14, w + 8, 26, 6);
    ctx.stroke();
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - 10);
  ctx.lineTo(x + w / 2, y - 10);
  ctx.lineTo(x + w / 2, y + 6);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x - w / 2, y + 6);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#e1b64a';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.fillStyle = '#e1b64a';
  ctx.beginPath();
  ctx.arc(x, y - 13, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff8e8';
  ctx.font = '700 11px Cinzel, serif';
  ctx.fillText(text, x, y - 1);
}

function drawSwords(ctx: CanvasRenderingContext2D, x: number, y: number, now: number): void {
  const s = 1 + 0.12 * Math.sin(now * 8);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = 'rgba(120,20,10,0.85)';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f3e3bf';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const d of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(-5 * d, -5);
    ctx.lineTo(5 * d, 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-6 * d + d * 0, 2 - 0);
    ctx.lineTo(-2 * d, 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, z: number): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy);
  if (l < 10) return;
  const ux = dx / l;
  const uy = dy / l;
  const w = 6 / Math.max(0.6, z);
  ctx.strokeStyle = 'rgba(255,220,140,0.95)';
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.setLineDash([w * 1.6, w * 1.2]);
  ctx.beginPath();
  ctx.moveTo(x0 + ux * 30, y0 + uy * 30);
  ctx.lineTo(x1 - ux * 14, y1 - uy * 14);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,220,140,0.95)';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - ux * w * 3 - uy * w * 2, y1 - uy * w * 3 + ux * w * 2);
  ctx.lineTo(x1 - ux * w * 3 + uy * w * 2, y1 - uy * w * 3 - ux * w * 2);
  ctx.closePath();
  ctx.fill();
}
