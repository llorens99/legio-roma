import { initAudio, isMuted, resumeAudio, setMuted, sfx, suspendAudio } from './audio';
import { appointGeneral, canAppointGeneral, canUpgrade, GENERAL_COST, startUpgrade, cancelRecruit, canRecruit, CULTURE_NAMES, defaultPlayers, factionNames, disband, foodBalance, incomeOf, newGame, recruit, redirectArmy, routeFor, sendArmy, TICK } from './core/game';
import { MAPS } from './core/maps';
import { distancesFrom } from './core/path';
import { step } from './core/sim';
import type { Build, GameEvent, GameState, General, Settlement, Squad } from './core/types';
import { orderRetreat } from './core/combat';
import { ALDEA_BUILDINGS, maxHp, menOf, recruitable, statsOf, totalMen, UNITS, upgradeOptions } from './core/units';
import { Gestures } from './input';
import { Camera } from './render/camera';
import { Renderer, type ViewState } from './render/renderer';
import { RADIUS, soldierSprite } from './render/sprites';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type Settings } from './storage';

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const ICON_PAUSE = '<svg viewBox="0 0 24 24"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
const ICON_MENU = '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="2.4" rx="1"/><rect x="4" y="11" width="16" height="2.4" rx="1"/><rect x="4" y="16" width="16" height="2.4" rx="1"/></svg>';

type SheetMode = 'none' | 'settlement' | 'army' | 'info' | 'target';

const TIPS = [
  (s: GameState, p: number) => `Toca tu fortaleza <b>${esc(fortOf(s, p)?.name ?? '')}</b> para ver tus tropas y reclutar.`,
  () => 'Pulsa <b>Enviar</b> y toca una aldea independiente (bandera gris) para conquistarla.',
  (s: GameState, p: number) =>
    s.factions.length > 3
      ? 'Recluta con tu oro y cuida la <b>comida</b>. Ganas cuando caigan todas las fortalezas enemigas.'
      : `Recluta con tu oro y conquista la fortaleza enemiga <b>${esc(enemyFortOf(s, p)?.name ?? '')}</b> para ganar.`,
];

function fortOf(s: GameState, p: number): Settlement | undefined {
  return s.settlements.find((x) => x.owner === p && x.kind === 'fortaleza');
}
function enemyFortOf(s: GameState, p: number): Settlement | undefined {
  return s.settlements.find((x) => x.owner !== p && x.owner !== 0 && x.kind === 'fortaleza');
}

const iconCache = new Map<string, string>();
function unitIcon(unit: string, color: string): string {
  const k = `${unit}|${color}`;
  let u = iconCache.get(k);
  if (!u) {
    u = soldierSprite(unit, color, false).canvas.toDataURL();
    iconCache.set(k, u);
  }
  return u;
}

function levelTag(st: Settlement): string {
  if (st.kind === 'aldea') return st.building ? ` · ${ALDEA_BUILDINGS[st.building].name.toUpperCase()}` : '';
  return st.level > 1 ? ` ${'★'.repeat(st.level)}` : '';
}

