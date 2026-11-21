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
  helmet: 'roman' | 'crest' | 'gallic' | 'hood' | 'corinto' | 'none';
  shield: 'scutum' | 'oval' | 'round' | 'hoplon' | 'pelta' | 'none';
  shieldColor: string;
  weapon: 'spear' | 'sword' | 'bow' | 'javelin' | 'sling' | 'pike';
  big?: boolean;
  /** Montado: color del caballo. */
  horse?: string;
  /** Capa (generales). */
  cape?: string;
  /** Elefante con torre. */
  elephant?: boolean;
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
    case 'roma_equites':
      return { tunic: color, legs: SKIN, body: 'tunic', helmet: 'roman', shield: 'round', shieldColor: color, weapon: 'spear', horse: '#5a3a22' };
    case 'galos_jinetes':
      return { tunic: color, legs: '#5d6b8a', body: 'mail', helmet: 'gallic', shield: 'oval', shieldColor: color, weapon: 'spear', horse: '#b9b2a6' };
    case 'cartago_libios':
      return { tunic: '#ebe3cf', legs: SKIN, body: 'tunic', helmet: 'roman', shield: 'round', shieldColor: color, weapon: 'spear' };
    case 'cartago_honderos':
      return { tunic: '#cdb98f', legs: SKIN, body: 'tunic', helmet: 'none', shield: 'none', shieldColor: color, weapon: 'sling' };
    case 'cartago_lanceros':
      return { tunic: '#efe8d8', legs: SKIN, body: 'tunic', helmet: 'gallic', shield: 'oval', shieldColor: color, weapon: 'spear', big: true };
    case 'cartago_numidas':
      return { tunic: '#e6dcc4', legs: SKIN, body: 'tunic', helmet: 'none', shield: 'round', shieldColor: color, weapon: 'javelin', horse: '#a8743e' };
    case 'roma_pretorianos':
      return { tunic: '#5a1f6b', legs: SKIN, body: 'segmentata', helmet: 'crest', shield: 'scutum', shieldColor: '#5a1f6b', weapon: 'sword', big: true };
    case 'galos_druidas':
      return { tunic: '#f2efe6', legs: '#f2efe6', body: 'tunic', helmet: 'hood', shield: 'none', shieldColor: color, weapon: 'javelin' };
    case 'cartago_elefantes':
      return { tunic: '#e6dcc4', legs: SKIN, body: 'tunic', helmet: 'roman', shield: 'round', shieldColor: color, weapon: 'javelin', elephant: true };
    case 'general_roma':
      return { tunic: '#e8d9b0', legs: SKIN, body: 'segmentata', helmet: 'crest', shield: 'none', shieldColor: color, weapon: 'sword', horse: '#f0ebe0', cape: color };
    case 'general_galos':
      return { tunic: color, legs: '#5d6b8a', body: 'mail', helmet: 'gallic', shield: 'oval', shieldColor: '#d9b24a', weapon: 'sword', horse: '#3a2a1e', cape: '#d9b24a' };
    case 'general_cartago':
      return { tunic: '#f4eedf', legs: SKIN, body: 'tunic', helmet: 'crest', shield: 'round', shieldColor: '#d9b24a', weapon: 'spear', horse: '#7a5230', cape: color };
    case 'griegos_hoplitas':
      return { tunic: '#efe6cf', legs: SKIN, body: 'tunic', helmet: 'corinto', shield: 'hoplon', shieldColor: color, weapon: 'spear' };
    case 'griegos_peltastas':
      return { tunic: color, legs: SKIN, body: 'tunic', helmet: 'none', shield: 'pelta', shieldColor: '#b98a3e', weapon: 'javelin' };
    case 'griegos_falangitas':
      return { tunic: color, legs: SKIN, body: 'segmentata', helmet: 'corinto', shield: 'round', shieldColor: color, weapon: 'pike', big: true };
    case 'griegos_hetairoi':
      return { tunic: color, legs: SKIN, body: 'mail', helmet: 'roman', shield: 'none', shieldColor: color, weapon: 'spear', horse: '#e9e2d4' };
    case 'griegos_argiraspides':
      return { tunic: '#efe6cf', legs: SKIN, body: 'segmentata', helmet: 'corinto', shield: 'hoplon', shieldColor: '#d6dbe0', weapon: 'pike', big: true };
    case 'general_griegos':
      return { tunic: '#efe6cf', legs: SKIN, body: 'segmentata', helmet: 'crest', shield: 'none', shieldColor: color, weapon: 'sword', horse: '#1e1a18', cape: color };
    case 'ind_honderos':
      return { tunic: '#9b8b6a', legs: SKIN, body: 'tunic', helmet: 'none', shield: 'none', shieldColor: color, weapon: 'sling' };
    default:
      return { tunic: '#8d7b5c', legs: SKIN, body: 'tunic', helmet: 'none', shield: 'round', shieldColor: '#7d7465', weapon: 'spear' };
  }
}

