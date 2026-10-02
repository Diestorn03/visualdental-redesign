// d2-scroll: real wheel scroll through the page on GPU Chrome; per-section frame stats (rAF deltas, LoAF, long tasks, CLS),
// optional CDP trace with cost breakdown per section and A/B conditions injected through CDP (no file is touched).
//   node tools/qa/probes/d2-scroll.mjs --mode=free  --profile=bursts|steady|trackpad|flick [--reps=3] [--cond=base] [--w --h --dpr --cpu]
//   node tools/qa/probes/d2-scroll.mjs --mode=trace --profile=bursts [--only=services,process] [--cond=noblur]
//   --dir=up   scrolls down to the bottom first, then back up with the same profile (measures the way up)
import { launch, goto, frames, frameStats, playWheel, profiles, sleep, save, arg, traceStart, traceStop, threadMap, selfTimes, cpuSampler } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';

const PORT = +arg('port', 9402), URL = arg('url', 'http://127.0.0.1:4402/');
const MODE = arg('mode', 'free'), PROFILE = arg('profile', 'bursts'), COND = arg('cond', 'base'), REPS = +arg('reps', 1), DIR = arg('dir', 'down');
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const TAG = arg('tag', `${MODE}-${PROFILE}-${COND}-${arg('w', 1366)}x${arg('h', 820)}${+arg('dpr', 1) !== 1 ? '@' + arg('dpr') : ''}${+arg('cpu', 1) > 1 ? '-cpu' + arg('cpu') : ''}`);

const cond = CONDS[COND]; if (!cond) throw new Error('unknown cond ' + COND);
const c = await launch({ port: PORT, w: +arg('w', 1366), h: +arg('h', 820), dpr: +arg('dpr', 1), cpu: +arg('cpu', 1), profile: 'prof' });
if (cond.pre) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: cond.pre });
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.id='d2-cond';s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });

const geom = async () => c.ev(`(() => ({ vh: innerHeight, secs: [...document.querySelectorAll('main > section[id], body > footer')].map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || 'footer', top: Math.round(r.top + scrollY), h: Math.round(r.height) }; }), docH: document.documentElement.scrollHeight }))()`);
const secOf = (g, y) => { const m = y + g.vh / 2; let cur = g.secs[0]; for (const s of g.secs) if (m >= s.top) cur = s; return cur.id; };

function sectionStats(g, f, loafs, lts, lss) {
  const by = {};
  // split frames by section using scrollY at each frame; stats per consecutive groups
  const groups = {};
  for (let i = 0; i < f.length; i += 2) { const id = secOf(g, f[i + 1]); (groups[id] ||= []).push(f[i], f[i + 1]); }
  for (const id of Object.keys(groups)) {
    const fl = groups[id];
    // frames of one section are contiguous in time while scrolling in a single direction; stats ignore gaps >250 ms (pauses between bursts add no jank: nothing scheduled)
    const st = frameStatsActive(fl);
    const t0 = fl[0], t1 = fl[fl.length - 2];
    by[id] = { ...st, loaf: loafs.filter((l) => l.s >= t0 - 1 && l.s <= t1).length, loafMax: Math.round(Math.max(0, ...loafs.filter((l) => l.s >= t0 - 1 && l.s <= t1).map((l) => l.d))), lt: lts.filter((l) => l.s >= t0 && l.s <= t1).length, cls: +lss.filter((l) => l.s >= t0 && l.s <= t1 && !l.in).reduce((a, l) => a + l.v, 0).toFixed(4), t0, t1 };
  }
  return by;
}
// rAF deltas while the page is actually moving: drop the intervals where scrollY did not change for the whole of a >120 ms gap (idle rAFs are not janky, they are idle)
function frameStatsActive(flat) { return frameStats(flat); }

