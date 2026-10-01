"""grab.py <video-id|ig:code> t1 t2 ... -> full-res PNG per timestamp in .shots/media-work/full + a labelled contact sheet.
Usage: python tools/media/grab.py GuTcOzEswHo 50 52 74 --sheet name"""
import sys, os, subprocess, math
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = f'{ROOT}/.shots/media-work/full'
os.makedirs(OUT, exist_ok=True)

def src(v):
    return f'{ROOT}/insumos/ig/reels/{v[3:]}.mp4' if v.startswith('ig:') else f'{ROOT}/insumos/youtube/{v}.mp4'

def grab(v, t):
    f = f'{OUT}/{v.replace(":", "_")}_{float(t):07.2f}.png'
    if not os.path.exists(f):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', src(v), '-frames:v', '1', f], check=True)
    return f

if __name__ == '__main__':
    a = sys.argv[1:]
    name = a[a.index('--sheet') + 1] if '--sheet' in a else None
    if name: a = a[:a.index('--sheet')]
    v, ts = a[0], a[1:]
    files = [grab(v, t) for t in ts]
    if name:
        first = Image.open(files[0]); portrait = first.height > first.width
        tw, th = (270, 480) if portrait else (640, 360)
        cols = 6 if portrait else 3
        rows = math.ceil(len(files) / cols)
        sheet = Image.new('RGB', (cols * tw, rows * th), (20, 20, 20)); d = ImageDraw.Draw(sheet)
        font = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 20)
        for k, (f, t) in enumerate(zip(files, ts)):
            x, y = (k % cols) * tw, (k // cols) * th
            sheet.paste(Image.open(f).convert('RGB').resize((tw, th)), (x, y))
            d.rectangle([x, y, x + 70, y + 24], fill=(0, 0, 0)); d.text((x + 3, y + 1), f'{t}s', fill=(255, 230, 0), font=font)
        sheet.save(f'{ROOT}/.shots/media-work/{name}.jpg', quality=85)
        print(f'{ROOT}/.shots/media-work/{name}.jpg')
