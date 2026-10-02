"""d1: exports the step-6 poster. 1) capture: MSYS_NO_PATHCONV=1 SHOTS_DIR=C:/.../.shots/d1 node tools/digital/shoot-scene.mjs --out=poster --w=1600 --h=1000 --q="reduced=1&nogizmo=1" --settle=2500 1
   2) python tools/digital/export-poster.py   → public/media/digital-poster-{960,1600}.{avif,webp,jpg}"""
from PIL import Image
src = Image.open('.shots/d1/poster-p1.png').convert('RGB')
for w in (1600, 960):
    im = src if w == src.width else src.resize((w, round(src.height * w / src.width)), Image.LANCZOS)
    base = f'public/media/digital-poster-{w}'
    im.save(base + '.jpg', quality=82, optimize=True, progressive=True)
    im.save(base + '.webp', quality=80, method=6)
    im.save(base + '.avif', quality=58, speed=4)
    print(base, im.size)
