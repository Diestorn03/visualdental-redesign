"""python v4-crop-sheet.py <glob> <out-prefix> x0 y0 x1 y1 [cols=2] [rows=2] [scale=1.0]  -> crops each image to the box and tiles them (labels = file stem tail)"""
import glob, sys, os
from PIL import Image, ImageDraw
pat, out = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = map(int, sys.argv[3:7])
cols = int(sys.argv[7]) if len(sys.argv) > 7 else 2
rows = int(sys.argv[8]) if len(sys.argv) > 8 else 2
scale = float(sys.argv[9]) if len(sys.argv) > 9 else 1.0
files = sorted(glob.glob(pat))
per = cols * rows
for k in range(0, len(files), per):
    ims = []
    for f in files[k:k + per]:
        im = Image.open(f).convert('RGB').crop((x0, y0, x1, y1))
        im = im.resize((int((x1 - x0) * scale), int((y1 - y0) * scale)), Image.LANCZOS)
        d = ImageDraw.Draw(im); d.rectangle((0, 0, 110, 16), fill=(0, 0, 0)); d.text((4, 2), os.path.basename(f)[:-4], fill=(255, 255, 0))
        ims.append(im)
    w, h = ims[0].size
    sheet = Image.new('RGB', (cols * w + 6 * (cols - 1), rows * h + 6 * (rows - 1)), (255, 0, 255))
    for j, i in enumerate(ims):
        sheet.paste(i, ((j % cols) * (w + 6), (j // cols) * (h + 6)))
    sheet.save(f'{out}-{k // per:02d}.png'); print(f'{out}-{k // per:02d}.png')
