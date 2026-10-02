// v3-07: does the 3D drag end when the mouse button is released? inside the canvas / outside the canvas / outside the window. Logs pointer events.
// node tools/qa/probes/v3-07-drag-release.mjs [w] [h]
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `dr${W}`, wait: 3500 });
const J = (o) => JSON.stringify(o);
const dmove = (x, y) => b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'mouse' }); // a real drag reports buttons=1 on every move
const dTop = await docTop(b, '#digital');
await b.move(W / 2, H / 2);
await b.wheelTo(dTop - 300, W / 2, H / 2); await sleep(1500);
const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await b.evalJs(`!!(window.__digital && window.__digital.scene) && document.querySelector('#digital').classList.contains('is-live')`))) await sleep(500);
const geo = await b.evalJs(`window.__digital.geo.a`);
await b.wheelTo(geo[5], W / 2, H / 2, { tol: 25 }); await sleep(2800);
await b.evalJs(`(() => { window.__ev = []; const c = document.querySelector('.dg__canvas'); for (const t of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture','pointerleave']) c.addEventListener(t, (e) => window.__ev.push(t + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ' b=' + e.buttons), true);
  for (const t of ['pointerup','pointercancel']) document.addEventListener(t, (e) => window.__ev.push('DOC-' + t + ' target=' + e.target.tagName), true); })()`);
const cam = () => b.evalJs(`window.__digital.scene._dbg.camera.position.toArray().map((v) => +v.toFixed(2))`);
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const box = await b.evalJs(`(() => { const r = document.querySelector('.dg__canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
const cursor = () => b.evalJs(`document.querySelector('.dg__canvas').style.cursor`);
async function trial(name, releaseAt) {
  await b.evalJs('window.__ev.length = 0');
  await b.move(box.cx, box.cy); await sleep(100);
  await b.down(box.cx, box.cy); await sleep(40);
  for (let i = 1; i <= 10; i++) { await dmove(box.cx + i * 25, box.cy + i * 2); await sleep(16); }
  const cDrag = await cursor();
  await b.up(releaseAt[0], releaseAt[1]); await sleep(250);
  const cUp = await cursor();
  await sleep(1800); const q0 = await cam();
  for (let i = 0; i < 10; i++) { await b.move(box.x + 60 + i * 40, box.cy + 30); await sleep(16); } await sleep(250);
  const q1 = await cam();
  const o = { name, cursorWhileDragging: cDrag, cursorAfterRelease: cUp, camMovedByHoverWithoutButton: +dist(q0, q1).toFixed(2), events: await b.evalJs('window.__ev') };
  console.log(J(o)); return o;
}
await trial('release INSIDE canvas (where the drag ended)', [box.cx + 250, box.cy + 20]);
await trial('release inside canvas, elsewhere', [box.cx - 120, box.cy - 60]);
await trial('release OUTSIDE canvas but in page (steps column)', [box.x + box.w + 300, box.cy]);
await trial('release OUTSIDE canvas, above (header band)', [box.cx, 8]);
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
