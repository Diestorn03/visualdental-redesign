// d5-trace: attribute slow frames to a pipeline stage (main thread vs raster/activation vs GPU/present) during touch drags over a y-range.
// node tools/qa/probes/d5-trace.mjs --device=mobile --from=0 --to=6300 [--mode=normal] [--css="..."] [--eval="js run after load"]
import { launch, touchScroll, traceStart, traceStop, pipelineFrames, pullRec, analyze, sleep, save } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const device = arg('device', 'mobile'), mode = arg('mode', 'normal'), css = arg('css', ''), ev = arg('eval', ''), to = +arg('to', 6300), tag = arg('tag', 'base');
const S = await launch('tr-' + tag, { device, mode, lite: true, noNav: true });
if (css) await S.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(css)}; document.head.append(s); });` });
await S.send('Page.navigate', { url: process.env.D5_URL || 'http://127.0.0.1:4405/' });
await sleep(3500);
if (ev) await S.eval(ev);
await traceStart(S);
const T0 = Date.now();
let g = 0;
while ((await S.eval('scrollY')) < to && g++ < 120) { await touchScroll(S, { dist: 420, speed: 600, fling: false }); await sleep(200); }
await sleep(400);
const events = await traceStop(S);
await pullRec(S);
const a = analyze(S.rec, { from: T0 });
const fr = pipelineFrames(events);
const slow = fr.filter((f) => f.dur > 25);
const agg = {}; for (const f of slow) for (const [k, v] of Object.entries(f.stages)) agg[k] = (agg[k] || 0) + v;
console.log(`[${tag}] drags=${g} rAF frames=${a.frames} dt p95=${a.dt.p95} >25=${a.dt.gt25} >50=${a.dt.gt50} | pipeline frames=${fr.length} slow(>25ms)=${slow.length}`);
const states = {}; fr.forEach((f) => { states[f.state] = (states[f.state] || 0) + 1; }); console.log('  states', JSON.stringify(states));
const total = {}; for (const f of fr) for (const [k, v] of Object.entries(f.stages)) total[k] = (total[k] || 0) + v;
console.log('  avg stage ms (all frames):', Object.entries(total).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim().slice(0, 40)}=${(v / fr.length).toFixed(2)}`).join(' | '));
console.log('  avg stage ms (slow frames):', slow.length ? Object.entries(agg).map(([k, v]) => `${k.replace(/([A-Z])/g, ' $1').trim().slice(0, 40)}=${(v / slow.length).toFixed(2)}`).join(' | ') : '-');
console.log('  slow sample:', JSON.stringify(slow.slice(0, 5).map((f) => ({ dur: +f.dur.toFixed(1), st: f.state, main: f.mainAnim, comp: f.compAnim, miss: f.missing, stages: Object.fromEntries(Object.entries(f.stages).map(([k, v]) => [k.slice(0, 18), +v.toFixed(1)])) }))));
save(`trace-${tag}.json`, { a: { dt: a.dt }, fr: fr.length, slow: slow.length, states, total, agg, slowSample: slow.slice(0, 30) });
S.close();
