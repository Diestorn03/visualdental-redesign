// f4r-photo: verifier v3-02 S4 (pointer travels from a low row onto the sticky photo) + focus ring over the caption, on the DEV server.
//   MSYS_NO_PATHCONV=1 SHOTS_DIR="C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f4/" node tools/qa/probes/f4r-photo.mjs [w] [h] [cdpPort] [devPort] [tag]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9414), DEV = +(process.argv[5] || 4414), TAG = process.argv[6] || 'after';
const b = await launch({ port: PORT, w: W, h: H, tag: `f4p-${W}` });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })(); new MutationObserver(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())).observe(document, { childList: true, subtree: true });` });
await b.open(`http://127.0.0.1:${DEV}/`);
for (let i = 0; i < 40 && !(await b.evalJs(`document.documentElement.classList.contains('fx-booted')`).catch(() => false)); i++) await sleep(300);
const q = (js) => b.evalJs(js);
const J = JSON.stringify;
const listTop = await q(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
const listBottom = await q(`document.querySelector('.svc__list').getBoundingClientRect().bottom + scrollY`);
await b.wheelTo(listTop + 1700, 24, H / 2); await sleep(800); await b.wheelTo(listTop - 300, 24, H / 2); await sleep(1200);
const L = await q(`(() => { const l = document.querySelector('.svc__list').getBoundingClientRect(), a = document.querySelector('.svc__lane').getBoundingClientRect(); return { l: l.left, laneL: a.left, laneR: a.right }; })()`);
const rowsVp = () => q(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return [q.top, q.bottom]; })`);
const act = () => q(`(() => { const rs = [...document.querySelectorAll('.svc__row')]; return { act: rs.findIndex((x) => x.classList.contains('is-active')) + 1, cap: document.querySelector('.svc__cap [data-cap-n]').textContent, capT: document.querySelector('.svc__cap [data-cap-t]').textContent.slice(0, 22) }; })()`);
console.log(TAG, `viewport ${W}x${H} lane x ${Math.round(L.laneL)}..${Math.round(L.laneR)}`);

// S4 (v3-02): low row -> horizontally to the photo column -> up to the photo centre
await b.wheelTo(listTop + 300, 24, H / 2); await sleep(1800);
await b.move(20, 30); await sleep(400);
let rows = await rowsVp();
const lowRow = rows.findIndex((r) => (r[0] + r[1]) / 2 > H * 0.62 && (r[0] + r[1]) / 2 < H - 40);
const photo = await q(`(() => { const r = document.querySelector('.svc__panel .svc__frame').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const y0 = (rows[lowRow][0] + rows[lowRow][1]) / 2;
console.log('lowRow', lowRow + 1, 'y', Math.round(y0), 'photo', J({ l: Math.round(photo.l), t: Math.round(photo.t), w: Math.round(photo.w), h: Math.round(photo.h) }));
await b.move(L.l + 250, y0); await sleep(900);
const a0 = await act();
const seq = [a0.act];
for (let i = 1; i <= 8; i++) { await b.move(L.l + 250 + (photo.x - L.l - 250) * (i / 8), y0); await sleep(25); }
await sleep(500); const a1 = await act(); seq.push(a1.act);
for (let i = 1; i <= 12; i++) { await b.move(photo.x, y0 + (photo.y - y0) * (i / 12)); await sleep(25); seq.push((await act()).act); }
await sleep(900); const a2 = await act();
console.log('TOPHOTO', J({ startRow: a0.act, afterHorizontalToLane: a1.act, afterReachingPhotoCentre: a2.act, capNow: a2.cap + ' ' + a2.capT, rowSeq: [...new Set(seq)].join('>'), ok: a0.act === a2.act }));
await b.shot(`r2-${TAG}-pointer-on-photo-${W}`);

// the lane column above / below the photo (still the lane): the photo stays
await b.move(photo.x, Math.max(12, photo.t - 40)); await sleep(30); await b.move(photo.x + 3, Math.max(14, photo.t - 38)); await sleep(700);
const a3 = await act();
console.log('LANE-ABOVE-PHOTO', J({ startRow: a0.act, now: a3.act }));

// from the photo back onto another row's TEXT: it must still select
const other = rows.findIndex((r, k) => k !== a0.act - 1 && (r[0] + r[1]) / 2 > 100 && (r[0] + r[1]) / 2 < H - 60);
const oy = (rows[other][0] + rows[other][1]) / 2;
for (let i = 1; i <= 8; i++) { await b.move(photo.x + (L.l + 250 - photo.x) * (i / 8), (photo.y) + (oy - photo.y) * (i / 8)); await sleep(25); }
await sleep(900);
const a4 = await act();
console.log('BACK-TO-TEXT', J({ target: other + 1, now: a4.act, ok: a4.act === other + 1 }));

// whole row = link: the photo lies over the Education row at the end of the list: a click on the photo must not hit the row link
await b.move(20, 30);
await b.wheelTo(listBottom - H * 0.55, 24, H / 2); await sleep(1500);
const hit = await q(`(() => { const f = document.querySelector('.svc__panel .svc__frame').getBoundingClientRect(); const row6 = document.querySelectorAll('.svc__row')[5].getBoundingClientRect();
  const cx = f.left + f.width / 2, out = [];
  for (let y = Math.max(f.top, row6.top) + 6; y < Math.min(f.bottom, row6.bottom) - 6; y += 12) { const e = document.elementFromPoint(cx, y); out.push((e && e.closest('a') ? 'A' : '.') + '/' + (e ? (e.closest('.svc__row') ? [...document.querySelectorAll('.svc__row')].indexOf(e.closest('.svc__row')) + 1 : 0) : -1)); }
  const t = document.querySelector('.svc__row--link .svc__text').getBoundingClientRect(); const txt = document.elementFromPoint(t.left + 40, t.top + t.height / 2);
  return { photoOverRow6Samples: out.join(' '), textStillALink: !!(txt && txt.closest('a')), cursorOverPhoto: (() => { const e = document.elementFromPoint(cx, Math.max(f.top, row6.top) + 8); return e ? getComputedStyle(e).cursor : null; })() }; })()`);
console.log('LINK-ROW', J(hit));

// keyboard focus ring over the caption (screenshot): focus a row that lies under the photo's caption
await b.wheelTo(listTop + 300, 24, H / 2); await sleep(1500);
await q(`(() => { const rs = [...document.querySelectorAll('.svc__row')]; const cap = document.querySelector('.svc__cap').getBoundingClientRect(); const k = rs.findIndex((r) => { const q = r.getBoundingClientRect(); return q.top < cap.top - 4 && q.bottom > cap.top + 4 || (q.top < cap.bottom && q.bottom > cap.bottom); }); const t = rs[k >= 0 ? k : 2]; t.focus({ focusVisible: true }); return k; })()`);
await sleep(900);
const fr = await q(`(() => { const a = document.activeElement; const r = a.getBoundingClientRect(), c = document.querySelector('.svc__cap').getBoundingClientRect(), f = document.querySelector('.svc__frame').getBoundingClientRect(); return { fv: a.matches(':focus-visible'), row: [...document.querySelectorAll('.svc__row')].indexOf(a) + 1, rowTop: Math.round(r.top), rowBottom: Math.round(r.bottom), capTop: Math.round(c.top), capBottom: Math.round(c.bottom), frameBottom: Math.round(f.bottom), outline: getComputedStyle(a).outlineStyle + ' ' + getComputedStyle(a).outlineWidth }; })()`);
console.log('FOCUS', J(fr));
await b.shot(`r2-${TAG}-focus-row-${W}`);
console.log('errors', b.errors);
await b.close(); process.exit(0);
