// d4-05b: frame times while the panel wipes (row sweeps, 6 reps) vs idle baseline (same window, pointer parked outside the list).
// node tools/qa/probes/d4-05b-sweep-frames.mjs [w] [h] [port] [reps]
import { launch, sleep, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404), REPS = +(process.argv[5] || 6);
const b = await launch({ port: PORT, w: W, h: H, tag: `q${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(`(() => { let on = false, T = []; const tick = (t) => { if (on) T.push(t); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__q = { start() { T = []; on = true; }, stop() { on = false; return T; } }; })()`);
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2500);
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
const lb = await b.evalJs('document.querySelector(".svc__list").getBoundingClientRect().left');
const X = lb + 250;
const dts = (T) => T.slice(1).map((x, i) => x - T[i]);
const res = { hover: [], idle: [] };
for (let r = 0; r < REPS; r++) {
  // idle baseline (pointer outside the list)
  await b.move(W / 2, 20); await sleep(1200);
  await b.evalJs('__q.start()'); await sleep(1800); res.idle.push(stats(dts(await b.evalJs('__q.stop()'))));
  // hover sweep rows 1->3 then hold
  await b.move(X, rows[0]); await sleep(2200);
  await b.evalJs('__q.start()');
  const n = 14; for (let i = 1; i <= n; i++) { await b.move(X, rows[0] + (Math.min(H - 70, rows[2]) - rows[0]) * (i / n)); await sleep(16); }
  await sleep(1500); res.hover.push(stats(dts(await b.evalJs('__q.stop()'))));
}
for (const k of ['idle', 'hover']) console.log(k.padEnd(6), res[k].map((s) => `p50 ${s.p50} p95 ${s.p95} max ${s.max}`).join(' | '));
await b.close(); process.exit(0);
