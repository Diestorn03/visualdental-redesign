"""Contact sheets from a walk: python tools/qa/sheet.py <glob> <out-prefix> [cols=2] [rows=3] [scale=0.5]"""
import glob, sys
from PIL import Image
pat, out = sys.argv[1], sys.argv[2]
cols, rows = int(sys.argv[3]) if len(sys.argv) > 3 else 2, int(sys.argv[4]) if len(sys.argv) > 4 else 3
scale = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
files = sorted(glob.glob(pat))
per = cols * rows
for k in range(0, len(files), per):
    ims = [Image.open(f) for f in files[k:k + per]]
    ims = [i.resize((int(i.width * scale), int(i.height * scale))) for i in ims]
    w, h = ims[0].size
    sheet = Image.new('RGB', (cols * w + 8 * (cols - 1), rows * h + 8 * (rows - 1)), (255, 0, 255))
    for j, i in enumerate(ims):
        sheet.paste(i, ((j % cols) * (w + 8), (j // cols) * (h + 8)))
    sheet.save(f'{out}-{k // per:02d}.png')
    print(f'{out}-{k // per:02d}.png', [f.split("-")[-2] + "-" + f.split("-")[-1][:-4] for f in files[k:k + per]])
