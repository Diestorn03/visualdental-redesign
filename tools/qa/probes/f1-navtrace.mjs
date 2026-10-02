// f1-navtrace: Chrome trace of the cold nav jump services -> faq (after an idle so the 3D scene is built). Reports, for the jump window,
// the frames (dt) and the heaviest events per thread (main / compositor / raster / GPU) with the scroll position at that moment.
// node tools/qa/probes/f1-navtrace.mjs [idleMs=15000] [from=services] [to=faq] [tag=trace]
process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f1/nav/';
import { writeFileSync } from 'node:fs';
const d4 = await import('./d4-lib.mjs');
const { sleep, OUT } = d4;
const BASE = process.env.F1_BASE || 'http://127.0.0.1:4411/', PORT = +(process.env.F1_CDP || 9411);
const IDLE = +(process.argv[2] || 15000), FROM = process.argv[3] || 'services', TO = process.argv[4] || 'faq', TAG = process.argv[5] || 'trace';
const W = 1366, H = 820;

// the dev server's HMR client would reload the page when another agent saves a file: stub it
import { VITE_STUB } from './f1-lib.mjs';
async function noHmr(b) {
  b.ws.addEventListener('message', async (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused') return;
    try { await b.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(VITE_STUB).toString('base64') }); } catch {} });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] });
}
const b = await d4.launch({ port: PORT, w: W, h: H, tag: 'nt' });
await noHmr(b);
await b.open(BASE, IDLE);
const ev = [];
b.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Tracing.dataCollected') ev.push(...m.params.value); });
await b.evalJs(`(() => { window.__t = []; const tick = (t) => { window.__t.push([+t.toFixed(1), Math.round(scrollY)]); console.timeStamp('y=' + Math.round(scrollY)); requestAnimationFrame(tick); }; requestAnimationFrame(tick); })()`);
const click = async (id) => {
  const hb = await b.evalJs(`document.querySelector('[data-header]').getBoundingClientRect().bottom`);
  if (hb <= 0) { await b.wheel(W / 2, H / 2, -100); await sleep(900); }
  const n = await b.evalJs(`(() => { const a = document.querySelector('.hdr__nav a[data-nav="${id}"]'); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await b.move(n[0], n[1]); await sleep(250); await b.down(n[0], n[1]); await sleep(30); await b.up(n[0], n[1]);
};
await click(FROM); await sleep(4200);
await sleep(1500);
await b.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,devtools.timeline.async,blink.user_timing,cc,gpu,viz,disabled-by-default-devtools.timeline.frame,toplevel', transferMode: 'ReportEvents' });
const t0 = await b.evalJs('performance.now()');
await click(TO); await sleep(4200);
const done = new Promise((r) => b.ws.addEventListener('message', (e) => { if (JSON.parse(e.data).method === 'Tracing.tracingComplete') r(); }));
await b.send('Tracing.end'); await done;
const T = await b.evalJs('window.__t');
writeFileSync(OUT + TAG + '.json', JSON.stringify(ev));
const names = {}; for (const e of ev) if (e.ph === 'M' && e.name === 'thread_name') names[e.pid + ':' + e.tid] = e.args.name;
const stamps = ev.filter((e) => e.name === 'TimeStamp' && e.args?.data?.message?.startsWith('y=')).map((e) => ({ ts: e.ts, y: +e.args.data.message.slice(2) })).sort((a, c) => a.ts - c.ts);
const yAt = (ts) => { let lo = 0, hi = stamps.length - 1, r = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (stamps[m].ts <= ts) { r = stamps[m]; lo = m + 1; } else hi = m - 1; } return r?.y ?? null; };
// frames of the jump
const win = T.filter((r) => r[0] >= t0), mv = win.filter((r, i) => i && r[1] !== win[i - 1][1]);
const dts = mv.map((r) => r[0] - win[win.indexOf(r) - 1][0]);
console.log('moving frames', mv.length, 'over33', dts.filter((d) => d > 33).length, 'over50', dts.filter((d) => d > 50).length, 'worst', Math.round(Math.max(...dts)));
console.log('slow frames (t rel, dt, y after):', mv.map((r, i) => [Math.round(r[0] - t0), Math.round(dts[i]), r[1]]).filter((r) => r[1] > 33).map((r) => r.join(':')).join('  '));
// steps per frame (px) around the first frames
console.log('step px first 14 frames', mv.slice(0, 14).map((r, i) => Math.abs(r[1] - (win[win.indexOf(r) - 1][1]))).join(' '));
const X = ev.filter((e) => e.ph === 'X' && e.dur >= 6000 && !/^(RunTask|ThreadControllerImpl|ThreadPool|RunMicrotasks)/.test(e.name));
const byThread = {};
for (const e of X) { const th = names[e.pid + ':' + e.tid] || e.pid + ':' + e.tid; (byThread[th] ||= []).push(e); }
for (const [th, es] of Object.entries(byThread)) {
  console.log('\n== ' + th + ' (' + es.length + ' events >= 6 ms)');
  for (const e of es.sort((a, c) => c.dur - a.dur).slice(0, 12)) console.log(`${(e.dur / 1000).toFixed(0).padStart(5)}ms ${e.name.padEnd(30)} y=${yAt(e.ts)} ${(e.args?.data?.url || e.args?.data?.functionName || e.args?.data?.type || '').toString().split('/').pop().slice(0, 50)}`);
}
// totals by name for the window
const tot = {}; for (const e of ev.filter((e) => e.ph === 'X' && e.dur)) { const th = names[e.pid + ':' + e.tid] || '?'; const k = (/Raster|raster/.test(th) ? 'RASTER:' : /Compositor/.test(th) ? 'COMP:' : /GpuMain|Gpu/.test(th) ? 'GPU:' : /Main/.test(th) ? 'MAIN:' : 'OTH:') + e.name; tot[k] = (tot[k] || 0) + e.dur / 1000; }
console.log('\ntotals ms', JSON.stringify(Object.fromEntries(Object.entries(tot).filter(([k, v]) => v > 40 && !/RunTask|ThreadController|DoWork|ThreadPool/.test(k)).sort((a, c) => c[1] - a[1]).slice(0, 30).map(([k, v]) => [k, Math.round(v)]))));
console.log('errors', JSON.stringify(b.errors));
await b.close(); process.exit(0);
