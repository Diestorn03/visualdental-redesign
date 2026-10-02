// v3-22: Digital viewer (Worker scene) at step 6, where the camera stays put: does the drag end on mouse release (inside / outside canvas / over the header band)?
// Does hovering without a button rotate it? (rotation = mean screen displacement of the projected anchors; control = same time with the pointer parked)
// node tools/qa/probes/v3-22-drag-release-worker.mjs
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'dr2', wait: 3500 });
const J = (o) => JSON.stringify(o);
const dmove = (x, y) => b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'mouse' });
const dTop = await docTop(b, '#digital');
await b.move(W / 2, H / 2);
await b.wheelTo(dTop - 300, W / 2, H / 2); await sleep(1500);
const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await b.evalJs(`!!(window.__digital && window.__digital.scene) && document.querySelector('#digital').classList.contains('is-live')`))) await sleep(500);
const geo = await b.evalJs(`window.__digital.geo.a`);
await b.wheelTo(geo[5], W / 2, H / 2, { tol: 25 }); await sleep(3500);
await b.evalJs(`(() => { window.__ev = []; const c = document.querySelector('.dg__canvas'); for (const t of ['pointerdown','pointerup','pointercancel','gotpointercapture','lostpointercapture']) c.addEventListener(t, (e) => window.__ev.push(t + '@' + Math.round(e.clientX) + ',' + Math.round(e.clientY) + ' b=' + e.buttons), true);
  for (const t of ['pointerup','pointercancel']) document.addEventListener(t, (e) => window.__ev.push('DOC-' + t + ' target=' + e.target.tagName), true); })()`);
const cam = () => b.evalJs(`(() => { const s = window.__digital.scene; return ['crown','implantTip','implantBody','axisTop','abutment','angle','sleeve','plane'].map((n) => { const p = s.project(n); return [p.x, p.y, p.visible ? 1 : 0]; }).flat(); })()`);
const dist = (p, q) => { let a = 0, n = 0; for (let i = 0; i < p.length; i += 3) if (p[i + 2] && q[i + 2]) { a += Math.hypot(p[i] - q[i], p[i + 1] - q[i + 1]); n++; } return n ? +(a / n).toFixed(2) : NaN; };
const box = await b.evalJs(`(() => { const r = document.querySelector('.dg__canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);
const cursor = () => b.evalJs(`document.querySelector('.dg__canvas').style.cursor`);
async function trial(name, releaseAt) {
  await b.evalJs('window.__ev.length = 0');
  await b.move(box.cx, box.cy); await sleep(100);
  const a0 = await cam();
  await b.down(box.cx, box.cy); await sleep(40);
  for (let i = 1; i <= 10; i++) { await dmove(box.cx + i * 25, box.cy + i * 2); await sleep(16); }
  const cDrag = await cursor();
  const aDrag = await cam();
  await b.up(releaseAt[0], releaseAt[1]); await sleep(250);
  const cUp = await cursor();
  await sleep(2200); const q0 = await cam();
  await sleep(900); const qIdle = await cam();               // control: nothing moves for 0.9 s
  for (let i = 0; i < 10; i++) { await b.move(box.x + 60 + i * 40, box.cy + 30); await sleep(90); } // hover, no button, 0.9 s
  await sleep(100); const q1 = await cam();
  const o = { name, rotatedByDragPx: dist(a0, aDrag), cursorWhileDragging: cDrag, cursorAfterRelease: cUp, controlIdle0_9s: dist(q0, qIdle), hoverNoButton0_9s: dist(qIdle, q1), events: await b.evalJs('window.__ev') };
  console.log(J(o)); return o;
}
await trial('release INSIDE canvas', [box.cx + 250, box.cy + 20]);
await trial('release inside canvas, elsewhere', [box.cx - 120, box.cy - 60]);
await trial('release OUTSIDE canvas, in page (steps column)', [box.x + box.w + 300, box.cy]);
await trial('release OUTSIDE canvas, above (header band)', [box.cx, 8]);
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
