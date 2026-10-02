// d4-07: header nav click (and footer "Back to top") -> per-frame scrollY curve, header state, dt.  Real mouse click.
// node tools/qa/probes/d4-07-nav-click-scroll.mjs [w] [h] [port]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9423);
const b = await launch({ port: PORT, w: W, h: H, tag: `n${W}` });
await b.open('http://127.0.0.1:4423/');
await b.evalJs(`(() => {
  const hdr = document.querySelector('[data-header]'); let on = false, S = [];
  const tick = (t) => { if (on) { const r = hdr.getBoundingClientRect(); S.push({ t: +t.toFixed(1), y: +scrollY.toFixed(1), hb: +r.bottom.toFixed(1), th: hdr.dataset.theme, cur: document.querySelector('[data-header] [aria-current]')?.dataset.nav || '-' }); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__r7 = { start() { S = []; on = true; return performance.now(); }, stop() { on = false; return S; } };
})()`);
const navPos = await b.evalJs(`[...document.querySelectorAll('.hdr__nav a')].map((a) => { const r = a.getBoundingClientRect(); return { id: a.dataset.nav, x: r.left + r.width / 2, y: r.top + r.height / 2 }; })`);
console.log('nav', JSON.stringify(navPos.map((n) => `${n.id}@${Math.round(n.x)}`)));
async function go(label, x, y) {
  const y0 = await b.evalJs('scrollY');
  await b.move(x, y); await sleep(250);
  const t0 = await b.evalJs('__r7.start()');
  await b.down(x, y); await sleep(30); await b.up(x, y);
  await sleep(4500);
  const S = await b.evalJs('__r7.stop()');
  const v = S.slice(1).map((s, i) => s.y - S[i].y);
  const moving = S.filter((s, i) => i && s.y !== S[i - 1].y);
  const tStart = moving[0]?.t, tEnd = moving.at(-1)?.t;
  const dt = S.slice(1).map((s, i) => s.t - S[i].t).filter((_, i) => S[i + 1].y !== S[i].y);
  const finalY = S.at(-1).y;
  const maxV = Math.max(...v.map(Math.abs));
  const iMax = v.findIndex((x2) => Math.abs(x2) === maxV);
  console.log(label, JSON.stringify({ from: Math.round(y0), to: Math.round(finalY), distance: Math.round(finalY - y0), ms_clickToFirstMove: Math.round(tStart - t0), ms_motion: Math.round(tEnd - tStart), firstFramesPx: v.slice(S.findIndex((s, i) => i && s.y !== S[i - 1].y) - 1).slice(0, 8).map((n) => Math.round(n)), maxPxPerFrame: Math.round(maxV), maxFramePct: +(100 * maxV / Math.abs(finalY - y0)).toFixed(1), overshootPx: Math.round(Math.max(...S.map((s) => (finalY > y0 ? s.y - finalY : finalY - s.y)))), hdrBottomAtEnd: S.at(-1).hb, hdrHiddenFrames: S.filter((s) => s.hb <= 0).length, themeChanges: [...new Set(S.map((s) => s.th))].join('>'), dtMax: +Math.max(...dt).toFixed(1) }));
  const iFirst = S.findIndex((s, i) => i && s.y !== S[i - 1].y);
  console.log('   first 14 frames of motion [dt ms, dy px]:', JSON.stringify(S.slice(iFirst, iFirst + 14).map((s, i) => [Math.round(s.t - S[iFirst + i - 1].t), Math.round(s.y - S[iFirst + i - 1].y)])));
  const lf = S.slice(1).map((s, i) => s.t - S[i].t).filter((d) => d > 33); console.log('   frames > 33 ms during the whole click:', lf.length, 'sum ms', Math.round(lf.reduce((a, b2) => a + b2, 0)), 'worst', Math.round(Math.max(0, ...lf)));
  writeFileSync(`${OUT}d4-07-${label.replace(/\W+/g, '_')}-${W}.json`, JSON.stringify(S));
}
const pick = (id) => navPos.find((n) => n.id === id);
const ids = navPos.map((n) => n.id);
console.log('nav ids', ids.join(','));
// from top: click each of services, then education, then back to about
await go('top->' + ids[1], pick(ids[1]).x, pick(ids[1]).y);
await go(ids[1] + '->' + ids[ids.length - 1], pick(ids[ids.length - 1]).x, pick(ids[ids.length - 1]).y);
await go('last->' + ids[0], pick(ids[0]).x, pick(ids[0]).y);
console.log('errors', b.errors);
await b.close();
process.exit(0);