function buildName(what: Build['what'], st: Settlement): string {
  if (what === 'nivel') return st.kind === 'fortaleza' ? `nivel ${st.level + 1}` : 'refuerzo';
  return ALDEA_BUILDINGS[what].name;
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export class App {
  state: GameState | null = null;
  cam = new Camera();
  renderer: Renderer;
  gestures: Gestures;
  view: ViewState = { player: 1, selected: null, targeting: false, drag: null };
  speed = 1;
  paused = false;
  acc = 0;
  lastFrame = performance.now();
  excluded = new Set<number>();
  mode: SheetMode = 'none';
  sheetSig = '';
  hudT = 0;
  saveT = 0;
  clashT = 0;
  tipT = 0;
  endShown = false;
  sheetOpenedAt = 0;
  /** Primer toque en «Licenciar» pide confirmación. */
  disbandArmed = false;
  /** General elegido para acompañar al próximo ejército. */
  genSel: number | null = null;
  /** Destino suave de la cámara. */
  camGoal: { x: number; y: number } | null = null;
  settings: Settings = loadSettings();
  /** Partida de demostración (IA contra IA) que se ve detrás del menú. */
  demo: GameState | null = null;
  demoView: ViewState = { player: 0, selected: null, targeting: false, drag: null };

  constructor() {
    const canvas = $('map') as HTMLCanvasElement;
    this.renderer = new Renderer(canvas);
    this.renderer.resize(this.cam);
    setMuted(this.settings.muted);
    window.addEventListener('resize', () => this.renderer.resize(this.cam));
    window.addEventListener('orientationchange', () => setTimeout(() => this.renderer.resize(this.cam), 200));
    document.addEventListener('pointerdown', () => initAudio(), { capture: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.save();
        suspendAudio();
      } else resumeAudio();
    });
    window.addEventListener('pagehide', () => this.save());
    this.gestures = new Gestures(canvas, {
      tap: (x, y) => this.onTap(x, y),
      pan: (dx, dy) => {
        this.camGoal = null;
        this.cam.pan(dx, dy);
      },
      zoom: (x, y, f) => this.cam.zoomAt(x, y, f),
      canDragFrom: (x, y) => this.canDragFrom(x, y),
      dragMove: (x, y) => this.onDragMove(x, y),
      dragEnd: (x, y, c) => this.onDragEnd(x, y, c),
    });
    $('sheet').addEventListener('click', (e) => this.onSheetClick(e));
    $('screen').addEventListener('click', (e) => this.onScreenClick(e));
    $('hud').addEventListener('click', (e) => this.onHudClick(e));
    $('toasts').addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest('.toast') as HTMLElement | null;
      if (t?.dataset.x) this.focus(Number(t.dataset.x), Number(t.dataset.y));
    });
    (window as any).__legio = this;
    this.showMenu();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------------- Bucle ----------------

  frame(t: number): void {
    const dt = Math.min(0.25, (t - this.lastFrame) / 1000);
    this.lastFrame = t;
    const s = this.state;
    this.gestures.tick(dt);
    if (this.camGoal) {
      const k = 1 - Math.exp(-dt * 10);
      this.cam.x += (this.camGoal.x - this.cam.x) * k;
      this.cam.y += (this.camGoal.y - this.cam.y) * k;
      this.cam.clamp();
      if (Math.hypot(this.camGoal.x - this.cam.x, this.camGoal.y - this.cam.y) < 1) this.camGoal = null;
    }
    if (s) {
      if (!this.paused && s.winner === null && $('screen').classList.contains('hidden')) {
        this.acc += dt * this.speed;
        let n = 0;
        while (this.acc >= TICK && n++ < 40) {
          step(s);
          this.acc -= TICK;
        }
      }
      this.handleEvents(s);
      this.renderer.draw(s, this.cam, this.view, this.paused ? 0 : this.acc, t / 1000);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.25;
        this.updateHud();
        this.renderSheet();
      }
      this.saveT += dt;
      if (this.saveT > 15) {
        this.saveT = 0;
        this.save();
      }
      this.ambient(s, dt);
      this.updateTip(dt);
    } else if (this.demo) {
      this.acc += dt * 2;
      while (this.acc >= TICK) {
        step(this.demo);
        this.acc -= TICK;
      }
      this.demo.events.length = 0;
      if (this.demo.winner !== null) this.demo = this.makeDemo();
      this.cam.x += Math.cos(t / 9000) * dt * 12;
      this.cam.y += Math.sin(t / 7000) * dt * 18;
      this.cam.clamp();
      this.renderer.draw(this.demo, this.cam, this.demoView, 0, t / 1000);
    }
    requestAnimationFrame((tt) => this.frame(tt));
  }

  /** Para pruebas: avanza la simulación `sec` segundos de golpe. */
  debugAdvance(sec: number): void {
    if (!this.state) return;
    for (let i = 0; i < sec / TICK && this.state.winner === null; i++) step(this.state);
  }

  /** Para pruebas: posición en pantalla de un asentamiento. */
  debugScreenOf(name: string): [number, number] | null {
    const s = this.state ?? this.demo;
    const st = s?.settlements.find((x) => x.name === name);
    return st ? this.cam.toScreen(st.x, st.y) : null;
  }

  save(): void {
    if (this.state) saveGame(this.state);
  }

  ambient(s: GameState, dt: number): void {
    if (this.paused || !s.battles.length) return;
    this.clashT -= dt * this.speed;
    if (this.clashT > 0) return;
    this.clashT = 0.18 + Math.random() * 0.4;
    const [x0, y0] = this.cam.toWorld(0, 0);
    const [x1, y1] = this.cam.toWorld(this.cam.vw, this.cam.vh);
    if (s.battles.some((b) => b.x > x0 && b.x < x1 && b.y > y0 && b.y < y1)) sfx.clash();
  }

  // ---------------- Partida ----------------

  startNew(culture: Settings['culture'], difficulty: Settings['difficulty'], mapId: string): void {
    const seed = (Math.random() * 2 ** 31) | 0;
    const map = MAPS[mapId] ?? MAPS.po;
    this.state = newGame({ seed, difficulty, mapId: map.id, players: defaultPlayers(map.players, culture, difficulty, seed) });
    this.settings.culture = culture;
    this.settings.difficulty = difficulty;
    this.settings.mapId = map.id;
    saveSettings(this.settings);
    this.begin();
    this.save();
  }

  continueGame(): void {
    const s = loadGame();
    if (!s) {
      this.showMenu();
      return;
    }
    this.state = s;
    this.begin();
  }

  begin(): void {
    const s = this.state!;
    this.demo = null;
    this.view = { player: s.factions.find((f) => f.isPlayer)?.id ?? 1, selected: null, targeting: false, drag: null };
    this.cam.mapW = s.width;
    this.cam.mapH = s.height;
    this.renderer.resize(this.cam);
    this.cam.z = this.cam.defaultZoom();
    const f = fortOf(s, this.view.player);
    if (f) {
      this.cam.x = f.x;
      this.cam.y = f.y - 60;
    }
    this.cam.clamp();
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.endShown = false;
    this.mode = 'none';
    this.excluded.clear();
    $('screen').classList.add('hidden');
    $('screen').innerHTML = '';
    $('sheet').classList.add('hidden');
    this.buildHud();
    this.updateHud();
  }

  // ---------------- Eventos ----------------

  handleEvents(s: GameState): void {
    if (!s.events.length) return;
    const p = this.view.player;
    const name = (id: number) => s.settlements[id].name;
    for (const e of s.events) this.onEvent(s, e, p, name);
    s.events.length = 0;
  }

  onEvent(s: GameState, e: GameEvent, p: number, name: (id: number) => string): void {
    const fname = (f: number) => (f === 0 ? 'los independientes' : s.factions[f].name);
    switch (e.type) {
      case 'capture': {
        const st = s.settlements[e.settlement];
        if (e.faction === p) {
          sfx.capture();
          this.toast(`¡Has conquistado ${esc(name(e.settlement))}!`, 'good', st);
          if (this.settings.tipsDone < 3) this.settings.tipsDone = Math.max(this.settings.tipsDone, 2);
        } else if (e.from === p) {
          sfx.lost();
          this.toast(`${esc(name(e.settlement))} ha caído ante ${fname(e.faction)}`, 'bad', st);
        } else this.toast(`${esc(fname(e.faction))} toma ${esc(name(e.settlement))}`, '', st);
        if (this.view.selected?.kind === 'settlement' && this.view.selected.id === e.settlement) this.sheetSig = '';
        break;
      }
      case 'battle': {
        if (!e.factions.includes(p)) break;
        sfx.horn();
        const b = s.battles.find((x) => x.id === e.battle);
        if (b && b.settlement !== null && s.settlements[b.settlement].owner === p)
          this.toast(`¡Atacan ${esc(name(b.settlement))}!`, 'bad', { x: e.x, y: e.y });
        else if (b && b.settlement === null) this.toast('Choque en el camino', '', { x: e.x, y: e.y });
        break;
      }
      case 'breach': {
        const st = s.settlements[e.settlement];
        const b = s.battles.find((x) => x.id === st.battleId);
        const involved = st.owner === p || b?.sides.some((x) => x.faction === p);
        if (!involved) break;
        sfx.breach();
        this.toast(st.owner === p ? `¡Brecha en la muralla de ${esc(st.name)}!` : `Brecha abierta en ${esc(st.name)}`, st.owner === p ? 'bad' : 'good', st);
        break;
      }
      case 'repelled':
        if (e.faction === p) this.toast(`${esc(name(e.settlement))} resiste el asalto`, 'good', s.settlements[e.settlement]);
        else if (e.attacker === p) {
          sfx.lost();
          this.toast(`El asalto a ${esc(name(e.settlement))} ha fracasado`, 'bad', s.settlements[e.settlement]);
        }
        break;
      case 'field-win':
        if (e.faction === p) this.toast('Victoria en campo abierto', 'good', e);
        else if (e.loser === p) {
          sfx.lost();
          this.toast('Tu ejército ha sido derrotado', 'bad', e);
        }
        break;
      case 'upgraded':
        if (e.faction === p) {
          sfx.capture();
          const st = s.settlements[e.settlement];
          this.toast(e.what === 'nivel' ? `${esc(st.name)} sube a nivel ${st.level}` : `${esc(buildName(e.what as Build['what'], st))} terminado en ${esc(st.name)}`, 'good', st);
          if (this.view.selected?.kind === 'settlement' && this.view.selected.id === e.settlement) this.sheetSig = '';
        }
        break;
      case 'rout':
        if (e.faction === p) this.toast(e.ordered ? 'Retirada ordenada' : '¡Tu ejército pierde la moral y huye!', e.ordered ? '' : 'bad', e);
        else if ([...this.renderer.armyFront.entries()].some(([id, pt]) => s.armies.find((x) => x.id === id)?.owner === p && Math.hypot(pt.x - e.x, pt.y - e.y) < 90))
          this.toast('¡El enemigo huye!', 'good', e);
        break;
      case 'general-died':
        if (e.faction === p) {
          sfx.lost();
          this.toast(`Ha caído el general ${esc(e.name)}`, 'bad');
        } else if (e.faction !== 0) this.toast(`Ha caído ${esc(e.name)}, general de ${esc(s.factions[e.faction].name)}`, 'good');
        break;
      case 'general-level':
        if (e.faction === p) this.toast(`${esc(e.name)} asciende a nivel ${e.level}`, 'good');
        break;
      case 'starving':
        if (e.faction === p) {
          sfx.lost();
          this.toast('¡Tus tropas pasan hambre y desertan! Conquista aldeas o licencia tropas.', 'bad');
        }
        break;
      case 'eliminated':
        if (e.faction !== p) this.toast(`${esc(s.factions[e.faction].name)} ha sido eliminado`, 'good');
        else if (s.winner === null) {
          sfx.defeat();
          this.closeSheet();
          setTimeout(() => this.showEnd(), 1800);
        }
        break;
      case 'recruited':
        if (e.faction === p && this.view.selected?.kind === 'settlement' && this.view.selected.id === e.settlement) sfx.recruit();
        break;
      case 'victory':
        setTimeout(() => this.showEnd(), 1800);
        if (e.faction === p) sfx.victory();
        else sfx.defeat();
        this.closeSheet();
        break;
    }
  }

  toast(html: string, tone: '' | 'good' | 'bad', at?: { x: number; y: number }): void {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${tone}`;
    el.innerHTML = html;
    if (at) {
      el.dataset.x = String(at.x);
      el.dataset.y = String(at.y);
    }
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild!.remove();
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  focus(x: number, y: number): void {
    this.camGoal = null;
    this.cam.x = x;
    this.cam.y = y;
    this.cam.clamp();
  }

  // ---------------- Toques ----------------

  onTap(sx: number, sy: number): void {
    const s = this.state;
    if (!s || s.winner !== null) return;
    const p = this.view.player;
    const hitS = this.renderer.hitSettlement(s, this.cam, sx, sy);
    if (this.mode === 'target') {
      if (hitS === null) {
        this.cancelTarget();
        return;
      }
      this.orderTo(hitS);
      return;
    }
    if (this.mode === 'army' && hitS !== null && this.view.selected?.kind === 'army') {
      this.orderTo(hitS);
      return;
    }
    const hitA = this.renderer.hitArmy(s, this.cam, sx, sy, p);
    if (hitA !== null && (hitS === null || this.distToSettlement(s, hitS, sx, sy) > 0.6)) {
      sfx.select();
      this.view.selected = { kind: 'army', id: hitA };
      this.view.targeting = true;
      this.openSheet('army');
      return;
    }
    if (hitS !== null) {
      sfx.tap();
      this.view.selected = { kind: 'settlement', id: hitS };
      this.view.targeting = false;
      this.excluded.clear();
      this.genSel = null;
      this.openSheet(s.settlements[hitS].owner === p ? 'settlement' : 'info');
      if (this.settings.tipsDone === 0 && s.settlements[hitS].owner === p) this.advanceTip(1);
      return;
    }
    this.closeSheet();
  }

  /** Distancia relativa (0 = centro, 1 = borde) del toque al asentamiento. */
  distToSettlement(s: GameState, id: number, sx: number, sy: number): number {
    const st = s.settlements[id];
    const [wx, wy] = this.cam.toWorld(sx, sy);
    return Math.hypot(st.x - wx, st.y - wy) / RADIUS[st.kind];
  }

  sendSquads(st: Settlement): number[] {
    return st.garrison.filter((q) => !this.excluded.has(q.id)).map((q) => q.id);
  }

  orderTo(target: number): void {
    const s = this.state!;
    const p = this.view.player;
    const sel = this.view.selected;
    if (!sel) return;
    if (sel.kind === 'settlement') {
      if (target === sel.id) {
        this.cancelTarget();
        return;
      }
      const st = s.settlements[sel.id];
      const ids = this.sendSquads(st);
      const men = totalMen(st.garrison.filter((q) => ids.includes(q.id)));
      const r = sendArmy(s, p, sel.id, target, ids, this.genSel ?? undefined);
      if (r.ok) this.genSel = null;
      if (!r.ok) {
        sfx.deny();
        this.toast(r.reason, 'bad');
        return;
      }
      sfx.march();
      const route = r.army ? [r.army.toNode, ...r.army.path] : [];
      const stop = route.length ? route[route.length - 1] : target;
      const dest = s.settlements[stop];
      this.toast(stop === target ? `${men} hombres marchan hacia ${esc(dest.name)}` : `${men} hombres marchan; atacarán primero ${esc(dest.name)}`, '');
      if (this.settings.tipsDone <= 1) this.advanceTip(2);
      this.excluded.clear();
      this.view.targeting = false;
      this.mode = 'settlement';
      this.sheetSig = '';
      this.renderSheet();
    } else {
      const r = redirectArmy(s, p, sel.id, target);
      if (!r.ok) {
        sfx.deny();
        this.toast(r.reason, 'bad');
        return;
      }
      sfx.march();
      this.toast(`Nuevo rumbo: ${esc(s.settlements[target].name)}`, '');
      this.closeSheet();
    }
  }

  canDragFrom(sx: number, sy: number): boolean {
    const s = this.state;
    if (!s || this.view.selected?.kind !== 'settlement') return false;
    const hit = this.renderer.hitSettlement(s, this.cam, sx, sy);
    const st = hit !== null ? s.settlements[hit] : null;
    return !!st && hit === this.view.selected.id && st.owner === this.view.player && st.garrison.length > 0 && st.battleId === null;
  }

  onDragMove(sx: number, sy: number): void {
    const s = this.state!;
    const sel = this.view.selected;
    if (sel?.kind !== 'settlement') return;
    const [wx, wy] = this.cam.toWorld(sx, sy);
    const hover = this.renderer.hitSettlement(s, this.cam, sx, sy);
    this.view.drag = { from: sel.id, to: { x: wx, y: wy }, hover: hover !== sel.id ? hover : null };
  }

  onDragEnd(_sx: number, _sy: number, cancelled: boolean): void {
    const d = this.view.drag;
    this.view.drag = null;
    if (!d || cancelled || d.hover === null) return;
    this.orderTo(d.hover);
  }

  cancelTarget(): void {
    this.view.targeting = false;
    if (this.view.selected?.kind === 'settlement') this.openSheet('settlement');
    else this.closeSheet();
  }

  // ---------------- Panel ----------------

  openSheet(mode: SheetMode): void {
    this.disbandArmed = false;
    const wasHidden = $('sheet').classList.contains('hidden');
    this.mode = mode;
    this.sheetSig = '';
    if (wasHidden) this.sheetOpenedAt = performance.now();
    $('sheet').classList.remove('hidden');
    this.renderSheet();
    this.keepSelectionVisible();
  }

  /** Ajusta el margen de cámara al panel y mueve el mapa para que lo seleccionado no quede debajo. */
  keepSelectionVisible(): void {
    const s = this.state;
    const el = $('sheet');
    const hidden = el.classList.contains('hidden');
    const r = el.getBoundingClientRect();
    const side = !hidden && r.left > 10;
    this.cam.padBottom = hidden || side ? 0 : r.height;
    this.cam.padRight = side ? r.width : 0;
    const sel = this.view.selected;
    if (!s || !sel || hidden) return;
    let pt: { x: number; y: number } | undefined;
    if (sel.kind === 'settlement') pt = s.settlements[sel.id];
    else pt = this.renderer.armyFront.get(sel.id);
    if (!pt) return;
    const [sx, sy] = this.cam.toScreen(pt.x, pt.y);
    const maxY = side ? this.cam.vh - 70 : r.top - 70;
    const maxX = side ? r.left - 60 : this.cam.vw - 40;
    const minY = 110;
    let dx = 0;
    let dy = 0;
    if (sy > maxY) dy = sy - maxY;
    else if (sy < minY) dy = sy - minY;
    if (sx > maxX) dx = sx - maxX;
    else if (sx < 40) dx = sx - 40;
    if (dx || dy) this.camGoal = { x: this.cam.x + dx / this.cam.z, y: this.cam.y + dy / this.cam.z };
  }

  closeSheet(): void {
    this.cam.padBottom = 0;
    this.cam.padRight = 0;
    this.mode = 'none';
    this.view.selected = null;
    this.view.targeting = false;
    $('sheet').classList.add('hidden');
    $('sheet').innerHTML = '';
    this.sheetSig = '';
  }

  renderSheet(): void {
    const s = this.state;
    if (!s || this.mode === 'none') return;
    const el = $('sheet');
    const p = this.view.player;
    const sel = this.view.selected;
    if (sel?.kind === 'army' && !s.armies.some((a) => a.id === sel.id)) {
      this.closeSheet();
      return;
    }
    if (this.mode === 'settlement' && sel?.kind === 'settlement' && s.settlements[sel.id].owner !== p) this.mode = 'info';
    if (this.mode === 'info' && sel?.kind === 'settlement' && s.settlements[sel.id].owner === p) this.mode = 'settlement';
    let html = '';
    let sig = '';
    const color = s.factions[p].color;
    if (this.mode === 'target' && sel?.kind === 'settlement') {
      const st = s.settlements[sel.id];
      const men = totalMen(st.garrison.filter((q) => !this.excluded.has(q.id)));
      sig = `t|${sel.id}|${men}`;
      html = `<div class="slimbar"><div class="txt">Toca el destino para <b>${men}</b> hombres de ${esc(st.name)}</div><button class="secondary" data-act="cancel">Cancelar</button></div>`;
      el.classList.add('slim');
    } else if (this.mode === 'settlement' && sel?.kind === 'settlement') {
      el.classList.remove('slim');
      const st = s.settlements[sel.id];
      const k = statsOf(st);
      const f = s.factions[p];
      const units = recruitable(f.culture, st.kind, st.level);
      const can = units.map((u) => canRecruit(s, p, st.id, u.key));
      const ups = upgradeOptions(st);
      const canUp = ups.map((o) => canUpgrade(s, p, st.id, o.what));
      const canGen = st.kind === 'fortaleza' ? canAppointGeneral(s, p, st.id) : null;
      if (this.genSel !== null && !st.generals.some((g) => g.id === this.genSel)) this.genSel = null;
      sig = [
        's', st.id, st.garrison.map((q) => `${q.id}:${menOf(q)}:${Math.round((q.hp / maxHp(q.unit)) * 10)}`).join(','),
        st.queue.map((q) => q.unit).join(','), [...this.excluded].join(','), can.map((c) => (c.ok ? 1 : c.reason)).join(','),
        Math.floor(st.pop / 5), Math.round((st.walls / k.wallHp) * 20), st.battleId, f.starving, this.disbandArmed,
        st.level, st.building, st.build?.what, canUp.map((c) => (c.ok ? 1 : c.reason)).join(','), canGen ? (canGen.ok ? 1 : canGen.reason) : '',
        st.generals.map((g) => `${g.id}:${g.level}`).join(','), this.genSel,
      ].join('|');
      const selMen = totalMen(st.garrison.filter((q) => !this.excluded.has(q.id)));
      const allSel = st.garrison.every((q) => !this.excluded.has(q.id));
      html = `
        <div class="sh-head"><h2>${esc(st.name)}<span class="kind">${k.name}${levelTag(st)}${st.battleId !== null ? ' · ASEDIADA' : ''}</span></h2><button class="close" data-act="close">×</button></div>
        <div class="stats">
          ${k.popMax ? `<span>Población <b>${Math.floor(st.pop)}/${k.popMax}</b></span>` : ''}
          <span>Muralla <b>${Math.round((st.walls / k.wallHp) * 100)} %</b></span>
          <span>Oro <b>+${k.income.toFixed(1)}</b></span>
          ${k.food ? `<span>Comida <b>+${k.food.toFixed(1)}</b></span>` : ''}
          ${k.towers ? `<span>Torres <b>${k.towers}</b></span>` : ''}
        </div>
        <div class="sec">GUARNICIÓN · ${totalMen(st.garrison)}<span class="grow"></span>${st.garrison.length ? `<button data-act="all">${allSel ? 'Ninguna' : 'Todas'}</button>` : ''}</div>
        <div class="chips">${st.generals.map((g) => this.genChip(g, this.genSel === g.id, true)).join('')}${st.garrison.length ? st.garrison.map((q) => this.chip(q, color, !this.excluded.has(q.id), true)).join('') : '<span class="hint">Sin tropas.</span>'}</div>
        ${st.generals.length ? `<p class="hint">${this.genSel !== null ? 'El general irá con el ejército: más ataque, defensa y aguante.' : 'Toca un general para que acompañe al ejército.'}</p>` : ''}
        ${units.length ? `<div class="sec">RECLUTAR<span class="grow"></span></div>
        <div class="recruit">${units
          .map(
            (u, i) => `<button class="rbtn" data-act="rec" data-unit="${u.key}" ${can[i].ok ? '' : 'disabled'}>
              <img src="${unitIcon(u.key, color)}" alt=""><span class="nm">${esc(u.name)}</span>
              <span class="cost"><span class="coin"></span>${u.cost} · ${u.time}s</span>
              ${can[i].ok ? '' : `<span class="why">${esc((can[i] as any).reason)}</span>`}
            </button>`,
          )
          .join('')}</div>
        ${st.queue.length ? `<div class="queue">${st.queue.map((q, i) => `<button class="qitem" data-act="cq" data-i="${i}"><img src="${unitIcon(q.unit, color)}" alt="">${esc(UNITS[q.unit].name)}<span class="x">×</span><span class="bar" data-q="${i}" style="width:${i === 0 ? (q.progress / UNITS[q.unit].time) * 100 : 0}%"></span></button>`).join('')}</div>` : ''}`
        : `<p class="hint">Los fortines no reclutan, pero sus murallas y torres resisten mucho.</p>`}
        ${ups.length || st.build || canGen ? `<div class="sec">MEJORAS<span class="grow"></span></div>` : ''}
        ${st.build ? `<div class="building"><span>Construyendo <b>${esc(buildName(st.build.what, st))}</b></span><span class="bar"><span data-build style="width:${(st.build.progress / st.build.time) * 100}%"></span></span></div>` : ''}
        ${!st.build && ups.length ? `<div class="ups">${ups
          .map(
            (o, i) => `<button class="ubtn" data-act="up" data-what="${o.what}" ${canUp[i].ok ? '' : 'disabled'}>
              <span class="nm">${esc(o.name)}</span><span class="ds">${esc(o.desc)}</span>
              <span class="cost"><span class="coin"></span>${o.cost} · ${o.time}s${canUp[i].ok ? '' : ` · <span class="why">${esc((canUp[i] as any).reason)}</span>`}</span>
            </button>`,
          )
          .join('')}</div>` : ''}
        ${canGen ? `<button class="secondary" data-act="gen" ${canGen.ok ? '' : 'disabled'}>☆ Nombrar general · ${GENERAL_COST} oro${canGen.ok ? '' : ` (${esc((canGen as any).reason)})`}</button>` : ''}
        ${f.starving || this.disbandArmed ? `<button class="secondary" data-act="disband" ${selMen && st.battleId === null ? '' : 'disabled'}>${this.disbandArmed ? `¿Seguro? Licenciar ${selMen} hombres` : `Licenciar ${selMen} hombres (ahorra comida)`}</button>` : ''}
        <p class="hint">${st.battleId !== null ? 'No puede salir nadie mientras dura el asedio.' : 'También puedes arrastrar desde la plaza hasta el destino.'}</p>
        <div class="sticky-send"><button class="primary" data-act="send" ${selMen && st.battleId === null ? '' : 'disabled'}>⚔ Enviar ${selMen} hombres</button></div>`;
    } else if (this.mode === 'army' && sel?.kind === 'army') {
      el.classList.add('slim');
      const a = s.armies.find((x) => x.id === sel.id)!;
      const dest = s.settlements[a.path.length ? a.path[a.path.length - 1] : a.toNode];
      sig = ['a', a.id, a.squads.map((q) => `${q.id}:${menOf(q)}`).join(','), a.battleId, dest.id, a.general?.level, a.retreating].join('|');
      html = `
        <div class="sh-head"><h2>Ejército · ${totalMen(a.squads)}<span class="kind">${a.battleId !== null ? 'COMBATIENDO' : `${a.retreating ? 'SE RETIRA A' : 'HACIA'} ${esc(dest.name.toUpperCase())}`}</span></h2><button class="close" data-act="close">×</button></div>
        <div class="chips">${a.general ? this.genChip(a.general, true, false) : ''}${a.squads.map((q) => this.chip(q, color, true, false)).join('')}</div>
        ${a.battleId !== null ? `<button class="secondary" data-act="retreat">↩ Retirada (perderá algunos hombres)</button>` : ''}
        <p class="hint">${a.battleId !== null ? 'Está combatiendo: retírate o espera a que acabe para cambiar de rumbo.' : 'Toca un asentamiento para cambiar su rumbo.'}</p>`;
    } else if (this.mode === 'info' && sel?.kind === 'settlement') {
      el.classList.remove('slim');
      const st = s.settlements[sel.id];
      const k = statsOf(st);
      const oc = s.factions[st.owner].color;
      const from = this.bestAttacker(s, st);
      sig = ['i', st.id, st.owner, st.garrison.map((q) => `${q.id}:${menOf(q)}`).join(','), Math.round((st.walls / k.wallHp) * 20), from?.id, from ? totalMen(from.garrison) : 0].join('|');
      html = `
        <div class="sh-head"><h2>${esc(st.name)}<span class="kind">${k.name}${levelTag(st)} · ${st.owner === 0 ? 'Independiente' : esc(s.factions[st.owner].name)}</span></h2><button class="close" data-act="close">×</button></div>
        <div class="stats"><span>Muralla <b>${Math.round((st.walls / k.wallHp) * 100)} %</b></span>${k.towers ? `<span>Torres <b>${k.towers}</b></span>` : ''}<span>Defensa <b>×${k.wall}</b></span></div>
        <div class="sec">GUARNICIÓN · ${totalMen(st.garrison)}<span class="grow"></span></div>
        <div class="chips">${st.generals.map((g) => this.genChip(g, true, false)).join('')}${st.garrison.length ? st.garrison.map((q) => this.chip(q, oc, true, false)).join('') : '<span class="hint">Sin defensores.</span>'}</div>
        ${from ? `<button class="primary" data-act="atk" data-from="${from.id}">⚔ Atacar con ${totalMen(from.garrison)} de ${esc(from.name)}</button>` : ''}
        <p class="hint">Consejo: ataca con bastantes más hombres que los defensores; las murallas multiplican su defensa.</p>`;
    }
    if (sig !== this.sheetSig) {
      const scroll = el.scrollTop;
      const modeChanged = !this.sheetSig.startsWith(sig.slice(0, 2));
      el.innerHTML = html;
      el.scrollTop = scroll;
      this.sheetSig = sig;
      if (modeChanged) this.keepSelectionVisible();
    } else {
      // Solo barras de progreso.
      if (sel?.kind === 'settlement') {
        const st = s.settlements[sel.id];
        const bar = el.querySelector('[data-q="0"]') as HTMLElement | null;
        if (bar && st.queue[0]) bar.style.width = `${(st.queue[0].progress / UNITS[st.queue[0].unit].time) * 100}%`;
        const bb = el.querySelector('[data-build]') as HTMLElement | null;
        if (bb && st.build) bb.style.width = `${(st.build.progress / st.build.time) * 100}%`;
      }
    }
  }

  genChip(g: General, sel: boolean, toggle: boolean): string {
    return `<button class="chip gen ${toggle ? (sel ? 'sel' : '') : 'static'}" ${toggle ? `data-act="genchip" data-id="${g.id}"` : ''}><span class="laurel">☆</span><span><span class="n">${esc(g.name)}</span><span class="nm">General · nivel ${g.level}</span></span></button>`;
  }

  chip(q: Squad, color: string, sel: boolean, toggle: boolean): string {
    const u = UNITS[q.unit];
    const hp = q.hp / maxHp(q.unit);
    return `<button class="chip ${toggle ? (sel ? 'sel' : '') : 'static'}" ${toggle ? `data-act="chip" data-id="${q.id}"` : ''}><img src="${unitIcon(q.unit, color)}" alt=""><span><span class="n">${menOf(q)}</span><span class="nm">${esc(u.name)}</span></span><span class="hp" style="width:${hp * 100}%;${hp < 0.5 ? 'background:#d9573d' : ''}"></span></button>`;
  }

  /** La plaza propia más cercana con tropas para atacar un objetivo. */
  bestAttacker(s: GameState, target: Settlement): Settlement | null {
    const p = this.view.player;
    let best: Settlement | null = null;
    let bestD = Infinity;
    for (const o of s.settlements) {
      if (o.owner !== p || !o.garrison.length || o.battleId !== null) continue;
      const route = routeFor(s, p, o.id, target.id);
      if (!route || route[route.length - 1] !== target.id) continue;
      const d = distancesFrom(s, o.id, p)[target.id];
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  onSheetClick(e: Event): void {
    // Evitar el «clic fantasma» del mismo toque que abrió el panel.
    if (performance.now() - this.sheetOpenedAt < 400) return;
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    const s = this.state;
    if (!t || !s) return;
    const p = this.view.player;
    const sel = this.view.selected;
    const act = t.dataset.act;
    if (act === 'close') {
      sfx.tap();
      this.closeSheet();
    } else if (act === 'cancel') {
      sfx.tap();
      this.cancelTarget();
    } else if (act === 'genchip') {
      const id = Number(t.dataset.id);
      this.genSel = this.genSel === id ? null : id;
      sfx.tap();
      this.renderSheet();
    } else if (act === 'up' && sel?.kind === 'settlement') {
      const r = startUpgrade(s, p, sel.id, t.dataset.what as Build['what']);
      if (r.ok) sfx.recruit();
      else {
        sfx.deny();
        this.toast(r.reason, 'bad');
      }
      this.renderSheet();
    } else if (act === 'gen' && sel?.kind === 'settlement') {
      const r = appointGeneral(s, p, sel.id);
      if (r.ok) {
        sfx.capture();
        const st = s.settlements[sel.id];
        this.toast(`${esc(st.generals[st.generals.length - 1].name)} toma el mando`, 'good');
      } else {
        sfx.deny();
        this.toast(r.reason, 'bad');
      }
      this.renderSheet();
    } else if (act === 'retreat' && sel?.kind === 'army') {
      const r = orderRetreat(s, p, sel.id);
      if (!r.ok) this.toast(r.reason ?? '', 'bad');
      this.renderSheet();
    } else if (act === 'chip') {
      const id = Number(t.dataset.id);
      if (this.excluded.has(id)) this.excluded.delete(id);
      else this.excluded.add(id);
      sfx.tap();
      this.renderSheet();
    } else if (act === 'all' && sel?.kind === 'settlement') {
      const st = s.settlements[sel.id];
      const allSel = st.garrison.every((q) => !this.excluded.has(q.id));
      this.excluded.clear();
      if (allSel) for (const q of st.garrison) this.excluded.add(q.id);
      sfx.tap();
      this.renderSheet();
    } else if (act === 'rec' && sel?.kind === 'settlement') {
      const r = recruit(s, p, sel.id, t.dataset.unit!);
      if (r.ok) {
        sfx.recruit();
        if (this.settings.tipsDone === 2) this.advanceTip(3);
      } else {
        sfx.deny();
        this.toast(r.reason, 'bad');
      }
      this.renderSheet();
    } else if (act === 'cq' && sel?.kind === 'settlement') {
      cancelRecruit(s, p, sel.id, Number(t.dataset.i));
      sfx.tap();
      this.renderSheet();
    } else if (act === 'disband' && sel?.kind === 'settlement') {
      if (!this.disbandArmed) {
        this.disbandArmed = true;
      } else {
        const st = s.settlements[sel.id];
        const r = disband(s, p, sel.id, this.sendSquads(st));
        this.disbandArmed = false;
        if (r.ok) {
          sfx.tap();
          this.toast('Tropas licenciadas: vuelven a sus casas', '');
          this.excluded.clear();
        } else this.toast(r.reason, 'bad');
      }
      this.renderSheet();
    } else if (act === 'send' && sel?.kind === 'settlement') {
      sfx.select();
      this.view.targeting = true;
      this.mode = 'target';
      this.sheetSig = '';
      this.renderSheet();
    } else if (act === 'atk' && sel?.kind === 'settlement') {
      const from = Number(t.dataset.from);
      const target = sel.id;
      const st = s.settlements[from];
      const men = totalMen(st.garrison);
      const r = sendArmy(s, p, from, target);
      if (r.ok) {
        sfx.march();
        this.toast(`${men} hombres de ${esc(st.name)} marchan hacia ${esc(s.settlements[target].name)}`, '');
        if (this.settings.tipsDone <= 1) this.advanceTip(2);
        this.closeSheet();
      } else {
        sfx.deny();
        this.toast(r.reason, 'bad');
      }
    }
  }

  // ---------------- HUD ----------------

  buildHud(): void {
    const s = this.state!;
    const f = s.factions[this.view.player];
    const hud = $('hud');
    hud.classList.remove('hidden');
    hud.innerHTML = `
      <div class="hudl">
        <div class="res"><span class="flag" style="background:${f.color}"></span><span><span class="coin"></span><span id="gold">0</span><span class="inc" id="inc"></span></span><span id="foodbox"><span class="wheat"></span><span id="food">0</span><span class="inc" id="finc"></span></span></div>
        <div class="res small"><span class="men" id="men"></span><span id="rivals"></span></div>
      </div>
      <div class="spacer"></div>
      <button class="hbtn" data-act="speed" id="speed" aria-label="Velocidad">×1</button>
      <button class="hbtn" data-act="pause" id="pause" aria-label="Pausa">${ICON_PAUSE}</button>
      <button class="hbtn" data-act="menu" aria-label="Menú">${ICON_MENU}</button>`;
  }

  updateHud(): void {
    const s = this.state;
    if (!s) return;
    const p = this.view.player;
    const f = s.factions[p];
    $('gold').textContent = String(Math.floor(f.gold));
    $('inc').textContent = `+${incomeOf(s, p).toFixed(1)}/s`;
    let men = 0;
    for (const st of s.settlements) if (st.owner === p) men += totalMen(st.garrison);
    for (const a of s.armies) if (a.owner === p) men += totalMen(a.squads);
    $('men').textContent = `⚔ ${men}`;
    const fb = foodBalance(s, p);
    const net = fb.prod - fb.upkeep;
    $('food').textContent = String(Math.floor(f.food));
    $('finc').textContent = `${net >= 0 ? '+' : ''}${net.toFixed(1)}/s`;
    $('foodbox').classList.toggle('neg', net < 0 || f.starving);
    if (net < -0.05 && !this.settings.foodTip) {
      this.settings.foodTip = true;
      saveSettings(this.settings);
      this.toast('Tus tropas comen más de lo que producen tus plazas. Las <b>aldeas</b> dan comida; si se acaba, las tropas desertan.', '');
    }
    const rivals = s.factions
      .filter((x) => x.id !== 0 && x.id !== p)
      .map((x) => {
        const n = s.settlements.filter((q) => q.owner === x.id).length;
        return `<span class="rv${x.alive ? '' : ' dead'}"><span class="dot" style="background:${x.color}"></span>${x.alive ? n : '✝'}</span>`;
      })
      .join('');
    if ($('rivals').innerHTML !== rivals) $('rivals').innerHTML = rivals;
    $('pause').innerHTML = this.paused ? ICON_PLAY : ICON_PAUSE;
    $('pause').classList.toggle('on', this.paused);
    $('speed').textContent = `×${this.speed}`;
    $('speed').classList.toggle('on', this.speed > 1);
    $('pause-tag').classList.toggle('hidden', !this.paused);
  }

  onHudClick(e: Event): void {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t) return;
    sfx.tap();
    if (t.dataset.act === 'pause') this.paused = !this.paused;
    else if (t.dataset.act === 'speed') this.speed = this.speed === 1 ? 2 : 1;
    else if (t.dataset.act === 'menu') this.showPauseMenu();
    this.updateHud();
  }

  // ---------------- Consejos ----------------

  advanceTip(n: number): void {
    this.settings.tipsDone = Math.max(this.settings.tipsDone, n);
    saveSettings(this.settings);
    this.tipT = 0;
  }

  updateTip(dt: number): void {
    const s = this.state!;
    const el = $('tip');
    const i = this.settings.tipsDone;
    const sheetOpen = !$('sheet').classList.contains('hidden');
    if (i >= TIPS.length || s.winner !== null || (sheetOpen && i !== 1) || this.mode === 'target') {
      el.classList.add('hidden');
      return;
    }
    if (i === 2) {
      this.tipT += dt;
      if (this.tipT > 20) {
        this.advanceTip(3);
        return;
      }
    }
    const html = TIPS[i](s, this.view.player);
    if (el.innerHTML !== html) el.innerHTML = html;
    el.classList.remove('hidden');
    el.style.bottom = sheetOpen ? 'auto' : '';
    el.style.top = sheetOpen ? 'calc(var(--sat) + 104px)' : '';
  }

  // ---------------- Pantallas ----------------

  makeDemo(): GameState {
    const seed = (Math.random() * 1e9) | 0;
    const maps = Object.values(MAPS);
    const map = maps[seed % maps.length];
    const players = defaultPlayers(map.players, 'roma', 'normal', seed).map((p) => ({ ...p, ai: 'normal' }));
    const d = newGame({ seed, mapId: map.id, players });
    for (let i = 0; i < 1800; i++) step(d);
    d.events.length = 0;
    return d;
  }

  showMenu(): void {
    this.state = null;
    if (!this.demo) {
      this.demo = this.makeDemo();
      this.cam.mapW = this.demo.width;
      this.cam.mapH = this.demo.height;
      this.renderer.resize(this.cam);
      this.cam.z = this.cam.defaultZoom() * 1.1;
      this.cam.x = this.demo.width / 2;
      this.cam.y = this.demo.height / 2;
      this.cam.clamp();
    }
    this.closeSheet();
    $('hud').classList.add('hidden');
    $('tip').classList.add('hidden');
    const has = !!loadGame();
    const sc = $('screen');
    sc.classList.remove('hidden');
    sc.innerHTML = `
      <div class="card">
        <div class="laurel">❧ SPQR ❧</div>
        <h1>LEGIO</h1>
        <div class="sub">FORTALEZAS DE ROMA</div>
        ${has ? '<button class="primary" data-act="continue">Continuar partida</button>' : ''}
        <button class="${has ? 'secondary' : 'primary'}" data-act="new">Nueva partida</button>
        <button class="secondary" data-act="help">Cómo se juega</button>
        <button class="secondary" data-act="mute">Sonido: ${isMuted() ? 'no' : 'sí'}</button>
        <div class="ver">M0 · versión de prueba</div>
      </div>`;
  }

  showNew(): void {
    const st = this.settings;
    const opt = (act: string, v: string, on: boolean, title: string, sub: string) =>
      `<button data-act="${act}" data-v="${v}" class="${on ? 'on' : ''}">${title}<small>${sub}</small></button>`;
    const map = MAPS[st.mapId] ?? MAPS.po;
    const others = (['roma', 'galos', 'cartago'] as const).filter((c) => c !== st.culture).map((c) => CULTURE_NAMES[c]);
    const rivals =
      map.players === 2
        ? [`${others.join(' o ')} (al azar)`]
        : factionNames(defaultPlayers(map.players, st.culture, st.difficulty, 0)).slice(1);
    $('screen').innerHTML = `
      <div class="card">
        <h2>Nueva partida</h2>
        <div class="lbl">MAPA</div>
        <div class="opt">
          ${Object.values(MAPS).map((m) => opt('map', m.id, m.id === map.id, m.name, `${m.players} pueblos`)).join('')}
        </div>
        <div class="lbl">TU PUEBLO</div>
        <div class="opt">
          ${opt('cul', 'roma', st.culture === 'roma', 'Roma', 'Legiones')}
          ${opt('cul', 'galos', st.culture === 'galos', 'Galos', 'Furia')}
          ${opt('cul', 'cartago', st.culture === 'cartago', 'Cartago', 'Jinetes')}
        </div>
        <div class="lbl">DIFICULTAD</div>
        <div class="opt">
          ${opt('dif', 'facil', st.difficulty === 'facil', 'Fácil', 'Aprender')}
          ${opt('dif', 'normal', st.difficulty === 'normal', 'Normal', 'Equilibrado')}
          ${opt('dif', 'dificil', st.difficulty === 'dificil', 'Difícil', 'Sin piedad')}
        </div>
        <p style="font-size:15px;margin:0">${esc(map.desc)}. Rivales: <b>${rivals.map(esc).join(', ')}</b>. ${map.players > 2 ? 'Ganas si eres el último en pie.' : 'Ganas si tomas su fortaleza.'}</p>
        <button class="primary" data-act="start">¡A la guerra!</button>
        <button class="secondary" data-act="back">Volver</button>
      </div>`;
  }

  showHelp(back: 'menu' | 'pause'): void {
    $('screen').innerHTML = `
      <div class="card">
        <h2>Cómo se juega</h2>
        <ul>
          <li><b>Toca una de tus plazas</b> (bandera de tu color) para ver su guarnición y reclutar con oro.</li>
          <li>Pulsa <b>Enviar</b> y toca el destino, o <b>arrastra</b> desde la plaza seleccionada hasta el destino. Toca las escuadras para elegir cuáles salen.</li>
          <li><b>Toca un estandarte</b> en marcha para cambiar su rumbo.</li>
          <li>Las <b>fortalezas</b> reclutan todas las tropas; las <b>aldeas</b>, solo las básicas; los <b>fortines</b> no reclutan pero tienen murallas y torres.</li>
          <li>Para tomar una plaza amurallada tu infantería debe <b>abrir brecha</b> mientras las torres y los tiradores disparan.</li>
          <li>Cada soldado <b>come</b>. Las aldeas y fortalezas producen comida; si se acaba, tus tropas desertan y no puedes reclutar. Puedes <b>licenciar</b> tropas.</li>
          <li>Piedra, papel y tijera: la <b>caballería</b> arrasa a los tiradores, las <b>lanzas</b> frenan a la caballería y los <b>tiradores</b> desgastan a la infantería pesada. La caballería apenas sirve para derribar murallas.</li>
          <li><b>Mejoras</b>: sube tu fortaleza hasta el nivel 3 (más oro, comida, murallas, generales y la tropa especial de tu pueblo); en cada aldea elige granja, mercado o muro; refuerza los fortines.</li>
          <li><b>Generales</b>: toca un general en la guarnición para que acompañe al ejército. Da más ataque y defensa, aguanta más antes de huir y sube de nivel. Si el ejército cae, muere.</li>
          <li><b>Moral</b>: un ejército muy castigado frente a otro mucho más fuerte huye a la plaza propia más cercana. También puedes ordenar la <b>retirada</b> tocando su estandarte.</li>
          <li><b>Ganas</b> cuando no queda ninguna fortaleza enemiga en pie y <b>pierdes</b> si caen las tuyas.</li>
          <li>Pausa cuando quieras: en pausa también puedes dar órdenes. ×2 acelera el tiempo.</li>
        </ul>
        <button class="primary" data-act="${back === 'menu' ? 'back' : 'resume-menu'}">Entendido</button>
      </div>`;
  }

  showPauseMenu(): void {
    const sc = $('screen');
    sc.classList.remove('hidden');
    sc.innerHTML = `
      <div class="card">
        <h2>En pausa</h2>
        <button class="primary" data-act="resume">Seguir jugando</button>
        <button class="secondary" data-act="mute">Sonido: ${isMuted() ? 'no' : 'sí'}</button>
        <button class="secondary" data-act="help-p">Cómo se juega</button>
        <button class="secondary" data-act="quit">Guardar y salir al menú</button>
        <button class="secondary" data-act="surrender">Rendirse</button>
      </div>`;
  }

  showEnd(): void {
    const s = this.state;
    if (!s || this.endShown) return;
    this.endShown = true;
    clearGame();
    const p = this.view.player;
    const win = s.winner === p;
    const st = s.factions[p].stats;
    const sc = $('screen');
    sc.classList.remove('hidden');
    sc.innerHTML = `
      <div class="card">
        <div class="laurel">${win ? '❧ TRIUNFO ❧' : '❧ DERROTA ❧'}</div>
        <h2 style="font-size:34px">${win ? '¡Victoria!' : 'Tu fortaleza ha caído'}</h2>
        <p style="text-align:center">${win ? 'El enemigo ha sido aplastado. Tu nombre se recordará en el foro.' : 'Reúne a tus legiones y vuelve a intentarlo.'}</p>
        <div class="endstats">
          <span>Duración</span><b>${fmtTime(s.time)}</b>
          <span>Escuadras reclutadas</span><b>${st.recruited}</b>
          <span>Enemigos abatidos</span><b>${st.killed}</b>
          <span>Bajas propias</span><b>${st.lost}</b>
          <span>Plazas conquistadas</span><b>${st.captured}</b>
        </div>
        <button class="primary" data-act="again">Otra partida</button>
        <button class="secondary" data-act="tomenu">Menú principal</button>
      </div>`;
  }

  onScreenClick(e: Event): void {
    const t = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
    if (!t) return;
    sfx.tap();
    const act = t.dataset.act;
    switch (act) {
      case 'continue':
        this.continueGame();
        break;
      case 'new':
        this.showNew();
        break;
      case 'help':
        this.showHelp('menu');
        break;
      case 'help-p':
        this.showHelp('pause');
        break;
      case 'back':
        this.showMenu();
        break;
      case 'resume-menu':
        this.showPauseMenu();
        break;
      case 'mute':
        setMuted(!isMuted());
        this.settings.muted = isMuted();
        saveSettings(this.settings);
        t.textContent = `Sonido: ${isMuted() ? 'no' : 'sí'}`;
        break;
      case 'cul':
        this.settings.culture = t.dataset.v as Settings['culture'];
        this.showNew();
        break;
      case 'dif':
        this.settings.difficulty = t.dataset.v as Settings['difficulty'];
        this.showNew();
        break;
      case 'map':
        this.settings.mapId = t.dataset.v!;
        this.showNew();
        break;
      case 'start':
        this.startNew(this.settings.culture, this.settings.difficulty, this.settings.mapId);
        break;
      case 'resume':
        $('screen').classList.add('hidden');
        $('screen').innerHTML = '';
        break;
      case 'quit':
        this.save();
        this.showMenu();
        break;
      case 'surrender':
        clearGame();
        this.showMenu();
        break;
      case 'again':
        this.showNew();
        break;
      case 'tomenu':
        this.showMenu();
        break;
    }
  }
}
