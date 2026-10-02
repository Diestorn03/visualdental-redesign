// v1 verifier library (ronda 1): Chrome over CDP + real input + per-frame recorder + invariant analysis.
// Adapted from d1-lib/d5-lib (read them first). Output goes to .shots/v1-r2/. No dependencies (Node native WebSocket).
//
// Invariants checked (all measured on the main thread, per rendered frame, via rAF -> MessageChannel):
//   I1  document.scrollHeight never changes after the scenario starts (0 changes)
//   I2  layout-shift entries with hadRecentInput=false and value > 0.001 (0 allowed)
//   I3  no ScrollTrigger refresh (refreshInit) while the page is moving (Lenis isScrolling, or a scroll event in the last 160 ms, or one in the next 160 ms)
//   I4  pinned / sticky elements (#process .rc__stage, #digital .dg__stage, #services .svc__panel, .faq__head): between contiguous frames the element
//       moves by dTop in [0, -dY] (rides the document or stands still, or a blend of both at the edge). "excess" = distance outside that interval; must be < 1 px.
//   I5  section doc-space tops (top + scrollY) stay constant (> 1 px = a layout jump)
//   I6  scroll position continuity: no frame whose scroll step is > 2.5x its neighbours (speed discontinuity), no backwards step in a downward run
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll(String.fromCharCode(92), '/').replace(/\/$/, '');
export const OUT = () => { const d = `${ROOT}/.shots/v1-r2`; mkdirSync(d + '/data', { recursive: true }); return d; };
export const arg = (k, d) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };

const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

export async function launch({ port = 9421, w = 1366, h = 820, dpr = 1, mobile = false, profile, fresh = true, extra = [] } = {}) {
  if (fresh) { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
  const args = ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
    '--remote-debugging-port=' + port, `--window-size=${w},${h}`, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...(mobile ? ['--hide-scrollbars'] : []), ...extra, 'about:blank'];
  const chrome = spawn(CHROME, args, { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
  if (!wsUrl) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const listeners = []; const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    for (const l of listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile, screenWidth: w, screenHeight: h });
  if (mobile) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: UA_MOBILE, userAgentMetadata: { platform: 'Android', platformVersion: '14', architecture: '', model: 'Pixel 8', mobile: true, brands: [{ brand: 'Chromium', version: '140' }, { brand: 'Google Chrome', version: '140' }], fullVersionList: [{ brand: 'Chromium', version: '140.0.0.0' }, { brand: 'Google Chrome', version: '140.0.0.0' }] } });
  }
  const close = async () => { try { ws.close(); } catch {} chrome.kill(); await sleep(300); };
  return { send, ev, on: (f) => listeners.push(f), errors, close, chrome, port, w, h, mobile };
}

export async function engineUrlOf(base) {
  const html = await (await fetch(base + '/')).text();
  const queue = [...html.matchAll(/\/_astro\/[\w.-]+\.js/g)].map((m) => m[0]); const seen = new Set();
  while (queue.length) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    if (/\/engine\.[\w-]+\.js$/.test(u)) return u;
    const js = await (await fetch(base + u)).text();
    for (const m of js.matchAll(/(?:from|import)\s*["']\.\/([\w.-]+\.js)["']/g)) queue.push('/_astro/' + m[1]);
  }
  throw new Error('engine chunk not found');
}

// ---------------------------------------------------------------- real input
export const wheel = (c, dy, x, y) => c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x ?? Math.round(c.w / 2), y: y ?? Math.round(c.h / 2), deltaX: 0, deltaY: dy });
export async function paced(totalMs, stepMs, fn) {
  const t0 = performance.now(); let n = 0;
  while (true) {
    const el = performance.now() - t0; if (el >= totalMs) break;
    await fn(n++, el);
    const next = t0 + n * stepMs; const d = next - performance.now();
    if (d > 2) await sleep(d - 1);
  }
  return n;
}
// Real touch drag/fling with explicit timestamps (Input.synthesizeScrollGesture is tried by the caller first; see v1-run).
export async function touchScroll(c, { dist = 500, speed = 900, dir = 'down', fling = true, x, y } = {}) {
  const x0 = x ?? Math.round(c.w / 2); const sign = dir === 'down' ? -1 : 1;
  const span = Math.min(dist, c.h * 0.75); const y0 = y ?? Math.round(dir === 'down' ? c.h * 0.85 : c.h * 0.2);
  const dur = Math.max(60, (span / speed) * 1000); const step = 16; const n = Math.max(3, Math.round(dur / step));
  const t0 = Date.now(); const ts = (ms) => (t0 + ms) / 1000;
  const prof = (u) => (fling ? u : 1 - (1 - u) * (1 - u));
  await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }], timestamp: ts(0) });
  for (let i = 1; i <= n; i++) {
    const wait = t0 + i * step - Date.now(); if (wait > 0) await sleep(wait);
    await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: Math.round(y0 + sign * span * prof(i / n)) }], timestamp: ts(i * step) });
  }
  if (!fling) await sleep(120);
  await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: ts(n * step + (fling ? 8 : 120)) });
}

