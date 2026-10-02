// d2-hover: pointer interaction cost and feel in #services (the panel that follows the cursor), with REAL mouse events.
//   node tools/qa/probes/d2-hover.mjs [--cpu=1] [--cond=base]
// Measures: (1) frame cadence + LoAF while the pointer sweeps the list at human speed, (2) panel lag: pointer -> panel centre distance over time
// (how long until the panel settles, steady-state offset in x/y), (3) cost of wheel-scrolling with the pointer resting on the list
// (services.js scroll handler -> elementFromPoint), (4) video start on the "ceramic" row.
import { launch, goto, playWheel, profiles, sleep, arg, frames, frameStats, movePath, mouseMove, traceStart, traceStop, threadMap, selfTimes, exposeEngine } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const CPU = +arg('cpu', 1), COND = arg('cond', 'base');
const c = await launch({ port: +arg('port', 9402), profile: 'hover', cpu: CPU });
const cond = CONDS[COND];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
// bring the list into view with real wheel input, then let reveals finish
const top = await c.ev(`(() => { const r = document.querySelector('.svc__list').getBoundingClientRect(); return Math.round(r.top + scrollY); })()`);
await c.ev(`scrollTo(0, ${top - 420}); 1`); await sleep(3000);
await playWheel(c, profiles.steady(100, 40)); await sleep(1500);
const geo = async () => c.ev(`(() => { const rows = [...document.querySelectorAll('.svc__row')].map((r) => { const b = r.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)]; }); const p = document.querySelector('.svc__panel'); const pb = p.getBoundingClientRect(); const l = document.querySelector('.svc__lane').getBoundingClientRect(); return { rows, panel: [Math.round(pb.left), Math.round(pb.top), Math.round(pb.width), Math.round(pb.height)], op: +getComputedStyle(p).opacity, lane: [Math.round(l.left), Math.round(l.right)], vh: innerHeight }; })()`);
let g = await geo(); console.log('geometry', JSON.stringify(g));
const row = (i) => g.rows[i];
// (1) sweep: pointer enters the first row at its title, then moves down through the six rows at ~700 px/s with small jitter
const path = []; let t = 0;
const y0 = row(0)[1] + 40, x0 = row(0)[0] + 140;
for (let i = 0; i < 140; i++) { t += 16; path.push([t, x0 + 60 * Math.sin(i / 9) + i * 1.2, Math.min(g.vh - 20, y0 + i * 5.5)]); }
await c.ev('__d2.reset(); __d2.rec = true; 1');
await traceStart(c, 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing');
await movePath(c, path); await sleep(1500);
await c.ev('__d2.rec = false; 1');
let f = await frames(c); const ev = await traceStop(c);
console.log('(1) sweep rAF', JSON.stringify(frameStats(f.f)), 'loaf', f.loaf.length, f.loaf.slice(0, 3).map((l) => Math.round(l.d) + 'ms').join(','));
const { names } = threadMap(ev); const main = (e) => names.get(e.pid + ':' + e.tid) === 'CrRendererMain';
const self = selfTimes(ev, main, -Infinity, Infinity);
console.log('    main self top:', [...self].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, d]) => `${n}=${(d / 1000).toFixed(0)}`).join(' '));
// (2) panel lag: put the pointer on row 2 centre, sample panel rect every rAF for 2.5 s; also pointer jump to another row
g = await geo();
const sampleJs = (ms) => `new Promise((res) => { const out = []; const t0 = performance.now(); const p = document.querySelector('.svc__panel'); (function f(t) { const b = p.getBoundingClientRect(); out.push([Math.round(t - t0), Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2), +getComputedStyle(p).opacity]); if (t - t0 < ${ms}) requestAnimationFrame(f); else res(out); })(performance.now()); })`;
await mouseMove(c, 100, 780); await sleep(1200); // park the pointer far away (panel hidden)
const px = row(2)[0] + 200, py = row(2)[1] + 50;
const sp = c.ev(sampleJs(2600));
await sleep(200); await mouseMove(c, px, py);
const s1 = await sp;
const last = s1.at(-1); const settle = s1.find((s, i) => i > 3 && s1.slice(i).every((q) => Math.abs(q[1] - last[1]) < 4 && Math.abs(q[2] - last[2]) < 4));
console.log(`(2) pointer at (${px},${py}) -> panel centre settles at (${last[1]},${last[2]}); offset from pointer dx=${last[1] - px} dy=${last[2] - py}; time to settle (±4px) ${settle ? settle[0] - 200 : '>2400'} ms from pointer arrival; opacity ${last[3]}`);
console.log('    first samples [t,cx,cy,op]:', JSON.stringify(s1.filter((_, i) => i % 6 === 0).slice(0, 16)));
// pointer jumps to row 4: how long until the panel follows
await sleep(500);
const px2 = row(4)[0] + 300, py2 = row(4)[1] + 50;
const sp2 = c.ev(sampleJs(2600)); await sleep(150); await mouseMove(c, px2, py2); const s2 = await sp2; const l2 = s2.at(-1);
const st2 = s2.find((s, i) => i > 3 && s2.slice(i).every((q) => Math.abs(q[1] - l2[1]) < 4 && Math.abs(q[2] - l2[2]) < 4));
console.log(`    jump to row 4 pointer(${px2},${py2}) -> panel (${l2[1]},${l2[2]}) dx=${l2[1] - px2} dy=${l2[2] - py2} settle ${st2 ? st2[0] - 150 : '>2400'} ms`);
// slow drag across the row horizontally: how does x map?
const xs = [];
for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) { const x = g.rows[2][0] + g.rows[2][2] * fx; await mouseMove(c, x, py); await sleep(1700); const b = await c.ev(`(() => { const b = document.querySelector('.svc__panel').getBoundingClientRect(); return [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)]; })()`); xs.push(`ptr x=${Math.round(x)} -> panel cx=${b[0]} (gap ${b[0] - Math.round(x)}), cy=${b[1]} (ptr y ${py})`); }
console.log('    x mapping:', xs.join(' | '));
// (3) wheel scroll with the pointer resting on the list
await mouseMove(c, px, py); await sleep(800);
await c.ev('__d2.reset(); __d2.rec = true; 1');
await traceStart(c, 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing');
await playWheel(c, profiles.bursts(900), { x: px, y: py }); await sleep(1200);
await c.ev('__d2.rec = false; 1'); f = await frames(c); const ev3 = await traceStop(c);
const nF = f.f.length / 2; const hit = ev3.filter((e) => e.name === 'HitTest' && e.ph === 'X' && main(e)); const fc = ev3.filter((e) => e.name === 'FunctionCall' && e.ph === 'X' && main(e) && /services/.test(e.args?.data?.url || ''));
console.log('(3) wheel with pointer on list rAF', JSON.stringify(frameStats(f.f)), 'loaf', f.loaf.length, `HitTest n=${hit.length} ${(hit.reduce((a, e) => a + e.dur, 0) / 1000).toFixed(0)}ms`, `services.js FunctionCall n=${fc.length} ${(fc.reduce((a, e) => a + e.dur, 0) / 1000).toFixed(0)}ms`);
const lf = {}; for (const l of f.loaf) for (const s of l.scripts) { const k = s.u + ':' + s.l + ' ' + s.it; (lf[k] ||= { n: 0, d: 0, fl: 0 }); lf[k].n++; lf[k].d += s.d; lf[k].fl += s.fl; }
console.log('    LoAF scripts:', Object.entries(lf).sort((a, b) => b[1].d - a[1].d).slice(0, 5).map(([k, v]) => `${k} n=${v.n} ${v.d.toFixed(0)}ms forced=${v.fl.toFixed(0)}`).join(' | '));
// (4) ceramic row: video start
const ceramic = 4;
await sleep(500); g = await geo();
await c.ev('__d2.reset(); __d2.rec = true; 1');
await mouseMove(c, g.rows[ceramic][0] + 200, Math.min(g.vh - 30, g.rows[ceramic][1] + 40)); await sleep(1800);
await c.ev('__d2.rec = false; 1'); f = await frames(c);
console.log('(4) hover ceramic row (video) rAF', JSON.stringify(frameStats(f.f)), 'loaf', f.loaf.map((l) => Math.round(l.d) + 'ms').join(','), 'video state', await c.ev(`(() => { const v = document.querySelector('.svc__video'); return v ? JSON.stringify({ paused: v.paused, rs: v.readyState, t: +v.currentTime.toFixed(2) }) : 'none'; })()`));
await c.close();
