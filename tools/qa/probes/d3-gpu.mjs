// d3: GPU raster cost of a scroll region under CSS variants (injected at document start, nothing on disk changes).
// For each variant: reload, jump above the region, trace a wheel traverse of the region, sum GPU-process raster flushes (RasterDecoderImpl::DoEndRasterCHROMIUM)
// and main-thread Paint/UpdateLayoutTree/FunctionCall, plus ticker frame-time jank. N trials, averaged.
// Usage: node tools/qa/probes/d3-gpu.mjs <y0> <y1> <trials> "name=css" "name2=css2" ...   (name 'base' = no css)
import { launch, sleep, summarize } from './d3-lib.mjs';

const Y0 = +process.argv[2], Y1 = +process.argv[3], TRIALS = +(process.argv[4] || 2);
const specs = process.argv.slice(5).map((s) => { const i = s.indexOf('='); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; });
const PORT = +(process.env.CDP_PORT || 9403);
const injector = (css) => css ? `(() => { const add = () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(css)}; document.head.appendChild(st); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); })();` : undefined;

const out = {};
for (const [name, css] of specs) {
  const T = [];
  for (let k = 0; k < TRIALS; k++) {
    const b = await launch({ port: PORT, early: injector(css), url: 'http://127.0.0.1:4403/' });
    await sleep(4200);
    await b.ev(`(() => { const R = (window.__A = { t: [], y: [] }); window.__gsap.ticker.add(() => { R.t.push(performance.now()); R.y.push(scrollY); console.timeStamp('y=' + Math.round(scrollY)); }); return 1; })()`);
    await b.ev(`window.__lenis.scrollTo(${Math.max(0, Y0 - 500)}, { immediate: true, force: true }); 1`);
    await sleep(1500);
    await b.ev('window.__A.t.length = window.__A.y.length = 0; 1');
    const chunks = []; let done; const fin = new Promise((r) => (done = r));
    b.listeners.push((m) => { if (m.method === 'Tracing.dataCollected') chunks.push(...m.params.value); if (m.method === 'Tracing.tracingComplete') done(); });
    await b.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,gpu,cc,viz', transferMode: 'ReportEvents' });
    let guard = 0;
    while (guard++ < 400) { const y = await b.ev('scrollY'); if (y >= Y1) break; for (let i = 0; i < 8; i++) { await b.wheel(100); await sleep(20 + (i % 3) * 5); } await sleep(150); }
    await sleep(600);
    await b.send('Tracing.end'); await fin;
    const A = await b.ev('window.__A');
    await b.close();
    const X = chunks.filter((e) => e.ph === 'X' && e.dur);
    const sum = (n) => X.filter((e) => e.name === n).reduce((a, e) => a + e.dur / 1000, 0);
    const flush = X.filter((e) => e.name === 'RasterDecoderImpl::DoEndRasterCHROMIUM').map((e) => e.dur / 1000);
    const swap = X.filter((e) => e.name === 'DXGISwapChainImageBacking::Present').map((e) => e.dur / 1000);
    const dt = []; for (let i = 1; i < A.t.length; i++) if (A.y[i] >= Y0 && A.y[i] <= Y1) dt.push(A.t[i] - A.t[i - 1]);
    T.push({ raster: sum('RasterDecoderImpl::DoEndRasterCHROMIUM'), nFlush: flush.length, maxFlush: Math.max(0, ...flush), present: swap.reduce((a, c) => a + c, 0), paint: sum('Paint'), style: sum('UpdateLayoutTree'), fn: sum('FunctionCall'), jank: dt.reduce((a, d) => a + Math.max(0, d - 16.7), 0), max: Math.max(...dt), over25: dt.filter((d) => d > 25).length });
    const t = T.at(-1);
    console.log(`  ${name} #${k + 1}: gpuRaster=${t.raster.toFixed(0)}ms (${t.nFlush} flushes, max ${t.maxFlush.toFixed(0)}) present=${t.present.toFixed(0)} mainPaint=${t.paint.toFixed(0)} style=${t.style.toFixed(0)} js=${t.fn.toFixed(0)} | dt jank=${t.jank.toFixed(0)}ms max=${t.max.toFixed(0)} >25ms=${t.over25}`);
  }
  const avg = (key) => T.reduce((a, t) => a + t[key], 0) / T.length;
  out[name] = { raster: avg('raster'), maxFlush: avg('maxFlush'), present: avg('present'), paint: avg('paint'), style: avg('style'), jank: avg('jank'), max: avg('max'), over25: avg('over25') };
}
console.log(`\n=== y ${Y0}..${Y1}, ${TRIALS} trials (avg) ===`);
for (const [k, v] of Object.entries(out)) console.log(`${k.padEnd(22)} gpuRaster=${v.raster.toFixed(0)}ms maxFlush=${v.maxFlush.toFixed(0)} present=${v.present.toFixed(0)} mainPaint=${v.paint.toFixed(0)} style=${v.style.toFixed(0)} | jank=${v.jank.toFixed(0)}ms maxdt=${v.max.toFixed(0)} >25ms=${v.over25.toFixed(1)}`);
