"""Contact sheets with timestamps from the extracted candidate frames (.shots/media-work/yt/<id>/NNNN.jpg)."""
import sys, glob, os
from PIL import Image, ImageDraw, ImageFont
W = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '.shots', 'media-work'))
STEP = {'GuTcOzEswHo': 2, 'wHwWyR-Vsfk': 2, 'tbf0E3Yq3Qs': 1, 'At9KcdW1_Cg': 1, 'cpuyUuM52s8': 3, '4_Bn42aDvnQ': 4}
COLS, ROWS, TW, TH = 6, 5, 320, 180
font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 18)
for vid, step in STEP.items():
    files = sorted(glob.glob(f'{W}/yt/{vid}/*.jpg'))
    per = COLS * ROWS
    os.makedirs(f'{W}/sheets', exist_ok=True)
    for s in range(0, len(files), per):
        sheet = Image.new('RGB', (COLS * TW, ROWS * TH), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        for k, f in enumerate(files[s:s + per]):
            t = (s + k) * step
            im = Image.open(f).resize((TW, TH))
            x, y = (k % COLS) * TW, (k // COLS) * TH
            sheet.paste(im, (x, y))
            d.rectangle([x, y, x + 58, y + 22], fill=(0, 0, 0))
            d.text((x + 3, y + 1), f'{t}s', fill=(255, 230, 0), font=font)
        sheet.save(f'{W}/sheets/{vid}_{s // per + 1:02d}.jpg', quality=80)
