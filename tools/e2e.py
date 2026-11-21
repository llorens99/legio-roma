"""E2E en móvil con Playwright: toques reales, vertical y horizontal, errores de consola y capturas.
Uso: python3 tools/e2e.py  (requiere `npm run build` antes)."""
import functools, http.server, os, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(__file__), '..', 'dist')
OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
handler.log_message = lambda *a: None
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_address[1]}/index.html'

errors = []
fails = []

def check(cond, msg):
    print(('  ok  ' if cond else '  FALLO ') + msg)
    if not cond:
        fails.append(msg)

def shot(page, name):
    page.screenshot(path=os.path.join(OUT, f'{name}.png'))

def tap_text(page, text):
    el = page.get_by_text(text, exact=False).first
    box = el.bounding_box()
    page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.wait_for_timeout(250)

def tap_sel(page, sel):
    box = page.locator(sel).first.bounding_box()
    page.touchscreen.tap(box['x'] + box['width'] / 2, box['y'] + box['height'] / 2)
    page.wait_for_timeout(250)

def tap_settlement(page, name):
    x, y = page.evaluate(f"window.__legio.debugScreenOf({name!r})")
    # Si queda tapada por el HUD, el minimapa o el panel, centrar la cámara en ella primero.
    covered = page.evaluate(f"""(() => {{ const x = {x}, y = {y};
      for (const id of ['hud', 'minimap', 'sheet', 'tip']) {{ const e = document.getElementById(id);
        if (!e || e.classList.contains('hidden')) continue; const r = e.getBoundingClientRect();
        if (id === 'hud') {{ if (y < 120) return true; continue; }}
        if (x >= r.left - 20 && x <= r.right + 20 && y >= r.top - 20 && y <= r.bottom + 20) return true; }}
      return x < 30 || y < 30 || x > innerWidth - 30 || y > innerHeight - 30; }})()""")
    if covered:
        page.evaluate(f"(() => {{ const a = window.__legio; const s = (a.state ?? a.demo).settlements.find(x => x.name === {name!r}); a.focus(s.x, s.y - 40); }})()")
        page.wait_for_timeout(250)
        x, y = page.evaluate(f"window.__legio.debugScreenOf({name!r})")
    page.touchscreen.tap(x, y)
    page.wait_for_timeout(300)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(URL)
    page.wait_for_timeout(1500)
    shot(page, '01-menu')
    check(page.get_by_text('Batalla libre').count() > 0, 'menú principal visible')

    tap_text(page, 'Batalla libre')
    tap_sel(page, '[data-act=map][data-v=po]')
    tap_sel(page, '[data-act=cul][data-v=roma]')
    tap_sel(page, '[data-act=dif][data-v=normal]')
    shot(page, '02-nueva')
    tap_text(page, 'A la guerra')
    page.wait_for_timeout(800)
    shot(page, '03-inicio')
    check(page.evaluate("!!window.__legio.state"), 'partida iniciada')
    check(page.is_visible('#hud'), 'HUD visible')
    check(page.is_visible('#tip'), 'consejo inicial visible')

    tap_settlement(page, 'Ariminum')
    check(page.is_visible('#sheet'), 'panel de la fortaleza al tocarla')
    check(page.get_by_text('RECLUTAR').count() > 0, 'botones de reclutar')
    shot(page, '04-fortaleza')
    gold0 = page.evaluate("window.__legio.state.factions[1].gold")
    tap_sel(page, '.rbtn[data-unit=roma_hastati]')
    gold1 = page.evaluate("window.__legio.state.factions[1].gold")
    check(gold1 < gold0, f'reclutar gasta oro ({gold0:.0f} → {gold1:.0f})')
    check(page.evaluate("window.__legio.state.settlements[0].queue.length") == 1, 'escuadra en cola (y sin clic fantasma al abrir el panel)')
    sy = page.evaluate("window.__legio.debugScreenOf('Ariminum')[1]")
    top = page.eval_on_selector('#sheet', 'e => e.getBoundingClientRect().top')
    check(sy < top, f'la fortaleza seleccionada queda visible sobre el panel ({sy:.0f} < {top:.0f})')

    # M2: mejorar la fortaleza y elegir al general para el ejército.
    page.evaluate("window.__legio.state.factions[1].gold = 600")
    page.wait_for_timeout(400)
    page.locator('[data-act=up][data-what=nivel]').scroll_into_view_if_needed()
    tap_sel(page, '[data-act=up][data-what=nivel]')
    check(page.evaluate("!!window.__legio.state.settlements[0].build"), 'obra de nivel 2 en marcha')
    shot(page, '04b-mejora')
    page.locator('[data-act=genchip]').first.scroll_into_view_if_needed()
    tap_sel(page, '[data-act=genchip]')
    check(page.evaluate("window.__legio.genSel !== null"), 'general elegido para el ejército')

    # Enviar tropas a Castra Rubra (fortín independiente).
    tap_sel(page, '[data-act=send]')
    check(page.get_by_text('Toca el destino').count() > 0, 'modo elegir destino')
    shot(page, '05-destino')
    tap_settlement(page, 'Castra Rubra')
    n_armies = page.evaluate("window.__legio.state.armies.filter(a => a.owner === 1).length")
    check(n_armies == 1, 'ejército en marcha')
    check(page.evaluate("!!window.__legio.state.armies.find(a => a.owner === 1).general"), 'el general marcha con el ejército')
    page.wait_for_timeout(1200)
    shot(page, '06-marcha')

    # Acelerar la simulación hasta el asedio.
    page.evaluate("window.__legio.debugAdvance(26)")
    page.evaluate("(() => { const a = window.__legio; const s = a.state.settlements.find(x => x.name === 'Castra Rubra'); a.focus(s.x, s.y + 30); a.cam.z = 1.6; a.cam.clamp(); })()")
    page.wait_for_timeout(900)
    shot(page, '07-asedio')
    check(page.evaluate("window.__legio.state.battles.length") >= 1, 'hay batalla en curso')
    # Tocar el estandarte del ejército y ordenar la retirada.
    page.evaluate("window.__legio.closeSheet()")
    page.wait_for_timeout(200)
    fx, fy = page.evaluate("(() => { const a = window.__legio; const ar = a.state.armies.find(x => x.owner === 1); const p = a.renderer.armyFront.get(ar.id); const [x, y] = a.cam.toScreen(p.x, p.y); return [x, y - 20 * Math.min(1.2, a.cam.z) - 10]; })()")
    page.touchscreen.tap(fx, fy)
    page.wait_for_timeout(500)
    shot(page, '07b-ejercito')
    check(page.locator('[data-act=retreat]').count() == 1, 'botón de retirada en el panel del ejército')
    tap_sel(page, '[data-act=retreat]')
    check(page.evaluate("window.__legio.state.armies.some(a => a.owner === 1 && a.retreating)"), 'el ejército se retira')

    # Pausa y velocidad
    page.touchscreen.tap(*page.evaluate("(() => { const r = document.getElementById('pause').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()"))
    page.wait_for_timeout(200)
    check(page.evaluate("window.__legio.paused") is True, 'pausa con el botón')
    t0 = page.evaluate("window.__legio.state.time")
    page.wait_for_timeout(600)
    check(abs(page.evaluate("window.__legio.state.time") - t0) < 1e-6, 'en pausa no avanza el tiempo')
    shot(page, '08-pausa')
    page.touchscreen.tap(*page.evaluate("(() => { const r = document.getElementById('pause').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()"))
    page.touchscreen.tap(*page.evaluate("(() => { const r = document.getElementById('speed').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()"))
    check(page.evaluate("window.__legio.speed") == 2, 'velocidad ×2')

    # Arrastrar el mapa con el dedo (paneo).
    cam0 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
    cdp = ctx.new_cdp_session(page)
    def touch(kind, pts):
        cdp.send('Input.dispatchTouchEvent', {'type': kind, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in enumerate(pts)]})
    page.evaluate("window.__legio.closeSheet()")
    touch('touchStart', [(200, 300)])
    for k in range(1, 11):
        touch('touchMove', [(200, 300 + k * 15)])
        page.wait_for_timeout(16)
    touch('touchEnd', [])
    page.wait_for_timeout(300)
    cam1 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
    check(cam1[1] < cam0[1] - 40, f'paneo con el dedo ({cam0[1]:.0f} → {cam1[1]:.0f})')
    # Pellizco para zoom.
    z0 = page.evaluate("window.__legio.cam.z")
    page.evaluate("window.__legio.cam.z = 1.2")
    z0 = page.evaluate("window.__legio.cam.z")
    touch('touchStart', [(150, 420), (240, 420)])
    for k in range(1, 11):
        touch('touchMove', [(150 - k * 8, 420), (240 + k * 8, 420)])
        page.wait_for_timeout(16)
    touch('touchEnd', [])
    page.wait_for_timeout(200)
    z1 = page.evaluate("window.__legio.cam.z")
    check(z1 > z0 * 1.2, f'pellizco amplía ({z0:.2f} → {z1:.2f})')

    # Avanzar más y ver el resultado del asedio.
    page.evaluate("window.__legio.debugAdvance(60)")
    page.evaluate("(() => { const a = window.__legio; const s = a.state.settlements.find(x => x.name === 'Castra Rubra'); a.focus(s.x, s.y); a.cam.z = 1.2; a.cam.clamp(); })()")
    page.wait_for_timeout(800)
    shot(page, '09-tras-asedio')

    # Tocar una plaza enemiga muestra información.
    page.evaluate("(() => { const a = window.__legio; const s = a.state.settlements.find(x => x.name === 'Mediolanum'); a.focus(s.x, s.y + 80); a.cam.z = 1.0; a.cam.clamp(); })()")
    page.wait_for_timeout(300)
    tap_settlement(page, 'Mediolanum')
    check(page.get_by_text('GUARNICIÓN').count() > 0, 'info de plaza enemiga')
    shot(page, '10-enemigo')
    page.touchscreen.tap(*page.evaluate("(() => { const r = document.querySelector('[data-act=close]').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()"))
    page.wait_for_timeout(450)
    check(not page.is_visible('#sheet'), 'cerrar panel')

    # Horizontal
    page.set_viewport_size({'width': 844, 'height': 390})
    page.wait_for_timeout(600)
    page.evaluate("(() => { const a = window.__legio; const s = a.state.settlements.find(x => x.name === 'Ariminum'); a.focus(s.x, s.y - 40); a.cam.z = 0.9; a.cam.clamp(); })()")
    page.wait_for_timeout(300)
    tap_settlement(page, 'Ariminum')
    page.wait_for_timeout(400)
    shot(page, '11-horizontal')
    check(page.is_visible('#sheet'), 'panel en horizontal')
    sheet_box = page.eval_on_selector('#sheet', 'e => e.getBoundingClientRect().toJSON()')
    check(sheet_box['x'] > 300, 'en horizontal el panel va a la derecha')
    page.set_viewport_size({'width': 390, 'height': 844})
    page.wait_for_timeout(400)

    # Guardado y continuar
    t_before = page.evaluate("window.__legio.state.time")
    page.evaluate("window.__legio.save()")
    page.reload()
    page.wait_for_timeout(1500)
    check(page.get_by_text('Continuar partida').count() > 0, 'tras recargar aparece «Continuar»')
    tap_text(page, 'Continuar partida')
    page.wait_for_timeout(500)
    t_after = page.evaluate("window.__legio.state.time")
    check(t_after >= t_before - 0.01, f'partida restaurada (t={t_after:.0f}s)')
    shot(page, '12-continuar')

    # Menú de pausa y salir
    page.touchscreen.tap(*page.evaluate("(() => { const r = document.querySelector('[data-act=menu]').getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; })()"))
    page.wait_for_timeout(300)
    shot(page, '13-menu-pausa')
    tap_text(page, 'Guardar y salir')
    check(page.get_by_text('Continuar partida').count() > 0, 'salir al menú')

    # Partida completa acelerada hasta el final: pantalla de fin.
    tap_text(page, 'Continuar partida')
    page.evaluate("(() => { const a = window.__legio; a.state.factions[1].ai = 'normal'; a.debugAdvance(60*45); })()")
    page.wait_for_timeout(2500)
    shot(page, '14-fin')
    check(page.get_by_text('Otra partida').count() > 0, 'pantalla de fin de partida')

    # M1: partida en Hispania con Cartago (4 pueblos), comida y rivales en el HUD.
    tap_text(page, 'Otra partida')
    tap_sel(page, '[data-act=map][data-v=cuatro]')
    tap_sel(page, '[data-act=cul][data-v=cartago]')
    tap_sel(page, '[data-act=dif][data-v=dificil]')
    shot(page, '15-nueva-m1')
    tap_text(page, 'A la guerra')
    page.wait_for_timeout(800)
    check(page.evaluate("window.__legio.state.factions.length") == 5, 'Cuatro reinos: 4 bandos y los independientes')
    check(page.evaluate("window.__legio.state.factions[1].culture") == 'cartago', 'juegas con Cartago')
    check(page.is_visible('#food'), 'comida en el HUD')
    check(page.locator('#rivals .rv').count() == 3, 'tres rivales en el HUD')
    shot(page, '16-hispania')
    tap_settlement(page, 'Gades')
    check(page.locator('.rbtn[data-unit=cartago_numidas]').count() == 1, 'se pueden reclutar jinetes númidas en la fortaleza')
    shot(page, '17-cartago-panel')
    page.evaluate("(() => { const a = window.__legio; a.closeSheet(); a.state.factions[1].ai = 'normal'; a.debugAdvance(60*6); const b = a.state.battles[0]; if (b) { a.cam.z = 1.8; a.focus(b.x, b.y); } })()")
    page.wait_for_timeout(1200)
    shot(page, '18-batalla-m1')

    # M4: tutorial guiado con toques reales.
    page.evaluate("window.__legio.showMenu()")
    page.wait_for_timeout(300)
    tap_sel(page, '[data-act=tutorial]')
    page.wait_for_timeout(800)
    step = lambda: page.evaluate("window.__legio.state.tutorial")
    check(step() == 0 and page.is_visible('#tip'), 'tutorial: paso 1 a la vista')
    shot(page, '24-tutorial-1')
    tap_settlement(page, 'Ariminum')
    page.wait_for_timeout(500)
    check(step() == 1, 'tutorial: tocar Ariminum lleva al paso 2')
    check(page.locator('.rbtn.hl').count() == 1, 'tutorial: el botón de Hastati está resaltado')
    shot(page, '25-tutorial-2')
    tap_sel(page, '.rbtn[data-unit=roma_hastati]')
    page.wait_for_timeout(400)
    check(step() == 2, 'tutorial: reclutar lleva al paso 3')
    tap_sel(page, '[data-act=send]')
    page.wait_for_timeout(400)
    check(step() == 3, 'tutorial: Enviar lleva al paso 4')
    tap_settlement(page, 'Castra Rubra')
    page.wait_for_timeout(400)
    check(step() == 4, 'tutorial: enviar a Castra Rubra lleva al paso 5')
    tap_sel(page, '#speed')
    page.wait_for_timeout(400)
    check(step() == 5, 'tutorial: ×2 lleva al paso 6')
    page.evaluate("window.__legio.debugAdvance(90)")
    page.wait_for_timeout(600)
    check(step() == 6, 'tutorial: conquistar Castra Rubra lleva al paso 7')
    page.evaluate("(() => { const a = window.__legio; const s = a.state.settlements.find(x => x.name === 'Ariminum'); a.focus(s.x, s.y); })()")
    page.wait_for_timeout(300)
    tap_settlement(page, 'Ariminum')
    page.wait_for_timeout(500)
    page.locator('[data-act=up]').scroll_into_view_if_needed()
    shot(page, '26-tutorial-7')
    tap_sel(page, '[data-act=up]')
    page.wait_for_timeout(500)
    check(step() == 7, 'tutorial: mejorar la fortaleza lleva al último paso')
    check(page.evaluate("window.__legio.state.factions[2].ai") == 'facil', 'tutorial: los galos despiertan al final')
    # Minimapa y avisos fuera de pantalla.
    page.evaluate("window.__legio.closeSheet()")
    check(page.is_visible('#minimap'), 'minimapa visible')
    cam0 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
    box = page.locator('#minimap canvas').bounding_box()
    page.touchscreen.tap(box['x'] + box['width'] * 0.5, box['y'] + box['height'] * 0.1)
    page.wait_for_timeout(300)
    cam1 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
    check(cam1[1] < cam0[1] - 100, f'tocar el minimapa mueve la cámara ({cam0[1]:.0f} → {cam1[1]:.0f})')
    page.evaluate("(() => { const a = window.__legio; const s = a.state; const f = s.settlements.find(x => x.name === 'Ariminum'); a.cam.z = 1.6; a.focus(f.x, f.y); const g = s.settlements.find(x => x.name === 'Mediolanum'); g.garrison.push({id: s.nextId++, unit: 'galos_guerreros', hp: 110}); })()")
    page.evaluate("(() => { const a = window.__legio; const s = a.state; const pis = s.settlements.find(x => x.name === 'Castra Rubra'); a.view.selected = {kind: 'settlement', id: pis.id}; a.excluded.clear(); a.orderTo(s.settlements.find(x => x.name === 'Turris Vada').id); a.closeSheet(); a.debugAdvance(30); })()")
    page.wait_for_timeout(4200)
    shot(page, '27-avisos')
    n_ind = page.evaluate("window.__legio.renderer.indicators.length")
    check(n_ind >= 1, f'aviso en el borde de una batalla fuera de la vista ({n_ind})')
    if n_ind:
        ix, iy = page.evaluate("[window.__legio.renderer.indicators[0].sx, window.__legio.renderer.indicators[0].sy]")
        cam0 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
        page.touchscreen.tap(ix, iy)
        page.wait_for_timeout(300)
        cam1 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
        check(abs(cam1[1] - cam0[1]) + abs(cam1[0] - cam0[0]) > 50, 'tocar el aviso lleva a la batalla')
    # Gráfica al final.
    page.evaluate("(() => { const a = window.__legio; a.debugAdvance(60); const m = a.state.settlements.find(x => x.name === 'Mediolanum'); m.owner = 1; a.debugAdvance(0.2); })()")
    page.wait_for_timeout(2600)
    check(page.locator('.chart svg polyline').count() >= 2, 'gráfica de hombres en armas al acabar')
    shot(page, '28-fin-grafica')
    check(page.evaluate("window.__legio.settings.tutorialDone") is True, 'tutorial marcado como hecho')

    # M3: campaña en mapa real.
    page.evaluate("window.__legio.showMenu()")
    page.wait_for_timeout(300)
    tap_sel(page, '[data-act=campaigns]')
    shot(page, '19-campanas')
    tap_sel(page, '[data-act=camp][data-v=roma]')
    check(page.get_by_text('Los ínsubres').count() > 0, 'briefing del primer capítulo')
    shot(page, '20-capitulo')
    tap_sel(page, '[data-act=campstart]')
    page.wait_for_timeout(900)
    check(page.evaluate("window.__legio.state.mapId") == 'italia', 'el capítulo 1 se juega en Italia')
    check(page.evaluate("window.__legio.state.campaign.chapter") == 0, 'partida marcada como campaña')
    page.evaluate("(() => { const a = window.__legio; a.settings.tipsDone = 9; a.cam.z = 1.0; const s = a.state.settlements.find(x => x.name === 'Roma'); a.focus(s.x, s.y); })()")
    page.wait_for_timeout(600)
    shot(page, '21-italia')
    # Ganar el capítulo: tomar Mediolanum.
    page.evaluate("(() => { const a = window.__legio; const s = a.state; const m = s.settlements.find(x => x.name === 'Mediolanum'); m.owner = 1; a.debugAdvance(0.2); })()")
    page.wait_for_timeout(2600)
    check(page.locator('[data-act=nextchapter]').count() == 1, 'tras ganar: botón «Siguiente capítulo»')
    shot(page, '22-capitulo-ganado')
    tap_sel(page, '[data-act=nextchapter]')
    check(page.get_by_text('Sicilia').count() > 0, 'briefing del capítulo 2')
    check(page.get_by_text('Te acompañan').count() > 0, 'los generales veteranos pasan al capítulo siguiente')
    shot(page, '23-capitulo2')

    # M6: los griegos, nuevas campañas y mapas de Grecia, Britania y Egipto.
    page.evaluate("window.__legio.showMenu()")
    page.wait_for_timeout(300)
    tap_sel(page, '[data-act=campaigns]')
    check(page.locator('[data-act=camp]').count() == 6, 'seis campañas en la lista')
    page.locator('[data-act=camp][data-v=galos2]').scroll_into_view_if_needed()
    shot(page, '29-campanas-m6')
    tap_sel(page, '[data-act=camp][data-v=griegos]')
    check(page.get_by_text('Queronea').count() > 0, 'briefing de Queronea')
    shot(page, '30-queronea')
    tap_sel(page, '[data-act=campstart]')
    page.wait_for_timeout(900)
    check(page.evaluate("window.__legio.state.mapId") == 'grecia', 'Queronea se juega en Grecia')
    check(page.evaluate("window.__legio.state.factions[1].culture") == 'griegos', 'juegas con los griegos')
    page.evaluate("(() => { const a = window.__legio; a.settings.tipsDone = 9; a.cam.z = 0.8; const s = a.state.settlements.find(x => x.name === 'Pella'); a.focus(s.x, s.y); })()")
    page.wait_for_timeout(600)
    shot(page, '31-grecia')
    tap_settlement(page, 'Pella')
    page.wait_for_timeout(500)
    check(page.get_by_text('Hoplitas').count() > 0, 'Pella recluta hoplitas')
    shot(page, '32-pella-panel')
    for mid, town in (('britannia', 'Londinium'), ('aegyptus', 'Alexandria')):
        page.evaluate("window.__legio.showMenu()")
        page.wait_for_timeout(300)
        tap_sel(page, '[data-act=new]')
        tap_sel(page, f'[data-act=map][data-v={mid}]')
        tap_sel(page, '[data-act=cul][data-v=griegos]')
        shot(page, f'33-nueva-{mid}')
        tap_sel(page, '[data-act=start]')
        page.wait_for_timeout(900)
        check(page.evaluate("window.__legio.state.mapId") == mid, f'partida en {mid}')
        page.evaluate(f"(() => {{ const a = window.__legio; a.settings.tipsDone = 9; a.cam.z = 0.7; const s = a.state.settlements.find(x => x.name === '{town}'); a.focus(s.x, s.y); }})()")
        page.wait_for_timeout(600)
        shot(page, f'34-{mid}')

    check(not errors, 'sin errores de consola' + ('' if not errors else f': {errors[:3]}'))
    b.close()

print('\nRESULTADO:', 'TODO BIEN' if not fails else f'{len(fails)} fallos')
sys.exit(1 if fails else 0)
