// v3-01: production Services (anchored preview): structure, first glance, anchor precision while scrolling, hover/focus/scroll selection, blink check.
// node tools/qa/probes/v3-01-services.mjs [w] [h]
import { start, sleep, stats, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `s${W}` });
const net = []; await b.send('Network.enable');
b.ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) net.push(m.params.response.status + ' ' + m.params.response.url); if (m.method === 'Network.loadingFailed') net.push('FAIL ' + m.params.errorText + ' ' + (m.params.requestId)); });
await b.evalJs(FRAMES);
const R = {};
const J = (o) => JSON.stringify(o);

R.mode = await b.evalJs(`({ fx: document.documentElement.classList.contains('is-desktop-fx'), cls: document.documentElement.className, panelDisplay: getComputedStyle(document.querySelector('.svc__panel')).display, panelPos: getComputedStyle(document.querySelector('.svc__panel')).position, thumbDisplay: getComputedStyle(document.querySelector('.svc__thumb')).display, hint: !!document.querySelector('.svc__hint'), tag: !!document.querySelector('.svc__tag'), stickyTop: getComputedStyle(document.querySelector('.svc__panel')).top, hdrH: getComputedStyle(document.documentElement).getPropertyValue('--header-h') })`);
console.log('MODE', J(R.mode));

await b.evalJs(`window.__fr.add('p', () => { const P = document.querySelector('.svc__panel'), L = document.querySelector('.svc__lane'), r = P.getBoundingClientRect(), l = L.getBoundingClientRect(), h = document.querySelector('[data-header]').getBoundingClientRect();
  const sl = [...P.querySelectorAll('.svc__slide')]; const vis = sl.map((s, k) => { const cs = getComputedStyle(s); return { k, v: cs.visibility === 'visible' && cs.display !== 'none', cp: cs.clipPath, z: +s.style.zIndex || 0 }; }).filter((o) => o.v);
  const full = vis.filter((o) => o.cp === 'none' || ((o.cp.match(/[\d.]+/g) || []).reduce((a, n) => a + +n, 0) < 0.05)).length;
  const act = [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active'));
  return { y: scrollY, pt: r.top, pl: r.left, pw: r.width, ph: r.height, lt: l.top, lb: l.bottom, ll: l.left, lr: l.right, hb: h.bottom, layers: vis.length, full, act, cap: P.querySelector('[data-cap-n]').textContent, op: +getComputedStyle(P).opacity }; })`);

// ---------- arrive at the list the way a visitor does ----------
const listTop = await docTop(b, '.svc__list');
const svcTop = await docTop(b, '#services');
await b.move(W * 0.2, H * 0.5);
await b.wheelTo(svcTop - 40, W / 2, H / 2); await sleep(2200);
console.log('shot', await b.shot(`01-arrive-head-${W}`));
await b.wheelTo(listTop - 160, W / 2, H / 2); await sleep(2200);
console.log('shot', await b.shot(`02-first-glance-${W}`));
R.first = await b.evalJs(`(() => { const P = document.querySelector('.svc__panel'); const rows = [...document.querySelectorAll('.svc__row')]; return { act: rows.findIndex((r) => r.classList.contains('is-active')), cap: P.querySelector('.svc__cap').textContent.trim(), photoLoaded: [...P.querySelectorAll('img')].map((i) => i.complete && i.naturalWidth > 0), warm: P.classList.contains('is-warm') } })()`);
console.log('FIRST', J(R.first));

// ---------- scroll through the list, pointer parked on the LEFT text column (typical) ----------
async function scrollPass(name, dir, every, notches, px, py) {
  await b.move(px, py); await sleep(300);
  await b.evalJs(`window.__fr.start('p')`);
  for (let i = 0; i < notches; i++) { await b.wheel(px, py, dir * 100); await sleep(every); }
  await sleep(1600);
  const S = await b.evalJs(`window.__fr.stop('p')`);
  const exp = (s) => Math.max(s.hb > 0 ? 80 : 80, 0); // placeholder, replaced below
  return S;
}
const stickyTop = parseFloat(R.mode.stickyTop);
const analyse = (S, label) => {
  const T = stickyTop;
  const dev = [];
  let stuckFrames = 0, jumpMax = 0, leftSet = new Set(), widthSet = new Set();
  for (let i = 0; i < S.length; i++) {
    const s = S[i];
    const lo = s.lt, hi = s.lb - 24 - s.ph;
    const expect = Math.max(lo, Math.min(T, hi));
    const d = s.pt - expect;
    dev.push(d);
    if (s.lt < T && hi > T) stuckFrames++;
    leftSet.add(s.pl.toFixed(2)); widthSet.add(s.pw.toFixed(2));
    if (i) jumpMax = Math.max(jumpMax, Math.abs((s.pt - s.lt) - (S[i - 1].pt - S[i - 1].lt)) - 0); // movement of panel inside the lane per frame
  }
  const maxDev = Math.max(...dev.map(Math.abs));
  const blink = S.filter((s) => s.full === 0 && s.lt < innerHeightGuess && s.lb > 0).length;
  const dts = S.slice(1).map((s, i) => s.t - S[i].t);
  const acts = []; S.forEach((s, i) => { if (!i || s.act !== S[i - 1].act) acts.push(s.act); });
  const mism = S.filter((s) => s.act >= 0 && s.cap !== String(s.act + 1).padStart(2, '0')).length;
  const out = { label, frames: S.length, scrollFrames: S.filter((s, i) => i && s.y !== S[i - 1].y).length, maxDevPx_vs_stickyAnchor: +maxDev.toFixed(3), stuckFrames, panelLeftValues: [...leftSet].length, panelWidthValues: [...widthSet].length, minLeft: Math.min(...S.map((s) => s.pl)), maxLeft: Math.max(...S.map((s) => s.pl)), laneLeftMinMax: [Math.min(...S.map((s) => s.ll)), Math.max(...S.map((s) => s.ll))], maxLayers: Math.max(...S.map((s) => s.layers)), framesNoFullSlideWhileLaneVisible: blink, capMismatchFrames: mism, rowSeq: acts.join('>'), minOpacity: Math.min(...S.map((s) => s.op)), dt: stats(dts), over25: dts.filter((d) => d > 25).length, over40: dts.filter((d) => d > 40).length };
  return out;
};
const innerHeightGuess = H;
const passes = [
  ['scroll down @1430px/s ptr on text', 1, 70, 12, W * 0.3, H * 0.5],
  ['scroll down @2500px/s ptr on text', 1, 40, 16, W * 0.3, H * 0.5],
  ['scroll down @1000px/s ptr on text', 1, 100, 12, W * 0.3, H * 0.5],
  ['scroll up   @1430px/s ptr on text', -1, 70, 18, W * 0.3, H * 0.5],
];
R.passes = [];
for (const [name, dir, every, n, px, py] of passes) {
  // reset position
  await b.wheelTo(dir > 0 ? listTop - 240 : listTop + 2000, W / 2, H / 2); await sleep(1800);
  const S = await scrollPass(name, dir, every, n, px, py);
  const a = analyse(S, name); R.passes.push(a); console.log('PASS', J(a));
  if (name.startsWith('scroll down @1430')) writeFileSync(OUT + `v3-01-series-${W}.json`, J(S));
}
console.log('errors', J(b.errors), 'net', J(net));
writeFileSync(OUT + `v3-01-result-${W}.json`, J({ R, net, errors: b.errors }, null, 1));
await b.close();
process.exit(0);
