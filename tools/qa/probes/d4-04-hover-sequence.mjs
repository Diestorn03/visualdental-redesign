// d4-04: screenshot sequence of the first hover on a row (pointer jumps from outside to row 2 at x=300) + a second jump to row 4.
// Output: .shots/diag/d4/04-seq-<w>-<n>.jpg + printed timeline (ms since the first pointer event).  node tools/qa/probes/d4-04-hover-sequence.mjs [w] [h] [port]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `s${W}` });
await b.open('http://127.0.0.1:4404/');
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop - 120, W / 2, H / 2);
await sleep(2500);
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return [q.top, q.bottom]; })`);
const lb = await b.evalJs(`(() => { const r = document.querySelector('.svc__list').getBoundingClientRect(); return { l: r.left, w: r.width }; })()`);
await b.move(W / 2, 12); await sleep(800);
async function seq(label, x, y, n = 12) {
  const t0 = await b.evalJs('performance.now()');
  await b.move(x, y);
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = await b.evalJs('performance.now()');
    const r = await b.send('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
    const f = `${OUT}04-${label}-${W}-${String(i).padStart(2, '0')}.jpg`; writeFileSync(f, Buffer.from(r.data, 'base64'));
    out.push({ i, ms: Math.round(t - t0), f });
    await sleep(60);
  }
  console.log(label, JSON.stringify(out.map((o) => [o.i, o.ms])));
}
const y2 = Math.min(H - 80, (rows[1][0] + rows[1][1]) / 2);
await seq('hover-row2', lb.l + 250, y2, 12);
await sleep(1500);
const y4 = Math.min(H - 60, (rows[2][0] + rows[2][1]) / 2);
await seq('hover-row3-from-row2', lb.l + 250, y4, 12);
console.log('errors', b.errors);
await b.close();
process.exit(0);
