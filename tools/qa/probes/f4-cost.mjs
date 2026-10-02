// f4-cost: main-thread cost of wheel-scrolling through #services (pointer ON vs OFF the list) + frame pacing + long tasks.
//   MSYS_NO_PATHCONV=1 SHOTS_DIR="C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f4/" node tools/qa/probes/f4-cost.mjs [w] [h] [cdpPort] [devPort]
import { launch, sleep, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9414), DEV = +(process.argv[5] || 4414);
const b = await launch({ port: PORT, w: W, h: H, tag: `f4c${W}` });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })(); new MutationObserver(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())).observe(document, { childList: true, subtree: true });` });
await b.open(`http://127.0.0.1:${DEV}/`);
for (let i = 0; i < 30 && !(await b.evalJs(`document.documentElement.classList.contains('fx-booted')`)); i++) await sleep(300);
await b.send('Performance.enable');
const metrics = async () => Object.fromEntries((await b.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop + 1700, W / 2, H / 2); await sleep(1000); await b.wheelTo(listTop - 300, W / 2, H / 2); await sleep(1500);
await b.evalJs(`(() => { window.__f = { on: false, d: [], last: 0, lt: [] }; const t = (n) => { if (__f.on) { if (__f.last) __f.d.push(n - __f.last); __f.last = n; } requestAnimationFrame(t); }; requestAnimationFrame(t);
  new PerformanceObserver((l) => l.getEntries().forEach((e) => __f.on && __f.lt.push(Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); })()`);
async function run(name, px, py, dir) {
  await b.wheelTo(dir > 0 ? listTop - 120 : listTop + 1300, W / 2, H / 2); await sleep(2200);
  await b.move(px, py); await sleep(1200);
  const m0 = await metrics(); const y0 = await b.evalJs('scrollY');
  await b.evalJs('__f.d = []; __f.lt = []; __f.last = 0; __f.on = true');
  await b.burst(px, py, 18, dir * 100, 40); await sleep(1200);
  const f = await b.evalJs('__f.on = false; ({ d: __f.d, lt: __f.lt })');
  const m1 = await metrics(); const y1 = await b.evalJs('scrollY');
  const d = (k) => +(m1[k] - m0[k]).toFixed(4);
  console.log(name.padEnd(26), JSON.stringify({ scrolledPx: Math.round(y1 - y0), LayoutCount: d('LayoutCount'), RecalcStyleCount: d('RecalcStyleCount'), ScriptMs: +(d('ScriptDuration') * 1000).toFixed(1), TaskMs: +(d('TaskDuration') * 1000).toFixed(1), frames: stats(f.d), over25ms: f.d.filter((x) => x > 25).length, longTasks: f.lt }));
}
for (let r = 0; r < (+process.env.REPEAT || 1); r++) {
  await run('ON  list (500,430) down', 500, 430, 1);
  await run('OFF list (20,430)  down', 20, 430, 1);
  await run('ON  list (500,430) up', 500, 430, -1);
  await run('OFF list (20,430)  up', 20, 430, -1);
}
console.log('errors', b.errors);
await b.close(); process.exit(0);
