// v2-build: what does the #digital scene build cost on the main thread, task by task? CPU profile (Profiler domain, 250 us) of the window that starts when the
// reader is ~1.2 viewports above #digital (jump + no further scroll, so quiet() can fire) and ends when data-ready=1. Busy segments >= --min ms are listed with their
// top self-time functions; functions in the scene/three chunks are shown with a snippet of the minified source at line:col so they can be mapped back to scene.js.
//   node tools/qa/probes/v2-build.mjs [--cache=warm|cold] [--min=40] [--tag=x]
import { readFileSync, rmSync } from 'node:fs';
import { launch, goto, geom, frames, series, stats, cpuSampler, sleep, arg, save, OUT } from './v2-lib.mjs';

const PORT = +arg('port', 9422), URL = arg('url', 'http://127.0.0.1:4422/'), CACHE = arg('cache', 'warm'), MIN = +arg('min', 40), TAG = arg('tag', `build-${CACHE}`);
const profDir = OUT + (CACHE === 'cold' ? 'prof-cold-build' : 'prof-warm');
const c = await launch({ port: PORT, profileDir: profDir, fresh: CACHE === 'cold' });
await goto(c, URL, { settle: 1500 });
const g = await geom(c); const dg = g.secs.find((s) => s.id === 'digital');
await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 250 });
await c.ev('__d2.reset(); __d2.rec = true; 1');
await c.send('Profiler.start');
const cpu = cpuSampler(); const t0 = Date.now();
await c.ev(`scrollTo(0, ${dg.top - Math.round(g.vh * 1.2)}); 1`);
let ready = false; for (let i = 0; i < 120 && !ready; i++) { await sleep(250); ready = await c.ev(`document.querySelector('#digital')?.dataset.ready === '1'`); }
await sleep(400);
const took = Date.now() - t0;
const { profile } = await c.send('Profiler.stop');
await c.ev('__d2.rec = false; 1');
const f = await frames(c); const F = series(f.f);
console.log(`cache=${CACHE} ready=${ready} after ${took} ms (machine CPU ${cpu()}%) | frames in window: ${JSON.stringify(stats(F.map((x) => x.dt)))} | long tasks: ${f.lt.map((l) => Math.round(l.d)).join(',')}`);

const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const fileCache = {};
const snippet = (url, line, col) => {
  const m = /_astro\/([^?]+)/.exec(url || ''); if (!m) return '';
  try { const txt = (fileCache[m[1]] ||= readFileSync(OUT + 'dist/_astro/' + m[1], 'utf8').split('\n')); const L = txt[line] || ''; return ' «' + L.slice(Math.max(0, col - 10), col + 70).replace(/\s+/g, ' ') + '»'; } catch { return ''; }
};
const label = (n) => { const cf = n.callFrame; return `${cf.functionName || '(anon)'} ${(cf.url || '').split('/').pop().slice(0, 28)}:${cf.lineNumber}:${cf.columnNumber}`; };
const IDLE = new Set(['(idle)', '(program)', '(root)']);
// segments of busy samples
const segs = []; let cur = null, t = 0, idleRun = 0;
for (let i = 0; i < profile.samples.length; i++) {
  const dt = profile.timeDeltas[i] / 1000; t += dt;
  const n = nodes.get(profile.samples[i]); const idle = IDLE.has(n.callFrame.functionName);
  if (!idle) { if (!cur) cur = { t0: t - dt, ms: 0, self: new Map(), gc: 0 }; cur.ms += dt + idleRun; idleRun = 0; cur.t1 = t; const k = label(n); cur.self.set(k, (cur.self.get(k) || 0) + dt); cur.node ||= new Map(); cur.node.set(k, n); }
  else if (cur) { idleRun += dt; if (idleRun > 3) { segs.push(cur); cur = null; idleRun = 0; } }
}
if (cur) segs.push(cur);
const big = segs.filter((s) => s.ms >= MIN);
console.log(`busy segments >= ${MIN} ms: ${big.length} (total busy ${segs.reduce((a, s) => a + s.ms, 0).toFixed(0)} ms in ${segs.length} segments)`);
let n = 0;
for (const s of big) {
  console.log(`\n#${++n} t=${s.t0.toFixed(0)}ms busy=${s.ms.toFixed(0)}ms`);
  for (const [k, v] of [...s.self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)) { const nd = s.node.get(k).callFrame; console.log(`     ${v.toFixed(0).padStart(4)}ms ${k}${/scene|three|BufferGeo|Digital|cbct/.test(nd.url || '') && v > 8 ? snippet(nd.url, nd.lineNumber, nd.columnNumber) : ''}`); }
}
// self time by file
const byFile = new Map(); { let tt = 0; for (let i = 0; i < profile.samples.length; i++) { const dt = profile.timeDeltas[i] / 1000; const nd = nodes.get(profile.samples[i]).callFrame; if (IDLE.has(nd.functionName)) continue; const k = (nd.url || nd.functionName).split('/').pop().slice(0, 40); byFile.set(k, (byFile.get(k) || 0) + dt); tt += dt; } }
console.log('\nself time by file/native:', [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(' | '));
save(`${TAG}.json`, { took, ready, segs: big.map((s) => ({ t0: s.t0, ms: s.ms, top: [...s.self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5) })) });
await c.close();
if (CACHE === 'cold') { try { rmSync(profDir, { recursive: true, force: true }); } catch {} }
