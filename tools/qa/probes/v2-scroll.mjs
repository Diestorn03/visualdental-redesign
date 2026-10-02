// v2-scroll: full-page real-wheel pass on the production build (frozen dist on :4422), GPU Chrome. Per-section frame stats, long tasks, spike attribution.
//   node tools/qa/probes/v2-scroll.mjs --profile=bursts|trackpad|steady|flick --dir=down|up|both --cache=warm|cold --reps=2 [--tag=x] [--w --h --dpr] [--url]
// Frames = rAF deltas (what the compositor was fed). "act" = frames while the page is being scrolled (scrollY changes within +-3 frames); "all" includes idle pauses.
// Section = the one under the viewport centre (same rule as d2-scroll). "digital*" = any frame where #digital intersects the viewport.
import { rmSync } from 'node:fs';
import { launch, goto, geom, secOf, visible, stats, series, frames, playWheel, profiles, cpuSampler, sleep, arg, save, OUT } from './v2-lib.mjs';

const PORT = +arg('port', 9422), URL = arg('url', 'http://127.0.0.1:4422/');
const PROFILE = arg('profile', 'bursts'), DIR = arg('dir', 'both'), CACHE = arg('cache', 'warm'), REPS = +arg('reps', 1);
const W = +arg('w', 1366), H = +arg('h', 820), DPR = +arg('dpr', 1);
const TAG = arg('tag', `${PROFILE}-${DIR}-${CACHE}-${W}x${H}${DPR !== 1 ? '@' + DPR : ''}`);
const SETTLE = +arg('settle', 2500);
// reading profile: bursts of --per notches --gap ms apart, then a --pause ms look at the page (profile=bursts + these args, or profile=read = 6 notches / 1800 ms)
const plan = (px) => PROFILE === 'read' ? profiles.bursts(px, { per: +arg('per', 6), gap: +arg('gap', 30), pause: +arg('pause', 1800) }) : PROFILE === 'bursts' ? profiles.bursts(px, { per: +arg('per', 4), gap: +arg('gap', 30), pause: +arg('pause', 600) }) : profiles[PROFILE](px);

function analyse(g, flat, d2, marks) {
  const F = series(flat);
  const ids = g.secs.map((s) => s.id);
  const by = Object.fromEntries([...ids, 'digital*', 'ALL'].map((k) => [k, { act: [], all: [] }]));
  for (const f of F) {
    const k = secOf(g, f.y);
    by[k].all.push(f.dt); if (f.active) by[k].act.push(f.dt);
    by.ALL.all.push(f.dt); if (f.active) by.ALL.act.push(f.dt);
    if (visible(g, 'digital', f.y)) { by['digital*'].all.push(f.dt); if (f.active) by['digital*'].act.push(f.dt); }
  }
  const secStats = Object.fromEntries(Object.entries(by).map(([k, v]) => [k, { act: stats(v.act), all: stats(v.all) }]));
  // spikes > 50 ms with attribution
  const near = (a, b) => (l) => l.s < b && l.s + l.d > a;
  const spikes = F.map((f, i) => ({ ...f, i })).filter((f) => f.dt > 50).map((f) => {
    const a = f.t - f.dt, b = f.t;
    const loafs = d2.loaf.filter(near(a, b)).map((l) => ({ s: Math.round(l.s), d: Math.round(l.d), bd: Math.round(l.bd), render: Math.round(l.s + l.d - l.rs), style: Math.round(l.s + l.d - l.sl), scripts: l.scripts.filter((c) => c.d > 8).map((c) => `${c.u}:${c.f || c.i || ''} ${Math.round(c.d)}ms${c.fl > 4 ? ' (forced layout ' + Math.round(c.fl) + ')' : ''}`) }));
    const prev = F[f.i - 1] || f;
    const mk = marks.filter((m) => m.t >= a - 50 && m.t <= b + 50).map((m) => m.n);
    return { dt: Math.round(f.dt), t: Math.round(f.t), yFrom: Math.round(prev.y), y: Math.round(f.y), sec: secOf(g, prev.y), digitalVisible: visible(g, 'digital', prev.y) || visible(g, 'digital', f.y), loafs, lt: d2.lt.filter(near(a, b)).map((l) => Math.round(l.d)), marks: mk };
  });
  // scene build interval (dg:near .. dg:created) vs spikes
  const near_ = marks.find((m) => m.n === 'dg:near'), created = marks.find((m) => m.n === 'dg:ready') || marks.find((m) => m.n === 'dg:created');
  const dgTop = g.secs.find((s) => s.id === 'digital')?.top ?? 0;
  const arr = F.find((f) => f.y > dgTop - g.vh); // first frame with #digital entering the viewport
  return { arrivalT: arr ? Math.round(arr.t) : null, readyBeforeArrival: !!(created && arr && created.t < arr.t), secStats, spikes, buildWindow: near_ && created ? [Math.round(near_.t), Math.round(created.t)] : null, lt: d2.lt.length, loaf: d2.loaf.length, loafWorst: d2.loaf.map((l) => Math.round(l.d)).sort((a, b) => b - a).slice(0, 6),
    cls: +d2.ls.filter((l) => !l.in).reduce((a, l) => a + l.v, 0).toFixed(4), ltBySec: null };
}

