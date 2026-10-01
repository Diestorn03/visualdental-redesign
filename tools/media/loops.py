"""Short muted loops (720p) + posters. ceramic: brush stain on an arch (reel, forward loop); studio: slow push-in (ping-pong so the loop has no jump)."""
import os, subprocess
from lib import ROOT, PUB, frame, grade, crop_to, export
LOOPS = {
    'ceramic': dict(v='ig:Ddju-YPPITl', t0=13.1, t1=17.6, crop='crop=1440:810:0:1000,', pingpong=False,
                    poster_box=(0, 1000, 1440, 1810), alt='Brush applying stain to the incisal edge of a ceramic arch, looping'),
    'studio': dict(v='GuTcOzEswHo', t0=234.0, t1=237.0, crop='', pingpong=True,
                   poster_box=(0, 0, 1920, 1080), alt='Slow push-in across the studio benches, looping'),
}

def src(v): return f'{ROOT}/insumos/ig/reels/{v[3:]}.mp4' if v.startswith('ig:') else f'{ROOT}/insumos/youtube/{v}.mp4'

def build(crf_mp4=27, crf_webm=37, encode=True):
    out = {}
    for name, L in LOOPS.items():
        base = f'media/loop-{name}'; o = f'{PUB}/{base}'
        os.makedirs(os.path.dirname(o), exist_ok=True)
        chain = f"trim=start={L['t0']}:end={L['t1']},setpts=PTS-STARTPTS,{L['crop']}scale=1280:720:flags=lanczos,fps=30,format=yuv420p"
        if L['pingpong']: chain += ",split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0"
        base_cmd = ['ffmpeg', '-v', 'error', '-y', '-i', src(L['v']), '-filter_complex' if L['pingpong'] else '-vf', chain, '-an']
        if encode: subprocess.run(base_cmd + ['-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf_mp4), '-movflags', '+faststart', f'{o}.mp4'], check=True)
        if encode: subprocess.run(base_cmd + ['-c:v', 'libvpx-vp9', '-crf', str(crf_webm), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', f'{o}.webm'], check=True)
        im = crop_to(frame(L['v'], (L['t0'] + L['t1']) / 2 if name == 'ceramic' else L['t0'] + 0.5), L['poster_box'])
        p = export(im, f'{base}-poster', [480, 960, 1280])
        out[name] = {'base': base, 'video': True, 'w': 1280, 'h': 720, 'alt': L['alt'], 'poster': {**p, 'alt': L['alt'], 'position': '50% 50%'}}
        print(name, {e: os.path.getsize(f'{o}.{e}') // 1024 for e in ('mp4', 'webm')}, 'KB')
    return out

if __name__ == '__main__':
    build()
