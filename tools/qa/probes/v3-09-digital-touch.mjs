// v3-09: #digital with TOUCH (mobile 390x844 and tablet 768x1024): a vertical swipe that starts ON the 3D viewer scrolls the page; no drag handler is bound; static/live per device.
// D5_CDP=9423 D5_URL=http://127.0.0.1:4423/ node tools/qa/probes/v3-09-digital-touch.mjs [mobile|tablet] [force3d]
process.env.D5_CDP ||= '9423';
process.env.D5_URL ||= 'http://127.0.0.1:4423/';
const { launch, touchScroll, waitSettled, sleep } = await import('./d5-lib.mjs');
import { writeFileSync } from 'node:fs';
const device = process.argv[2] || 'mobile', force = process.argv.includes('force3d');
const J = (o) => JSON.stringify(o);
const S = await launch(`v3-touch-${device}${force ? '-3d' : ''}`, { device, url: process.env.D5_URL + (force ? '?digital=3d' : ''), wait: 4000 });
const OUTD = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v3-r2/';
const shot = async (n) => { const r = await S.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUTD + n + '.png', Buffer.from(r.data, 'base64')); };
const R = { device, force };
const jump = async (y) => { await S.eval(`document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, ${Math.round(y)}); 0`); await sleep(600); };
R.env = await S.eval(`({ mode: document.querySelector('#digital').dataset.mode, coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches, lite: document.documentElement.classList.contains('lite'), cls: document.documentElement.className, vw: innerWidth, vh: innerHeight })`);
console.log('ENV', J(R.env));
// go near the section so the (live) scene gets built, then wait for it
const top = await S.eval(`document.querySelector('#digital').getBoundingClientRect().top + scrollY`);
await jump(top - 500);
if (R.env.mode === 'live') { const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await S.eval(`!!(window.__digital && window.__digital.scene)`))) await sleep(500); await sleep(1500); }
const stepY = R.env.mode === 'live' ? await S.eval(`window.__digital.geo.a[2]`) : top + 200;
await jump(stepY); await sleep(1800);
R.layout = await S.eval(`(() => { const c = document.querySelector('.dg__canvas'), r = c.getBoundingClientRect(), st = document.querySelector('.dg__stage'), sr = st.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { canvas: [r.left, r.top, r.width, r.height].map(Math.round), stage: [sr.top, sr.height].map(Math.round), stagePos: getComputedStyle(st).position, canvasTouchAction: getComputedStyle(c).touchAction, canvasCursorInline: c.style.cursor || '(none)', canvasDisplay: getComputedStyle(c).display, canvasOpacity: getComputedStyle(c).opacity, topEl: e.tagName.toLowerCase() + '.' + String(e.className).split(' ')[0], isLive: document.querySelector('#digital').classList.contains('is-live'), hintDisplay: getComputedStyle(document.querySelector('.dg__hint')).display }; })()`);
console.log('LAYOUT', J(R.layout));
await shot(`50-digital-${device}${force ? '-3d' : ''}-before`);
const cam = () => S.eval(`window.__digital && window.__digital.scene ? ['crown','implantTip','implantBody','axisTop','abutment','angle','sleeve','plane'].map((n) => { const p = window.__digital.scene.project(n); return [p.x, p.y, p.visible ? 1 : 0]; }).flat() : null`);
const cdist = (p, q) => { if (!p || !q) return null; let a = 0, n = 0; for (let i = 0; i < p.length; i += 3) if (p[i + 2] && q[i + 2]) { a += Math.hypot(p[i] - q[i], p[i + 1] - q[i + 1]); n++; } return n ? +(a / n).toFixed(2) : null; };
const [cx, cy] = [R.layout.canvas[0] + R.layout.canvas[2] / 2, R.layout.canvas[1] + R.layout.canvas[3] / 2];
const swipe = async (label, x, y, dir) => {
  const y0 = await S.eval('scrollY'); const c0 = await cam();
  const info = await touchScroll(S, { dist: 300, speed: 500, fling: false, dir, x: Math.round(x), y: Math.round(y) });
  await waitSettled(S, { quiet: 300, max: 3000 });
  const y1 = await S.eval('scrollY');
  const o = { label, startedAt: [Math.round(x), Math.round(y)], span: Math.round(info.span), scrollDelta: Math.round(y1 - y0) };
  console.log('SWIPE', J(o)); return o;
};
R.swipes = [];
// finger moves UP by 300 starting on the canvas centre (dir 'down' = page scrolls down)
R.swipes.push(await swipe('vertical swipe starting ON the viewer (finger up)', cx, Math.min(cy + 100, R.env.vh - 40), 'down'));
await jump(stepY); await sleep(900);
R.swipes.push(await swipe('vertical swipe starting ON the viewer (finger down)', cx, cy - 60, 'up'));
await jump(stepY); await sleep(900);
// horizontal swipe on the viewer must neither scroll the page nor rotate anything
const c0 = await cam(); const y0 = await S.eval('scrollY');
const t0 = Date.now(); const ts = (m) => (t0 + m) / 1000;
await S.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(cx - 100), y: Math.round(cy) }], timestamp: ts(0) });
for (let i = 1; i <= 12; i++) { await sleep(16); await S.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: Math.round(cx - 100 + i * 16), y: Math.round(cy) }], timestamp: ts(i * 16) }); }
await S.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: ts(300) }); await sleep(800);
const c1 = await cam();
R.horizontal = { scrollDelta: Math.round((await S.eval('scrollY')) - y0), cameraMovedAnchorPx: cdist(c0, c1) };
console.log('HORIZONTAL', J(R.horizontal));
await shot(`51-digital-${device}${force ? '-3d' : ''}-after`);
// control: same swipe starting on the steps text (outside the viewer)
await jump(stepY); await sleep(900);
const ty = await S.eval(`(() => { const s = document.querySelector('.dg__step.is-on') || document.querySelector('.dg__step'); const r = s.getBoundingClientRect(); return [r.left + r.width / 2, Math.min(innerHeight - 40, r.top + r.height / 2)]; })()`);
R.swipes.push(await swipe('control: swipe starting on the step text', ty[0], ty[1], 'down'));
console.log('errors', J(S.errors.filter((e) => !/Violation|GPU stall|ReadPixels/i.test(e))));
writeFileSync(OUTD + `v3-09-result-${device}${force ? '-3d' : ''}.json`, J(R, null, 1));
S.close(); process.exit(0);
