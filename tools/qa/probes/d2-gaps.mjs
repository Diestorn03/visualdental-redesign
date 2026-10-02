// d2-gaps: forensic view of the frames that stall during a real-wheel scroll over a y-range.
// For every rAF gap >= --gap ms while the page is scrolling: which thread was busy (main / compositor / GPU / viz / raster+decode workers),
// the longest single events inside the gap and where the compositor pipeline spent the time (PipelineReporter stages).
//   node tools/qa/probes/d2-gaps.mjs --y=0 --px=900 [--from=<scrollTo before>] [--gap=40] [--cpu=1] [--profile=bursts] [--cond=base] [--natural]
import { launch, goto, traceStart, traceStop, playWheel, profiles, sleep, threadMap, selfTimes, frameStats, frames, arg, save, cpuSampler } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const Y = +arg('y', 0), PX = +arg('px', 900), GAP = +arg('gap', 40), CPU = +arg('cpu', 1), PROFILE = arg('profile', 'bursts'), COND = arg('cond', 'base');
const FROM = arg('from', null);
const CATS = 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.frame,benchmark,blink.user_timing,cc,gpu,viz';
const c = await launch({ port: +arg('port', 9402), cpu: CPU, profile: 'gap', w: +arg('w', 1366), h: +arg('h', 820), dpr: +arg('dpr', 1) });
const cond = CONDS[COND];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: +arg('settle', 4000) });
if (!arg('natural') && Y > 0) { await c.ev(`scrollTo(0, ${FROM ?? Math.max(0, Y - 700)}); 1`); await sleep(2500); }
else if (Y > 0) { /* natural: caller starts at 0 */ }
await c.ev('__d2.reset(); __d2.rec = true; 1');
const cpuEnd = cpuSampler();
await traceStart(c, CATS);
const t0 = await c.ev('performance.now()'); await c.ev(`performance.mark('d2:begin'); 1`);
await playWheel(c, profiles[PROFILE](PX));
await sleep(1500);
const sys = cpuEnd();
await c.ev('__d2.rec = false; 1');
const f = await frames(c); const ev = await traceStop(c);
const mk = ev.find((e) => e.name === 'd2:begin'); const off = mk.ts - t0 * 1000;
const { names, procs } = threadMap(ev);
const T = (e) => (procs.get(e.pid) || '') + '|' + (names.get(e.pid + ':' + e.tid) || '');
// async stage intervals
const stack = new Map(), stages = [];
for (const e of ev.filter((x) => (x.ph === 'b' || x.ph === 'e') && ['BeginImplFrameToSendBeginMainFrame', 'SendBeginMainFrameToCommit', 'Commit', 'EndCommitToActivation', 'Activation', 'EndActivateToSubmitCompositorFrame', 'SubmitCompositorFrameToPresentationCompositorFrame', 'SubmitToReceiveCompositorFrame', 'ReceiveCompositorFrameToStartDraw', 'StartDrawToSwapStart', 'SwapStartToSwapEnd', 'SwapEndToPresentationCompositorFrame'].includes(x.name)).sort((a, b) => a.ts - b.ts)) {
  const k = e.pid + '|' + (e.id2?.local ?? e.id) + '|' + e.name;
  if (e.ph === 'b') { (stack.get(k) || stack.set(k, []).get(k)).push(e.ts); } else { const s = stack.get(k)?.pop(); if (s != null) stages.push({ n: e.name, s, e: e.ts }); }
}
const fl = f.f; const gaps = [];
for (let i = 1; i < fl.length / 2; i++) { const dt = fl[i * 2] - fl[(i - 1) * 2]; const mv = Math.abs(fl[Math.min(fl.length / 2 - 1, i + 2) * 2 + 1] - fl[(i - 2 < 0 ? 0 : i - 2) * 2 + 1]); if (dt >= GAP && mv > 0) gaps.push({ a: fl[(i - 1) * 2], b: fl[i * 2], y: fl[i * 2 + 1], dt }); }
console.log(`system CPU ${sys}%  raf ${JSON.stringify(frameStats(fl))}  gaps>=${GAP}ms while moving: ${gaps.length}`);
const out = [];
for (const g of gaps.sort((x, y) => y.dt - x.dt).slice(0, +arg('top', 8))) {
  const w0 = off + g.a * 1000, w1 = off + g.b * 1000;
  const threads = [['main', /Renderer\|CrRendererMain/], ['compositor', /Renderer\|Compositor$/], ['rasterWorkers', /Renderer\|(ThreadPoolForegroundWorker|CompositorTileWorker)/], ['gpuMain', /GPU Process\|CrGpuMain/], ['viz', /GPU Process\|VizCompositorThread/], ['browser', /Browser\|CrBrowserMain/]];
  const lines = [];
  for (const [nm, re] of threads) {
    const st = selfTimes(ev, (e) => re.test(T(e)), w0, w1);
    const real = [...st].filter(([n]) => !/^(RunTask|ThreadControllerImpl|Scheduler::RunTask|Scheduler::Running|ThreadPool_RunTask|ThreadPool_|TaskAnnotator)/.test(n));
    const tot = real.reduce((a, [, d]) => a + d / 1000, 0);
    lines.push(`${nm}=${tot.toFixed(0)}ms [${real.sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, d]) => n.slice(0, 48) + ' ' + (d / 1000).toFixed(0)).join('; ')}]`);
  }
  const big = ev.filter((e) => e.ph === 'X' && e.dur >= 6000 && e.ts + e.dur >= w0 && e.ts <= w1 && !/^(RunTask|ThreadControllerImpl|Scheduler::RunTask|ThreadPool_RunTask|ProxyMain::BeginMainFrame$|WebFrameWidgetImpl::UpdateLifecycle|LocalFrameView::RunPaintLifecyclePhase|Graphics\.Pipeline|TaskAnnotator|ThreadControllerImpl::DoWork|AsyncTask|Scheduler::Running)/.test(e.name)).sort((a, b) => b.dur - a.dur).slice(0, 6).map((e) => `${T(e).replace('Renderer|', 'R:').replace('GPU Process|', 'G:')} ${e.name.slice(0, 60)} ${(e.dur / 1000).toFixed(0)}ms`);
  const sg = {}; for (const s of stages) { const lo = Math.max(s.s, w0), hi = Math.min(s.e, w1); if (hi > lo) sg[s.n] = (sg[s.n] || 0) + (hi - lo) / 1000; }
  // longest *single* pipeline stage interval overlapping the gap (a stage is per frame; summed across overlapping frames inflates, so also report the max single)
  const sgMax = {}; for (const s of stages) { const lo = Math.max(s.s, w0), hi = Math.min(s.e, w1); if (hi > lo) sgMax[s.n] = Math.max(sgMax[s.n] || 0, (hi - lo) / 1000); }
  console.log(`\n-- gap ${g.dt.toFixed(0)}ms at t=${g.a.toFixed(0)} y=${Math.round(g.y)}`);
  lines.forEach((l) => console.log('   ' + l));
  console.log('   big events:', big.join(' | ') || '-');
  console.log('   pipeline stage (max single, ms):', Object.entries(sgMax).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, d]) => n + '=' + d.toFixed(0)).join(' '));
  out.push({ gap: g, lines, big, sgMax });
}
save(`gaps-y${Y}-${COND}-cpu${CPU}.json`, out);
await c.close();
