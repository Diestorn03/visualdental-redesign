// v3-02: production Services hover/focus/scroll selection with real pointer events. node tools/qa/probes/v3-02-hover.mjs [w] [h]
import { start, sleep, stats, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `h${W}` });
await b.evalJs(FRAMES);
await b.evalJs(`window.__pe = []; addEventListener('pointermove', (e) => window.__pe.push(performance.now()), { capture: true, passive: true });
 window.__fr.add('h', () => { const P = document.querySelector('.svc__panel'), rows = [...document.querySelectorAll('.svc__row')], sl = [...P.querySelectorAll('.svc__slide')];
  const vis = sl.map((s, k) => { const cs = getComputedStyle(s); const nums = (cs.clipPath.match(/[\\d.]+/g) || []).map(Number); return { k, v: cs.visibility === 'visible' && cs.display !== 'none', z: +s.style.zIndex || 0, cl: cs.clipPath === 'none' ? 0 : Math.max(0, ...nums) }; }).filter((o) => o.v).sort((a, b) => b.z - a.z);
  const r = P.getBoundingClientRect();
  return { act: rows.findIndex((x) => x.classList.contains('is-active')), top: vis[0] ? vis[0].k : -1, clip: vis[0] ? vis[0].cl : 100, layers: vis.length, full: vis.filter((o) => o.cl < 0.05).length, cap: P.querySelector('[data-cap-n]').textContent, capT: P.querySelector('[data-cap-t]').textContent, op: +getComputedStyle(P).opacity, pt: r.top, pl: r.left, ph: r.height }; })`);
