"""Genera el icono de la app (normal, redondo y adaptativo) y las pantallas de inicio de Android.
Uso: python3 tools/iconos.py   (Pillow + fontTools)"""
import math, os, glob
from PIL import Image, ImageDraw, ImageFilter, ImageFont
from fontTools.ttLib import TTFont

RAIZ = os.path.join(os.path.dirname(__file__), '..')
RES = os.path.join(RAIZ, 'android/app/src/main/res')
FUENTE = '/tmp/cinzel-900.ttf'

# Cinzel en .woff (zlib) → .ttf para Pillow
f = TTFont(os.path.join(RAIZ, 'node_modules/@fontsource/cinzel/files/cinzel-latin-900-normal.woff'))
f.flavor = None
f.save(FUENTE)

ORO = (232, 192, 96)
ORO_OSC = (150, 105, 35)
ROJO = (179, 38, 30)
ROJO_OSC = (110, 20, 14)
FONDO = (42, 18, 10)


def fondo(size):
    im = Image.new('RGB', (size, size), FONDO)
    d = ImageDraw.Draw(im)
    for r in range(size // 2, 0, -2):
        t = r / (size / 2)
        c = tuple(int(a * (1 - t) + b * t) for a, b in zip((110, 38, 20), FONDO))
        d.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], fill=c)
    return im


def laurel(d, cx, cy, R, w):
    """Corona de laurel: dos ramas de hojas alrededor."""
    for lado in (-1, 1):
        for i in range(11):
            a = math.radians(100 + i * 15) if lado < 0 else math.radians(80 - i * 15)
            x = cx + math.cos(a) * R
            y = cy + math.sin(a) * R
            ang = a + (math.pi / 2) * lado
            L, W = w * 1.7, w * 0.62
            pts = []
            for k in range(14):
                t = k / 13 * math.pi * 2
                px, py = math.cos(t) * L / 2, math.sin(t) * W / 2
                pts.append((x + px * math.cos(ang) - py * math.sin(ang), y + px * math.sin(ang) + py * math.cos(ang)))
            d.polygon(pts, fill=ORO, outline=ORO_OSC)


def escudo(d, cx, cy, h):
    w = h * 0.66
    r = w * 0.22
    box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    d.rounded_rectangle([box[0] + h * 0.02, box[1] + h * 0.04, box[2] + h * 0.02, box[3] + h * 0.04], r, fill=(20, 8, 4))
    d.rounded_rectangle(box, r, fill=ROJO, outline=ORO, width=max(2, int(h * 0.045)))
    d.rounded_rectangle([box[0] + w * 0.12, box[1] + h * 0.08, box[2] - w * 0.12, box[3] - h * 0.08], r * 0.7, outline=ORO_OSC, width=max(1, int(h * 0.018)))
    # alas y rayos de Júpiter
    for s in (-1, 1):
        d.line([(cx, cy), (cx + s * w * 0.32, cy - h * 0.3)], fill=ORO, width=max(2, int(h * 0.035)))
        d.line([(cx, cy), (cx + s * w * 0.32, cy + h * 0.3)], fill=ORO, width=max(2, int(h * 0.035)))
        for k in range(3):
            y = cy - h * (0.08 + k * 0.06)
            d.line([(cx + s * w * 0.08, y), (cx + s * w * (0.36 - k * 0.04), y - h * 0.05)], fill=ORO, width=max(1, int(h * 0.022)))
    rb = h * 0.1
    d.ellipse([cx - rb, cy - rb, cx + rb, cy + rb], fill=ORO, outline=ORO_OSC, width=max(1, int(h * 0.015)))


def emblema(size, transparente=False, escala=1.0):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)) if transparente else fondo(size).convert('RGBA')
    d = ImageDraw.Draw(im)
    c = size / 2
    laurel(d, c, c, size * 0.36 * escala, size * 0.07 * escala)
    escudo(d, c, c, size * 0.5 * escala)
    return im


def redondo(im):
    m = Image.new('L', im.size, 0)
    ImageDraw.Draw(m).ellipse([0, 0, im.size[0] - 1, im.size[1] - 1], fill=255)
    out = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out.paste(im, (0, 0), m)
    return out


base = emblema(1024)
cuadrado = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
mascara = Image.new('L', (1024, 1024), 0)
ImageDraw.Draw(mascara).rounded_rectangle([0, 0, 1023, 1023], 180, fill=255)
cuadrado.paste(base, (0, 0), mascara)
frente = emblema(1024, transparente=True, escala=0.64)  # zona segura del icono adaptativo

DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for dn, k in DENS.items():
    carpeta = os.path.join(RES, f'mipmap-{dn}')
    os.makedirs(carpeta, exist_ok=True)
    n = int(48 * k)
    cuadrado.resize((n, n), Image.LANCZOS).save(os.path.join(carpeta, 'ic_launcher.png'))
    redondo(base).resize((n, n), Image.LANCZOS).save(os.path.join(carpeta, 'ic_launcher_round.png'))
    m = int(108 * k)
    frente.resize((m, m), Image.LANCZOS).save(os.path.join(carpeta, 'ic_launcher_foreground.png'))

# Fondo del icono adaptativo: color liso.
open(os.path.join(RES, 'drawable/ic_launcher_background.xml'), 'w').write(
    '<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android">\n'
    '    <solid android:color="#5a1d0f" />\n</shape>\n')
for nombre in ('ic_launcher.xml', 'ic_launcher_round.xml'):
    open(os.path.join(RES, 'mipmap-anydpi-v26', nombre), 'w').write(
        '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@drawable/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>\n')

# Pantallas de inicio: mismas medidas que las que trae Capacitor.
def splash(w, h):
    im = Image.new('RGB', (w, h), (34, 24, 16))
    d = ImageDraw.Draw(im)
    for r in range(int(max(w, h) * 0.7), 0, -4):
        t = r / (max(w, h) * 0.7)
        c = tuple(int(a * (1 - t) + b * t) for a, b in zip((95, 32, 16), (34, 24, 16)))
        d.ellipse([w / 2 - r, h * 0.42 - r, w / 2 + r, h * 0.42 + r], fill=c)
    s = int(min(w, h) * 0.42)
    em = emblema(s, transparente=True)
    im.paste(em, (w // 2 - s // 2, int(h * 0.42) - s // 2), em)
    f1 = ImageFont.truetype(FUENTE, int(min(w, h) * 0.13))
    f2 = ImageFont.truetype(FUENTE, int(min(w, h) * 0.035))
    y = int(h * 0.42 + s * 0.55)
    d.text((w / 2, y), 'LEGIO', font=f1, fill=ORO, anchor='mt')
    d.text((w / 2, y + int(min(w, h) * 0.16)), 'FORTALEZAS DE ROMA', font=f2, fill=(220, 190, 140), anchor='mt')
    return im

for ruta in glob.glob(os.path.join(RES, 'drawable*/splash.png')):
    w, h = Image.open(ruta).size
    splash(w, h).save(ruta)

# Icono para la web y vista previa.
cuadrado.resize((512, 512), Image.LANCZOS).save('/tmp/icono-512.png')
splash(1080, 1920).save('/tmp/splash.png')
print('iconos y pantallas de inicio generados')