// ---------------------------------------------------------------- in-page recorder
// Tracked elements (name, selector). SECT are document-space constants (I5); STICKY are checked with I4.
export const SECT = [['top', '#top'], ['about', '#about'], ['services', '#services'], ['digital', '#digital'], ['process', '#process'], ['education', '#education'], ['stories', '#stories'], ['faq', '#faq'], ['contact', '#contact'], ['footer', 'body > footer']];
export const STICKY = [['rc stage', '#process .rc__stage'], ['rc head', '#process .rc__head'], ['dg stage', '#digital .dg__stage'], ['dg vp', '#digital .dg__vp'], ['svc panel', '#services .svc__panel'], ['faq head', '#faq .faq__head']];
export const EXTRA = [['rc spacer', '#process .pin-spacer'], ['dg body', '#digital .dg__body'], ['svc lane', '#services .svc__lane']];
export const TRACK = [...SECT, ...STICKY, ...EXTRA];

export const recorderSource = (engineUrl) => `(() => {
  if (window.__v1) return;
  const TRACK = ${JSON.stringify(TRACK)};
  const D = window.__v1 = { frames: [], refresh: [], ls: [], ro: [], long: [], loaf: [], marks: [], inputs: [], scrollEv: [], notes: [], on: false, t0: performance.now(), pins: [], loadAt: null, dclAt: null };
  const desc = (n) => { if (!n) return '?'; const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''); };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) D.ls.push({ t: e.startTime, v: e.value, hri: e.hadRecentInput, src: (e.sources || []).map((s) => ({ n: desc(s.node), p: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), c: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) }); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { D.notes.push('no layout-shift'); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) D.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) D.loaf.push({ t: e.startTime, d: e.duration, blk: e.blockingDuration, scripts: (e.scripts || []).map((s) => ({ src: (s.sourceURL || '').split('/').pop().slice(0, 40), fn: s.sourceFunctionName, inv: s.invoker, dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration || 0) })) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  document.addEventListener('DOMContentLoaded', () => { D.dclAt = performance.now(); });
  addEventListener('load', () => { D.loadAt = performance.now(); });
  addEventListener('scroll', () => { D.scrollEv.push(performance.now()); }, { passive: true });
  ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown', 'click'].forEach((n) => addEventListener(n, () => { D.inputs.push([performance.now(), n]); }, { passive: true, capture: true }));
  const els = [];
  const pick = () => { els.length = 0; for (const [n, s] of TRACK) els.push(document.querySelector(s)); };
  D.pick = pick;
  D.start = () => {
    pick(); D.frames = []; D.on = true; D.t0 = performance.now(); D.ro = [];
    const last = new Map(); D.roObs?.disconnect();
    D.roObs = new ResizeObserver((entries) => { for (const e of entries) { const el = e.target; const h = e.contentRect.height; const p = last.get(el); const k = els.indexOf(el); if (p !== undefined && Math.abs(p - h) > 0.01) D.ro.push({ t: performance.now(), n: k >= 0 ? TRACK[k][0] : desc(el), from: p, to: h, y: scrollY }); last.set(el, h); } });
    [document.body, ...els].forEach((el) => { if (el) { last.set(el, el.getBoundingClientRect().height); D.roObs.observe(el); } });
    D.nextFrame();
  };
  const mc = new MessageChannel();
  mc.port1.onmessage = (m) => { if (!D.on) return; const L = D.getLenis?.();
    const row = [m.data, performance.now(), scrollY, L ? L.scroll : null, L ? L.targetScroll : null, document.documentElement.scrollHeight, L ? (L.isScrolling ? 1 : 0) : null, document.documentElement.scrollHeight];
    for (let i = 0; i < els.length; i++) { const el = els[i] && els[i].isConnected ? els[i] : (els[i] = document.querySelector(TRACK[i][1])); if (!el) { row.push(null, null); continue; } const r = el.getBoundingClientRect(); row.push(r.top, r.height); }
    D.frames.push(row); };
  D.nextFrame = () => { if (!D.on) return; requestAnimationFrame((ts) => { mc.port2.postMessage(ts); D.nextFrame(); }); };
  D.stop = () => { D.on = false; };
  D.pinInfo = () => { try { return D.api.ScrollTrigger.getAll().map((s) => ({ pin: !!s.pin, id: desc(s.trigger), start: s.start, end: s.end, scrub: !!s.vars.scrub })).filter((s) => s.pin); } catch (e) { return String(e); } };
  import(${JSON.stringify(engineUrl)}).then((m) => {
    D.getLenis = m.t; D.env = m.r;
    m.n((api) => {
      D.api = api; D.hookAt = performance.now(); D.hookState = document.readyState; const ST = api.ScrollTrigger;
      const snap = (init) => { const L = D.getLenis?.(); const t = performance.now(); const lastSc = D.scrollEv.length ? D.scrollEv[D.scrollEv.length - 1] : -1e9; return { t, init, y: scrollY, sh: document.documentElement.scrollHeight, ls: L ? L.isScrolling : null, vel: L ? L.velocity : null, sinceScroll: t - lastSc, nInputs: D.inputs.length }; };
      ST.addEventListener('refreshInit', () => D.refresh.push(snap(true)));
      ST.addEventListener('refresh', () => { const r = snap(false); r.pins = D.pinInfo(); D.refresh.push(r); });
    });
  }).catch((e) => D.notes.push('engine import failed ' + e));
})();`;

