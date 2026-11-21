import type { Pt } from './types';

/** ¿El punto está en tierra? (regla par-impar sobre todos los polígonos de costa) */
export function onLand(land: Pt[][], p: Pt): boolean {
  let inside = false;
  for (const poly of land) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    }
  }
  return inside;
}

/** Punto de costa más cercano. */
export function nearestCoast(land: Pt[][], p: Pt): Pt {
  let best = { x: p.x, y: p.y };
  let bd = Infinity;
  for (const poly of land) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const d = (x - p.x) ** 2 + (y - p.y) ** 2;
      if (d < bd) {
        bd = d;
        best = { x, y };
      }
    }
  }
  return best;
}

/** Si el punto está en el mar, lo lleva a tierra firme (`margin` unidades tierra adentro). */
export function toLand(land: Pt[][], p: Pt, margin = 7): Pt {
  if (onLand(land, p)) return p;
  const c = nearestCoast(land, p);
  let dx = c.x - p.x;
  let dy = c.y - p.y;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  for (let m = margin; m < margin * 6; m += margin) {
    const q = { x: c.x + dx * m, y: c.y + dy * m };
    if (onLand(land, q)) return q;
  }
  // Cabo estrecho: buscar en círculos alrededor.
  for (let r = margin; r < 120; r += margin)
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
      if (onLand(land, q)) {
        const q2 = { x: p.x + Math.cos(a) * (r + margin), y: p.y + Math.sin(a) * (r + margin) };
        return onLand(land, q2) ? q2 : q;
      }
    }
  return c;
}

/** Como `toLand`, pero también aparta de la orilla los puntos que están en tierra demasiado cerca del mar. */
export function inland(land: Pt[][], p: Pt, margin = 10): Pt {
  if (!onLand(land, p)) return toLand(land, p, margin);
  const c = nearestCoast(land, p);
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  if (d >= margin) return p;
  const ux = (p.x - c.x) / (d || 1);
  const uy = (p.y - c.y) / (d || 1);
  const q = { x: c.x + ux * margin, y: c.y + uy * margin };
  return onLand(land, q) ? q : p;
}
