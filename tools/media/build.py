"""Export everything in the manifest to public/media and write src/data/media.js.
    python tools/media/build.py            photos + IG + brand + loop posters (reuses existing loop videos)
    python tools/media/build.py --loops    also re-encode the loop videos
Requires Pillow (AVIF/WebP/JPG encoders are Pillow's); ffmpeg only for frame grabs and loops."""
import os, sys
from lib import ROOT, PUB, frame, grade, crop_to, export, write_media_js
from manifest import PHOTOS, IG
import brand, loops

ORDER = ['brand', 'hero', 'about', 'services', 'recipe', 'anatomy', 'stories']


def photo(base, v, t, box, widths, alt, pos, g):
    e = export(grade(crop_to(frame(v, t), box), **g), base, widths)
    return {**e, 'alt': alt, 'position': pos}


def build(encode_loops=False):
    media = {k: {} for k in ORDER}
    media['brand'] = brand.build()
    for key, v, t, box, widths, alt, pos, g in PHOTOS:
        grp, name = key.split('.', 1)
        base = f"media/{grp}-{name.lower() if grp == 'stories' else name}"
        media[grp][name] = photo(base, v, t, box, widths, alt, pos, g)
    media['ig'] = []
    for i, (code, t, alt) in enumerate(IG, 1):
        im = frame(f'ig:{code}', t)
        e = export(im, f'media/ig-{i:02d}', [360, 720])
        media['ig'].append({**e, 'alt': alt, 'position': '50% 50%', 'href': f'https://www.instagram.com/reel/{code}/'})
    media['loops'] = loops.build(encode=encode_loops)
    write_media_js(media, f'{ROOT}/src/data/media.js')
    return media


if __name__ == '__main__':
    build('--loops' in sys.argv)
