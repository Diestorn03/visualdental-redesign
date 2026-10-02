// v3-03: first time each Services photo is shown (decode/upload hitch?) + the video slide (poster / play) + hover transitions in a fresh page.
// node tools/qa/probes/v3-03-firstshow.mjs [w] [h]
import { start, sleep, stats, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `f${W}`, wait: 4500 });
await b.evalJs(FRAMES);
await b.evalJs(`window.__shown = new Set(); window.__fr.add('h', () => { const P = document.querySelector('.svc__panel'), rows = [...document.querySelectorAll('.svc__row')];
  const a = rows.findIndex((x) => x.classList.contains('is-active')); window.__shown.add(a); const v = P.querySelector('video');
  return { act: a, vp: v ? (v.paused ? 0 : 1) : -1, vr: v ? v.readyState : -1 }; })`);
const J = (o) => JSON.stringify(o);
const listTop = await docTop(b, '.svc__list');
const L = await b.evalJs(`(() => { const r = document.querySelector('.svc__list').getBoundingClientRect(); return r.left; })()`);
const res = [];
await b.move(20, 30);
const order = [0, 2, 1, 3, 4, 5, 4, 2, 5, 0];
for (const i of order) {
  // put row i in the upper-middle of the viewport (away from the reading line at 50%)
  const rowTop = await b.evalJs(`document.querySelectorAll('.svc__row')[${i}].getBoundingClientRect().top + scrollY`);
  await b.wheelTo(Math.max(0, rowTop - 110), W / 2, H / 2); await sleep(1200); // settle: the reading line may pick another row
  await b.move(20, 30); await sleep(250);
  const q = await b.evalJs(`(() => { const r = document.querySelectorAll('.svc__row')[${i}].getBoundingClientRect(); return [r.top, r.bottom, [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active'))]; })()`);
  const y = Math.min(H - 60, Math.max(120, (q[0] + q[1]) / 2));
  const shownBefore = await b.evalJs(`window.__shown.has(${i})`);
  await b.evalJs(`window.__fr.start('h')`);
  await b.move(L + 260, y); await sleep(700);
  const S = await b.evalJs(`window.__fr.stop('h')`);
  const dts = S.slice(1).map((s, k) => s.t - S[k].t);
  const o = { row: i + 1, activeBefore: q[2] + 1, firstTimeShown: !shownBefore, becameActive: S.at(-1).act === i, maxDt: +Math.max(...dts).toFixed(1), over25: dts.filter((d) => d > 25).length, over16: dts.filter((d) => d > 17.5).length, videoPlaying: i === 4 ? S.at(-1).vp : undefined, videoReady: i === 4 ? S.at(-1).vr : undefined };
  res.push(o); console.log(J(o));
  if (i === 4 && !shownBefore) { await b.shot(`20-ceramic-video-slide-${W}`); }
}
console.log('SUMMARY first-time transitions maxDt', J(res.filter((r) => r.firstTimeShown).map((r) => [r.row, r.maxDt])), '| repeat transitions maxDt', J(res.filter((r) => !r.firstTimeShown).map((r) => [r.row, r.maxDt])));
console.log('video', J(await b.evalJs(`(() => { const v = document.querySelector('.svc__video'); return { poster: v.poster.split('/').pop(), src: v.currentSrc.split('/').pop(), readyState: v.readyState, paused: v.paused, w: v.videoWidth, h: v.videoHeight }; })()`)));
console.log('errors', J(b.errors));
writeFileSync(OUT + `v3-03-result-${W}.json`, J(res, null, 1));
await b.close(); process.exit(0);
