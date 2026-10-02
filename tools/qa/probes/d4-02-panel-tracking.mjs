// d4-02: Services panel vs pointer. E1 static x sweep (where does the panel settle relative to the pointer?), E2 sweep rows 1->3 (lag over time),
// E3 enter from outside, E4 leave. Real Input.dispatchMouseEvent mouseMoved at ~60 Hz.
// node tools/qa/probes/d4-02-panel-tracking.mjs [w] [h] [port]
import { launch, sleep, RECORDER, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `t${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(RECORDER);
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
// put the list top ~120 px below the viewport top so rows 1-3 are in view
await b.wheelTo(listTop - 120, W / 2, H / 2);
await sleep(2500); // let the row reveals finish
const rowsVp = () => b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return { t: q.top, b: q.bottom, c: (q.top + q.bottom) / 2 }; })`);
const listBox = await b.evalJs(`(() => { const r = document.querySelector('.svc__list').getBoundingClientRect(); const l = document.querySelector('.svc__lane').getBoundingClientRect(); return { l: r.left, w: r.width, laneL: l.left, laneR: l.right }; })()`);
let rows = await rowsVp();
console.log('scrollY', await b.evalJs('scrollY'), 'listBox', JSON.stringify(listBox));
console.log('rows (viewport)', rows.map((r) => `${r.t.toFixed(0)}..${r.b.toFixed(0)}`).join(' | '));

// helper: smooth human move from a to b in `ms` (60 Hz), returns nothing
async function glide(a, c, ms = 300) {
  const n = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) { const t = i / n, e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; await b.move(a.x + (c.x - a.x) * e, a.y + (c.y - a.y) * e); await sleep(16); }
}
const center = (s) => ({ x: s.px + s.pw / 2, y: s.py + s.ph / 2 });

// park the pointer outside the list (above the section head) and wait for any panel to hide
await b.move(W / 2, 20); await sleep(800);

// ---------- E1: static pointer, panel settled position vs pointer, for x across the list ----------
const e1 = [];
const y1 = (rows[1].t + rows[1].b) / 2; // row 02 center
for (const f of [0.04, 0.2, 0.4, 0.6, 0.8, 0.96]) {
  const x = listBox.l + listBox.w * f;
  await b.move(W / 2, 20); await sleep(900); // reset: panel hidden
  await b.evalJs('__rec.start()');
  await glide({ x: W / 2, y: 20 }, { x, y: y1 }, 350);
  await sleep(1600);
  const { samples } = await b.evalJs('__rec.stop()');
  const s = samples.at(-1), c = center(s);
  e1.push({ xFrac: f, ptr: [Math.round(x), Math.round(y1)], panelCenter: [Math.round(c.x), Math.round(c.y)], dx: Math.round(c.x - x), dy: Math.round(c.y - y1), dist: Math.round(Math.hypot(c.x - x, c.y - y1)), pointerInsidePanel: x >= s.px && x <= s.px + s.pw && y1 >= s.py && y1 <= s.py + s.ph, opacity: s.po });
}
console.log('E1 settled panel vs pointer (px)'); console.table(e1);

// ---------- E2: sweep from row 1 (x=300) to row 3 (x=700), 350 ms; per-frame distance ----------
rows = await rowsVp();
await b.move(W / 2, 20); await sleep(900);
const A = { x: listBox.l + 180, y: (rows[0].t + rows[0].b) / 2 }, B = { x: listBox.l + 640, y: Math.min(H - 60, (rows[2].t + rows[2].b) / 2) };
await glide({ x: W / 2, y: 20 }, A, 300); await sleep(1500); // sit on row 1, panel settled
await b.evalJs('__rec.start()');
const tStart = await b.evalJs('performance.now()');
await glide(A, B, 350);
await sleep(2200);
const rec2 = await b.evalJs('__rec.stop()');
const tStop = rec2.pe.at(-1).t, tFirst = rec2.pe[0].t;
const dist = rec2.samples.map((s) => { const c = center(s); return { t: s.t - tStop, d: Math.hypot(c.x - s.ptrx, c.y - s.ptry), dx: c.x - s.ptrx, dy: c.y - s.ptry, act: s.act, y: s.py }; });
const moving = dist.filter((o) => o.t >= tFirst - tStop && o.t <= 0);
const maxDy = moving.reduce((m, o) => (Math.abs(o.dy) > Math.abs(m.dy) ? o : m), moving[0]);
const settleY = (th) => { const last = [...dist].reverse().find((o) => Math.abs(o.dy) > th); return last ? Math.round(last.t) : 0; }; // ms after the last pointer event
console.log('E2 sweep A->B', JSON.stringify({ A, B, pointerEvents: rec2.pe.length, sweepMs: Math.round(tStop - tFirst), maxAbsDyWhileMoving: Math.round(maxDy.dy), maxDyAt_msBeforeStop: Math.round(maxDy.t), finalDx: Math.round(dist.at(-1).dx), finalDy: Math.round(dist.at(-1).dy), msAfterStopUntil_dyWithin: { '100px': settleY(100), '50px': settleY(50), '20px': settleY(20), '5px': settleY(5), '1px': settleY(1) } }));
console.log('E2 row active sequence', [...new Set(dist.map((o) => o.act))].join('>'));
writeSeries('E2', dist);

// ---------- E3: leave the list ----------
await b.evalJs('__rec.start()');
await glide(B, { x: W / 2, y: 20 }, 250);
await sleep(900);
const rec3 = await b.evalJs('__rec.stop()');
const op = rec3.samples.map((s) => s.po);
console.log('E3 leave list: opacity trace (every 4th frame)', op.filter((_, i) => i % 4 === 0).join(' '));
console.log('errors', b.errors);
await b.close();
process.exit(0);

async function writeSeries(name, rows) { (await import('node:fs')).writeFileSync(`${(await import('./d4-lib.mjs')).OUT}d4-02-${name}-${W}.json`, JSON.stringify(rows)); }
