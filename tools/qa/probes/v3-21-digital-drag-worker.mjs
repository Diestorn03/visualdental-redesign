// v3-21 (v3-06 for the Worker/OffscreenCanvas scene: no camera handle, so rotation is measured as the mean screen displacement (px) of the 8 projected anchors via scene.project()): #digital 3D viewer with a MOUSE: drag rotates, wheel is never captured (also while dragging), no text selection, release outside works.
// node tools/qa/probes/v3-06-digital-drag.mjs [w] [h]
import { start, sleep, stats, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `dg${W}`, wait: 3500 });
const J = (o) => JSON.stringify(o);
const dmove = (x, y) => b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1, pointerType: 'mouse' }); // a real drag reports buttons=1 on every move
const R = {};
await b.evalJs(FRAMES);
const waitScene = async (maxMs = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < maxMs) { const s = await b.evalJs(`!!(window.__digital && window.__digital.scene) && document.querySelector('#digital').classList.contains('is-live')`); if (s) return Date.now() - t0; await sleep(500); } return -1; };
// travel to #digital like a visitor: wheel in steps (this also triggers the "near" build)
const dTop = await docTop(b, '#digital');
await b.move(W / 2, H / 2);
await b.wheelTo(dTop - 300, W / 2, H / 2); await sleep(1500);
R.sceneReadyMs = await waitScene();
console.log('scene ready after (ms)', R.sceneReadyMs, 'mode', await b.evalJs(`document.querySelector('#digital').dataset.mode + ' ' + document.querySelector('#digital').dataset.step`));
const geo = await b.evalJs(`window.__digital.geo.a`);
console.log('geo.a', J(geo.map(Math.round)));
const cam = () => b.evalJs(`(() => { const s = window.__digital.scene; return ['crown','implantTip','implantBody','axisTop','abutment','angle','sleeve','plane'].map((n) => { const p = s.project(n); return [p.x, p.y, p.visible ? 1 : 0]; }).flat().map((v) => +v.toFixed(1)); })()`);
const dist = (p, q) => { let a = 0, n = 0; for (let i = 0; i < p.length; i += 3) if (p[i + 2] && q[i + 2]) { a += Math.hypot(p[i] - q[i], p[i + 1] - q[i + 1]); n++; } return n ? a / n : NaN; };
const canvasBox = () => b.evalJs(`(() => { const r = document.querySelector('.dg__canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; })()`);

async function atStep(k) {
  await b.wheelTo(geo[k], W / 2, H / 2, { tol: 25 }); await sleep(2800);
  return { step: await b.evalJs(`document.querySelector('#digital').dataset.step`), y: await b.evalJs('scrollY') };
}

