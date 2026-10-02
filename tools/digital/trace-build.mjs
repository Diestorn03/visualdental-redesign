// Trace of the scene build: which thread (page main, worker, GPU process...) is busy in long events (> --min ms) while #digital's scene is built, and the page's frame gaps.
//   MSYS_NO_PATHCONV=1 node tools/digital/trace-build.mjs --port=9416 --url=http://127.0.0.1:4416/ [--cache=cold|warm] [--min=40] [--main]
import { rmSync } from 'node:fs';
import { launch, goto, geom, frames, series, stats, traceStart, traceStop, threadMap, sleep, arg, OUT } from './v/v2-lib.mjs';

const PORT = +arg('port', 9416), CACHE = arg('cache', 'cold'), MIN = +arg('min', 40) * 1000;
const URL = arg('url', 'http://127.0.0.1:4416/') + (arg('main', false) ? '?digital=main' : '');
const dir = OUT + (CACHE === 'cold' ? 'prof-cold-tb' : 'prof-warm');
const c = await launch({ port: PORT, profileDir: dir, fresh: CACHE === 'cold' });
await goto(c, URL, { settle: +arg('idle', 1500) });
const g = await geom(c); const dg = g.secs.find((s) => s.id === 'digital');
await c.ev('__d2.reset(); __d2.rec = true; 1');
await traceStart(c, 'devtools.timeline,gpu,viz,cc,blink.user_timing');
const t0 = await c.ev('performance.now()');
await c.ev(`scrollTo(0, ${dg.top - Math.round(g.vh * 1.2)}); 1`);
if (arg('arrive', false)) { await sleep(400); await c.ev('scrollTo(0, ' + (dg.top - 100) + '); 1'); } // the reader gets to the section before the scene is ready
let ready = false; for (let i = 0; i < 160 && !ready; i++) { await sleep(250); ready = await c.ev(`document.querySelector('#digital')?.dataset.ready === '1'`); }
await sleep(1200);
const ev = await traceStop(c);
await c.ev('__d2.rec = false; 1');
const f = await frames(c); const F = series(f.f).filter((x) => x.t > t0);
console.log(`cache=${CACHE} ready=${ready} frames ${JSON.stringify(stats(F.map((x) => x.dt)))}`);
for (const x of F) if (x.dt > 50) console.log(`  frame ${Math.round(x.dt)} ms at t=+${Math.round(x.t - t0)}`);
const { names, procs } = threadMap(ev);
const xs = ev.filter((e) => e.ph === 'X' && e.dur >= MIN).sort((a, b) => a.ts - b.ts);
const base = xs.length ? xs[0].ts : 0;
console.log(`long events >= ${MIN / 1000} ms (${xs.length}):`);
for (const e of xs.slice(0, 40)) console.log(`  +${((e.ts - base) / 1000).toFixed(0).padStart(5)} ms ${(e.dur / 1000).toFixed(0).padStart(4)} ms  ${(procs.get(e.pid) || e.pid)}/${names.get(e.pid + ':' + e.tid) || e.tid}  ${e.name}`);
await c.close();
if (CACHE === 'cold') { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
