#!/usr/bin/env bash
# Prueba el APK en el emulador: abrir, empezar partida, girar, atrás, reabrir con la partida guardada.
# Deja capturas, logcat y un resumen en ./emulador. Sale con error si algo falla.
set -u
OUT=emulador
mkdir -p "$OUT"
PKG=es.legio.roma
FALLOS=0
RES="$OUT/resumen.txt"
: > "$RES"

ok() { echo "ok  $1" | tee -a "$RES"; }
mal() { echo "FALLO  $1" | tee -a "$RES"; FALLOS=$((FALLOS + 1)); }
cap() { adb exec-out screencap -p > "$OUT/$1.png"; }

# Busca un texto en la pantalla (el WebView solo lo expone tras varias lecturas) y lo toca.
tocar() {
  local texto="$1"
  for i in $(seq 1 8); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1
    local xy
    xy=$(python3 - "$OUT/ui.xml" "$texto" <<'PY'
import re, sys
xml = open(sys.argv[1], encoding='utf-8', errors='ignore').read()
t = sys.argv[2].lower()
# El nodo más pequeño que contiene el texto (los contenedores también lo incluyen);
# primero los que coinciden exactamente.
best = None
for m in re.finditer(r'<node [^>]*>', xml):
    n = m.group(0)
    txt = (re.search(r' text="([^"]*)"', n) or [None, ''])[1].strip().lower()
    desc = (re.search(r' content-desc="([^"]*)"', n) or [None, ''])[1].strip().lower()
    if t in txt or t in desc:
        b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
        if b:
            x1, y1, x2, y2 = map(int, b.groups())
            if x2 > x1 and y2 > y1:
                key = (0 if t in (txt, desc) else 1, (x2 - x1) * (y2 - y1))
                if best is None or key < best[0]:
                    best = (key, (x1 + x2) // 2, (y1 + y2) // 2)
if best:
    print(best[1], best[2])
PY
)
    if [ -n "$xy" ]; then
      adb shell input tap $xy
      return 0
    fi
    sleep 2
  done
  return 1
}

hay() {
  for i in $(seq 1 6); do
    adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
    adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1
    grep -qi "$1" "$OUT/ui.xml" && return 0
    sleep 2
  done
  return 1
}

adb logcat -c
adb install -r legio.apk && ok "instalar el APK" || mal "instalar el APK"
adb shell am start -n $PKG/.MainActivity
sleep 20
cap 01-inicio
hay "Batalla libre" && ok "menú principal" || mal "menú principal"

# El WebView a veces da posiciones de una lectura anterior: comprobamos y repetimos.
abierta=no
for intento in 1 2 3; do
  tocar "Batalla libre"
  sleep 3
  if hay "A la guerra"; then abierta=si; break; fi
  cp "$OUT/ui.xml" "$OUT/ui-fallo-$intento.xml"
  adb shell input keyevent KEYCODE_BACK
  sleep 3
done
[ "$abierta" = si ] && ok "abrir batalla libre" || mal "abrir batalla libre"
cap 02-nueva
tocar "A la guerra" && ok "empezar partida" || mal "empezar partida"
sleep 8
cap 03-partida
# El lienzo se anima sin parar y uiautomator no siempre lo lee: la app lo anuncia por la consola.
adb logcat -d | grep -q "\[legio\] partida en marcha" && ok "partida en marcha" || mal "partida en marcha"

# Girar a horizontal y volver.
adb shell settings put system accelerometer_rotation 0
adb shell settings put system user_rotation 1
sleep 5
cap 04-horizontal
adb shell settings put system user_rotation 0
sleep 4
cap 05-vertical

# Atrás: vuelve al menú guardando la partida.
adb shell input keyevent KEYCODE_BACK
sleep 3
cap 06-atras
hay "Continuar partida" && ok "atrás vuelve al menú con la partida guardada" || mal "atrás vuelve al menú con la partida guardada"

# Cerrar del todo y reabrir: la partida sigue.
adb shell am force-stop $PKG
sleep 2
adb shell am start -n $PKG/.MainActivity
sleep 15
hay "Continuar partida" && ok "al reabrir, la partida guardada sigue ahí" || mal "al reabrir, la partida guardada sigue ahí"
tocar "Continuar partida" && ok "continuar partida" || mal "continuar partida"
sleep 6
cap 07-continuar

# Atrás dos veces: al menú y luego minimizar.
adb shell input keyevent KEYCODE_BACK
sleep 2
adb shell input keyevent KEYCODE_BACK
sleep 3
cap 08-minimizado
if adb shell dumpsys activity activities | grep -q "mResumedActivity.*$PKG"; then mal "atrás en el menú minimiza"; else ok "atrás en el menú minimiza"; fi

adb logcat -d > "$OUT/logcat.txt"
if grep -E "chromium.*(Uncaught|TypeError|ReferenceError)|Capacitor/Console.*(E |Error)" "$OUT/logcat.txt" > "$OUT/errores.txt"; then
  mal "errores de consola (ver errores.txt)"
else
  ok "sin errores de consola"
  rm -f "$OUT/errores.txt"
fi
rm -f "$OUT/ui.xml"
echo "Fallos: $FALLOS" | tee -a "$RES"
exit $FALLOS