export async function install(c, engineUrl) { await c.send('Page.addScriptToEvaluateOnNewDocument', { source: recorderSource(engineUrl) }); }
export const dump = async (c) => JSON.parse(await c.ev(`JSON.stringify({ frames: __v1.frames, refresh: __v1.refresh, ls: __v1.ls, ro: __v1.ro, long: __v1.long, loaf: __v1.loaf, marks: __v1.marks, inputs: __v1.inputs, scrollEv: __v1.scrollEv, notes: __v1.notes, hookAt: __v1.hookAt, hookState: __v1.hookState, loadAt: __v1.loadAt, dclAt: __v1.dclAt, pins: __v1.pinInfo(), t0: __v1.t0 })`));
export const save = (name, obj) => writeFileSync(`${OUT()}/data/${name}.json`, JSON.stringify(obj));

// ---------------------------------------------------------------- analysis (Node side)
// frame row: [rafTs, now, y, lenis.scroll, lenis.target, scrollHeight, isScrolling, scrollHeight(dup), (top,height) x TRACK.length]
const BASE = 8;
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

export function analyse(D, { fromMark = 'scenario-start', toMark = 'scenario-end', down = null } = {}) {
  const m0 = D.marks.find((m) => m.n === fromMark)?.t ?? 0; const m1 = D.marks.find((m) => m.n === toMark)?.t ?? Infinity;
  const F = D.frames.filter((r) => r[1] >= m0 && r[1] <= m1);
  const out = { frames: F.length, fails: [] };
  if (F.length < 5) { out.fails.push('too few frames'); return out; }
  const T0 = F[0][1];
  // dt
  // frame interval = gap between samples (a stalled main thread then runs several queued rAF callbacks back to back: those near-zero gaps are not frames)
  const dts = []; for (let i = 1; i < F.length; i++) { const g = F[i][1] - F[i - 1][1]; if (g > 4) dts.push(g); }
  out.dt = { med: r1(q(dts, 0.5)), p95: r1(q(dts, 0.95)), max: r1(Math.max(...dts)), gt34: dts.filter((d) => d > 34).length, gt50: dts.filter((d) => d > 50).length, gt100: dts.filter((d) => d > 100).length };
  out.travel = r1(F.at(-1)[2] - F[0][2]); out.yMax = Math.max(...F.map((f) => f[2])); out.yMin = Math.min(...F.map((f) => f[2]));
  // I1 scrollHeight changes
  const sh = []; for (let i = 1; i < F.length; i++) if (Math.abs(F[i][5] - F[i - 1][5]) > 0.5) sh.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), from: F[i - 1][5], to: F[i][5] });
  out.scrollHeightChanges = sh; out.scrollHeightRange = [Math.min(...F.map((f) => f[5])), Math.max(...F.map((f) => f[5]))];
  // I2 layout shifts without input
  const ls = D.ls.filter((l) => l.t >= m0 && l.t <= m1 + 50);
  out.layoutShifts = ls.map((l) => ({ t: r1(l.t - T0), v: +l.v.toFixed(5), hri: l.hri, src: l.src.map((s) => `${s.n} ${s.p}->${s.c}`).join(' ; ') }));
  out.clsBad = ls.filter((l) => !l.hri && l.v > 0.001);
  // I3 refresh mid-scroll
  const rf = D.refresh.filter((r) => r.t >= m0 - 5 && r.t <= m1 + 400);
  out.refresh = rf.map((r) => ({ t: r1(r.t - T0), init: !!r.init, y: r1(r.y), sh: r.sh, lenisScrolling: r.ls, sinceScroll: r1(r.sinceScroll) }));
  out.refreshMid = [];
  for (const r of rf) {
    if (!r.init) continue;
    const userBefore = D.inputs.some(([t, n]) => (n === 'wheel' || n === 'touchmove' || n === 'keydown') && t <= r.t && r.t - t < 400);
    const userDuring = D.inputs.some(([t, n]) => (n === 'wheel' || n === 'touchmove') && t > r.t && t - r.t < 60); // input landing right behind the refresh = it was moving
    const next = D.scrollEv.find((t) => t > r.t); const nextGap = next ? next - r.t : Infinity; const wheelNear = userBefore || userDuring;
    // moving = Lenis animating, or a scroll event in the last 160 ms that a wheel/touch/key caused. Scrolls that restore() makes by itself after the load are not the reader.
    const moving = r.ls === true || (r.sinceScroll < 160 && userBefore) || userDuring;
    if (moving) out.refreshMid.push({ t: r1(r.t - T0), y: r1(r.y), lenisScrolling: r.ls, sinceScroll: r1(r.sinceScroll), nextScrollGap: r1(nextGap), wheelNear });
  }
  // I4 sticky/pinned excess (dTop outside [0, -dY])
  out.sticky = {};
  const names = [...SECT, ...STICKY, ...EXTRA].map((x) => x[0]);
  const ix = (n) => names.indexOf(n);
  for (const [name] of STICKY) {
    const k = ix(name); const rows = [];
    let seen = 0, maxEx = 0, bad = [];
    for (let i = 1; i < F.length; i++) {
      const a = F[i - 1][BASE + 2 * k], b = F[i][BASE + 2 * k]; if (a == null || b == null) continue; seen++;
      const dy = F[i][2] - F[i - 1][2]; const dTop = b - a;
      // allowed interval for dTop: between 0 and -dy (inclusive), 1 px slack
      const lo = Math.min(0, -dy) - 1, hi = Math.max(0, -dy) + 1;
      const ex = dTop < lo ? lo - dTop : dTop > hi ? dTop - hi : 0;
      if (ex > maxEx) maxEx = ex;
      if (ex >= 1) bad.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), dy: r1(dy), dTop: r1(dTop), excess: r1(ex), dt: r1(F[i][0] - F[i - 1][0]) });
    }
    // how much of the run the element was actually stuck (|dTop| ~ 0 while |dy| > 1) - evidence the check exercised the pinned state
    let stuck = 0; for (let i = 1; i < F.length; i++) { const a = F[i - 1][BASE + 2 * k], b = F[i][BASE + 2 * k]; if (a != null && b != null && Math.abs(b - a) < 0.3 && Math.abs(F[i][2] - F[i - 1][2]) > 1) stuck++; }
    out.sticky[name] = { framesSeen: seen, stuckFrames: stuck, maxExcess: r1(maxEx), bad: bad.slice(0, 8), nBad: bad.length };
  }
  // I5 section doc-space tops
  out.sectionShifts = [];
  for (const [name] of SECT) {
    const k = ix(name); let prev = null;
    for (let i = 0; i < F.length; i++) { const t = F[i][BASE + 2 * k]; if (t == null) continue; const d = t + F[i][2]; if (prev != null && Math.abs(d - prev) > 1.2) out.sectionShifts.push({ name, t: r1(F[i][1] - T0), y: r1(F[i][2]), d: r1(d - prev) }); prev = d; }
  }
  // height changes of sections (RO)
  out.roChanges = D.ro.filter((r) => r.t >= m0 && r.t <= m1).map((r) => ({ t: r1(r.t - T0), n: r.n, from: r1(r.from), to: r1(r.to), y: r1(r.y) }));
  // I6 scroll continuity. Lenis present: model check. Lenis integrates animatedScroll toward targetScroll with damp(lambda = lerp*60 = 7.2 /s) and its clock step is capped
  // at 34 ms (engine.js MAX_DT), so one frame can move at most (1 - exp(-7.2 * dt)) of the remaining distance. A frame that moves MORE than that (+2 px) was not Lenis
  // (a scrollTo from elsewhere, scroll anchoring, a restore, a native smooth scroll). I7: |scrollY - lenis.scroll| must stay < 2 px (the page shows what Lenis computed).
  // No Lenis (touch / native): neighbour test on the committed scroll (frame step > 3x the median of its 6 neighbours and > 80 px).
  const jumps = [], back = [], div = []; let maxDiv = 0;
  for (let i = 1; i < F.length; i++) {
    const dy = F[i][2] - F[i - 1][2]; const dt = F[i][1] - F[i - 1][1];
    if (F[i][3] != null && F[i - 1][3] != null) {
      const dl = F[i][3] - F[i - 1][3]; const dtE = Math.min(F[i][1] - F[i - 1][1] + 6, 34.5) / 1000; const frac = 1 - Math.exp(-7.2 * dtE);
      const maxMove = Math.abs(F[i][4] - F[i - 1][3]) * frac * 1.5 + 3;
      /* frames after a stall are the stall's catch-up (I8), not a separate jump */ if (Math.abs(dl) > maxMove && F[i][6] === 1 && F[i][1] - F[i - 1][1] < 45) jumps.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), dLenis: r1(dl), maxMove: r1(maxMove), dt: r1(dt) });
      const dv = Math.abs(F[i][2] - F[i][3]); if (dv > maxDiv) maxDiv = dv; if (dv > 2) div.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), lenis: r1(F[i][3]), diff: r1(F[i][2] - F[i][3]) });
    }
  }
  if (F[0][3] == null) {
    const rate = []; for (let i = 1; i < F.length; i++) rate.push({ dy: F[i][2] - F[i - 1][2], dt: F[i][0] - F[i - 1][0], t: F[i][1] - T0, y: F[i][2] });
    for (let i = 3; i < rate.length - 3; i++) {
      const nb = [rate[i - 3], rate[i - 2], rate[i - 1], rate[i + 1], rate[i + 2], rate[i + 3]].map((r) => Math.abs(r.dy)).sort((x, y) => x - y); const med = (nb[2] + nb[3]) / 2;
      if (Math.abs(rate[i].dy) > 80 && Math.abs(rate[i].dy) > 3 * Math.max(med, 10) && rate[i].dt < 40) jumps.push({ t: r1(rate[i].t), y: r1(rate[i].y), dy: r1(rate[i].dy), dt: r1(rate[i].dt), nbr: r1(med) });
    }
  }
  for (let i = 1; i < F.length; i++) { const dy = F[i][2] - F[i - 1][2]; if (down === true && dy < -0.6) back.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), dy: r1(dy) }); if (down === false && dy > 0.6) back.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), dy: r1(dy) }); }
  out.scrollJumps = jumps; out.scrollReversals = back; out.lenisDivergence = { max: r1(maxDiv), n: div.length, first: div.slice(0, 4) };
  // stalls with the section under the viewport top (doc-space section tops come from the same frame)
  out.stalls = [];
  for (let i = 1; i < F.length; i++) { const g = F[i][1] - F[i - 1][1]; if (g > 60) { let sec = '?'; for (let k = 0; k < SECT.length; k++) { const t = F[i][BASE + 2 * k]; if (t != null && t + F[i][2] <= F[i][2] + 120) sec = SECT[k][0]; } out.stalls.push({ t: r1(F[i][1] - T0), y: r1(F[i][2]), gap: r1(g), sec }); } }
  out.longTasks = D.long.filter((l) => l.t >= m0 && l.t <= m1).map((l) => r1(l.d));
  out.loaf = D.loaf.filter((l) => l.t >= m0 && l.t <= m1 && l.d >= 100).map((l) => ({ t: r1(l.t - T0), d: r1(l.d), scripts: l.scripts.filter((s) => s.dur >= 30).map((s) => `${s.src}:${s.fn || s.inv}:${s.dur}ms`).join(',') }));
  return out;
}

