// d2-cpuprofile: V8 sampling profile of the main thread while a real wheel scroll crosses a y-range. Self time per function and per top-level
// entry (ticker / scroll listener / IO callbacks), so JS cost can be pinned to engine.js / chrome.js / services.js code.
//   node tools/qa/probes/d2-cpuprofile.mjs --from=15000 --px=1500 [--cpu=1] [--cond=base]
import { launch, goto, playWheel, profiles, sleep, arg, save } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const FROM = +arg('from', 0), PX = +arg('px', 1500), CPU = +arg('cpu', 1), COND = arg('cond', 'base');
const c = await launch({ port: +arg('port', 9402), cpu: CPU, profile: 'cpu', w: +arg('w', 1366), h: +arg('h', 820) });
const cond = CONDS[COND];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
if (FROM > 0) { await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(2500); }
await c.send('Profiler.enable'); await c.send('Profiler.setSamplingInterval', { interval: 100 });
await c.send('Profiler.start');
await c.ev('__d2.reset(); __d2.rec = true; 1');
await playWheel(c, profiles[arg('profile', 'bursts')](PX)); await sleep(1200);
await c.ev('__d2.rec = false; 1');
const { profile } = await c.send('Profiler.stop');
const nodes = new Map(profile.nodes.map((n) => [n.id, n])); const self = new Map();
const dts = profile.timeDeltas; let total = 0;
profile.samples.forEach((id, i) => { const d = dts[i] / 1000; self.set(id, (self.get(id) || 0) + d); total += d; });
const parent = new Map(); profile.nodes.forEach((n) => (n.children || []).forEach((ch) => parent.set(ch, n.id)));
const label = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${(f.url || '').split('/').pop().slice(0, 28)}:${f.lineNumber + 1}:${f.columnNumber + 1}`; };
const byFn = new Map();
for (const [id, ms] of self) { const k = label(nodes.get(id)); byFn.set(k, (byFn.get(k) || 0) + ms); }
console.log('samples total ms', total.toFixed(0));
console.log('SELF top:'); [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, v]) => console.log('  ' + v.toFixed(1).padStart(7) + 'ms ' + k));
// inclusive per root-child (entry points)
const incl = new Map();
for (const [id, ms] of self) { let cur = id; const chain = []; while (cur != null) { chain.push(cur); cur = parent.get(cur); } chain.reverse(); const seen = new Set(); chain.forEach((nid) => { const k = label(nodes.get(nid)); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + ms); } }); }
console.log('INCLUSIVE top (functions whose subtree is heaviest, excluding (root)/(program)):');
[...incl].filter(([k]) => !/^\((root|program|idle)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 24).forEach(([k, v]) => console.log('  ' + v.toFixed(1).padStart(7) + 'ms ' + k));
save(`cpuprofile-${FROM}-${COND}-cpu${CPU}.json`, { total, top: [...byFn].sort((a, b) => b[1] - a[1]).slice(0, 60) });
await c.close();
