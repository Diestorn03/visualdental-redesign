// d2-invalidation: which style/layout/paint invalidations happen per frame while scrolling a given range (invalidation tracking trace).
//   node tools/qa/probes/d2-invalidation.mjs --y=17600 --px=1200 [--cond=base]
import { launch, goto, traceStart, traceStop, playWheel, profiles, sleep, threadMap, arg, save } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const c = await launch({ port: +arg('port', 9402), cpu: +arg('cpu', 1) });
const cond = CONDS[arg('cond', 'base')];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'));
await c.ev(`scrollTo(0, ${+arg('y', 17600)}); 1`); await sleep(2500);
if (arg('warm')) { await playWheel(c, profiles.steady(+arg('px', 1200) + 300, 40)); await sleep(1500); await playWheel(c, profiles.steady(-(+arg('px', 1200) + 300), 40)); await sleep(2500); }
await c.ev('__d2.reset(); __d2.rec = true; 1');
await traceStart(c, 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,blink.user_timing');
const t0 = await c.ev('performance.now()'); await c.ev(`performance.mark('d2:begin'); 1`);
await playWheel(c, profiles.steady(+arg('px', 1200), 40));
await sleep(800);
await c.ev('__d2.rec = false; 1');
const ev = await traceStop(c);
await c.send('DOM.getDocument', { depth: -1 });
const agg = new Map();
const describe = async (id) => { try { const x = await c.send('DOM.describeNode', { backendNodeId: id }); const a = x.node.attributes || []; const cls = a[a.indexOf('class') + 1] || ''; const ds = a.filter((v, i) => i % 2 === 0 && /^data-(?!astro)/.test(v)).join(','); return x.node.nodeName + '.' + cls.slice(0, 40) + (ds ? '[' + ds + ']' : ''); } catch { return '?'; } };
const cache = new Map();
const counts = {};
for (const e of ev) counts[e.name] = (counts[e.name] || 0) + 1;
console.log('counts', ['ScheduleStyleRecalculation', 'StyleRecalcInvalidationTracking', 'StyleInvalidatorInvalidationTracking', 'LayoutInvalidationTracking', 'UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'UpdateLayer', 'InvalidateLayout', 'ScheduleStyleInvalidationTracking'].map((n) => n + '=' + (counts[n] || 0)).join(' '));
for (const e of ev) {
  if (!/InvalidationTracking|ScheduleStyleRecalculation|^InvalidateLayout$/.test(e.name)) continue;
  const d = e.args?.data || {}; const id = d.nodeId;
  if (id != null && !cache.has(id)) cache.set(id, await describe(id));
  const key = [e.name, d.reason || '', d.invalidationSet || '', d.changedClass || d.changedAttribute || d.changedId || '', d.extraData || '', cache.get(id) || ''].join(' | ');
  agg.set(key, (agg.get(key) || 0) + 1);
}
console.log([...agg].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, v]) => v + '  ' + k).join('\n'));
// UpdateLayoutTree element counts
const ult = ev.filter((e) => e.name === 'UpdateLayoutTree' && e.ph === 'X');
const el = ult.map((e) => e.args?.elementCount ?? 0).sort((a, b) => b - a);
console.log('UpdateLayoutTree n=' + ult.length, 'elementCount max/median/total', el[0], el[Math.floor(el.length / 2)], el.reduce((a, b) => a + b, 0), 'dur ms', (ult.reduce((a, e) => a + e.dur, 0) / 1000).toFixed(0));
await c.close();
