"""Preview the manifest crops as labelled contact sheets in .shots/media-work/prev_N.jpg.
python preview.py [prefix]   e.g. `python preview.py services` (default: everything)"""
import sys
from PIL import Image, ImageDraw, ImageFont
from lib import WORK, frame, grade, crop_to
from manifest import PHOTOS, IG

pre = sys.argv[1] if len(sys.argv) > 1 else ''
items = [(k, v, t, box, g) for k, v, t, box, ws, alt, pos, g in PHOTOS if k.startswith(pre)]
font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
TW, TH, COLS, ROWS = 640, 480, 3, 2
for n in range(0, len(items), COLS * ROWS):
    chunk = items[n:n + COLS * ROWS]
    sheet = Image.new('RGB', (COLS * TW, ROWS * TH), (30, 30, 30)); d = ImageDraw.Draw(sheet)
    for i, (k, v, t, box, g) in enumerate(chunk):
        im = grade(crop_to(frame(v, t), box), **g)
        im.thumbnail((TW, TH))
        x, y = (i % COLS) * TW, (i // COLS) * TH
        sheet.paste(im, (x + (TW - im.width) // 2, y + (TH - im.height) // 2))
        d.rectangle([x, y, x + 330, y + 22], fill=(0, 0, 0)); d.text((x + 3, y + 1), f'{k} {t}s {im.width and ""}', fill=(255, 230, 0), font=font)
    out = f'{WORK}/prev_{pre or "all"}_{n // (COLS * ROWS) + 1}.jpg'
    sheet.save(out, quality=88); print(out)
