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
    check(page.get_by_text('Nueva partida').count() > 0, 'menú principal visible')

    tap_text(page, 'Nueva partida')
    tap_text(page, 'Roma')
    tap_text(page, 'Normal')
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

    # Enviar tropas a Castra Rubra (fortín independiente).
    tap_sel(page, '[data-act=send]')
    check(page.get_by_text('Toca el destino').count() > 0, 'modo elegir destino')
    shot(page, '05-destino')
    tap_settlement(page, 'Castra Rubra')
    n_armies = page.evaluate("window.__legio.state.armies.filter(a => a.owner === 1).length")
    check(n_armies == 1, 'ejército en marcha')
    page.wait_for_timeout(1200)
    shot(page, '06-marcha')

    # Acelerar la simulación hasta el asedio.
    page.evaluate("window.__legio.debugAdvance(26)")
    page.evaluate("(() => { const a = window.__legio; const s = a.state.settlements.find(x => x.name === 'Castra Rubra'); a.focus(s.x, s.y + 30); a.cam.z = 1.6; a.cam.clamp(); })()")
    page.wait_for_timeout(900)
    shot(page, '07-asedio')
    check(page.evaluate("window.__legio.state.battles.length") >= 1, 'hay batalla en curso')

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
    touch('touchStart', [(200, 400)])
    for k in range(1, 11):
        touch('touchMove', [(200, 400 + k * 15)])
        page.wait_for_timeout(16)
    touch('touchEnd', [])
    page.wait_for_timeout(300)
    cam1 = page.evaluate("[window.__legio.cam.x, window.__legio.cam.y]")
    check(cam1[1] < cam0[1] - 40, f'paneo con el dedo ({cam0[1]:.0f} → {cam1[1]:.0f})')
    # Pellizco para zoom.
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
    page.wait_for_timeout(200)
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

    check(not errors, 'sin errores de consola' + ('' if not errors else f': {errors[:3]}'))
    b.close()

print('\nRESULTADO:', 'TODO BIEN' if not fails else f'{len(fails)} fallos')
sys.exit(1 if fails else 0)