function drawHorse(c: CanvasRenderingContext2D, col: string): void {
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(0, 0, 6.2, 1.4, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = OUT;
  c.lineWidth = 0.35;
  const dark = shade(col, -0.25);
  // patas
  c.fillStyle = dark;
  for (const x of [-4.2, -3, 2.6, 3.8]) {
    c.fillRect(x, -4.4, 0.85, 4.3);
    c.fillStyle = '#2b2018';
    c.fillRect(x - 0.05, -0.6, 0.95, 0.7);
    c.fillStyle = dark;
  }
  // cola
  c.strokeStyle = shade(col, -0.45);
  c.lineWidth = 0.9;
  c.beginPath();
  c.moveTo(-5.2, -6.6);
  c.quadraticCurveTo(-7.2, -5.2, -6.6, -2.6);
  c.stroke();
  c.strokeStyle = OUT;
  c.lineWidth = 0.35;
  // cuerpo
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(-0.3, -6, 5.4, 2.4, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // cuello y cabeza
  c.beginPath();
  c.moveTo(3.2, -7.6);
  c.lineTo(5.6, -10.6);
  c.lineTo(7.6, -9.4);
  c.lineTo(7.4, -8.4);
  c.lineTo(5.6, -8.2);
  c.lineTo(4.6, -5.4);
  c.closePath();
  c.fill();
  c.stroke();
  c.fillStyle = shade(col, -0.45);
  c.beginPath();
  c.moveTo(3.2, -7.8);
  c.lineTo(5.4, -10.9);
  c.lineTo(5.9, -10.4);
  c.lineTo(3.9, -7.4);
  c.closePath();
  c.fill();
}

function drawElephant(c: CanvasRenderingContext2D): void {
  c.fillStyle = 'rgba(0,0,0,0.3)';
  c.beginPath();
  c.ellipse(0, 0, 10, 2.2, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = OUT;
  c.lineWidth = 0.45;
  const g = '#8d8a85';
  const d = '#6f6c68';
  c.fillStyle = d;
  for (const x of [-6.5, -3.8, 3, 5.6]) {
    c.fillRect(x, -6, 2.2, 6);
    c.strokeRect(x, -6, 2.2, 6);
  }
  // cola
  c.strokeStyle = d;
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(-8.8, -9);
  c.quadraticCurveTo(-10.2, -6, -9.4, -4);
  c.stroke();
  c.strokeStyle = OUT;
  c.lineWidth = 0.45;
  // cuerpo
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(-0.6, -9.5, 8.8, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  // cabeza, oreja y trompa
  c.beginPath();
  c.ellipse(8.2, -10.5, 3.6, 3.4, 0, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = d;
  c.beginPath();
  c.ellipse(6.6, -10, 2, 3, -0.3, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = g;
  c.lineWidth = 1.6;
  c.beginPath();
  c.moveTo(10.8, -9);
  c.quadraticCurveTo(12.6, -5, 11.4, -1.4);
  c.stroke();
  c.strokeStyle = '#f3ecd8';
  c.lineWidth = 0.7;
  c.beginPath();
  c.moveTo(10, -8);
  c.quadraticCurveTo(12.4, -7.4, 13, -9.4);
  c.stroke();
  // torre sobre el lomo
  c.strokeStyle = OUT;
  c.lineWidth = 0.45;
  c.fillStyle = '#9b6b3a';
  c.fillRect(-4.5, -16.5, 8, 4.2);
  c.strokeRect(-4.5, -16.5, 8, 4.2);
  c.fillStyle = '#c9a26a';
  for (let x = -4.2; x < 3.2; x += 1.8) c.fillRect(x, -17.4, 1, 1);
}

function drawFigure(c: CanvasRenderingContext2D, f: FigSpec): void {
  c.lineWidth = 0.35;
  c.strokeStyle = OUT;
  if (f.elephant) {
    drawElephant(c);
    c.translate(-0.5, -14.2);
    c.scale(0.62, 0.62);
    c.lineWidth = 0.5;
  } else if (f.horse) {
    drawHorse(c, f.horse);
    c.translate(-0.3, -5.6);
    c.scale(0.86, 0.86);
    c.lineWidth = 0.4;
  } else if (f.big) c.scale(1.12, 1.12);
  // Capa del general (detrás del cuerpo).
  if (f.cape) {
    c.fillStyle = f.cape;
    c.beginPath();
    c.moveTo(-1.6, -7.4);
    c.lineTo(1.4, -7.4);
    c.lineTo(-0.2, -1.8);
    c.lineTo(-3.8, -2.6);
    c.closePath();
    c.fill();
    c.stroke();
  }
  // Sombra
  c.fillStyle = 'rgba(0,0,0,0.28)';
  if (!f.horse && !f.elephant) {
    c.beginPath();
    c.ellipse(0, 0, 3, 1.1, 0, 0, Math.PI * 2);
    c.fill();
  }
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
  if (f.weapon === 'pike') {
    c.strokeStyle = '#5a4128';
    c.lineWidth = 0.55;
    c.beginPath();
    c.moveTo(-1.5, 0.5);
    c.lineTo(6.5, -15);
    c.stroke();
    c.fillStyle = '#c9ccd0';
    c.beginPath();
    c.moveTo(7.2, -16.4);
    c.lineTo(7.0, -14.4);
    c.lineTo(5.9, -15.0);
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
  if (f.elephant) {
    // sentado en la torre: sin piernas visibles
  } else if (f.horse) {
    c.fillRect(-0.2, -3.6, 1, 3.4);
    c.strokeRect(-0.2, -3.6, 1, 3.4);
  } else {
    c.fillRect(-1.25, -3.3, 0.95, 3.2);
    c.fillRect(0.3, -3.3, 0.95, 3.2);
    c.strokeRect(-1.25, -3.3, 0.95, 3.2);
    c.strokeRect(0.3, -3.3, 0.95, 3.2);
    c.fillStyle = '#4a3522';
    c.fillRect(-1.35, -0.6, 1.15, 0.7);
    c.fillRect(0.2, -0.6, 1.15, 0.7);
  }
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
    case 'corinto':
      c.fillStyle = '#c0924a';
      c.beginPath();
      c.arc(0, -8.7, 1.6, Math.PI * 0.9, Math.PI * 2.1);
      c.lineTo(1.5, -7.6);
      c.lineTo(-1.5, -7.6);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#2a1d10';
      c.fillRect(-0.2, -8.8, 1.3, 0.5);
      c.fillStyle = '#7a1f1a';
      c.beginPath();
      c.moveTo(-1.8, -10.4);
      c.quadraticCurveTo(0, -12.2, 1.8, -10.4);
      c.lineTo(1.2, -10.1);
      c.quadraticCurveTo(0, -11.4, -1.2, -10.1);
      c.closePath();
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
    case 'hoplon': {
      const g = c.createRadialGradient(-2.4, -5.6, 0.3, -2, -5.2, 2.6);
      g.addColorStop(0, '#f0d28a');
      g.addColorStop(1, '#a8782e');
      c.fillStyle = f.shieldColor === '#d6dbe0' ? '#d6dbe0' : g;
      c.beginPath();
      c.arc(-2, -5.2, 2.5, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = f.shieldColor;
      c.beginPath();
      c.arc(-2, -5.2, 1.4, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(255,240,200,0.7)';
      c.lineWidth = 0.25;
      c.beginPath();
      c.arc(-2, -5.2, 2.1, 0, Math.PI * 2);
      c.stroke();
      break;
    }
    case 'pelta':
      c.beginPath();
      c.arc(-2, -5.4, 1.9, Math.PI * 0.15, Math.PI * 0.85, true);
      c.quadraticCurveTo(-2, -6.4, -0.3, -4.5);
      c.closePath();
      c.fill();
      c.stroke();
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
    const w = spec.elephant ? 28 : spec.horse ? 18 : 10;
    const h = spec.elephant ? 24 : 18;
    s = mk(w, h, w / 2, h - 1.5, FIG_SCALE, (c) => {
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
    const horse = !!spec.horse || !!spec.elephant;
    s = mk(horse ? 20 : 16, horse ? 14 : 10, horse ? 10 : 8, horse ? 9 : 5, FIG_SCALE, (c) => {
      if (horse) {
        // caballo tumbado de lado y jinete al lado
        c.save();
        c.scale(1, 0.55);
        c.rotate(Math.PI * 0.03);
        if (spec.elephant) drawElephant(c);
        else drawHorse(c, spec.horse!);
        c.restore();
        c.rotate(-Math.PI / 2);
        c.translate(1, 7);
        drawFigure(c, { ...spec, horse: undefined, elephant: false });
        return;
      }
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

function flatHouse(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.fillRect(x - w / 2 + 1.2, y - h / 2 + 1.5, w, h);
  c.fillStyle = '#d9cdb2';
  c.fillRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = '#f4eedf';
  c.fillRect(x - w / 2 + 0.6, y - h / 2 + 0.6, w - 1.2, h - 1.6);
  c.strokeStyle = 'rgba(90,70,40,0.45)';
  c.lineWidth = 0.4;
  c.strokeRect(x - w / 2, y - h / 2, w, h);
  c.fillStyle = '#8a6d45';
  c.fillRect(x - w / 2 + w * 0.3, y + h / 2 - 1.4, w * 0.18, 1.4);
}

function palm(c: CanvasRenderingContext2D, x: number, y: number) {
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.ellipse(x + 1.5, y + 1.2, 3.5, 1.2, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = '#7a5a32';
  c.lineWidth = 0.8;
  c.beginPath();
  c.moveTo(x, y);
  c.quadraticCurveTo(x + 1, y - 3, x + 0.6, y - 6);
  c.stroke();
  c.strokeStyle = '#4f7a2e';
  c.lineWidth = 1.1;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.beginPath();
    c.moveTo(x + 0.6, y - 6);
    c.quadraticCurveTo(x + 0.6 + Math.cos(a) * 2.5, y - 7.2 + Math.sin(a) * 1.2, x + 0.6 + Math.cos(a) * 4.2, y - 5.2 + Math.sin(a) * 2);
    c.stroke();
  }
}

function squareTowers(c: CanvasRenderingContext2D, r: number, n: number, col: string) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2 + Math.PI / n;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(x - 3.6 + 1, y - 3.6 + 1.4, 7.2, 7.2);
    c.fillStyle = col;
    c.fillRect(x - 3.6, y - 3.6, 7.2, 7.2);
    c.strokeStyle = '#7d6a4a';
    c.lineWidth = 0.6;
    c.strokeRect(x - 3.6, y - 3.6, 7.2, 7.2);
    c.fillStyle = shade(col, -0.15);
    c.fillRect(x - 2, y - 2, 4, 4);
  }
}

export function settlementSprite(kind: SettlementKind, style: Culture): Sprite {
  if (style === 'griegos') style = 'roma';
  const key = `${kind}|${style}`;
  let s = setCache.get(key);
  if (s) return s;
  const R = RADIUS[kind] + 8;
  const gallic = style === 'galos';
  const punic = style === 'cartago';
  s = mk(R * 2, R * 2, R, R, SET_SCALE, (c) => {
    if (punic) {
      if (kind === 'fortaleza') {
        c.strokeStyle = '#a8916a';
        c.lineWidth = 4.6;
        c.beginPath();
        c.arc(0, 0, 34, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = '#d8c7a0';
        c.lineWidth = 3.4;
        c.beginPath();
        c.arc(0, 0, 34, 0, Math.PI * 2);
        c.stroke();
        const hs: [number, number, number, number][] = [
          [-15, -14, 9, 7], [-19, 3, 8, 8], [-7, 17, 10, 6], [11, 17, 9, 7], [19, -2, 7, 9], [13, -17, 9, 6], [-2, -23, 8, 5], [-25, -7, 5, 7],
        ];
        for (const [x, y, w, h] of hs) flatHouse(c, x, y, w, h);
        // templo de Tanit con cúpula
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(-5, -3, 12, 10);
        c.fillStyle = '#efe6d0';
        c.fillRect(-6, -5, 12, 10);
        c.fillStyle = '#c9b48a';
        c.beginPath();
        c.arc(0, 0, 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#e8dcbc';
        c.beginPath();
        c.arc(-1, -1, 2.6, 0, Math.PI * 2);
        c.fill();
        palm(c, 8, 8);
        palm(c, -12, 10);
        squareTowers(c, 34, 8, '#d3c198');
      } else if (kind === 'aldea') {
        c.strokeStyle = '#b89a6a';
        c.lineWidth = 1.8;
        c.beginPath();
        c.arc(0, 0, 24, 0, Math.PI * 2);
        c.stroke();
        for (const [x, y, w, h] of [[-9, -8, 8, 7], [8, -10, 7, 6], [11, 6, 8, 7], [-8, 9, 7, 6], [0, -1, 6, 5]] as [number, number, number, number][]) flatHouse(c, x, y, w, h);
        palm(c, 3, 12);
        palm(c, -15, -1);
      } else {
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(-18 + 1.5, -18 + 2, 36, 36);
        c.fillStyle = '#c8b48c';
        c.fillRect(-18, -18, 36, 36);
        c.fillStyle = '#ddcca6';
        c.fillRect(-14.5, -14.5, 29, 29);
        c.strokeStyle = '#8a7350';
        c.lineWidth = 0.6;
        c.strokeRect(-18, -18, 36, 36);
        flatHouse(c, 0, -2, 12, 9);
        flatHouse(c, -6, 8, 6, 4);
        palm(c, 7, 10);
        for (const [x, y] of [[-18, -18], [18, -18], [18, 18], [-18, 18]] as [number, number][]) {
          c.fillStyle = '#d3c198';
          c.fillRect(x - 4, y - 4, 8, 8);
          c.strokeRect(x - 4, y - 4, 8, 8);
        }
      }
      return;
    }
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
