// v2-idle: load the page and do NOT touch it for N s (presenter introduces the site): when does the scene build land and what does it cost the hero?
//   node tools/qa/probes/v2-idle.mjs --cache=cold|warm --secs=14
import { rmSync } from 'node:fs';
import { launch, goto, series, stats, frames, sleep, arg, OUT } from './v2-lib.mjs';
const PORT = +arg('port', 9422), URL = arg('url', 'http://127.0.0.1:4422/'), CACHE = arg('cache', 'cold'), SECS = +arg('secs', 14);
const dir = OUT + (CACHE === 'cold' ? 'prof-cold-idle' : 'prof-warm');
const c = await launch({ port: PORT, profileDir: dir, fresh: CACHE === 'cold' });
await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__d2 && (window.__d2.rec = true)` });
await goto(c, URL, { settle: 200 }); await c.ev('__d2.reset(); __d2.rec = true; 1');
await sleep(SECS * 1000); await c.ev('__d2.rec = false; 1');
const f = await frames(c); const F = series(f.f);
const marks = JSON.parse(await c.ev(`JSON.stringify(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dg:')).map((m) => [m.name, Math.round(m.startTime)]))`));
console.log(`cache=${CACHE} idle ${SECS}s | frames ${JSON.stringify(stats(F.map((x) => x.dt)))} | marks ${JSON.stringify(marks)} | ready=${await c.ev(`document.querySelector('#digital').dataset.ready`)}`);
for (const x of F) if (x.dt > 50) console.log(`  ${Math.round(x.dt)}ms at t=${Math.round(x.t)}ms`);
await c.close(); if (CACHE === 'cold') { try { rmSync(dir, { recursive: true, force: true }); } catch {} }
