// d3: Chrome trace of a human-paced wheel traverse, with a per-tick console.timeStamp('y=..') so every trace event can be placed on the page.
// Reports the heaviest events (Decode Image, Raster, Layout, Style, Paint, FunctionCall...) with the scroll position and the 50 ms window cost.
// Usage: node tools/qa/probes/d3-trace.mjs [from=0] [to=full] [dpr=1] [w=1366] [h=820]
import { writeFileSync, readFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d3-lib.mjs';

const FROM = +(process.argv[2] || 0), TO = process.argv[3] && process.argv[3] !== 'full' ? +process.argv[3] : null;
const DPR = +(process.argv[4] || 1), W = +(process.argv[5] || 1366), H = +(process.argv[6] || 820);
const PORT = +(process.env.CDP_PORT || 9403);
const b = await launch({ port: PORT, w: W, h: H, dpr: DPR, url: 'http://127.0.0.1:4403/' });
await sleep(4500);
const total = await b.ev('document.documentElement.scrollHeight - innerHeight');
const end = TO ?? total;
if (FROM > 0) { await b.ev(`window.__lenis.scrollTo(${FROM}, { immediate: true, force: true }); 1`); await sleep(1500); }
await b.ev(`(() => { window.__gsap.ticker.add(() => { console.timeStamp('y=' + Math.round(scrollY)); }); return 1; })()`);

const chunks = [];
let done; const fin = new Promise((r) => (done = r));
b.listeners.push((m) => { if (m.method === 'Tracing.dataCollected') chunks.push(...m.params.value); if (m.method === 'Tracing.tracingComplete') done(); });
await b.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,devtools.timeline.async,v8,blink.user_timing,cc,gpu,viz,disabled-by-default-devtools.timeline.frame', transferMode: 'ReportEvents' });
const rnd = (a, c) => a + Math.floor(Math.random() * (c - a + 1));
let guard = 0;
while (guard++ < 800) {
  const y = await b.ev('scrollY'); if (y >= end - 4 && guard > 3) break;
  const n = rnd(6, 12); for (let i = 0; i < n; i++) { await b.wheel(100); await sleep(rnd(16, 30)); } await sleep(rnd(120, 400));
}
await sleep(1200);
await b.send('Tracing.end'); await fin;
writeFileSync(OUT + `trace-${FROM}-${end}-dpr${DPR}.json`, JSON.stringify(chunks));
console.log('events:', chunks.length);

// map ts -> y via TimeStamp events (main thread). Keep them sorted.
const stamps = chunks.filter((e) => e.name === 'TimeStamp' && e.args?.data?.message?.startsWith('y=')).map((e) => ({ ts: e.ts, y: +e.args.data.message.slice(2) })).sort((a, c) => a.ts - c.ts);
const yAt = (ts) => { let lo = 0, hi = stamps.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (stamps[m].ts <= ts) { r = stamps[m]; lo = m + 1; } else hi = m - 1; } return r?.y ?? null; };
const X = chunks.filter((e) => e.ph === 'X' && e.dur);
const sum = (name) => X.filter((e) => e.name === name).reduce((a, e) => a + e.dur / 1000, 0);
console.log('totals ms:', ['FunctionCall', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'RasterTask', 'GPUTask', 'Decode Image', 'ImageDecodeTask', 'Decode LazyPixelRef', 'ResourceFinish', 'CompositeLayers'].map((n) => `${n}=${sum(n).toFixed(0)}`).join(' '));
const heavy = X.filter((e) => e.dur > 12000 && !['RunTask', 'ThreadControllerImpl::RunTask', 'ThreadControllerImpl::DoWork', 'RunMicrotasks', 'ProxyMain::BeginMainFrame', 'BeginMainThreadFrame'].includes(e.name)).sort((a, c) => c.dur - a.dur).slice(0, 40);
console.log('\nheaviest events (>12ms): ms name thread-ish @y');
for (const e of heavy) console.log(`${(e.dur / 1000).toFixed(0).padStart(4)}ms ${e.name.padEnd(28)} pid=${e.pid} tid=${e.tid} @y=${yAt(e.ts)} ${e.args?.data?.url ? e.args.data.url.split('/').pop() : ''}${e.args?.data?.imageType ? ' ' + e.args.data.imageType : ''}${e.args?.data?.functionName ? ' fn=' + e.args.data.functionName : ''}`);
// decode events by image
const dec = X.filter((e) => /Decode/.test(e.name)).map((e) => ({ ms: e.dur / 1000, name: e.name, y: yAt(e.ts), url: (e.args?.data?.url || '').split('/').pop(), type: e.args?.data?.imageType, pix: e.args?.data?.pixelRefId }));
console.log('\nimage decode events:', dec.length, 'total ms', dec.reduce((a, d) => a + d.ms, 0).toFixed(0));
dec.sort((a, c) => c.ms - a.ms).slice(0, 15).forEach((d) => console.log(`  ${d.ms.toFixed(1)}ms ${d.name} y=${d.y} ${d.url} ${d.type || ''}`));

// ---- hitch anatomy: for every gap > 40 ms between consecutive main-thread ticks, what ran during it (by thread)? ----
const tids = {}; chunks.filter((e) => e.ph === 'M' && e.name === 'thread_name').forEach((e) => { tids[e.pid + ':' + e.tid] = e.args.name; });
const SKIP = new Set(['RunTask', 'ThreadControllerImpl::RunTask', 'ThreadControllerImpl::DoWork', 'RunMicrotasks', 'ProxyMain::BeginMainFrame', 'BeginMainThreadFrame', 'Scheduler::RunTask', 'GpuChannel::ExecuteDeferredRequest', 'CommandBuffer::Flush', 'CommandBufferStub::OnAsyncFlush', 'CommandBufferService:PutChanged', 'RasterDecoderImpl::DoEndRasterCHROMIUM::Flush', 'ThreadPool_RunTask', 'ThreadPool_ChildThreadPool', 'TaskAnnotator::RunTask']);
let hit = 0;
for (let i = 1; i < stamps.length; i++) {
  const gap = (stamps[i].ts - stamps[i - 1].ts) / 1000; if (gap < 40) continue; hit++; if (hit > 14) break;
  const a = stamps[i - 1].ts, c = stamps[i].ts;
  const inside = X.filter((e) => e.ts < c && e.ts + e.dur > a && e.dur > 2500 && !SKIP.has(e.name));
  const by = {}; inside.forEach((e) => { const th = tids[e.pid + ':' + e.tid] || (e.pid + ':' + e.tid); const k = th + ' | ' + e.name; by[k] = Math.max(by[k] || 0, e.dur / 1000); });
  console.log(`\nHITCH ${gap.toFixed(0)}ms at y=${stamps[i - 1].y}->${stamps[i].y}:`);
  Object.entries(by).sort((x, z) => z[1] - x[1]).slice(0, 9).forEach(([k, v]) => console.log(`    ${v.toFixed(0).padStart(4)}ms ${k}`));
}
await b.close();