const row = (k, s) => { const a = s.act, l = s.all; if (!a.n && !l.n) return null; const f = (x, key) => (x.n ? String(x[key]).padStart(6) : '     -'); return `${k.padEnd(10)} act n=${String(a.n).padStart(4)} p50=${f(a, 'p50')} p95=${f(a, 'p95')} max=${f(a, 'max')} >25=${String(a.o25 ?? 0).padStart(3)} (${String(a.pct25 ?? 0).padStart(4)}%) >50=${String(a.o50 ?? 0).padStart(2)} | all n=${String(l.n).padStart(4)} p95=${f(l, 'p95')} max=${f(l, 'max')} >25=${String(l.o25 ?? 0).padStart(3)}`; };

const all = [];
for (let r = 0; r < REPS; r++) {
  const profDir = OUT + (CACHE === 'cold' ? `prof-cold-${PORT}` : 'prof-warm');
  const c = await launch({ port: PORT, w: W, h: H, dpr: DPR, profileDir: profDir, fresh: CACHE === 'cold' });
  const cpu = cpuSampler();
  await goto(c, URL, { settle: SETTLE });
  await c.ev('scrollTo(0,0); 1'); await sleep(300);
  const g0 = await geom(c);
  const total = g0.docH - g0.vh;
  const passes = [];
  const run = async (dir) => {
    await c.ev('__d2.reset(); __d2.rec = true; 1');
    const took = await playWheel(c, plan((dir === 'up' ? -1 : 1) * (total + 400) * +arg('mult', 1)));
    await sleep(1800);
    await c.ev('__d2.rec = false; 1');
    const f = await frames(c);
    const g = await geom(c);
    const marks = JSON.parse(await c.ev(`JSON.stringify(performance.getEntriesByType('mark').filter((m) => m.name.startsWith('dg:')).map((m) => ({ n: m.name, t: m.startTime })))`));
    const dgState = await c.ev(`(() => { const d = window.__digital; const sc = d && d.scene; return { mode: document.querySelector('#digital')?.dataset.mode, ready: document.querySelector('#digital')?.dataset.ready, live: document.querySelector('#digital')?.classList.contains('is-live'), info: sc && sc.info ? sc.info() : null }; })()`);
    return { dir, took, g, f, marks, dgState };
  };
  if (DIR === 'down' || DIR === 'both') passes.push(await run('down'));
  if (DIR === 'up' || DIR === 'both') {
    if (DIR === 'up') { await c.ev(`scrollTo(0, ${total}); 1`); await sleep(1500); }
    passes.push(await run('up'));
  }
  const cpuPct = cpu();
  for (const p of passes) {
    const a = analyse(p.g, p.f.f, p.f, p.marks);
    console.log(`\n=== ${TAG} rep ${r + 1}/${REPS} [${p.dir}] input ${(p.took / 1000).toFixed(1)}s docH=${p.g.docH} machineCPU=${cpuPct}% LoAF=${a.loaf} (worst ${a.loafWorst.join(',')}) longtasks=${a.lt} CLS=${a.cls} buildWindow(dg:near..ready)=${JSON.stringify(a.buildWindow)} arrivalT=${a.arrivalT} sceneReadyBeforeArrival=${a.readyBeforeArrival}`);
    console.log(`    digital: ${JSON.stringify(p.dgState)}`);
    for (const k of [...p.g.secs.map((s) => s.id), 'digital*', 'ALL']) { const s = a.secStats[k]; const t = s && row(k, s); if (t) console.log('  ' + t); }
    console.log(`  spikes >50ms: ${a.spikes.length}`);
    for (const s of a.spikes) console.log('   ', JSON.stringify(s));
    all.push({ rep: r + 1, dir: p.dir, cpuPct, ...a, g: p.g, dgState: p.dgState, marks: p.marks, errors: c.errors.slice(0, 10) });
  }
  if (c.errors.length) console.log('  console errors/warnings:', c.errors.slice(0, 8));
  await c.close();
  if (CACHE === 'cold') { try { rmSync(profDir, { recursive: true, force: true }); } catch {} }
}
save(`scroll-${TAG}.json`, all);
console.log('\nsaved', OUT + `scroll-${TAG}.json`);
