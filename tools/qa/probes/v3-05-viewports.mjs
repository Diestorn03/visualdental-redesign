// v3-05: Services anchored preview across desktop viewports: overlap with text / header / FAB / palette, sticky anchor error, screenshots.
// node tools/qa/probes/v3-05-viewports.mjs   (one Chrome per viewport)
import { start, sleep, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const J = (o) => JSON.stringify(o);
const VPS = [[1024, 700], [1280, 720], [1440, 900], [1920, 1080], [2560, 1300]];
const out = [];
for (const [W, H] of VPS) {
  const b = await start({ w: W, h: H, tag: `vp${W}`, wait: 3500 });
  await b.evalJs(FRAMES);
  await b.evalJs(`window.__fr.add('g', () => { const q = (s) => document.querySelector(s), P = q('.svc__panel'), r = P.getBoundingClientRect(), l = q('.svc__lane').getBoundingClientRect(), h = q('[data-header]').getBoundingClientRect(), f1 = q('.fab__case').getBoundingClientRect(), f2 = q('.fab__call').getBoundingClientRect(), pal = q('.pal').getBoundingClientRect();
    const ix = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
    const rows = [...document.querySelectorAll('.svc__text')].map((t) => { const x = t.getBoundingClientRect(); return { r: x.right, t: x.top, b: x.bottom }; });
    const tr = Math.max(0, ...rows.filter((x) => x.b > 0 && x.t < innerHeight).map((x) => x.r));
    const bt = r.bottom; return { pt: r.top, pb: bt, pl: r.left, lt: l.top, lb: l.bottom, hb: h.bottom, hv: getComputedStyle(q('[data-header]')).transform, fabOv: Math.round(ix(r, f1) + ix(r, f2)), palOv: Math.round(ix(r, pal)), textGap: r.left - tr, inView: r.bottom > 0 && r.top < innerHeight, y: scrollY, ph: r.height }; })`);
  const stickyTop = parseFloat(await b.evalJs(`getComputedStyle(document.querySelector('.svc__panel')).top`));
  const svcTop = await docTop(b, '.svc__list');
  const info = await b.evalJs(`({ fx: document.documentElement.classList.contains('is-desktop-fx'), lane: document.querySelector('.svc__lane').getBoundingClientRect().width, panelW: document.querySelector('.svc__panel').getBoundingClientRect().width })`);
  await b.move(W * 0.25, H * 0.5);
  await b.wheelTo(svcTop - 140, W / 2, H / 2); await sleep(2200);
  await b.shot(`30-vp-${W}x${H}-glance`);
  await b.evalJs(`window.__fr.start('g')`);
  for (let i = 0; i < 40; i++) { await b.wheel(W * 0.25, H * 0.5, 100); await sleep(60); }
  await sleep(1500);
  const S = await b.evalJs(`window.__fr.stop('g')`);
  const on = S.filter((s) => s.inView);
  const stuck = S.filter((s) => s.lt < stickyTop && s.lb - 24 - s.ph > stickyTop);
  const o = { vp: `${W}x${H}`, fx: info.fx, laneW: Math.round(info.lane), stickyTop, panelH: Math.round(S[0].ph), maxAnchorErr: +Math.max(...S.map((s) => Math.abs(s.pt - Math.max(s.lt, Math.min(stickyTop, s.lb - 24 - s.ph))))).toFixed(3), stuckFrames: stuck.length, minTextGap: Math.round(Math.min(...on.map((s) => s.textGap))), maxFabOverlapPx2: Math.max(...on.map((s) => s.fabOv)), maxPalOverlapPx2: Math.max(...on.map((s) => s.palOv)), minPanelTopVsHeaderBottom: Math.round(Math.min(...on.map((s) => s.pt - Math.max(0, s.hb)))), panelBottomMax: Math.round(Math.max(...on.map((s) => s.pb))) };
  out.push(o); console.log(J(o));
  await b.shot(`31-vp-${W}x${H}-mid`);
  await b.close();
}
writeFileSync(OUT + 'v3-05-result.json', J(out, null, 1));
process.exit(0);
