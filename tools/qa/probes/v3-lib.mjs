// v3 verifier helpers: d4-lib (real CDP input) pointed at the production preview on 4423 / CDP 9423, outputs in .shots/v3-r2/
process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/v3-r2/';
const d4 = await import('./d4-lib.mjs');
export const { sleep, OUT, stats, RECORDER } = d4;
export const BASE = 'http://127.0.0.1:4423/';
export const PORT = +(process.env.V3_CDP || 9423);
export async function start({ w = 1366, h = 820, tag = 'v3', wait = 3500, port = PORT } = {}) {
  const b = await d4.launch({ port, w, h, tag });
  await b.open(BASE, wait);
  return b;
}
export const docTop = (b, sel) => b.evalJs(`document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top + scrollY`);
// per-rAF in-page recorder factory: __mk(name, fnReturningRow) ; __mk.start(name) ; __mk.stop(name) -> rows
export const FRAMES = `(() => { if (window.__fr) return 'ok'; const R = {}; window.__fr = { add(n, fn) { R[n] = { fn, on: false, S: [] }; }, start(n) { R[n].S = []; R[n].on = true; }, stop(n) { R[n].on = false; return R[n].S; } };
  const tick = (t) => { for (const k in R) if (R[k].on) R[k].S.push(Object.assign({ t: +t.toFixed(1) }, R[k].fn())); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 'ok'; })()`;
