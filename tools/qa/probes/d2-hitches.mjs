// d2-hitches: continuous real-wheel scroll (top -> bottom [-> top]) with a light main-thread trace; lists every main-thread task that
// blows the frame budget, with the scroll position, the section and the self-time of what it contained; plus dropped frames.
//   node tools/qa/probes/d2-hitches.mjs --profile=bursts --reps=3 [--cpu=1] [--min=14] [--cond=base] [--dir=down|both]
import { launch, goto, traceStart, traceStop, playWheel, profiles, sleep, threadMap, selfTimes, frameStats, frames, arg, save, cpuSampler } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const PROFILE = arg('profile', 'bursts'), REPS = +arg('reps', 3), MIN = +arg('min', 14), CPU = +arg('cpu', 1), COND = arg('cond', 'base'), DIR = arg('dir', 'down');
const CATS = 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,benchmark,blink.user_timing';
const cond = CONDS[COND];
const allHits = [];
for (let r = 0; r < REPS; r++) {
  const c = await launch({ port: +arg('port', 9402), cpu: CPU, profile: 'hit', w: +arg('w', 1366), h: +arg('h', 820), dpr: +arg('dpr', 1) });
  if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
  await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
  const g = await c.ev(`({ vh: innerHeight, docH: document.documentElement.scrollHeight, secs: [...document.querySelectorAll('main > section[id], body > footer')].map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || 'footer', top: Math.round(r.top + scrollY) }; }) })`);
  const secOf = (y) => { const m = y + g.vh / 2; let cur = g.secs[0]; for (const s of g.secs) if (m >= s.top) cur = s; return cur.id; };
  await c.ev('scrollTo(0,0); __d2.reset(); __d2.rec = true; 1'); await sleep(300);
  const cpuEnd = cpuSampler();
  await traceStart(c, CATS);
  const t0 = await c.ev('performance.now()'); await c.ev(`performance.mark('d2:begin'); 1`);
  const total = g.docH - g.vh;
  await playWheel(c, profiles[PROFILE](total + 300));
  if (DIR === 'both') { await sleep(1500); await playWheel(c, profiles[PROFILE](-(total + 300))); }
  await sleep(1500);
  const sys = cpuEnd();
  await c.ev('__d2.rec = false; 1');
  const f = await frames(c); const ev = await traceStop(c);
  const mk = ev.find((e) => e.name === 'd2:begin'); const off = mk.ts - t0 * 1000;
  const { names, procs } = threadMap(ev);
  const T = (e) => (procs.get(e.pid) || '') + '|' + (names.get(e.pid + ':' + e.tid) || '');
  const yAt = (tsUs) => { const tm = (tsUs - off) / 1000; let lo = 0, hi = f.f.length / 2 - 1; while (lo < hi) { const mid = (lo + hi) >> 1; if (f.f[mid * 2] < tm) lo = mid + 1; else hi = mid; } return f.f[lo * 2 + 1]; };
  const runs = ev.filter((e) => e.ph === 'X' && e.name === 'RunTask' && /CrRendererMain/.test(T(e)) && e.dur >= MIN * 1000);
  const hits = runs.map((e) => {
    const kids = selfTimes(ev, (x) => x.tid === e.tid && x.pid === e.pid, e.ts, e.ts + e.dur);
    const top = [...kids].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, d]) => `${n}=${Math.round(d / 1000)}`);
    const y = yAt(e.ts); return { rep: r, ms: +(e.dur / 1000).toFixed(1), y: Math.round(y), sec: secOf(y), top };
  }).sort((a, b) => a.y - b.y);
  const drops = ev.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.args?.frame_reporter?.state === 'STATE_DROPPED').map((e) => Math.round(yAt(e.ts)));
  console.log(`\n##### rep ${r + 1}: system CPU ${sys}% raf ${JSON.stringify(frameStats(f.f))} tasks>=${MIN}ms: ${hits.length}, dropped frames (pipeline): ${drops.length}`);
  for (const h of hits) console.log(`  ${String(h.ms).padStart(6)}ms y=${String(h.y).padStart(6)} ${h.sec.padEnd(9)} ${h.top.join(' ')}`);
  console.log('  dropped @y:', drops.join(','));
  allHits.push(...hits);
  save(`hitches-${PROFILE}-${COND}-cpu${CPU}-rep${r + 1}.json`, { hits, drops, raf: frameStats(f.f) });
  await c.close(); await sleep(1000);
}
// reproducibility: cluster by y (±150 px) across reps
const cl = [];
for (const h of allHits.sort((a, b) => a.y - b.y)) { const k = cl.find((x) => Math.abs(x.y - h.y) <= 150); if (k) { k.reps.add(h.rep); k.ms.push(h.ms); k.tops.push(h.top[0]); } else cl.push({ y: h.y, sec: h.sec, reps: new Set([h.rep]), ms: [h.ms], tops: [h.top[0]] }); }
console.log('\n=== clusters seen in >=2 reps (deterministic hitches) ===');
for (const k of cl.filter((x) => x.reps.size >= 2)) console.log(`  y~${k.y} ${k.sec} reps=${[...k.reps].join('')} max=${Math.max(...k.ms)}ms n=${k.ms.length} ${[...new Set(k.tops)].join(' | ')}`);
