// Sprites dibujados por código y horneados en canvas (soldados y asentamientos).
import type { Culture, SettlementKind } from '../core/types';
import { UNITS } from '../core/units';

const OUT = 'rgba(25,18,10,0.6)';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Tamaño en unidades de mundo. */
  w: number;
  h: number;
  /** Ancla (pies / centro) en unidades de mundo desde la esquina superior izquierda. */
  ax: number;
  ay: number;
}

function mk(w: number, h: number, ax: number, ay: number, scale: number, draw: (c: CanvasRenderingContext2D) => void): Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(w * scale);
  canvas.height = Math.ceil(h * scale);
  const c = canvas.getContext('2d')!;
  c.scale(scale, scale);
  c.translate(ax, ay);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  draw(c);
  return { canvas, w, h, ax, ay };
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  if (k < 0) {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  } else {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------------- Soldados ----------------

interface FigSpec {
  tunic: string;
  legs: string;
  body: 'tunic' | 'mail' | 'segmentata' | 'bare';
  helmet: 'roman' | 'crest' | 'gallic' | 'hood' | 'none';
  shield: 'scutum' | 'oval' | 'round' | 'none';
  shieldColor: string;
  weapon: 'spear' | 'sword' | 'bow' | 'javelin' | 'sling';
  big?: boolean;
}

const SKIN = '#d9a77c';

function specFor(unit: string, color: string): FigSpec {
  switch (unit) {
    case 'roma_hastati':
      return { tunic: color, legs: SKIN, body: 'tunic', helmet: 'roman', shield: 'scutum', shieldColor: color, weapon: 'spear' };
    case 'roma_velites':
      return { tunic: '#d8c9a3', legs: SKIN, body: 'tunic', helmet: 'hood', shield: 'round', shieldColor: color, weapon: 'javelin' };
    case 'roma_legionarios':
      return { tunic: color, legs: SKIN, body: 'segmentata', helmet: 'crest', shield: 'scutum', shieldColor: color, weapon: 'sword', big: true };
    case 'galos_guerreros':
      return { tunic: SKIN, legs: '#5d6b8a', body: 'bare', helmet: 'none', shield: 'oval', shieldColor: color, weapon: 'spear' };
    case 'galos_arqueros':
      return { tunic: '#8c7a4a', legs: '#6b5a3a', body: 'tunic', helmet: 'none', shield: 'none', shieldColor: color, weapon: 'bow' };
    case 'galos_nobles':
      return { tunic: color, legs: '#4a5a7a', body: 'mail', helmet: 'gallic', shield: 'oval', shieldColor: color, weapon: 'sword', big: true };
    case 'ind_honderos':
      return { tunic: '#9b8b6a', legs: SKIN, body: 'tunic', helmet: 'none', shield: 'none', shieldColor: color, weapon: 'sling' };
    default:
      return { tunic: '#8d7b5c', legs: SKIN, body: 'tunic', helmet: 'none', shield: 'round', shieldColor: '#7d7465', weapon: 'spear' };
  }
}

function drawFigure(c: CanvasRenderingContext2D, f: FigSpec): void {
  c.lineWidth = 0.35;
  c.strokeStyle = OUT;
  if (f.big) c.scale(1.12, 1.12);
  // Sombra
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(0, 0, 3, 1.1, 0, 0, Math.PI * 2);
  c.fill();
  // Arma trasera (lanza)
  if (f.weapon === 'spear') {
    c.strokeStyle = '#5a4128';
    c.lineWidth = 0.55;
    c.beginPath();
    c.moveTo(2.4, 0.4);
    c.lineTo(2.4, -12.4);
    c.stroke();
    c.fillStyle = '#c9ccd0';
    c.beginPath();
    c.moveTo(2.4, -14);
    c.lineTo(3.05, -12.2);
    c.lineTo(1.75, -12.2);
    c.closePath();
    c.fill();
    c.lineWidth = 0.35;
    c.strokeStyle = OUT;
  }
  if (f.weapon === 'javelin') {
    c.strokeStyle = '#6a4d30';
    c.lineWidth = 0.45;
    c.beginPath();
    c.moveTo(1.4, -3);
    c.lineTo(3.6, -12);
    c.stroke();
    c.lineWidth = 0.35;
    c.strokeStyle = OUT;
  }
  // Piernas
  c.fillStyle = f.legs;
  c.fillRect(-1.25, -3.3, 0.95, 3.2);
  c.fillRect(0.3, -3.3, 0.95, 3.2);
  c.strokeRect(-1.25, -3.3, 0.95, 3.2);
  c.strokeRect(0.3, -3.3, 0.95, 3.2);
  c.fillStyle = '#4a3522';
  c.fillRect(-1.35, -0.6, 1.15, 0.7);
  c.fillRect(0.2, -0.6, 1.15, 0.7);
  // Torso
  const torso = f.body === 'bare' ? SKIN : f.body === 'segmentata' ? '#a9adb3' : f.body === 'mail' ? '#8f9399' : f.tunic;
  c.fillStyle = f.body === 'bare' || f.body === 'mail' || f.body === 'segmentata' ? (f.body === 'bare' ? '#8b6d4a' : f.tunic) : f.tunic;
  // falda
  c.beginPath();
  c.moveTo(-1.9, -4.2);
  c.lineTo(1.9, -4.2);
  c.lineTo(2.2, -2.5);
  c.lineTo(-2.2, -2.5);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = torso;
  c.beginPath();
  c.roundRect(-1.85, -7.4, 3.7, 3.6, 0.8);
  c.fill();
  c.stroke();
  if (f.body === 'segmentata') {
    c.strokeStyle = 'rgba(60,60,70,0.7)';
    c.lineWidth = 0.25;
    for (const y of [-6.5, -5.6, -4.7]) {
      c.beginPath();
      c.moveTo(-1.7, y);
      c.lineTo(1.7, y);
      c.stroke();
    }
    c.strokeStyle = OUT;
    c.lineWidth = 0.35;
  } else if (f.body === 'mail') {
    c.fillStyle = 'rgba(40,40,50,0.35)';
    for (let y = -7; y < -4; y += 0.7) for (let x = -1.5; x < 1.6; x += 0.7) c.fillRect(x, y, 0.3, 0.3);
  } else if (f.body === 'bare') {
    c.fillStyle = '#6b4a2a';
    c.fillRect(-1.85, -4.4, 3.7, 0.6);
  }
  // Brazos
  c.fillStyle = f.body === 'segmentata' || f.body === 'mail' ? SKIN : f.body === 'bare' ? SKIN : f.tunic;
  c.fillRect(1.7, -7, 0.9, 3.2);
  c.strokeRect(1.7, -7, 0.9, 3.2);
  // Cabeza
  c.fillStyle = SKIN;
  c.beginPath();
  c.arc(0, -8.6, 1.35, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  if (f.body === 'bare' || f.helmet === 'none') {
    // pelo (galos con melena)
    c.fillStyle = f.legs === SKIN ? '#4a3420' : '#a8733a';
    c.beginPath();
    c.arc(0, -8.9, 1.4, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
  }
  switch (f.helmet) {
    case 'roman':
    case 'crest':
      c.fillStyle = '#b8893a';
      c.beginPath();
      c.arc(0, -8.8, 1.5, Math.PI, 0);
      c.fill();
      c.stroke();
      c.fillRect(-1.6, -8.9, 3.2, 0.45);
      if (f.helmet === 'crest') {
        c.fillStyle = '#c0281c';
        c.beginPath();
        c.ellipse(0, -10.6, 1.9, 0.75, 0, 0, Math.PI * 2);
        c.fill();
        c.stroke();
      } else {
        c.fillStyle = '#7b5a28';
        c.fillRect(-0.2, -11, 0.4, 0.9);
      }
      break;
    case 'gallic':
      c.fillStyle = '#9aa0a6';
      c.beginPath();
      c.arc(0, -8.9, 1.5, Math.PI, 0);
      c.fill();
      c.stroke();
      c.fillStyle = '#c9a24a';
      c.beginPath();
      c.arc(0, -10.5, 0.45, 0, Math.PI * 2);
      c.fill();
      break;
    case 'hood':
      c.fillStyle = '#7a5a36';
      c.beginPath();
      c.arc(0, -8.9, 1.6, Math.PI * 0.95, Math.PI * 2.05);
      c.fill();
      c.stroke();
      break;
  }
  // Arma delantera
  if (f.weapon === 'sword') {
    c.strokeStyle = '#d8dce0';
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(2.3, -4);
    c.lineTo(3.6, -7.6);
    c.stroke();
    c.strokeStyle = OUT;
    c.lineWidth = 0.35;
  } else if (f.weapon === 'bow') {
    c.strokeStyle = '#5c3d1e';
    c.lineWidth = 0.5;
    c.beginPath();
    c.arc(1.6, -5.6, 3.3, -Math.PI / 2.4, Math.PI / 2.4);
    c.stroke();
    c.strokeStyle = 'rgba(240,230,200,0.8)';
    c.lineWidth = 0.15;
    c.beginPath();
    c.moveTo(1.6 + 3.3 * Math.cos(-Math.PI / 2.4), -5.6 + 3.3 * Math.sin(-Math.PI / 2.4));
    c.lineTo(1.6 + 3.3 * Math.cos(Math.PI / 2.4), -5.6 + 3.3 * Math.sin(Math.PI / 2.4));
    c.stroke();
    c.strokeStyle = OUT;
    c.lineWidth = 0.35;
  } else if (f.weapon === 'sling') {
    c.strokeStyle = '#5c3d1e';
    c.lineWidth = 0.3;
    c.beginPath();
    c.moveTo(2.4, -4.5);
    c.quadraticCurveTo(4.2, -8, 2.8, -9.4);
    c.stroke();
    c.strokeStyle = OUT;
    c.lineWidth = 0.35;
  }
  // Escudo
  c.fillStyle = f.shieldColor;
  c.strokeStyle = 'rgba(20,12,6,0.75)';
  switch (f.shield) {
    case 'scutum':
      c.beginPath();
      c.roundRect(-3.4, -7.8, 2.9, 6.2, 0.7);
      c.fill();
      c.stroke();
      c.strokeStyle = '#e1b64a';
      c.lineWidth = 0.3;
      c.beginPath();
      c.roundRect(-3.1, -7.5, 2.3, 5.6, 0.5);
      c.stroke();
      c.fillStyle = '#e1b64a';
      c.beginPath();
      c.arc(-1.95, -4.7, 0.55, 0, Math.PI * 2);
      c.fill();
      break;
    case 'oval':
      c.beginPath();
      c.ellipse(-2, -4.8, 1.75, 3.2, 0, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = shade(f.shieldColor, 0.45);
      c.fillRect(-2.25, -7.6, 0.5, 5.6);
      c.fillStyle = '#c0c4c8';
      c.beginPath();
      c.arc(-2, -4.8, 0.55, 0, Math.PI * 2);
      c.fill();
      break;
    case 'round':
      c.beginPath();
      c.arc(-2, -5.2, 1.7, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = shade(f.shieldColor, 0.35);
      c.beginPath();
      c.arc(-2, -5.2, 0.5, 0, Math.PI * 2);
      c.fill();
      break;
  }
}

const figCache = new Map<string, Sprite>();
export const FIG_SCALE = 4;

/** Figura de soldado. `flip` = mirando a la izquierda. */
export function soldierSprite(unit: string, color: string, flip: boolean): Sprite {
  const key = `${unit}|${color}|${flip}`;
  let s = figCache.get(key);
  if (!s) {
    const spec = specFor(unit, color);
    s = mk(10, 16, 5, 14.5, FIG_SCALE, (c) => {
      if (flip) c.scale(-1, 1);
      drawFigure(c, spec);
    });
    figCache.set(key, s);
  }
  return s;
}

/** Figura caída (para los muertos). */
export function fallenSprite(unit: string, color: string): Sprite {
  const key = `fallen|${unit}|${color}`;
  let s = figCache.get(key);
  if (!s) {
    const spec = specFor(unit, color);
    s = mk(16, 10, 8, 5, FIG_SCALE, (c) => {
      c.rotate(-Math.PI / 2);
      c.translate(0, 5);
      drawFigure(c, spec);
    });
    figCache.set(key, s);
  }
  return s;
}

export function isRanged(unit: string): boolean {
  return UNITS[unit].ranged;
}

// ---------------- Asentamientos ----------------

export const RADIUS: Record<SettlementKind, number> = { fortaleza: 40, aldea: 28, fortin: 24 };
const SET_SCALE = 3;
const setCache = new Map<string, Sprite>();

function house(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, roof: string, rot = 0) {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.fillRect(-w / 2 + 1, -h / 2 + 1.2, w, h);
  c.fillStyle = '#ece0c4';
  c.fillRect(-w / 2, -h / 2, w, h);
  c.fillStyle = roof;
  c.beginPath();
  c.moveTo(-w / 2 - 0.6, -h / 2 + h * 0.1);
  c.lineTo(0, -h / 2 - h * 0.35);
  c.lineTo(w / 2 + 0.6, -h / 2 + h * 0.1);
  c.lineTo(w / 2 + 0.6, h / 2 - h * 0.15);
  c.lineTo(-w / 2 - 0.6, h / 2 - h * 0.15);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(60,25,10,0.55)';
  c.lineWidth = 0.4;
  c.stroke();
  c.strokeStyle = shade(roof.startsWith('#') ? roof : '#b5532f', 0.25);
  c.beginPath();
  c.moveTo(-w / 2, -h / 2 + h * 0.05);
  c.lineTo(w / 2, -h / 2 + h * 0.05);
  c.stroke();
  c.restore();
}

function hut(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.arc(x + 0.8, y + 1, r, 0, Math.PI * 2);
  c.fill();
  const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  g.addColorStop(0, '#e2c27a');
  g.addColorStop(1, '#9c7a3c');
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = 'rgba(70,45,15,0.6)';
  c.lineWidth = 0.4;
  c.stroke();
  c.strokeStyle = 'rgba(90,60,20,0.45)';
  for (let a = 0; a < 8; a++) {
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + Math.cos((a * Math.PI) / 4) * r, y + Math.sin((a * Math.PI) / 4) * r);
    c.stroke();
  }
  c.fillStyle = '#5a4020';
  c.beginPath();
  c.arc(x, y, r * 0.18, 0, Math.PI * 2);
  c.fill();
}

function stoneRing(c: CanvasRenderingContext2D, r: number, sides: number, w: number, towers: boolean) {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + Math.PI / sides;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const poly = () => {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
  };
  c.save();
  c.translate(1.2, 1.6);
  c.strokeStyle = 'rgba(0,0,0,0.3)';
  c.lineWidth = w;
  poly();
  c.stroke();
  c.restore();
  c.strokeStyle = '#8e826b';
  c.lineWidth = w + 0.8;
  poly();
  c.stroke();
  c.strokeStyle = '#c8bc9f';
  c.lineWidth = w;
  poly();
  c.stroke();
  c.strokeStyle = 'rgba(255,250,235,0.5)';
  c.lineWidth = 0.5;
  c.setLineDash([1.2, 1.2]);
  poly();
  c.stroke();
  c.setLineDash([]);
  if (towers) {
    pts.forEach(([x, y], i) => {
      if (i % 2) return;
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.beginPath();
      c.arc(x + 1, y + 1.4, 4.2, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#bdb194';
      c.strokeStyle = '#7d725d';
      c.lineWidth = 0.6;
      c.beginPath();
      c.arc(x, y, 4, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#9a8f78';
      c.beginPath();
      c.arc(x, y, 2.2, 0, Math.PI * 2);
      c.fill();
    });
  }
}

function palisade(c: CanvasRenderingContext2D, r: number, square: boolean, stake = 1.6) {
  c.fillStyle = 'rgba(0,0,0,0.25)';
  const n = Math.round((Math.PI * 2 * r) / stake);
  const pt = (t: number): [number, number] => {
    if (!square) return [Math.cos(t * Math.PI * 2) * r, Math.sin(t * Math.PI * 2) * r];
    const side = Math.floor(t * 4);
    const u = t * 4 - side;
    const k = -r + 2 * r * u;
    return side === 0 ? [k, -r] : side === 1 ? [r, k] : side === 2 ? [-k, r] : [-r, -k];
  };
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i / n);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.arc(x + 0.7, y + 1, 1, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = 0; i < n; i++) {
    const [x, y] = pt(i / n);
    c.fillStyle = i % 2 ? '#8a6638' : '#9d7643';
    c.beginPath();
    c.arc(x, y, 0.95, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(50,30,10,0.6)';
    c.lineWidth = 0.3;
    c.stroke();
  }
}

function temple(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.fillRect(x - 6 + 1.2, y - 4.5 + 1.5, 12, 9);
  c.fillStyle = '#f1ead8';
  c.fillRect(x - 6, y - 4.5, 12, 9);
  c.fillStyle = '#c45b35';
  c.beginPath();
  c.moveTo(x - 6.6, y - 2);
  c.lineTo(x, y - 7.5);
  c.lineTo(x + 6.6, y - 2);
  c.closePath();
  c.fill();
  c.strokeStyle = 'rgba(80,30,10,0.6)';
  c.lineWidth = 0.4;
  c.stroke();
  c.fillStyle = '#d9cfb8';
  for (let i = 0; i < 6; i++) c.fillRect(x - 5.4 + i * 2.1, y - 1.5, 0.9, 5.5);
  c.fillStyle = '#cfc4ab';
  c.fillRect(x - 6.4, y + 4, 12.8, 1.2);
}

export function settlementSprite(kind: SettlementKind, style: Culture): Sprite {
  const key = `${kind}|${style}`;
  let s = setCache.get(key);
  if (s) return s;
  const R = RADIUS[kind] + 8;
  const gallic = style === 'galos';
  s = mk(R * 2, R * 2, R, R, SET_SCALE, (c) => {
    if (kind === 'fortaleza') {
      if (gallic) {
        // Oppidum: terraplén y empalizada, cabañas redondas.
        c.strokeStyle = '#7e6440';
        c.lineWidth = 6;
        c.beginPath();
        c.arc(0, 0, 34, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = '#a3865a';
        c.lineWidth = 3.5;
        c.beginPath();
        c.arc(0, 0, 34, 0, Math.PI * 2);
        c.stroke();
        palisade(c, 31, false, 1.7);
        const huts: [number, number, number][] = [[-14, -12, 6], [3, -18, 5], [17, -6, 6], [-19, 6, 5], [-5, 15, 6], [14, 14, 5], [-4, -3, 7], [22, 6, 4]];
        for (const [x, y, r] of huts) hut(c, x, y, r);
        // gran salón
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(-1, 4, 14, 7);
        house(c, 6, 5, 12, 6, '#a77a3a');
        for (const [x, y] of [[-24, -20], [24, -20], [0, 32]] as [number, number][]) {
          c.fillStyle = '#6d5030';
          c.fillRect(x - 3, y - 3, 6, 6);
          c.fillStyle = '#9c7848';
          c.fillRect(x - 2.4, y - 2.4, 4.8, 4.8);
        }
      } else {
        stoneRing(c, 34, 10, 3.6, false);
        const roofs = ['#b5532f', '#a3462a', '#c0663a', '#9c4026'];
        const hs: [number, number, number, number, number][] = [
          [-16, -14, 9, 6, 0], [-18, 4, 8, 7, 0.1], [-6, 18, 10, 6, 0], [12, 17, 9, 6, -0.05],
          [19, -2, 7, 9, 0], [14, -18, 9, 6, 0.08], [-2, -22, 8, 5, 0], [-24, -6, 5, 7, 0],
        ];
        hs.forEach(([x, y, w, h, r], i) => house(c, x, y, w, h, roofs[i % 4], r));
        temple(c, 0, -2);
        stoneRing(c, 34, 10, 0.01, true);
      }
    } else if (kind === 'aldea') {
      // campos ya van en el terreno; aquí casas y valla
      if (gallic) {
        palisade(c, 25, false, 2.6);
        for (const [x, y, r] of [[-9, -8, 5], [8, -10, 4.5], [11, 6, 5], [-8, 9, 4.5], [1, 0, 4]] as [number, number, number][]) hut(c, x, y, r);
      } else {
        c.strokeStyle = '#a89d84';
        c.lineWidth = 1.4;
        c.setLineDash([2.2, 1.2]);
        c.beginPath();
        c.arc(0, 0, 25, 0, Math.PI * 2);
        c.stroke();
        c.setLineDash([]);
        const hs: [number, number, number, number, number, string][] = [
          [-10, -9, 8, 6, 0.1, '#b5532f'], [8, -11, 7, 5, -0.1, '#a3462a'], [12, 5, 8, 6, 0.05, '#c0663a'],
          [-9, 9, 7, 6, -0.08, '#b5532f'], [0, -1, 6, 5, 0, '#9c4026'],
        ];
        for (const [x, y, w, h, r, roof] of hs) house(c, x, y, w, h, roof, r);
        c.fillStyle = '#5d7d93';
        c.beginPath();
        c.arc(2, 13, 1.6, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      // fortín
      if (gallic) {
        palisade(c, 18, true, 1.5);
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(-4, -3, 9, 9);
        c.fillStyle = '#7a5a34';
        c.fillRect(-5, -5, 9, 9);
        c.fillStyle = '#a17c4a';
        c.fillRect(-4, -4, 7, 7);
        c.strokeStyle = '#4a3218';
        c.lineWidth = 0.5;
        c.strokeRect(-4, -4, 7, 7);
        hut(c, 9, 9, 4);
      } else {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(-18 + 1.5, -18 + 2, 36, 36);
        c.fillStyle = '#b9ad91';
        c.fillRect(-18, -18, 36, 36);
        c.fillStyle = '#cdbf9c';
        c.fillRect(-14.5, -14.5, 29, 29);
        c.strokeStyle = '#7d725d';
        c.lineWidth = 0.6;
        c.strokeRect(-18, -18, 36, 36);
        c.strokeRect(-14.5, -14.5, 29, 29);
        for (const [x, y] of [[-18, -18], [18, -18], [18, 18], [-18, 18]] as [number, number][]) {
          c.fillStyle = 'rgba(0,0,0,0.3)';
          c.fillRect(x - 4 + 1, y - 4 + 1.3, 8, 8);
          c.fillStyle = '#c4b899';
          c.fillRect(x - 4, y - 4, 8, 8);
          c.strokeRect(x - 4, y - 4, 8, 8);
          c.fillStyle = '#9a8f78';
          c.fillRect(x - 2, y - 2, 4, 4);
        }
        house(c, 0, -2, 12, 8, '#b5532f');
        house(c, -6, 8, 6, 4, '#a3462a');
        house(c, 7, 8, 6, 4, '#a3462a');
        // puerta
        c.fillStyle = '#5a4128';
        c.fillRect(-2.5, 15, 5, 3.5);
      }
    }
  });
  setCache.set(key, s);
  return s;
}
