# Génère toutes les déclinaisons du logo (web, mobile, favicon) à partir de brand/logo.png.
# Usage : python3 scripts/brand-assets.py
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Image.open(ROOT / 'brand/logo.png').convert('RGBA')
BG = (14, 15, 19, 255)          # --bg de l'application
LIGHT = (236, 234, 228)         # --text : remplace le noir du logo sur fond sombre
ORANGE = (247, 147, 26)         # --btc : couleur principale de l'application, remplace le jaune d'origine


def trim(im, pad=0):
    box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(box)
    if pad:
        out = Image.new('RGBA', (im.width + 2 * pad, im.height + 2 * pad), (0, 0, 0, 0))
        out.paste(im, (pad, pad))
        im = out
    return im


def on_dark(im):
    # Les pixels sombres (le noir du logo) deviennent clairs ; le jaune reste jaune
    px = im.load()
    out = im.copy()
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) < 90:
                po[x, y] = (*LIGHT, a)
    return out


def mark_only(im):
    # Le symbole (Y + éclair + pièce) sans le texte « YombalPay / Bitcoin & Mobile Money »
    out = im.copy()
    ImageDraw.Draw(out).rectangle((505, 300, im.width, im.height), fill=(0, 0, 0, 0))
    return trim(out)


def fit(im, size, box_ratio, bg=None, radius=0):
    canvas = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    if bg and radius:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius), fill=255)
        canvas.putalpha(mask)
    inner = int(size * box_ratio)
    scale = min(inner / im.width, inner / im.height)
    sm = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(sm, ((size - sm.width) // 2, (size - sm.height) // 2))
    return canvas


def width(im, w):
    return im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)


def to_orange(im):
    # Le jaune du logo (et ses bords mêlés au noir) prend l'orange de l'application, à intensité égale
    out = im.copy()
    po = out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = po[x, y]
            if a and r - b > 40:
                t = min(1.0, r / 253)
                po[x, y] = (round(ORANGE[0] * t), round(ORANGE[1] * t), round(ORANGE[2] * t), a)
    return out


SRC = to_orange(SRC)
full = trim(SRC)
full_dark = on_dark(full)
mark = mark_only(SRC)
mark_dark = on_dark(mark)

web = ROOT / 'web/public'
mob = ROOT / 'mobile/assets'
outputs = {
    # Web : logo complet (fond clair / fond sombre), symbole, icônes navigateur et PWA
    web / 'logo.png': width(full, 900),
    web / 'logo-dark.png': width(full_dark, 900),
    web / 'logo-mark.png': fit(mark, 256, 1),
    web / 'logo-mark-dark.png': fit(mark_dark, 256, 1),
    web / 'favicon-32.png': fit(mark_dark, 32, 0.84, BG, 0.22),
    web / 'favicon-192.png': fit(mark_dark, 192, 0.78, BG, 0.22),
    web / 'apple-touch-icon.png': fit(mark_dark, 180, 0.74, BG),
    web / 'icon-512.png': fit(mark_dark, 512, 0.74, BG),
    web / 'icon-maskable-512.png': fit(mark_dark, 512, 0.58, BG),
    # Mobile (Expo) : icône, Android adaptatif, écran de démarrage, logos dans l'app
    mob / 'icon.png': fit(mark_dark, 1024, 0.72, BG),
    mob / 'android-icon-foreground.png': fit(mark_dark, 1024, 0.56),
    mob / 'android-icon-background.png': Image.new('RGBA', (1024, 1024), BG),
    mob / 'android-icon-monochrome.png': fit(Image.merge('RGBA', (*[mark.getchannel('A').point(lambda v: 255 if v else 0)] * 3, mark.getchannel('A'))), 1024, 0.56),
    mob / 'splash-icon.png': fit(full_dark, 1024, 0.9),
    mob / 'favicon.png': fit(mark_dark, 48, 0.84, BG, 0.22),
    mob / 'logo-dark.png': width(full_dark, 900),
    mob / 'logo-mark-dark.png': fit(mark_dark, 256, 1),
}
for path, im in outputs.items():
    im.save(path, optimize=True)
    print(f'{path.relative_to(ROOT)}  {im.width}×{im.height}')
