// d2-paintrects: what repaints while scrolling a range: Paint events (clip rect, duration), frames with paint vs frames total, plus
// CDP paint-rect overlay screenshots (Overlay.setShowPaintRects) to see the repainted regions.
//   node tools/qa/probes/d2-paintrects.mjs --from=17000 --px=900 [--shots=4] [--cond=base]
import { launch, goto, traceStart, traceStop, playWheel, profiles, sleep, arg, threadMap, frames } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
import { writeFileSync } from 'node:fs';
import { OUT } from './d2-lib.mjs';
const FROM = +arg('from', 17000), PX = +arg('px', 900), COND = arg('cond', 'base'), SHOTS = +arg('shots', 0);
const c = await launch({ port: +arg('port', 9402), profile: 'pr', w: +arg('w', 1366), h: +arg('h', 820) });
const cond = CONDS[COND];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(3000);
if (arg('warm')) { await playWheel(c, profiles.steady(PX + 300, 40)); await sleep(1500); await playWheel(c, profiles.steady(-(PX + 300), 40)); await sleep(2000); console.log('warmed, scrollY', await c.ev('scrollY')); }
if (SHOTS) {
  await c.send('Overlay.enable'); await c.send('Overlay.setShowPaintRects', { result: true });
  const p = playWheel(c, profiles.steady(PX, 40));
  for (let i = 0; i < SHOTS; i++) { await sleep(180); const r = await c.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}paintrects-${FROM}-${COND}-${i}.png`, Buffer.from(r.data, 'base64')); }
  await p; await c.send('Overlay.setShowPaintRects', { result: false });
  console.log('saved', SHOTS, 'screenshots to', OUT);
  await c.close(); process.exit(0);
}
await c.ev('__d2.reset(); __d2.rec = true; 1');
await traceStart(c, 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing');
const t0 = await c.ev('performance.now()'); await c.ev(`performance.mark('d2:begin'); 1`);
await playWheel(c, profiles.steady(PX, 40)); await sleep(800);
await c.ev('__d2.rec = false; 1');
const f = await frames(c); const ev = await traceStop(c);
const { names } = threadMap(ev);
const paints = ev.filter((e) => e.name === 'Paint' && e.ph === 'X' && names.get(e.pid + ':' + e.tid) === 'CrRendererMain');
const rect = (cl) => { if (!cl || cl.length < 8) return '?'; const xs = [cl[0], cl[2], cl[4], cl[6]], ys = [cl[1], cl[3], cl[5], cl[7]]; return `${Math.round(Math.min(...xs))},${Math.round(Math.min(...ys))} ${Math.round(Math.max(...xs) - Math.min(...xs))}x${Math.round(Math.max(...ys) - Math.min(...ys))}`; };
const agg = new Map(); for (const p of paints) { const k = rect(p.args?.data?.clip).replace(/^-?\d+,-?\d+ /, ''); const a = agg.get(k) || { n: 0, d: 0 }; a.n++; a.d += p.dur / 1000; agg.set(k, a); }
console.log(`frames(rAF)=${f.f.length / 2} paints=${paints.length} paint total ${(paints.reduce((a, p) => a + p.dur, 0) / 1000).toFixed(0)}ms; by clip size:`);
[...agg].sort((a, b) => b[1].d - a[1].d).slice(0, 10).forEach(([k, v]) => console.log(`  ${k.padEnd(14)} n=${v.n} ${v.d.toFixed(0)}ms`));
const cnt = {}; for (const e of ev) if (['UpdateLayer', 'Layerize', 'PrePaint', 'UpdateLayoutTree', 'Layout', 'CompositeLayers', 'Commit', 'HitTest', 'IntersectionObserverController::computeIntersections', 'PaintImage', 'CullRectUpdate'].includes(e.name) && e.ph === 'X') { const a = cnt[e.name] || (cnt[e.name] = { n: 0, d: 0 }); a.n++; a.d += e.dur / 1000; }
console.log(Object.entries(cnt).map(([k, v]) => `${k}: n=${v.n} ${v.d.toFixed(0)}ms`).join('\n'));
await c.close();