// verdict: strict pass/fail from the invariants
export function verdict(a, { allowFirstSecondsCls = false } = {}) {
  const f = [];
  if (a.scrollHeightChanges?.length) f.push(`I1 scrollHeight changed ${a.scrollHeightChanges.length}x: ${a.scrollHeightChanges.slice(0, 4).map((s) => `t=${s.t} y=${s.y} ${s.from}->${s.to}`).join(' | ')}`);
  if (a.clsBad?.length) f.push(`I2 ${a.clsBad.length} layout-shift(s) > 0.001 without input: ${a.clsBad.slice(0, 3).map((l) => `t=${r1(l.t)} v=${l.v} ${l.src.map((s) => `${s.n} ${s.p}->${s.c}`).join(';').slice(0, 160)}`).join(' | ')}`);
  if (a.refreshMid?.length) f.push(`I3 ${a.refreshMid.length} ScrollTrigger refresh mid-scroll: ${JSON.stringify(a.refreshMid.slice(0, 3))}`);
  for (const [n, s] of Object.entries(a.sticky || {})) if (s.nBad) f.push(`I4 ${n}: ${s.nBad} frames with excess >= 1px (max ${s.maxExcess}): ${JSON.stringify(s.bad.slice(0, 3))}`);
  if (a.sectionShifts?.length) f.push(`I5 section shifts: ${JSON.stringify(a.sectionShifts.slice(0, 4))}`);
  if (a.scrollJumps?.length) f.push(`I6 ${a.scrollJumps.length} frames moved more than Lenis allows (or native jumps): ${JSON.stringify(a.scrollJumps.slice(0, 3))}`);
  if (a.lenisDivergence?.n) f.push(`I7 |scrollY - lenis.scroll| > 2px in ${a.lenisDivergence.n} frames (max ${a.lenisDivergence.max}): ${JSON.stringify(a.lenisDivergence.first)}`);
  if (a.scrollReversals?.length) f.push(`I6 ${a.scrollReversals.length} scroll reversals: ${JSON.stringify(a.scrollReversals.slice(0, 3))}`);
  if (a.dt?.gt100) f.push(`I8 STALL ${a.dt.gt100} frames > 100 ms (max ${a.dt.max} ms, ${a.dt.gt50} > 50 ms): ${JSON.stringify((a.loaf || []).slice(0, 4))}`);
  return f;
}
