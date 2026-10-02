// f4-services: validates the REAL #services (sticky preview) with real CDP input. Reuses d4-lib.
//   MSYS_NO_PATHCONV=1 SHOTS_DIR="C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f4/" node tools/qa/probes/f4-services.mjs [w] [h] [cdpPort] [devPort] [only]
// only = shots | scroll | hover | kbd (default: all)
import { launch, sleep, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9414), DEV = +(process.argv[5] || 4414), ONLY = process.argv[6] || 'all';
const want = (k) => ONLY === 'all' || ONLY === k;

const b = await launch({ port: PORT, w: W, h: H, tag: `f4-${W}` });
// dev only: no HMR socket (other agents save files all the time: a hot reload mid-run would ruin it) and no Vite error overlay from ANOTHER section's file (mid-edit) would cover the page and swallow every pointer event
await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const W = window.WebSocket; window.WebSocket = function (u, p) { if (p === 'vite-hmr' || (Array.isArray(p) && p.includes('vite-hmr'))) return { addEventListener() {}, removeEventListener() {}, send() {}, close() {}, readyState: 0 }; return new W(u, p); }; window.WebSocket.prototype = W.prototype; Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }); })(); new MutationObserver(() => document.querySelectorAll('vite-error-overlay').forEach((e) => e.remove())).observe(document, { childList: true, subtree: true });` });
await b.open(`http://127.0.0.1:${DEV}/${process.env.QS || ""}`);
const q = (js) => b.evalJs(js);
let listTop = 0;
// the dev server hot-reloads the page when ANOTHER agent saves a file: re-open, re-warm and re-install the recorder whenever it is gone
async function ready() {
  if (await q(`typeof window.__p`).catch(() => 'undefined') === 'object') return;
  await b.open(`http://127.0.0.1:${DEV}/${process.env.QS || ""}`);
  for (let i = 0; i < 30 && !(await q(`document.documentElement.classList.contains('fx-booted')`).catch(() => false)); i++) await sleep(300); // engine booted (html.is-desktop-fx set)
  listTop = await q(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
  await b.wheelTo(listTop + 1700, W / 2, H / 2); await sleep(1200); await b.wheelTo(listTop - 300, W / 2, H / 2); await sleep(1500); // warm the one-shot reveals
  // recorder: per rAF (test only, this is NOT page code)
  await q(`(() => { const panel = document.querySelector('.svc__panel'), lane = document.querySelector('.svc__lane'), list = document.querySelector('.svc__list'),
    rows = [...document.querySelectorAll('.svc__row')], slides = [...panel.querySelectorAll('.svc__slide')], hdr = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 72;
    let on = false, S = [];
    const tick = (t) => { if (on) {
      const r = panel.getBoundingClientRect(), l = lane.getBoundingClientRect(), lt = list.getBoundingClientRect();
      const exp = Math.min(Math.max(l.top, hdr + 24, innerHeight / 2 - 12 * parseFloat(getComputedStyle(document.documentElement).fontSize)), l.bottom - (panel.offsetHeight + 24));
      const vis = slides.map((s, k) => ({ k, z: +s.style.zIndex || 0, v: getComputedStyle(s).visibility === 'visible', cp: getComputedStyle(s).clipPath })).filter((o) => o.v).sort((a, b) => b.z - a.z);
      const m = /inset\\(([\\d.]+)%/.exec(vis[0]?.cp || '');
      // row crossing the reading line, from layout (test side only)
      let cross = -1; rows.forEach((x, k) => { const q = x.getBoundingClientRect(); if (q.top <= innerHeight / 2 && q.bottom > innerHeight / 2) cross = k; });
      S.push({ t: +t.toFixed(1), y: +scrollY.toFixed(1), py: +r.top.toFixed(2), err: +(r.top - exp).toFixed(2), act: rows.findIndex((x) => x.classList.contains('is-active')), top: vis[0]?.k ?? -1, clip: m ? +m[1] : 0, nvis: vis.length, cross, cap: panel.querySelector('[data-cap-n]').textContent });
    } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    window.__p = { start() { S = []; on = true; return performance.now(); }, stop() { on = false; return S; } }; })()`);
  await sleep(300);
  await sleep(300);
}
await ready();

const rowMids = () => q(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
const lb = await q('document.querySelector(".svc__list").getBoundingClientRect().left');
const state = () => q(`({ act: [...document.querySelectorAll('.svc__row')].findIndex((r) => r.classList.contains('is-active')), panelDisplay: getComputedStyle(document.querySelector('.svc__panel')).display, sticky: getComputedStyle(document.querySelector('.svc__panel')).position, cap: document.querySelector('.svc__cap').textContent.trim() })`);

if (want('shots')) {
  await ready();
  console.log('state', JSON.stringify(await state()));
  console.log(await b.shot(`01-list-top-${W}`));
  await b.wheelTo(listTop + 250, W / 2, H / 2); await sleep(1500);
  console.log(await b.shot(`02-scrolled-${W}`));
  const rm = await rowMids();
  const target = rm.findIndex((y) => y > 120 && y < H - 60);
  await b.move(lb + 250, rm[Math.min(rm.length - 1, target + 2)]); await sleep(1200);
  console.log('state after hover', JSON.stringify(await state()));
  console.log(await b.shot(`03-hover-${W}`));
}

// --------- scroll scenarios: parked pointer ---------
const scen = async (name, every, notches, dir = 1, px = 500, py = 430, jitter = false) => {
  await ready();
  await b.wheelTo(dir > 0 ? listTop - 300 : listTop + 1150, W / 2, H / 2); await sleep(1800);
  await b.move(px, py); await sleep(900);
  await q('__p.start()');
  for (let i = 0; i < notches; i++) { await b.wheel(px, py, dir * 100); if (jitter) { for (let j = 0; j < Math.max(1, Math.round(every / 16)); j++) { await b.move(px + (j % 2 ? 3 : -3), py + (j % 2 ? -2 : 2)); await sleep(16); } } else await sleep(every); }
  await sleep(1200);
  const S = await q('__p.stop()');
  const sc = S.filter((s, i) => i && s.y !== S[i - 1].y);
  const stuck = sc.filter((s) => Math.abs(s.err) >= 0); // all frames while scrolling
  const inList = sc.filter((s) => s.cross >= 0);
  const match = inList.filter((s) => s.top === s.act && s.clip <= 10).length;
  const lag = inList.filter((s) => s.act !== s.cross).length; // frames where the active row is not the one on the line
  const acts = []; S.forEach((s, i) => { if (i && s.act !== S[i - 1].act) acts.push(S[i - 1].act + '>' + s.act); });
  const after = S.slice(-20); // 1.2 s after the last notch: settled
  console.log(name.padEnd(28), JSON.stringify({
    framesScrolling: sc.length, maxAnchorErrPx: stuck.length ? +Math.max(...stuck.map((s) => Math.abs(s.err))).toFixed(2) : null,
    pctPhotoMatchesRow: +(100 * match / Math.max(1, inList.length)).toFixed(0), framesActNotOnLine: lag, rowChanges: acts.join(' '),
    minVisibleLayers: Math.min(...S.map((s) => s.nvis)), maxLayers: Math.max(...S.map((s) => s.nvis)), settled: { act: after.at(-1).act, top: after.at(-1).top, layers: after.at(-1).nvis, cap: after.at(-1).cap },
    dt: stats(S.slice(1).map((s, i) => s.t - S[i].t)) }));
};
if (want('scroll')) {
  await scen('S1 @2500px/s ptr y=430', 40, 10);
  await scen('S1 @1430px/s ptr y=430', 70, 10);
  await scen('S1 @ 910px/s ptr y=430', 110, 9);
  await scen('S1 @1430px/s ptr y=700', 70, 10, 1, 500, 700);
  await scen('S1 up @1430px/s', 70, 10, -1);
  await scen('S4 @1430 + 3px jitter', 70, 10, 1, 500, 430, true);
}

// --------- hover: latency, sweep, rapid in/out ---------
if (want('hover')) {
  await ready();
  await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2200);
  const rr = await rowMids();
  await b.move(lb + 250, rr[0]); await sleep(1500);
  await q('__p.start()'); await b.move(lb + 250, rr[1]); await sleep(1500);
  let S = await q('__p.stop()');
  const iAct = S.findIndex((s) => s.act === 1);
  const at = (th) => { const s = S.find((s, i) => i >= iAct && s.top === 1 && s.clip <= th); return s ? Math.round(s.t - S[iAct].t) : null; };
  console.log('H1 hover row1->row2', JSON.stringify({ ms_visible: { '10%': at(90), '50%': at(50), '90%': at(10), '100%': at(0.5) }, maxAnchorErr: Math.max(...S.map((s) => Math.abs(s.err))), cap: S.at(-1).cap }));
  await b.move(lb + 250, rr[0]); await sleep(1500);
  await q('__p.start()');
  const n = 14; for (let i = 1; i <= n; i++) { await b.move(lb + 250, rr[0] + (Math.min(H - 70, rr[2]) - rr[0]) * (i / n)); await sleep(16); }
  await sleep(1400);
  S = await q('__p.stop()');
  console.log('H2 sweep rows1->3 in ~250ms', JSON.stringify({ maxLayers: Math.max(...S.map((s) => s.nvis)), minLayers: Math.min(...S.map((s) => s.nvis)), finalLayers: S.at(-1).nvis, final: { act: S.at(-1).act, top: S.at(-1).top, clip: S.at(-1).clip } }));
  // rapid in/out: pointer jumps onto row 3 and off the list, 16 ms apart; the photo must never disappear
  await q('__p.start()');
  for (let i = 0; i < 20; i++) { await b.move(lb + 250, rr[2]); await sleep(16); await b.move(W - 8, rr[2]); await sleep(16); await b.move(lb + 250, rr[1]); await sleep(16); await b.move(lb - 40 < 0 ? 4 : lb - 40, rr[1]); await sleep(16); }
  await sleep(900);
  S = await q('__p.stop()');
  console.log('H3 rapid in/out', JSON.stringify({ minVisibleLayers: Math.min(...S.map((s) => s.nvis)), framesWithNoPhoto: S.filter((s) => s.nvis === 0).length, finalAct: S.at(-1).act, finalTop: S.at(-1).top, finalLayers: S.at(-1).nvis }));
  // pointer leaves the list: the photo stays (always a photo)
  await b.move(W - 8, 20); await sleep(900);
  console.log('H4 pointer off the list', JSON.stringify(await state()), 'visible slides', await q(`[...document.querySelectorAll('.svc__slide')].filter((s) => getComputedStyle(s).visibility === 'visible').length`));
}

// --------- keyboard: focus wins over scroll; mouse wins over keyboard ---------
if (want('kbd')) {
  await ready();
  await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(1800);
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
  await q(`document.querySelectorAll('.svc__row')[3].focus()`); await sleep(700);
  const f0 = await q(`({ act: [...document.querySelectorAll('.svc__row')].findIndex((r) => r.classList.contains('is-active')), focusVisible: document.activeElement.matches(':focus-visible'), cap: document.querySelector('.svc__cap').textContent.trim() })`);
  await b.burst(20, 430, 6, 100, 60); await sleep(1200);
  const f1 = await q(`[...document.querySelectorAll('.svc__row')].findIndex((r) => r.classList.contains('is-active'))`);
  console.log('K1 keyboard', JSON.stringify({ afterFocusRow4: f0, activeAfterWheelWhileFocused: f1 }));
  console.log(await b.shot(`04-focus-${W}`));
}
console.log('errors', b.errors);
await b.close();
process.exit(0);
