// d2-load: load timeline (FCP/LCP/DCL/load/engine boot, main-thread busy per 250 ms bucket, long tasks, LoAF) and the first-scroll-while-the-hero-draws test.
//   node tools/qa/probes/d2-load.mjs --mode=timeline [--cpu=1] [--cache=cold|warm]
//   node tools/qa/probes/d2-load.mjs --mode=firstscroll --delays=300,1000,2000,3500,6000 [--cpu=1]   (wheel 900 px starting `delay` ms after the load event)
import { launch, playWheel, profiles, sleep, arg, frames, frameStats, traceStart, traceStop, threadMap, selfTimes, cpuSampler } from './d2-lib.mjs';
const MODE = arg('mode', 'timeline'), CPU = +arg('cpu', 1), URL = arg('url', 'http://127.0.0.1:4402/');
const LOADREC = `(() => { const L = window.__L = { paint: [], lcp: [], marks: {} };
  const o = (t, f) => { try { new PerformanceObserver((l) => l.getEntries().forEach(f)).observe({ type: t, buffered: true }); } catch (e) {} };
  o('paint', (e) => L.paint.push([e.name, Math.round(e.startTime)])); o('largest-contentful-paint', (e) => L.lcp.push([Math.round(e.startTime), e.element && e.element.tagName + '.' + String(e.element.className).slice(0, 30), e.size]));
  document.addEventListener('DOMContentLoaded', () => { L.marks.dcl = performance.now(); }); addEventListener('load', () => { L.marks.load = performance.now(); });
  document.addEventListener('vd:ready', () => { L.marks.ready = performance.now(); });
  new MutationObserver(() => { if (document.documentElement.classList.contains('fx-booted') && !L.marks.booted) L.marks.booted = performance.now(); }).observe(document.documentElement, { attributes: true });
})();`;
if (MODE === 'timeline') {
  const c = await launch({ port: +arg('port', 9402), profile: 'load', cpu: CPU });
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: LOADREC });
  await c.send('Network.enable');
  if (arg('cache', 'cold') === 'cold') { await c.send('Network.setCacheDisabled', { cacheDisabled: true }); await c.send('Network.clearBrowserCache').catch(() => {}); }
  await traceStart(c, 'devtools.timeline,disabled-by-default-devtools.timeline,loading,blink.user_timing,v8.execute,disabled-by-default-devtools.timeline.frame,benchmark');
  await c.send('Page.navigate', { url: URL });
  await sleep(8000);
  const L = JSON.parse(await c.ev('JSON.stringify(window.__L)'));
  const lo = JSON.parse(await c.ev(`JSON.stringify({ loaf: __d2.loaf.map(l => ({ s: Math.round(l.s), d: Math.round(l.d), bd: Math.round(l.bd), sc: l.scripts.map(x => x.u + ':' + x.l + ' ' + x.it + ' ' + Math.round(x.d) + 'ms fl=' + Math.round(x.fl)) })), lt: __d2.lt.map(l => [Math.round(l.s), Math.round(l.d)]), ls: __d2.ls.map(l => [Math.round(l.s), +l.v.toFixed(4), l.src.join(';').slice(0, 80)]) })`));
  const ev = await traceStop(c);
  const { names, procs } = threadMap(ev); const T = (e) => (procs.get(e.pid) || '') + '|' + (names.get(e.pid + ':' + e.tid) || '');
  const nav = ev.find((e) => e.name === 'navigationStart' && /CrRendererMain/.test(T(e))); const base = nav?.ts ?? 0;
  const runs = ev.filter((e) => e.ph === 'X' && e.name === 'RunTask' && /CrRendererMain/.test(T(e)) && e.ts > base);
  const buckets = new Array(32).fill(0); for (const r of runs) { const b = Math.floor((r.ts - base) / 250000); if (b >= 0 && b < 32) buckets[b] += r.dur / 1000; }
  const comp = {}; for (const [n, d] of selfTimes(ev, (e) => /CrRendererMain/.test(T(e)), base, base + 8e6)) if (!/^(RunTask|ThreadControllerImpl)/.test(n)) comp[n] = d / 1000;
  const fn = {}; for (const e of ev) if (e.name === 'FunctionCall' && e.ph === 'X' && /CrRendererMain/.test(T(e)) && e.ts > base) { const d = e.args?.data || {}; const k = (d.url || '').split('/').pop().slice(0, 36) + ':' + d.lineNumber + ' ' + (d.functionName || ''); fn[k] = (fn[k] || 0) + e.dur / 1000; }
  const evalS = ev.filter((e) => /^(EvaluateScript|v8\.compile|v8\.run|ParseHTML)/.test(e.name) && e.ph === 'X' && e.dur > 20000 && /CrRendererMain/.test(T(e))).map((e) => `${e.name} ${(e.dur / 1000).toFixed(0)}ms ${(e.args?.data?.url || '').split('/').pop()}`);
  console.log('marks(ms since nav):', JSON.stringify(Object.fromEntries(Object.entries(L.marks).map(([k, v]) => [k, Math.round(v)]))), 'paint', JSON.stringify(L.paint), 'LCP', JSON.stringify(L.lcp.at(-1)));
  console.log('main-thread busy per 250ms bucket (ms):', buckets.map((b) => Math.round(b)).join(' '));
  console.log('total busy first 3 s:', Math.round(buckets.slice(0, 12).reduce((a, b) => a + b, 0)), 'ms; 3-8 s:', Math.round(buckets.slice(12).reduce((a, b) => a + b, 0)), 'ms');
  console.log('longtasks', JSON.stringify(lo.lt), 'LoAF count', lo.loaf.length); lo.loaf.sort((a, b) => b.d - a.d).slice(0, 8).forEach((l) => console.log(`  LoAF @${l.s} ${l.d}ms block=${l.bd} ${l.sc.join(' | ').slice(0, 260)}`));
  console.log('CLS shifts', JSON.stringify(lo.ls));
  console.log('self top (first 8 s):', Object.entries(comp).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([n, d]) => `${n}=${d.toFixed(0)}`).join(' '));
  console.log('FunctionCall top:', Object.entries(fn).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, d]) => `${n}=${d.toFixed(0)}`).join(' | '));
  console.log('big script/parse events:', evalS.join(' | '));
  const prs = new Map(); for (const e of ev) if (e.name === 'PipelineReporter' && e.ph === 'b' && e.ts > base && e.ts < base + 8e6) { const k = e.args.frame_reporter.state; prs.set(k, (prs.get(k) || 0) + 1); }
  console.log('pipeline frame states first 8 s:', JSON.stringify(Object.fromEntries(prs)));
  const r250 = []; for (let i = 0; i < 32; i++) { const a = base + i * 250000, b = a + 250000; r250.push(ev.filter((e) => e.name === 'DrawFrame' && e.ts >= a && e.ts < b).length); }
  console.log('DrawFrame per 250ms bucket (15 = 60fps):', r250.join(' '));
  await c.close();
}
if (MODE === 'firstscroll') {
  const delays = arg('delays', '300,1000,2000,3500,6000').split(',').map(Number);
  for (const dly of delays) {
    const c = await launch({ port: +arg('port', 9402), profile: 'fs', cpu: CPU });
    await c.send('Network.enable'); await c.send('Network.setCacheDisabled', { cacheDisabled: true });
    const loaded = new Promise((r) => c.on('Page.loadEventFired', r));
    await c.send('Page.navigate', { url: URL });
    await Promise.race([loaded, sleep(15000)]);
    await sleep(dly);
    await c.ev('__d2.reset(); __d2.rec = true; 1');
    const cpuEnd = cpuSampler();
    await playWheel(c, profiles.bursts(900)); await sleep(1500);
    const sys = cpuEnd(); await c.ev('__d2.rec = false; 1');
    const f = await frames(c); const s = frameStats(f.f);
    const gaps = []; for (let i = 1; i < f.f.length / 2; i++) { const dt = f.f[i * 2] - f.f[(i - 1) * 2]; if (dt >= 30) gaps.push(Math.round(dt) + '@y' + Math.round(f.f[i * 2 + 1])); }
    console.log(`scroll starts ${String(dly).padStart(5)}ms after load: sysCPU=${sys}% n=${s.n} p95=${s.p95} worst=${s.worst} >33ms=${s.over33} missed=${s.missed} loaf=${f.loaf.length} | gaps>=30ms: ${gaps.join(' ') || '-'}`);
    await c.close(); await sleep(800);
  }
}
