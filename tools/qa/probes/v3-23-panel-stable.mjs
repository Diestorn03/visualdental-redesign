// v3-23 (r2): Services panel is stable across all 6 photos/captions and viewports; pointer on the photo never changes the row (all rows); click on the photo does not navigate.
// node tools/qa/probes/v3-23-panel-stable.mjs [w] [h]
import { start, sleep, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `ps${W}` });
await b.evalJs(FRAMES);
await b.evalJs(`window.__fr.add('p', () => { const P = document.querySelector('.svc__panel'), r = P.getBoundingClientRect(), c = P.querySelector('.svc__cap').getBoundingClientRect(), f = P.querySelector('.svc__frame').getBoundingClientRect();
  return { y: scrollY, pt: +r.top.toFixed(2), pl: +r.left.toFixed(2), pw: +r.width.toFixed(2), ph: +r.height.toFixed(2), ct: +c.top.toFixed(2), ch: +c.height.toFixed(2), ft: +f.top.toFixed(2), fh: +f.height.toFixed(2), act: [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active')), cap: P.querySelector('[data-cap-n]').textContent + ' ' + P.querySelector('[data-cap-t]').textContent }; })`);
const J = (o) => JSON.stringify(o);
const R = {};
const listTop = await docTop(b, '.svc__list');
const L = await b.evalJs(`(() => { const l = document.querySelector('.svc__lane').getBoundingClientRect(), t = document.querySelector('.svc__text').getBoundingClientRect(); return { laneL: l.left, textL: t.left, textR: t.right }; })()`);
const rowsVp = () => b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return [q.top, q.bottom]; })`);
const photoC = () => b.evalJs(`(() => { const r = document.querySelector('.svc__panel .svc__frame').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const act = () => b.evalJs(`[...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active')) + 1`);

// 1. full slow wheel pass down through the list with the pointer parked on the TEXT column, recording the panel geometry
await b.move(L.textL + 120, H * 0.5); await b.wheelTo(listTop - 160, W / 2, H / 2); await sleep(1500);
await b.evalJs(`window.__fr.start('p')`);
for (let i = 0; i < 60; i++) { await b.wheel(L.textL + 120, H * 0.5, 100); await sleep(60); }
await sleep(1800);
let S = await b.evalJs(`window.__fr.stop('p')`);
const distinct = (k) => [...new Set(S.map((s) => s[k]))];
R.pass = { frames: S.length, rowsSeen: distinct('act').join('>'), phValues: distinct('ph'), pwValues: distinct('pw'), plValues: distinct('pl'), fhValues: distinct('fh'), chValues: distinct('ch'), capSeen: distinct('cap').length };
console.log('PASS-DOWN', J(R.pass));
// moving frame-to-frame: top of panel must be stuck (pt constant) while the lane covers it
const stuck = S.filter((s) => Math.abs(s.pt - S[Math.floor(S.length / 2)].pt) < 0.01).length;
R.pass.stuckAtSameTop = stuck;

// 2. For each row: put the pointer on its text, then glide to the photo centre; row must not change. Click on the photo: no navigation.
R.rows = [];
await b.wheelTo(listTop - 160, W / 2, H / 2); await sleep(1500);
for (let k = 0; k < 6; k++) {
  // bring row k to ~ the middle of the viewport using the wheel (closed loop on the row geometry)
  for (let n = 0; n < 40; n++) { const rows = await rowsVp(); const mid = (rows[k][0] + rows[k][1]) / 2; const d = mid - H * 0.55; if (Math.abs(d) < 60) break; await b.wheel(L.textL + 120, 60, Math.sign(d) * Math.min(100, Math.abs(d))); await sleep(90); }
  await sleep(1200);
  const rows = await rowsVp(); const ph = await photoC();
  const rowMid = Math.max(rows[k][0] + 30, Math.min(rows[k][1] - 30, H * 0.55));
  await b.move(20, 20); await sleep(200);
  await b.move(L.textL + 120, rowMid); await sleep(700);
  const a0 = await act();
  const y0 = rowMid; const x0 = L.textL + 120;
  for (let i = 1; i <= 14; i++) { await b.move(x0 + (ph.x - x0) * (i / 14), y0 + (ph.y - y0) * (i / 14)); await sleep(18); }
  await sleep(900);
  const a1 = await act();
  const under = await b.evalJs(`(() => { const e = document.elementFromPoint(${ph.x}, ${ph.y}); return e ? e.tagName + '.' + String(e.className).split(' ')[0] : null; })()`);
  const cur = await b.evalJs(`(() => { const e = document.elementFromPoint(${ph.x}, ${ph.y}); return e ? getComputedStyle(e).cursor : null; })()`);
  const cap = await b.evalJs(`document.querySelector('.svc__cap').textContent.trim().slice(0, 30)`);
  const y1 = await b.evalJs('scrollY'); const href0 = await b.evalJs('location.href');
  await b.down(ph.x, ph.y); await sleep(40); await b.up(ph.x, ph.y); await sleep(900);
  const href1 = await b.evalJs('location.href'); const y2 = await b.evalJs('scrollY');
  R.rows.push({ row: k + 1, rowHoveredFirst: a0, afterPhoto: a1, stable: a0 === a1, underPhoto: under, cursorOnPhoto: cur, cap, clickNavigated: href0 !== href1 || Math.abs(y2 - y1) > 40, dY: Math.round(y2 - y1) });
  console.log('ROW', J(R.rows.at(-1)));
}
console.log('errors', J(b.errors));
writeFileSync(OUT + `v3-23-result-${W}x${H}.json`, J(R));
await b.close(); process.exit(0);
