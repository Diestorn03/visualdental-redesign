// f4r-i4: verifier v1 I4 for the sticky Services panel, on the DEV server (the v1 harness hooks minified production chunks, so it cannot run on dev).
//   Real CDP wheel + Lenis, per-rAF panel top/height, excess = distance outside [min(0,-dY), max(0,-dY)] between contiguous frames (must be < 1 px).
//   MSYS_NO_PATHCONV=1 SHOTS_DIR="C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f4/" node tools/qa/probes/f4r-i4.mjs [w] [h] [cdpPort] [devPort]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1920), H = +(process.argv[3] || 1080), PORT = +(process.argv[4] || 9414), DEV = +(process.argv[5] || 4414);
const b = await launch({ port: PORT, w: W, h: H, tag: `f4r-${W}` });
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })(); new MutationObserver(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())).observe(document, { childList: true, subtree: true });` });
await b.open(`http://127.0.0.1:${DEV}/`);
for (let i = 0; i < 40 && !(await b.evalJs(`document.documentElement.classList.contains('fx-booted')`).catch(() => false)); i++) await sleep(300);
const q = (js) => b.evalJs(js);
const geo = () => q(`(() => { const l = document.querySelector('.svc__list').getBoundingClientRect(); return { top: l.top + scrollY, bottom: l.bottom + scrollY }; })()`);
let g = await geo();
await b.wheelTo(g.top + 1700, 24, H / 2); await sleep(900); await b.wheelTo(g.top - 300, 24, H / 2); await sleep(1200); // warm the one-shot reveals
g = await geo();
await q(`(() => { const P = document.querySelector('.svc__panel'), rows = [...document.querySelectorAll('.svc__row')], cap = P.querySelector('.svc__cap'); let on = false, S = [];
  const tick = (t) => { if (on) { const r = P.getBoundingClientRect(); S.push({ t, y: scrollY, top: r.top, h: r.height, ch: cap.getBoundingClientRect().height, act: rows.findIndex((x) => x.classList.contains('is-active')) }); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick); window.__r = { start() { S = []; on = true; }, stop() { on = false; return S; } }; })()`);
const analyse = (S, name) => {
  const steps = []; let worst = 0, worstAt = null, hjump = 0, n = 0, over1 = 0, hcount = new Set();
  for (let i = 1; i < S.length; i++) {
    const dy = S[i].y - S[i - 1].y; if (Math.abs(dy) > 1500) continue; n++;
    const dTop = S[i].top - S[i - 1].top, lo = Math.min(0, -dy), hi = Math.max(0, -dy);
    const ex = dTop < lo ? lo - dTop : dTop > hi ? dTop - hi : 0;
    if (ex >= 1) over1++;
    if (ex > worst) { worst = ex; worstAt = { y: +S[i].y.toFixed(1), dy: +dy.toFixed(1), top: [+S[i - 1].top.toFixed(1), +S[i].top.toFixed(1)], h: [+S[i - 1].h.toFixed(1), +S[i].h.toFixed(1)] }; }
    if (Math.abs(S[i].h - S[i - 1].h) > 1) steps.push({ y: +S[i].y.toFixed(1), dy: +dy.toFixed(1), act: [S[i - 1].act, S[i].act], top: [+S[i - 1].top.toFixed(1), +S[i].top.toFixed(1)], h: [+S[i - 1].h.toFixed(1), +S[i].h.toFixed(1)] });
    hjump = Math.max(hjump, Math.abs(S[i].h - S[i - 1].h)); hcount.add(+S[i].h.toFixed(1));
  }
  console.log(name.padEnd(26), JSON.stringify({ frames: n, maxExcessPx: +worst.toFixed(2), framesExcessGE1: over1, maxHeightStepPx: +hjump.toFixed(2), distinctPanelHeights: [...hcount], worstAt, heightSteps: steps }));
};
const run = async (name, dir, dy, ms, from, to, jump = false) => {
  if (jump) { await b.wheelTo(g.top + 3.5 * (g.bottom - g.top) / 6 - H / 2, 24, H / 2); await sleep(1100); await q(`scrollTo(0, ${Math.round(from)}); 0`); await sleep(900); } // stale active row (row 04, the tall caption) + a hard jump to the end of the lane: like the verifier's gotoY
  else { await b.wheelTo(from, 24, H / 2); await sleep(900); }
  await q('__r.start()');
  for (let n = 0; n < 400; n++) { const y = await q('scrollY'); if (dir < 0 ? y <= to : y >= to) break; await b.wheel(24, H / 2, dir * dy); await sleep(ms); }
  await sleep(900);
  analyse(await q('__r.stop()'), name);
};
console.log(`viewport ${W}x${H}, list doc ${Math.round(g.top)}..${Math.round(g.bottom)}`);
await run('jump->up slow 20px/16ms', -1, 20, 16, g.bottom + 250, g.top - 150, true);
await run('jump->up notch 100/90ms', -1, 100, 90, g.bottom + 250, g.top - 150, true);
await run('up slow 20px/16ms', -1, 20, 16, g.bottom + 250, g.top - 150);
await run('up notch 100px/90ms', -1, 100, 90, g.bottom + 250, g.top - 150);
await run('up fast 100px/16ms', -1, 100, 16, g.bottom + 250, g.top - 150);
await run('down slow 20px/16ms', 1, 20, 16, g.top - 250, g.bottom + 150);
await run('down notch 100px/90ms', 1, 100, 90, g.top - 250, g.bottom + 150);
console.log('caption heights/rows', JSON.stringify(await q(`(() => { const P = document.querySelector('.svc__panel'); return { panelH: P.getBoundingClientRect().height, capH: P.querySelector('.svc__cap').getBoundingClientRect().height, frameH: P.querySelector('.svc__frame').getBoundingClientRect().height, lane: document.querySelector('.svc__lane').getBoundingClientRect().width }; })()`)));
console.log('errors', b.errors);
await b.close(); process.exit(0);
