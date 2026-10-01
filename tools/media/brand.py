"""Brand assets from the client's logo files: molar marks with alpha, lockups, favicons, OG image."""
import numpy as np
from PIL import Image, ImageDraw
from lib import ROOT, PUB, INK, export, frame, grade, crop_to

WEB = f'{ROOT}/insumos/web'
PAPER = (250, 250, 250)


def _trim(im, x_max=None, pad=6):
    a = np.asarray(im)[..., 3]
    if x_max: a = a[:, :x_max]
    ys, xs = np.where(a > 8)
    return im.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0), xs.max() + pad + 1, ys.max() + pad + 1))


def _dark_from_black(path):
    """Black-on-white JPG -> ink-colored RGBA whose alpha is the inverted luminance (noise floor removed)."""
    L = np.asarray(Image.open(path).convert('L')).astype(np.float32)
    a = np.clip((255 - L - 8) / (255 - 8), 0, 1)
    rgba = np.zeros(L.shape + (4,), np.uint8)
    rgba[..., :3] = INK
    rgba[..., 3] = (a * 255 + 0.5).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')


def build():
    out = {}
    light_lockup = Image.open(f'{WEB}/Visual_Dental_Arts_Logo_WhiteBKG-2x-1920w.png').convert('RGBA')  # white wordmark, already transparent
    dark_lockup = _dark_from_black(f'{WEB}/Visual_Dental_Arts_Logo_Black-2x-1920w.jpg')
    marks = {'markLight': _trim(light_lockup, 470), 'markDark': _trim(dark_lockup, 470)}
    names = {'markLight': 'logo-mark-light', 'markDark': 'logo-mark-dark'}
    alts = {'markLight': 'Visual Dental Arts molar mark, light version for dark backgrounds',
            'markDark': 'Visual Dental Arts molar mark, dark version for light backgrounds'}
    for k, m in marks.items():
        n = names[k]
        m.save(f'{PUB}/brand/{n}.png', optimize=True)
        m.save(f'{PUB}/brand/{n}.webp', quality=90, method=4)
        e = export(m, f'brand/{n}', [96, 192, m.width], sharpen=False, quality=(70, 90, 90),
                   flatten=INK if k == 'markLight' else PAPER)
        out[k] = {**e, 'alt': alts[k], 'position': '50% 50%', 'png': f'brand/{n}.png'}
    # full wordmark lockups (extras: header/footer can use the real lettering)
    for k, im, n, flat in (('logoLight', light_lockup, 'logo-light', INK), ('logoDark', dark_lockup, 'logo-dark', PAPER)):
        t = _trim(im, None, 4)
        e = export(t, f'brand/{n}', [320, 640, 960], sharpen=False, quality=(70, 90, 90), flatten=flat)
        out[k] = {**e, 'alt': 'Visual Dental Arts', 'position': '50% 50%'}

    # favicons: light molar centered on ink
    m = marks['markLight']
    for size, name, fill in ((32, 'favicon-32.png', .84), (192, 'favicon-192.png', .72), (180, 'apple-touch-icon.png', .66)):
        tile = Image.new('RGB', (size, size), INK)
        h = round(size * fill); w = round(m.width * h / m.height)
        r = m.resize((w, h), Image.LANCZOS)
        tile.paste(r, ((size - w) // 2, (size - h) // 2), r)
        tile.save(f'{PUB}/brand/{name}', optimize=True)

    # og.jpg 1200x630: ink, faint macro on the right fading to the left, white lockup on the left
    W, H = 1200, 630
    bg = Image.new('RGB', (W, H), INK)
    ph = grade(frame('ig:Ddju-YPPITl', 9.0).crop((0, 690, 1440, 1500)), gamma=1.25).resize((W, H), Image.LANCZOS)
    fade = np.linspace(0, 1, W, dtype=np.float32)[None, :]
    fade = np.clip((fade - 0.18) / 0.62, 0, 1) ** 1.2 * 0.45  # 0 on the left, .45 on the right
    a = np.asarray(bg).astype(np.float32); b = np.asarray(ph).astype(np.float32)
    bg = Image.fromarray((a + (b - a) * fade[..., None]).astype(np.uint8))
    lk = _trim(light_lockup, None, 0)
    lw = 600; lh = round(lk.height * lw / lk.width)
    lk = lk.resize((lw, lh), Image.LANCZOS)
    bg.paste(lk, (72, (H - lh) // 2), lk)
    ImageDraw.Draw(bg).line([(72, H - 56), (72 + lw, H - 56)], fill=(212, 163, 115), width=2)  # amber hairline: accent from the concept
    bg.save(f'{PUB}/brand/og.jpg', quality=88, progressive=True, optimize=True)
    out['og'] = {'src': 'brand/og.jpg', 'w': W, 'h': H, 'alt': 'Visual Dental Arts, boutique dental laboratory'}
    return out


if __name__ == '__main__':
    import json; print(json.dumps(build(), indent=1))
