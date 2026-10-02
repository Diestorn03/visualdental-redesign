// d4-13: viewport-edge clamp of the old floating panel: settled panel centre vs pointer for pointer y from the header line to the bottom edge.
// node tools/qa/probes/d4-13-edges.mjs [w] [h] [port]
import { launch, sleep, RECORDER } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `e${W}` });
await b.open('http://127.0.0.1:4404/');
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop + 300, W / 2, H / 2); await sleep(2500);
const lb = await b.evalJs('document.querySelector(".svc__list").getBoundingClientRect().left');
const out = [];
for (const y of [80, 100, 150, 200, Math.round(H * 0.5), Math.round(H * 0.75), H - 120, H - 60, H - 10]) {
  await b.move(W / 2, 20); await sleep(700);
  await b.move(lb + 250, y); await sleep(1700);
  const r = await b.evalJs(`(() => { const p = document.querySelector('.svc__panel').getBoundingClientRect(); const f = document.querySelector('.fab__case').getBoundingClientRect(); const ix = Math.max(0, Math.min(p.right, f.right) - Math.max(p.left, f.left)) * Math.max(0, Math.min(p.bottom, f.bottom) - Math.max(p.top, f.top)); return { top: Math.round(p.top), bottom: Math.round(p.bottom), cy: Math.round((p.top + p.bottom) / 2), op: +getComputedStyle(document.querySelector('.svc__panel')).opacity, fabCoversPct: Math.round(100 * ix / (p.width * p.height)) }; })()`);
  out.push({ pointerY: y, panelTop: r.top, panelBottom: r.bottom, dyCentreMinusPointer: r.cy - y, panelVisible: r.op > 0.9, fabCoversPanelPct: r.fabCoversPct });
}
console.table(out);
await b.close(); process.exit(0);
