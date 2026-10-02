// v1-mobhdr: mobile 390x844. Does the header cover the sticky 3D window (#digital .dg__win / .dg__stage) at any frame, in any scroll situation?
//   node tools/qa/probes/v1-mobhdr.mjs [--base=http://127.0.0.1:4421] [--port=9421] [--w=390 --h=844 --dpr=3]
// Per frame (rAF) during real touch scrolls (down/up, flings and slow drags) inside #digital: header rect (bottom, hidden class), stage top, window top, canvas top.
// "cover" = header.bottom - win.top > 1 while the header is on screen (hidden header has bottom <= 0).
import { launch, engineUrlOf, install, sleep, touchScroll, arg, OUT } from './v1-lib.mjs';
import { writeFileSync } from 'node:fs';

const W = +arg('w', 390), H = +arg('h', 844), DPR = +arg('dpr', 3);
const BASE = arg('base', 'http://127.0.0.1:4421'), PORT = +arg('port', 9421);
const dir = OUT();
const c = await launch({ port: PORT, w: W, h: H, dpr: DPR, mobile: true, profile: `${dir}/profile-${PORT}`, fresh: true });
const eng = await engineUrlOf(BASE);
await install(c, eng);
await c.send('Page.navigate', { url: BASE + '/' });
const ev = (e) => c.ev(e);
for (let i = 0; i < 100; i++) { if (await ev(`document.documentElement.classList.contains('fx-booted')`).catch(() => false)) break; await sleep(150); }
await sleep(2500);

await ev(`(() => {
  const hdr = document.querySelector('[data-header]'), stage = document.querySelector('#digital .dg__stage'), win = document.querySelector('#digital .dg__win'), cv = document.querySelector('#digital canvas');
  window.__mh = { rows: [], on: false };
  const mc = new MessageChannel();
  mc.port1.onmessage = () => { if (!__mh.on) return; const h = hdr.getBoundingClientRect(), s = stage.getBoundingClientRect(), w = win ? win.getBoundingClientRect() : s, k = cv ? cv.getBoundingClientRect() : w;
    __mh.rows.push([performance.now(), scrollY, h.top, h.bottom, hdr.classList.contains('is-hidden') ? 1 : 0, s.top, s.bottom, w.top, w.bottom, k.top, document.querySelector('#digital').classList.contains('is-stuck') ? 1 : 0, innerHeight]); };
  const loop = () => { if (!__mh.on) return; requestAnimationFrame(() => { mc.port2.postMessage(0); loop(); }); };
  __mh.start = () => { __mh.rows = []; __mh.on = true; loop(); }; __mh.stop = () => { __mh.on = false; };
  return 1; })()`);