async function freeRun() {
  const g0 = await geom();
  await c.ev('__d2.reset(); __d2.rec = true; 1');
  const total = g0.docH - g0.vh;
  const plan = profiles[PROFILE](total + 400);
  const took = await playWheel(c, plan);
  await sleep(1800);
  await c.ev('__d2.rec = false; 1');
  const f = await frames(c);
  const g = await geom();
  const by = sectionStats(g, f.f, f.loaf, f.lt, f.ls);
  let all = frameStats(f.f);
  let up = null;
  if (DIR === 'up' || DIR === 'both') {
    await c.ev('__d2.reset(); __d2.rec = true; 1');
    await playWheel(c, profiles[PROFILE](-(total + 400)));
    await sleep(1800); await c.ev('__d2.rec = false; 1');
    const fu = await frames(c);
    up = { all: frameStats(fu.f), by: sectionStats(g, fu.f, fu.loaf, fu.lt, fu.ls), loaf: fu.loaf };
  }
  return { took, total, all, by, g, f, up };
}

const row = (id, s) => `${id.padEnd(10)} n=${String(s.n).padStart(4)} fps=${String(s.fps).padStart(5)} p50=${String(s.p50).padStart(5)} p95=${String(s.p95).padStart(5)} p99=${String(s.p99).padStart(5)} worst=${String(s.worst).padStart(6)} >21ms=${String(s.pct17).padStart(5)}% >33ms=${String(s.pct33).padStart(5)}% (${s.over33}) missed=${String(s.missed).padStart(3)} loaf=${s.loaf ?? '-'} loafMax=${s.loafMax ?? '-'} lt=${s.lt ?? '-'} cls=${s.cls ?? '-'}`;

if (MODE === 'free') {
  const results = [];
  for (let r = 0; r < REPS; r++) {
    await goto(c, URL, { settle: 4000 });
    await c.ev('scrollTo(0,0); 1'); await sleep(400);
    const res = await freeRun();
    results.push(res);
    console.log(`--- ${TAG} rep ${r + 1}/${REPS}: ${res.took.toFixed(0)}ms input, total ${JSON.stringify(res.all)}`);
    for (const s of res.g.secs) if (res.by[s.id]) console.log('  ' + row(s.id, res.by[s.id]));
    if (res.up) { console.log('  [up] ' + JSON.stringify(res.up.all)); for (const s of res.g.secs.slice().reverse()) if (res.up.by[s.id]) console.log('  up ' + row(s.id, res.up.by[s.id])); }
    // LoAF top scripts
    const agg = {};
    for (const l of res.f.loaf) for (const sc of l.scripts) { const k = `${sc.u}:${sc.l} ${sc.it}:${(sc.i || '').slice(0, 40)} ${sc.f}`; const a = (agg[k] ||= { n: 0, d: 0, fl: 0, max: 0 }); a.n++; a.d += sc.d; a.fl += sc.fl; a.max = Math.max(a.max, sc.d); }
    console.log('  LoAF scripts (top by total ms):', Object.entries(agg).sort((a, b) => b[1].d - a[1].d).slice(0, 8).map(([k, a]) => `${k} n=${a.n} total=${a.d.toFixed(0)} max=${a.max.toFixed(0)} forcedLayout=${a.fl.toFixed(0)}`).join('\n    '));
    console.log('  LoAF count', res.f.loaf.length, 'worst', res.f.loaf.map((l) => Math.round(l.d)).sort((a, b) => b - a).slice(0, 8).join(','), ' longtasks', res.f.lt.length, ' CLS shifts', JSON.stringify(res.f.ls.filter((l) => !l.in).slice(0, 6)));
    // worst frames with position
    const fr = res.f.f; const worst = [];
    for (let i = 2; i < fr.length; i += 2) worst.push([fr[i] - fr[i - 2], fr[i + 1], fr[i], secOf(res.g, fr[i + 1])]);
    worst.sort((a, b) => b[0] - a[0]);
    console.log('  worst frames [ms, scrollY, t, section]:', worst.slice(0, 10).map((w) => `${w[0].toFixed(0)}ms@${Math.round(w[1])}(${w[3]})`).join('  '));
  }
  save(`${TAG}.json`, results.map((r) => ({ all: r.all, by: r.by, up: r.up && { all: r.up.all, by: r.up.by }, loaf: r.f.loaf, lt: r.f.lt, ls: r.f.ls, frames: r.f.f })));
}

