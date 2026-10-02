// Frames (rAF deltas) while #digital's scene is built: jump to 1.2 viewports above it, wait for data-ready, list every frame > --min ms with the page marks.
//   MSYS_NO_PATHCONV=1 node tools/digital/frames-build.mjs --port=9416 --url=http://127.0.0.1:4416/ [--cache=cold|warm] [--min=50] [--main] [--idle=5000]
// --idle: ms to wait after load before the jump (the scene is built at ~5 s after load once the page is quiet, or on the final approach).
import { rmSync } from 'node:fs';
import { launch, goto, geom, frames, series, stats, sleep, arg, OUT } from './v/v2-lib.mjs';

const PORT = +arg('port', 9416), CACHE = arg('cache', 'warm'), MIN = +arg('min', 50);
const URL = arg('url', 'http://127.0.0.1:4416/') + (arg('main', false) ? '?digital=main' : '');
const dir = OUT + (CACHE === 'cold' ? 'prof-cold-fb' : 'prof-warm');
const c = await launch({ port: PORT, profileDir: dir, fresh: CACHE === 'cold' });
await goto(c, URL, { settle: +arg('idle', 1500) });
const g = await geom(c); const dg = g.secs.find((s) => s.id === 'digital');
await c.ev('__d2.reset(); __d2.rec = true; 1');
const t0 = await c.ev('performance.now()');
await c.ev(`scrollTo(0, ${dg.top - Math.round(g.vh * 1.2)}); 1`);
let ready = false; for (let i = 0; i < 160 && !ready; i++) { await sleep(250); ready = await c.ev(`document.querySelector('#digital')?.dataset.ready === '1'`); }
const tr = await c.ev('performance.now()');
await sleep(1500);
await c.ev('__d2.rec = false; 1');
const f = await frames(c); const F = series(f.f).filter((x) => x.t > t0);
const marks = JSON.parse(await c.ev(`JSON.stringify(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dg:')).map((m) => [m.name, Math.round(m.startTime)]))`));
console.log(`cache=${CACHE} main=${!!arg('main', false)} ready=${ready} (+${Math.round(tr - t0)} ms) frames ${JSON.stringify(stats(F.map((x) => x.dt)))} longtasks ${f.lt.filter((l) => l.s > t0).map((l) => Math.round(l.d)).join(',')} marks ${JSON.stringify(marks)} t0=${Math.round(t0)}`);
for (const x of F) if (x.dt > MIN) console.log(`  ${Math.round(x.dt)} ms at t=+${Math.round(x.t - t0)}`);
console.log('info', JSON.stringify(await c.ev(`(() => { const s = window.__digital?.scene; return s && s.info && s.info(); })()`)), 'errors', c.errors.slice(0, 4));
await c.close();
if (CACHE === 'cold') { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
