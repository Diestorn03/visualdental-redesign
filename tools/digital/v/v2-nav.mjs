// v2-nav: the presenter clicks "Digital" in the header soon after load (Lenis flies ~9000 px) and the scene has not been built yet.
//   node tools/qa/probes/v2-nav.mjs --cache=warm|cold --wait=1500 [--url]   -> frames from the click until 6 s after arrival, spikes with attribution
import { rmSync } from 'node:fs';
import { launch, goto, geom, series, stats, frames, sleep, arg, OUT, visible, secOf } from './v2-lib.mjs';
const PORT = +arg('port', 9422), URL = arg('url', 'http://127.0.0.1:4422/'), CACHE = arg('cache', 'warm'), WAIT = +arg('wait', 1500);
const dir = OUT + (CACHE === 'cold' ? 'prof-cold-nav' : 'prof-warm');
const c = await launch({ port: PORT, profileDir: dir, fresh: CACHE === 'cold' });
await goto(c, URL, { settle: WAIT });
const g = await geom(c);
const r = await c.ev(`(() => { const a = [...document.querySelectorAll('[data-header] a[href$="#digital"]')].find((x) => x.getBoundingClientRect().width > 0); if (!a) return null; const b = a.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2, vis: getComputedStyle(a).visibility, w: b.width }; })()`);
console.log('nav link:', JSON.stringify(r));
await c.ev('__d2.reset(); __d2.rec = true; 1');
const t0 = await c.ev('performance.now()');
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: r.x, y: r.y, button: 'left', clickCount: 1 });
await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: r.x, y: r.y, button: 'left', clickCount: 1 });
let arrived = null; for (let i = 0; i < 200; i++) { await sleep(100); const y = await c.ev('scrollY'); const dg = g.secs.find((s) => s.id === 'digital'); if (Math.abs(y - (dg.top - 100)) < 200 && !arrived) arrived = Date.now(); if (arrived && Date.now() - arrived > 6000) break; }
await c.ev('__d2.rec = false; 1');
const f = await frames(c); const F = series(f.f).filter((x) => x.t > t0);
const dgInfo = await c.ev(`({ ready: document.querySelector('#digital').dataset.ready, live: document.querySelector('#digital').classList.contains('is-live'), poster: !!document.querySelector('#digital picture') , y: scrollY })`);
console.log(`cache=${CACHE} wait=${WAIT}ms | after click: ${JSON.stringify(stats(F.map((x) => x.dt)))} | digital ${JSON.stringify(dgInfo)}`);
for (const x of F) if (x.dt > 50) console.log(`  ${Math.round(x.dt)}ms at t=+${Math.round(x.t - t0)}ms y=${Math.round(x.y)} sec=${secOf(g, x.y)}${visible(g, 'digital', x.y) ? ' [DG visible]' : ''}`);
console.log('  long tasks:', f.lt.filter((l) => l.s > t0).map((l) => Math.round(l.d)).join(','));
await c.close();
if (CACHE === 'cold') { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