console.log('scene mode', J(await b.evalJs(`window.__digital.scene.info().mode`)));
for (const k of [5, 2]) {
  const T = {};
  T.at = await atStep(k);
  const c = await canvasBox();
  T.canvas = { w: Math.round(c.w), h: Math.round(c.h), x: Math.round(c.x), y: Math.round(c.y) };
  T.topEl = await b.evalJs(`(() => { const e = document.elementFromPoint(${c.cx}, ${c.cy}); return e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0]; })()`);
  T.cursor = await b.evalJs(`getComputedStyle(document.querySelector('.dg__canvas')).cursor + ' / vp:' + getComputedStyle(document.querySelector('.dg__vp')).cursor + ' / hintOpacity:' + getComputedStyle(document.querySelector('.dg__hint')).opacity + ' / touch-action:' + getComputedStyle(document.querySelector('.dg__canvas')).touchAction + ' / user-select:' + getComputedStyle(document.querySelector('.dg__canvas')).userSelect`);
  await b.shot(`40-digital-step${k + 1}-before-drag`);
  // ---- wheel over the canvas vs elsewhere (page must scroll the same) ----
  const wheelDelta = async (x, y) => { const y0 = await b.evalJs('scrollY'); for (let i = 0; i < 3; i++) { await b.wheel(x, y, 100); await sleep(40); } await sleep(1100); const y1 = await b.evalJs('scrollY'); return Math.round(y1 - y0); };
  await b.move(c.cx, c.cy); await sleep(150);
  T.wheelOverCanvasDeltaPx = await wheelDelta(c.cx, c.cy);
  await b.wheelTo(geo[k], W / 2, H / 2, { tol: 25 }); await sleep(1500);
  T.wheelElsewhereDeltaPx = await wheelDelta(W - 40, H / 2);
  await b.wheelTo(geo[k], W / 2, H / 2, { tol: 25 }); await sleep(2800);
  const c2 = await canvasBox();
  // ---- idle baseline over the same ~0.75 s ----
  { const i0 = await cam(); await sleep(750); T.idleDriftPx_0_75s = +dist(i0, await cam()).toFixed(2); }
  // ---- drag ----
  const p0 = await cam();
  await b.move(c2.cx, c2.cy); await sleep(100);
  await b.down(c2.cx, c2.cy); await sleep(50);
  const xs = []; for (let i = 1; i <= 14; i++) { await dmove(c2.cx + i * 14, c2.cy + i * 3); await sleep(16); }
  await sleep(120);
  const pDrag = await cam();
  T.cursorWhileDragging = await b.evalJs(`document.querySelector('.dg__canvas').style.cursor`);
  // wheel while the button is held
  const yA = await b.evalJs('scrollY'); for (let i = 0; i < 3; i++) { await b.wheel(c2.cx + 200, c2.cy + 40, 100); await sleep(40); } await sleep(1100);
  T.wheelWhileDraggingDeltaPx = Math.round((await b.evalJs('scrollY')) - yA);
  const c3 = await canvasBox();
  // keep dragging after the wheel moved the page: still rotates?
  const pW0 = await cam(); for (let i = 1; i <= 8; i++) { await dmove(c2.cx + 200 + i * 10, c2.cy + 40); await sleep(16); } await sleep(120); const pW1 = await cam();
  T.dragStillRotatesAfterWheel = +dist(pW0, pW1).toFixed(3);
  await b.up(c2.cx + 280, c2.cy + 40); await sleep(150);
  T.selection = await b.evalJs(`getSelection().toString().length`);
  const pUp = await cam();
  await b.shot(`41-digital-step${k + 1}-after-drag`);
  T.cameraMove = { dragDistance: +dist(p0, pDrag).toFixed(3), afterWheelAndMore: +dist(pDrag, pUp).toFixed(3), camBefore: p0, camAfterDrag: pDrag };
  // ---- inertia / drift back ----
  await sleep(3500); const pLate = await cam(); T.cameraAfter3_5s_distFromStart = +dist(p0, pLate).toFixed(3);
  R['step' + (k + 1)] = T; console.log('STEP', k + 1, J(T));
  await b.wheelTo(geo[k], W / 2, H / 2, { tol: 25 }); await sleep(2500);
}

// ---- release OUTSIDE the canvas, then hover over it without the button: must not rotate ----
{
  const c = await canvasBox();
  await b.move(c.cx, c.cy); await b.down(c.cx, c.cy); await sleep(40);
  for (let i = 1; i <= 10; i++) { await dmove(c.cx + i * 40, c.cy); await sleep(16); }
  await b.up(c.x + c.w + 330, c.cy); await sleep(300);
  const q0 = await cam(); await sleep(1500); const q1 = await cam();
  for (let i = 0; i < 12; i++) { await b.move(c.x + 40 + i * 30, c.cy + 20); await sleep(16); } await sleep(300);
  const q2 = await cam();
  R.releaseOutside = { settledDrift: +dist(q0, q1).toFixed(3), movedWithoutButtonDist: +dist(q1, q2).toFixed(3), selection: await b.evalJs(`getSelection().toString().length`), cursor: await b.evalJs(`document.querySelector('.dg__canvas').style.cursor`) };
  console.log('RELEASE OUTSIDE', J(R.releaseOutside));
}
// ---- keyboard / text selection by dragging across the steps column (should still select text normally outside the canvas) ----
console.log('errors', J(b.errors));
writeFileSync(OUT + `v3-06-result-${W}.json`, J(R, null, 1));
await b.close(); process.exit(0);