const J = (o) => JSON.stringify(o);
const R = {};
const listTop = await docTop(b, '.svc__list');
const rowsVp = () => b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return [q.top, q.bottom]; })`);
const L = await b.evalJs(`(() => { const r = document.querySelector('.svc__list').getBoundingClientRect(), l = document.querySelector('.svc__lane').getBoundingClientRect(), t = document.querySelector('.svc__text').getBoundingClientRect(); return { l: r.left, w: r.width, laneL: l.left, laneR: l.right, textR: t.right, textL: t.left }; })()`);
console.log('LIST', J(L));
const titles = await b.evalJs(`[...document.querySelectorAll('.svc__title')].map((t) => t.textContent.trim())`);

await b.move(20, 30); await sleep(300);
await b.wheelTo(listTop - 130, W / 2, H / 2); await sleep(2400);
await b.move(20, 30); await sleep(700);
let rows = await rowsVp();
const mid = (i) => (rows[i][0] + rows[i][1]) / 2;
const settledState = () => b.evalJs(`(() => { const P = document.querySelector('.svc__panel'); const a = [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active')); return { act: a, cap: P.querySelector('.svc__cap').textContent.trim(), listHasActive: document.querySelector('.svc__list').classList.contains('is-active') } })()`);

// S1: latency, outside -> row 2 and then row 3 (pointer jumps like a mouse flick, then idle)
async function latency(label, x, y) {
  await b.evalJs(`window.__pe.length = 0; window.__fr.start('h')`);
  await b.move(x, y); await sleep(1300);
  const S = await b.evalJs(`window.__fr.stop('h')`); const pe = await b.evalJs('window.__pe[0]');
  const act = +label.at(-1) - 1;
  const iA = S.findIndex((s) => s.act === act), tA = S[iA]?.t;
  const at = (th) => { const s = S.find((s, i) => i >= iA && s.top === act && s.clip <= th); return s ? Math.round(s.t - tA) : null; };
  const dts = S.slice(1).map((s, i) => s.t - S[i].t);
  const out = { label, ptrEvent_to_rowActive_ms: iA >= 0 ? Math.round(tA - pe) : null, rowActive_to_photo_ms: { '10pct': at(90), '50pct': at(50), '90pct': at(10), '100pct': at(0.5) }, finalCap: S.at(-1).cap + ' ' + S.at(-1).capT, capMatchesTitle: S.at(-1).capT === titles[act], maxLayers: Math.max(...S.map((s) => s.layers)), frames: S.length, maxDt: stats(dts).max, noFullSlideFrames: S.filter((s) => s.full === 0).length };
  console.log('LAT', J(out)); return out;
}
R.lat = [];
R.lat.push(await latency('outside->row2', L.l + 250, mid(1)));
await b.shot(`10-hover-row2-${W}`);
R.lat.push(await latency('row2->row3', L.l + 250, mid(2)));
await b.shot(`11-hover-row3-${W}`);

// S2: sweep rows 1..3 quickly (14 steps / 250 ms) and settle
await b.move(L.l + 250, mid(0)); await sleep(1500);
await b.evalJs(`window.__fr.start('h')`);
for (let i = 1; i <= 14; i++) { await b.move(L.l + 250, mid(0) + (mid(2) - mid(0)) * (i / 14)); await sleep(16); }
await sleep(1500);
let S = await b.evalJs(`window.__fr.stop('h')`);
R.sweep = { maxLayers: Math.max(...S.map((s) => s.layers)), finalLayers: S.at(-1).layers, noFullSlideFrames: S.filter((s) => s.full === 0).length, final: [S.at(-1).act, S.at(-1).top, S.at(-1).clip], seq: [...new Set(S.map((s) => s.act))].join('>'), capMismatchFrames: S.filter((s) => s.cap !== String(s.act + 1).padStart(2, '0')).length };
console.log('SWEEP', J(R.sweep));

// S3: rapid in/out of the list
await b.move(20, 400); await sleep(700);
await b.evalJs(`window.__fr.start('h')`);
for (let i = 0; i < 14; i++) { await b.move(L.l + 250, mid(1)); await sleep(80); await b.move(20, mid(1)); await sleep(80); }
await b.move(L.l + 250, mid(1)); await sleep(1500);
S = await b.evalJs(`window.__fr.stop('h')`);
const changes = []; S.forEach((s, i) => { if (i && s.act !== S[i - 1].act) changes.push(S[i - 1].act + '>' + s.act); });
R.inout = { cycles: 14, minOpacity: Math.min(...S.map((s) => s.op)), actChanges: changes.join(' '), panelMovedPx: [Math.min(...S.map((s) => s.pt)), Math.max(...S.map((s) => s.pt))], noFullSlideFrames: S.filter((s) => s.full === 0).length, finalAct: S.at(-1).act, finalLayers: S.at(-1).layers };
console.log('INOUT', J(R.inout));

// S4: pointer travels onto the photo: row low in the viewport -> photo center
await b.wheelTo(listTop + 300, W / 2, H / 2); await sleep(2000);
rows = await rowsVp();
const lowRow = rows.findIndex((r) => (r[0] + r[1]) / 2 > H * 0.62 && (r[0] + r[1]) / 2 < H - 40);
const photo = await b.evalJs(`(() => { const r = document.querySelector('.svc__panel .svc__frame').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
console.log('S4 lowRow', lowRow, 'rows', J(rows.map((r) => r.map(Math.round))), 'photo', J(photo));
await b.move(20, 30); await sleep(500);
await b.move(L.l + 250, (rows[lowRow][0] + rows[lowRow][1]) / 2); await sleep(900);
await b.shot(`12-hover-low-row-${W}`);
const a0 = await settledState();
// move horizontally to the lane edge at the same y, then up to the photo center in 12 steps
await b.evalJs(`window.__fr.start('h')`);
const y0 = (rows[lowRow][0] + rows[lowRow][1]) / 2;
for (let i = 1; i <= 8; i++) { await b.move(L.l + 250 + (photo.x - L.l - 250) * (i / 8), y0); await sleep(20); }
await sleep(500);
const atPhotoSameY = await settledState();
for (let i = 1; i <= 12; i++) { await b.move(photo.x, y0 + (photo.y - y0) * (i / 12)); await sleep(20); }
await sleep(1200);
S = await b.evalJs(`window.__fr.stop('h')`);
const atPhoto = await settledState();
await b.shot(`13-pointer-on-photo-${W}`);
R.toPhoto = { startRow: a0.act + 1, afterHorizontal: atPhotoSameY.act + 1, afterReachingPhotoCenter: atPhoto.act + 1, capNow: atPhoto.cap, rowSeq: [...new Set(S.map((s) => s.act + 1))].join('>'), pointerOnPhotoAt: [Math.round(photo.x), Math.round(photo.y)] };
console.log('TOPHOTO', J(R.toPhoto));

// S5: parked pointer + wheel: who wins, and does a real move take over?
await b.wheelTo(listTop - 130, W / 2, H / 2); await sleep(2000);
rows = await rowsVp();
await b.move(L.l + 250, mid(0)); await sleep(800);
const w0 = await settledState();
await b.evalJs(`window.__fr.start('h')`);
for (let i = 0; i < 8; i++) { await b.wheel(L.l + 250, mid(0), 100); await sleep(70); }
await sleep(1500);
S = await b.evalJs(`window.__fr.stop('h')`);
const w1 = await settledState();
const under = await b.evalJs(`(() => { const e = document.elementFromPoint(${L.l + 250}, ${mid(0)}); const r = e && e.closest('.svc__row'); return r ? [...document.querySelectorAll('.svc__row')].indexOf(r) + 1 : -1; })()`);
await b.move(L.l + 252, mid(0) + 2); await sleep(900);
const w2 = await settledState();
R.wheelParked = { hoverRowBefore: w0.act + 1, afterWheel_active: w1.act + 1, rowUnderParkedPointer: under, afterTinyMove_active: w2.act + 1, rowSeqDuringWheel: [...new Set(S.map((s) => s.act + 1))].join('>') };
console.log('WHEELPARKED', J(R.wheelParked));
await b.shot(`14-after-wheel-parked-${W}`);

// S6: keyboard
await b.move(20, 30);
await b.evalJs(`document.activeElement.blur(); window.scrollTo(0, ${listTop - 130}); 0`); await sleep(900);
const kb = [];
for (let n = 0; n < 9; n++) {
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await sleep(450);
  kb.push(await b.evalJs(`(() => { const a = document.activeElement; const r = a.closest && a.closest('.svc__row'); const rows = [...document.querySelectorAll('.svc__row')]; const cs = getComputedStyle(a); return { tag: a.tagName.toLowerCase() + (a.className ? '.' + String(a.className).split(' ')[0] : ''), inRow: r ? rows.indexOf(r) + 1 : 0, act: rows.findIndex((x) => x.classList.contains('is-active')) + 1, outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, fv: a.matches(':focus-visible'), cap: document.querySelector('.svc__cap').textContent.trim().slice(0, 4) }; })()`));
}
console.log('KB', J(kb));
R.kb = kb;
const focusShot = await b.evalJs(`(() => { const a = document.querySelectorAll('.svc__row')[2]; a.focus({ focusVisible: true }); return document.activeElement === a && a.matches(':focus-visible'); })()`);
await sleep(900); await b.shot(`15-keyboard-focus-row3-${W}`);
console.log('focus row3 visible', focusShot);
console.log('errors', J(b.errors));
writeFileSync(OUT + `v3-02-result-${W}.json`, J(R, null, 1));
await b.close(); process.exit(0);