const geo = await ev(`(() => { const d = document.querySelector('#digital').getBoundingClientRect(); const b = document.querySelector('#digital .dg__body').getBoundingClientRect(); return { top: d.top + scrollY, h: d.height, bodyTop: b.top + scrollY, bodyH: b.height, hdrH: document.querySelector('[data-header]').offsetHeight, mode: document.querySelector('#digital').dataset.mode, sh: document.documentElement.scrollHeight }; })()`);
console.log('geo', JSON.stringify(geo));
const goto = async (y) => { await ev(`(() => { document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, ${Math.round(y)}); return 0; })()`); await sleep(900); };
const res = [];
async function leg(name, y0, moves) {
  await goto(y0); await ev(`__mh.start()`);
  for (const m of moves) { await touchScroll(c, m); await sleep(m.wait ?? 900); }
  await sleep(1200); await ev(`__mh.stop()`);
  const rows = JSON.parse(await ev(`JSON.stringify(__mh.rows)`));
  let worst = 0, worstRow = null, nAny = 0, nCover = 0, nStuck = 0, firstCover = null, lastCover = null;
  for (const r of rows) {
    const [t, ht, , hb, hid, , , wt, wb, , stuck] = r; if (stuck) nStuck++;
    const cov = hb > 1 ? Math.min(hb, wb) - Math.max(0, wt) : 0; /* real overlap of the header band with the window */
    if (cov > 1) nAny++;
    if (cov > 1 && wt >= -1) { nCover++; if (cov > worst) { worst = cov; worstRow = r; } if (firstCover === null) firstCover = t; lastCover = t; }
  }
  const T0 = rows[0]?.[0] ?? 0;
  const out = { name, y0: Math.round(y0), frames: rows.length, stuckFrames: nStuck, coverTitleFrames: nCover, overlapAnyFrames: nAny, worstCoverPx: Math.round(worst), coverMs: firstCover === null ? 0 : Math.round(lastCover - firstCover), firstCoverAt: firstCover === null ? null : Math.round(firstCover - T0), worstRow: worstRow ? worstRow.map((v) => Math.round(v * 10) / 10) : null };
  let tg = 0; for (let i = 1; i < rows.length; i++) if (rows[i][4] !== rows[i - 1][4]) tg++; out.hiddenToggles = tg;
  const sts = rows.filter((r) => r[10]).map((r) => r[5]); out.stageTopRange = sts.length ? [Math.round(Math.min(...sts)), Math.round(Math.max(...sts))] : null;
  const wts = rows.filter((r) => r[10]).map((r) => r[7]); out.winTopRange = wts.length ? [Math.round(Math.min(...wts)), Math.round(Math.max(...wts))] : null;
  res.push(out); console.log(JSON.stringify(out));
  return rows;
}
const a = geo.bodyTop;
await leg('mid down200-up120', a + 1400, [{ dist: 200, speed: 500, fling: false, dir: 'down' }, { dist: 120, speed: 500, fling: false, dir: 'up' }]);
await leg('mid fling-up', a + 2200, [{ dist: 600, speed: 1800, fling: true, dir: 'down' }, { dist: 500, speed: 1800, fling: true, dir: 'up' }]);
await leg('re-enter from below', a + geo.bodyH + 200, [{ dist: 300, speed: 700, fling: false, dir: 'up' }, { dist: 300, speed: 700, fling: false, dir: 'up' }, { dist: 300, speed: 700, fling: false, dir: 'up' }]);
await leg('enter from above', a - 500, [{ dist: 250, speed: 600, fling: false, dir: 'down' }, { dist: 250, speed: 600, fling: false, dir: 'down' }, { dist: 250, speed: 600, fling: false, dir: 'down' }, { dist: 150, speed: 400, fling: false, dir: 'up' }]);
await leg('jiggle', a + 1000, [{ dist: 160, speed: 500, fling: false, dir: 'down', wait: 200 }, { dist: 120, speed: 500, fling: false, dir: 'up', wait: 200 }, { dist: 160, speed: 500, fling: false, dir: 'down', wait: 200 }, { dist: 120, speed: 500, fling: false, dir: 'up', wait: 200 }]);
const shot = async (n) => { const r = await c.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${dir}/${n}.png`, Buffer.from(r.data, 'base64')); };
await goto(a + 1400); await touchScroll(c, { dist: 200, speed: 500, fling: false, dir: 'down' }); await sleep(600); await touchScroll(c, { dist: 120, speed: 500, fling: false, dir: 'up' }); await sleep(1500);
const settled = await ev(`(() => { const h = document.querySelector('[data-header]').getBoundingClientRect(), w = document.querySelector('#digital .dg__win').getBoundingClientRect(), s = document.querySelector('#digital .dg__stage'); return { hdrBottom: Math.round(h.bottom), hdrHidden: document.querySelector('[data-header]').classList.contains('is-hidden'), winTop: Math.round(w.top), winBottom: Math.round(w.bottom), stageTransform: getComputedStyle(s).transform, isStuck: document.querySelector('#digital').classList.contains('is-stuck'), ih: innerHeight }; })()`);
console.log('settled-after-up', JSON.stringify(settled));
await shot('mobhdr-settled-up');
writeFileSync(`${dir}/mobhdr.summary.json`, JSON.stringify({ geo, res, settled, errors: c.errors }, null, 1));
await c.close(); process.exit(0);
