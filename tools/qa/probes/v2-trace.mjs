// v2-trace: per-section cost breakdown on the production build. For each section: jump just above it, wait, trace a real-wheel traversal of it and report
//   frame stats (rAF deltas, active frames) + GPU raster (DoEndRasterCHROMIUM sum/max flush) + main-thread Paint / style+layout / script / GC + raster-worker time + image decode.
//   node tools/qa/probes/v2-trace.mjs [--only=services,digital] [--pause=600] [--tag=x]
// The scene of #digital is built BEFORE the traversals (it jumps to the section and waits for data-ready) so the breakdown shows the steady-state cost, not the build.
import { launch, goto, geom, stats, series, frames, playWheel, profiles, traceStart, traceStop, threadMap, selfTimes, cpuSampler, sleep, arg, save, OUT } from './v2-lib.mjs';

const PORT = +arg('port', 9422), URL = arg('url', 'http://127.0.0.1:4422/'), TAG = arg('tag', 'trace');
const ONLY = (arg('only', '') || '').split(',').filter(Boolean);
const PAUSE = +arg('pause', 600);
const CATS = 'devtools.timeline,disabled-by-default-devtools.timeline,gpu,cc,viz';

const c = await launch({ port: PORT, profileDir: OUT + 'prof-warm' });
await goto(c, URL, { settle: 2500 });
const g0 = await geom(c);
const dg = g0.secs.find((s) => s.id === 'digital');
// build the scene first (poster -> live), then come back up
await c.ev(`scrollTo(0, ${dg.top - Math.round(g0.vh * 0.9)}); 1`);
for (let i = 0; i < 80; i++) { if (await c.ev(`document.querySelector('#digital')?.dataset.ready === '1'`)) break; await sleep(500); }
await sleep(2500);
console.log('digital ready:', await c.ev(`document.querySelector('#digital')?.dataset.ready`), 'live:', await c.ev(`document.querySelector('#digital')?.classList.contains('is-live')`));

const out = [];
const fmt = (m) => [...m.entries()].filter(([, v]) => v > 500).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([k, v]) => `${k} ${(v / 1000).toFixed(0)}`).join(', ');
for (const s of g0.secs) {
  if (ONLY.length && !ONLY.includes(s.id)) continue;
  const g = await geom(c);
  const sec = g.secs.find((x) => x.id === s.id);
  const startY = Math.max(0, sec.top - Math.round(g.vh * 0.9)), endY = Math.min(g.docH - g.vh, sec.top + sec.h - Math.round(g.vh * 0.1));
  await c.ev(`scrollTo(0, ${startY}); 1`); await sleep(1800);
  const cpu = cpuSampler();
  await c.ev('__d2.reset(); __d2.rec = true; 1');
  await traceStart(c, CATS);
  // wheel through [startY, endY] in bursts of 4 notches
  let guard = 0;
  while (guard++ < 200) {
    const y = await c.ev('scrollY'); if (y >= endY) break;
    await playWheel(c, profiles.bursts(400, { per: 4, gap: 30, pause: 0 }));
    await sleep(PAUSE);
  }
  await sleep(500);
  const ev = await traceStop(c);
  const cpuPct = cpu();
  await c.ev('__d2.rec = false; 1');
  const f = await frames(c);
  const F = series(f.f).filter((x) => x.y >= startY - 2);
  const act = F.filter((x) => x.active).map((x) => x.dt);

  const { names, procs } = threadMap(ev);
  const tn = (e) => names.get(e.pid + ':' + e.tid) || '';
  const pn = (e) => procs.get(e.pid) || '';
  const X = ev.filter((e) => e.ph === 'X' && e.dur != null);
  let t0 = Infinity, t1 = -Infinity; for (const e of X) { if (e.ts < t0) t0 = e.ts; if (e.ts + e.dur > t1) t1 = e.ts + e.dur; }
  const sum = (pred) => X.filter(pred).reduce((a, e) => a + e.dur / 1000, 0);
  const mainSelf = selfTimes(ev, (e) => tn(e) === 'CrRendererMain', t0, t1);
  const gpuSelf = selfTimes(ev, (e) => /GPU/i.test(pn(e)) && tn(e) === 'CrGpuMain', t0, t1);
  const ms = (k) => (mainSelf.get(k) || 0) / 1000;
  const flush = X.filter((e) => e.name === 'RasterDecoderImpl::DoEndRasterCHROMIUM').map((e) => e.dur / 1000);
  const row = {
    id: s.id, y: [Math.round(startY), Math.round(endY)], cpuPct, frames: stats(act),
    gpuRaster: +flush.reduce((a, b) => a + b, 0).toFixed(0), nFlush: flush.length, maxFlush: +Math.max(0, ...flush).toFixed(0),
    mainPaint: +(ms('Paint') + ms('PrePaint') + ms('Layerize') + ms('Commit')).toFixed(0),
    mainStyleLayout: +(ms('UpdateLayoutTree') + ms('Layout')).toFixed(0),
    mainScript: +(ms('FunctionCall') + ms('EvaluateScript') + ms('v8.run') + ms('TimerFire') + ms('FireAnimationFrame') + ms('v8.callFunction')).toFixed(0),
    mainGC: +(ms('MinorGC') + ms('MajorGC') + ms('V8.GC_MC_BACKGROUND_MARKING')).toFixed(0),
    rasterWorker: +(sum((e) => /TileWorker/.test(tn(e)) && e.name === 'RasterTask') ).toFixed(0),
    imageDecode: +(sum((e) => /TileWorker/.test(tn(e)) && /Decode/i.test(e.name))).toFixed(0),
    mainTop: fmt(mainSelf), gpuTop: fmt(gpuSelf),
    longTasks: f.lt.filter((l) => l.s > f.f[0]).map((l) => Math.round(l.d)), loaf: f.loaf.filter((l) => l.s > f.f[0]).map((l) => Math.round(l.d)),
  };
  out.push(row);
  const fr = row.frames;
  console.log(`\n[${s.id}] y ${row.y[0]}..${row.y[1]} cpu=${cpuPct}% | frames(act) n=${fr.n} p50=${fr.p50} p95=${fr.p95} max=${fr.max} >25=${fr.o25} (${fr.pct25}%) >50=${fr.o50}${row.longTasks.length ? ' longtasks=' + row.longTasks.join(',') : ''}`);
  console.log(`   gpuRaster=${row.gpuRaster}ms (${row.nFlush} flushes, max ${row.maxFlush}) | main: paint=${row.mainPaint} styleLayout=${row.mainStyleLayout} script=${row.mainScript} gc=${row.mainGC} | rasterWorker=${row.rasterWorker} imgDecode=${row.imageDecode}`);
  console.log(`   main top self(ms): ${row.mainTop}`);
  console.log(`   gpu  top self(ms): ${row.gpuTop}`);
}
save(`${TAG}.json`, out);
console.log('\nerrors:', c.errors.slice(0, 4));
await c.close();