if (MODE === 'trace') {
  await goto(c, URL, { settle: 4000 });
  const g = await geom();
  const list = g.secs.filter((s) => !ONLY.length || ONLY.includes(s.id));
  const out = [];
  for (const s of list) {
    // position just before the section enters (not a user simulation: only the starting point), let reveals/decodes of the jump finish
    const from = Math.max(0, s.top - Math.round(g.vh * 0.9));
    await c.ev(`scrollTo(0, ${from}); 1`); await sleep(2500);
    await c.ev('__d2.reset(); __d2.rec = true; 1');
    const cpuEnd = cpuSampler();
    await traceStart(c);
    const t0 = await c.ev(`performance.now()`); await c.ev(`performance.mark('d2:begin'); 1`);
    const dist = Math.min(g.docH - g.vh - from, s.h + Math.round(g.vh * 0.9)); // until the section has fully left (or the page ends)
    await playWheel(c, profiles[PROFILE](dist));
    await sleep(1500);
    const sysCpu = cpuEnd();
    await c.ev('__d2.rec = false; 1');
    const f = await frames(c);
    const ev = await traceStop(c);
    const markEv = ev.find((e) => e.name === 'd2:begin'); const off = markEv.ts - t0 * 1000; // trace µs = perf.now ms*1000 + off
    const fs = frameStats(f.f);
    const { names, procs } = threadMap(ev);
    const T = (e) => (procs.get(e.pid) || '') + '|' + (names.get(e.pid + ':' + e.tid) || '');
    const tA = markEv.ts, tB = off + f.now * 1000;
    // trace window = first moving frame .. last moving frame
    const mv = []; for (let i = 2; i < f.f.length; i += 2) if (f.f[i + 1] !== f.f[i - 1]) mv.push(f.f[i]);
    const w0 = mv.length ? off + mv[0] * 1000 : tA, w1 = mv.length ? off + mv[mv.length - 1] * 1000 : tB;
    const dur = (w1 - w0) / 1000;
    const bucket = (n) => /^(FunctionCall|EvaluateScript|v8\.run|v8\.compile|v8\.callFunction|RunMicrotasks|EventDispatch|TimerFire|FireAnimationFrame|FireIdleCallback|XHRReadyStateChange|V8\.|MinorGC|MajorGC|BlinkGC|V8\.GC|ParseHTML|HitTest)/.test(n) ? 'script' : /^(UpdateLayoutTree|Blink\.Style|RecalculateStyles|Document::updateStyle|Document::updateActiveStyle)/.test(n) ? 'style' : /^(Layout|LocalFrameView::performLayout|Blink\.Layout)/.test(n) ? 'layout' : /^(PrePaint|Paint|UpdateLayer|Layerize|CompositeLayers|PaintLayer|Blink\.Paint)/.test(n) ? 'paint' : /^(Commit|ProxyMain::BeginMainFrame::commit|UpdateLayoutTree)/.test(n) ? 'commit' : /(Intersection)/.test(n) ? 'io' : 'other';
    const main = selfTimes(ev, (e) => /CrRendererMain/.test(T(e)), w0, w1);
    const buckets = {}; let mainBusy = 0;
    for (const [n, d] of main) { if (n === 'RunTask' || n === 'ThreadControllerImpl::RunTask' || n === 'ThreadControllerImpl::DoWork') { continue; } const b = bucket(n); buckets[b] = (buckets[b] || 0) + d / 1000; mainBusy += d / 1000; }
    const top = (m, k = 12) => [...m].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, d]) => `${n}=${(d / 1000).toFixed(0)}`).join(' ');
    const runs = ev.filter((e) => e.ph === 'X' && e.name === 'RunTask' && /CrRendererMain/.test(T(e)) && e.ts >= w0 && e.ts <= w1);
    const busyRun = runs.reduce((a, e) => a + e.dur / 1000, 0);
    const longTasks = runs.filter((e) => e.dur > 20000).sort((a, b) => b.dur - a.dur).slice(0, 5).map((e) => {
      const kids = selfTimes(ev, (x) => x.tid === e.tid && x.pid === e.pid, e.ts, e.ts + e.dur);
      return Math.round(e.dur / 1000) + 'ms [' + [...kids].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n, d]) => n + '=' + Math.round(d / 1000)).join(' ') + ']';
    });
    const paintBy = new Map();
    for (const e of ev) if (e.name === 'Paint' && e.ph === 'X' && e.ts >= w0 && e.ts <= w1 && /CrRendererMain/.test(T(e))) { const k = e.args?.data?.nodeId; const a = paintBy.get(k) || { d: 0, n: 0, clip: null }; a.d += e.dur / 1000; a.n++; a.clip = e.args?.data?.clip; paintBy.set(k, a); }
    await c.send('DOM.getDocument', { depth: -1 });
    const paintTop = [];
    for (const [k, a] of [...paintBy].sort((x, y) => y[1].d - x[1].d).slice(0, 5)) { let d = '?'; try { const x = await c.send('DOM.describeNode', { backendNodeId: +k }); d = x?.node ? x.node.nodeName + ' ' + (x.node.attributes || []).join(' ').slice(0, 70) : '?'; } catch {} paintTop.push(a.d.toFixed(0) + 'ms n=' + a.n + ' ' + d); }
    const comp = selfTimes(ev, (e) => /Renderer\|Compositor$/.test(T(e)), w0, w1);
    const rast = selfTimes(ev, (e) => /ThreadPoolForegroundWorker|CompositorTileWorker/.test(T(e)) && /Renderer/.test(T(e)), w0, w1);
    const gpuMain = selfTimes(ev, (e) => /GPU Process\|CrGpuMain/.test(T(e)), w0, w1);
    const viz = selfTimes(ev, (e) => /GPU Process\|VizCompositorThread/.test(T(e)), w0, w1);
    const sumOf = (m, re) => [...m].filter(([n]) => re.test(n)).reduce((a, [, d]) => a + d / 1000, 0);
    // frames from the compositor: DrawFrame instants and PipelineReporter states
    const draws = ev.filter((e) => e.name === 'DrawFrame' && e.ts >= w0 && e.ts <= w1).map((e) => e.ts).sort((a, b) => a - b);
    const dd = []; for (let i = 1; i < draws.length; i++) dd.push((draws[i] - draws[i - 1]) / 1000);
    const dsorted = [...dd].sort((a, b) => a - b);
    const prs = new Map();
    for (const e of ev) if (e.name === 'PipelineReporter' && e.ph === 'b' && e.ts >= w0 && e.ts <= w1) { const k = e.args.frame_reporter.state + (e.args.frame_reporter.has_missing_content ? '+missing' : '') + (e.args.frame_reporter.checkerboarded_needs_raster ? '+cbRaster' : ''); prs.set(k, (prs.get(k) || 0) + 1); }
    const decode = sumOf(rast, /Decode|ImageDecode/);
    const rasterT = sumOf(rast, /^RasterTask|RasterizerTaskImpl|GpuRasterBuffer::Playback/);
    const mvIdx = f.f.filter((_, i) => i % 2 === 0);
    const result = {
      id: s.id, from, dist, windowMs: Math.round(dur), raf: fs,
      draw: { n: draws.length, p50: +(dsorted[Math.floor(dd.length * 0.5)] || 0).toFixed(1), p95: +(dsorted[Math.floor(dd.length * 0.95)] || 0).toFixed(1), worst: +(dsorted.at(-1) || 0).toFixed(1), over25: dd.filter((d) => d > 25).length, over40: dd.filter((d) => d > 40).length },
      pipeline: Object.fromEntries(prs),
      sysCpu, busyRun: +busyRun.toFixed(0), busyRunPct: +(100 * busyRun / dur).toFixed(0), longTasks, paintTop,
      mainBuckets: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, +v.toFixed(0)])), mainBusyMs: +mainBusy.toFixed(0), mainBusyPct: +(100 * mainBusy / dur).toFixed(0),
      compositorMs: +[...comp].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).reduce((a, [, d]) => a + d / 1000, 0).toFixed(0),
      rasterMs: +rasterT.toFixed(0), decodeMs: +decode.toFixed(0),
      gpuMainMs: +[...gpuMain].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).reduce((a, [, d]) => a + d / 1000, 0).toFixed(0), vizMs: +[...viz].filter(([n]) => !/^(RunTask|ThreadControllerImpl)/.test(n)).reduce((a, [, d]) => a + d / 1000, 0).toFixed(0),
      topMain: top(main), topRaster: top(rast, 6), topGpu: top(gpuMain, 6), topViz: top(viz, 6), topComp: top(comp, 6),
      loaf: f.loaf.length, lt: f.lt.length, cls: +f.ls.filter((l) => !l.in).reduce((a, l) => a + l.v, 0).toFixed(4),
      loafTop: f.loaf.map((l) => ({ d: Math.round(l.d), bd: Math.round(l.bd), styleLayout: Math.round(l.rs ? l.s + l.d - l.sl : 0), scripts: l.scripts.map((x) => `${x.u}:${x.l} ${x.it}:${(x.i || '').slice(0, 30)} ${Math.round(x.d)}ms fl=${Math.round(x.fl)}`) })).sort((a, b) => b.d - a.d).slice(0, 4),
    };
    out.push(result);
    console.log(`\n=== ${s.id} (window ${result.windowMs}ms, dist ${dist}px) rAF ${JSON.stringify(fs)}`);
    console.log(`  compositor draws n=${result.draw.n} p50=${result.draw.p50} p95=${result.draw.p95} worst=${result.draw.worst} >25ms=${result.draw.over25} >40ms=${result.draw.over40}  pipeline=${JSON.stringify(result.pipeline)}`);
    console.log(`  system CPU ${sysCpu}% | main RunTask busy ${result.busyRun}ms (${result.busyRunPct}% of window) | long tasks: ${longTasks.join(' | ') || '-'}`); console.log('  paint by node:', paintTop.join(' || '));
    console.log(`  main self ${result.mainBusyMs}ms (${result.mainBusyPct}% of window) ${JSON.stringify(result.mainBuckets)} | compositor ${result.compositorMs}ms raster ${result.rasterMs}ms decode ${result.decodeMs}ms gpuMain ${result.gpuMainMs}ms viz ${result.vizMs}ms`);
    console.log('  topMain:', result.topMain); console.log('  topRaster:', result.topRaster, '| topGpu:', result.topGpu, '| topViz:', result.topViz);
    console.log(`  loaf ${result.loaf} lt ${result.lt} cls ${result.cls}`); result.loafTop.slice(0, 2).forEach((l) => console.log('   loaf', l.d + 'ms', 'block', l.bd, l.scripts.join(' || ').slice(0, 300)));
    // JS attribution from trace FunctionCall
    const fn = {}; for (const e of ev) if (e.name === 'FunctionCall' && e.ph === 'X' && e.ts >= w0 && e.ts <= w1 && /CrRendererMain/.test(T(e))) { const d = e.args?.data || {}; const k = `${(d.url || '').split('/').pop().slice(0, 40)}:${d.lineNumber}:${d.columnNumber} ${d.functionName || ''}`; (fn[k] ||= { n: 0, d: 0 }); fn[k].n++; fn[k].d += e.dur / 1000; }
    console.log('  FunctionCall (incl. children):', Object.entries(fn).sort((a, b) => b[1].d - a[1].d).slice(0, 5).map(([k, v]) => `${k} n=${v.n} ${v.d.toFixed(0)}ms`).join(' | '));
    // paint by node
    if (arg('trace-save')) save(`trace-${TAG}-${s.id}.json`, ev.filter((e) => e.ts >= w0 - 2e5 && e.ts <= w1 + 2e5));
  }
  save(`${TAG}.json`, out);
}
await c.close();
