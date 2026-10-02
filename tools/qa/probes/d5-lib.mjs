// d5 shared CDP harness: launches Chrome (GPU, headless=new), emulates desktop/mobile/tablet, injects a per-frame recorder
// (scrollY, scrollHeight, section tops, layout-shift, LoAF, class changes, mq changes, SplitText create/revert) that survives reloads
// (chunks are pushed through a Runtime binding and merged on the Node side), and offers real-input helpers (touch gestures, wheel).
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

export const CDP_PORT = +(process.env.D5_CDP || 9405);
export const BASE = process.env.D5_URL || 'http://127.0.0.1:4405/';
export const OUT = 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/diag/d5/';
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DEVICES = {
  desktop: { w: 1366, h: 820, dsf: 1, mobile: false, touch: false },
  mobile: { w: 390, h: 844, dsf: 3, mobile: true, touch: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36' },
  tablet: { w: 768, h: 1024, dsf: 2, mobile: true, touch: true, ua: 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36' },
};

/* ------------------------------------------------------------------ recorder injected in every document */
const RECORDER = String.raw`(() => {
  if (window.__rec) return;
  const origin = performance.timeOrigin;
  const R = (window.__rec = { id: Math.random().toString(36).slice(2, 8), frames: [], ev: [], cls: [], loaf: [], lt: [], sent: { frames: 0, ev: 0, cls: 0, loaf: 0, lt: 0 } });
  const abs = (t) => Math.round((origin + t) * 100) / 100;
  const SEC = ['top', 'about', 'services', 'process', 'education', 'stories', 'faq', 'contact'];
  R.sec = SEC.concat(['footer']);
  const el = {};
  const get = (k, sel) => (el[k] && el[k].isConnected ? el[k] : (el[k] = document.querySelector(sel)));
  const desc = (n) => { try { if (!n) return '?'; if (n.nodeType === 3) return '#text(' + (n.textContent || '').trim().slice(0, 24) + ')'; return n.tagName.toLowerCase() + (n.id ? '#' + n.id : '') + (n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/).slice(0, 3).join('.') : '') + ' "' + (n.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 24) + '"'; } catch (e) { return '?'; } };
  const ev = (type, extra) => R.ev.push(Object.assign({ T: abs(performance.now()), y: Math.round(scrollY * 10) / 10, type }, extra));
  R.ev0 = ev;
  ev('doc-start', { w: innerWidth, h: innerHeight });
  // per frame
  let last = performance.now();
  let splitEls = [];
  const splitH = new Map();
  const frame = (t) => {
    const d = document.documentElement;
    const f = [abs(t), Math.round((t - last) * 10) / 10, scrollY, d.scrollHeight, innerHeight, visualViewport ? visualViewport.height : 0];
    last = t;
    if (window.__recLite) { for (let k = 0; k < 9; k++) f.push(-1); R.frames.push(f); requestAnimationFrame(frame); return; }
    for (const id of SEC) { const s = get('s' + id, '#' + id); f.push(s ? Math.round((s.getBoundingClientRect().top + scrollY) * 100) / 100 : -1); }
    const ft = get('sfooter', 'body > footer'); f.push(ft ? Math.round((ft.getBoundingClientRect().top + scrollY) * 100) / 100 : -1);
    R.frames.push(f);
    // data-split / data-lit heights (layout box, to see the revert)
    if (!splitEls.length || (R.frames.length % 120 === 0)) splitEls = [...document.querySelectorAll('[data-split]')];
    for (const s of splitEls) {
      const r = s.getBoundingClientRect(); const h = Math.round(r.height * 100) / 100; const top = Math.round((r.top + scrollY) * 100) / 100;
      const prev = splitH.get(s); const hasSplit = !!s.querySelector('.split-line, .split-word, .split-line-mask, .split-word-mask');
      if (!prev || prev.h !== h || prev.top !== top || prev.sp !== hasSplit) { ev('split-h', { el: desc(s).slice(0, 60), h, prevH: prev ? prev.h : null, top, prevTop: prev ? prev.top : null, split: hasSplit, prevSplit: prev ? prev.sp : null }); splitH.set(s, { h, top, sp: hasSplit }); }
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  // layout shifts + long animation frames + long tasks
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => R.cls.push({ T: abs(e.startTime), v: e.value, input: e.hadRecentInput, y: scrollY, src: (e.sources || []).map((s) => ({ n: desc(s.node), p: s.previousRect && [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), c: s.currentRect && [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) }))).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => R.loaf.push({ T: abs(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), rs: Math.round(e.renderStart - e.startTime), sl: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), scripts: (e.scripts || []).map((s) => ({ f: (s.sourceURL || '').split('/').pop() + ':' + (s.sourceFunctionName || s.invoker || ''), d: Math.round(s.duration), inv: s.invokerType })) }))).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => R.lt.push({ T: abs(e.startTime), dur: Math.round(e.duration) }))).observe({ type: 'longtask', buffered: true }); } catch (e) {}
  // class / state changes
  const watchAttr = (key, sel, fn) => { const t = () => { const n = document.querySelector(sel); if (!n) return setTimeout(t, 100); let prev = fn(n); new MutationObserver(() => { const c = fn(n); if (c !== prev) { ev(key, { from: prev, to: c }); prev = c; } }).observe(n, { attributes: true, attributeFilter: ['class', 'data-theme', 'open'] }); }; t(); };
  document.addEventListener('DOMContentLoaded', () => {
    watchAttr('html-class', 'html', (n) => n.className);
    watchAttr('hdr', '[data-header]', (n) => n.className.replace(/\s+/g, ' ') + '|' + n.dataset.theme);
    watchAttr('fab', '[data-fab]', (n) => n.className.replace(/\s+/g, ' ') + '|' + n.dataset.theme);
    // SplitText create / revert
    new MutationObserver((ms) => { for (const m of ms) { for (const n of m.addedNodes) if (n.nodeType === 1 && /split-(line|word)-mask|split-(line|word)/.test(n.className || '')) { ev('split-add', { p: desc(m.target).slice(0, 50) }); return; } for (const n of m.removedNodes) if (n.nodeType === 1 && /split-(line|word)-mask|split-(line|word)/.test(n.className || '')) { ev('split-rm', { p: desc(m.target).slice(0, 50) }); return; } } }).observe(document.body, { childList: true, subtree: true });
    document.addEventListener('vd:ready', () => ev('vd:ready'));
    document.addEventListener('toggle', (e) => { if (e.target.matches && e.target.matches('details')) ev('details-toggle', { open: e.target.open, q: e.target.textContent.trim().slice(0, 30) }); }, true);
  });
  const hookST = () => { if (!window.__ST) return setTimeout(hookST, 20); window.__ST.addEventListener('refresh', () => ev('st-refresh', { n: window.__ST.getAll().length })); window.__ST.addEventListener('refreshInit', () => ev('st-refreshInit')); };
  hookST();
  addEventListener('resize', () => ev('resize', { w: innerWidth, h: innerHeight, vv: visualViewport ? Math.round(visualViewport.height) : 0 }));
  ['(min-width: 768px) and (pointer: fine)', '(prefers-reduced-motion: reduce)', '(pointer: coarse)', '(hover: hover)'].forEach((q) => { const m = matchMedia(q); m.addEventListener('change', () => ev('mq-change', { q, matches: m.matches })); });
  addEventListener('scroll', () => { R.scrollEvents = (R.scrollEvents || 0) + 1; }, { passive: true });
  ['touchstart', 'touchend', 'touchcancel', 'wheel', 'keydown', 'pointerdown'].forEach((n) => addEventListener(n, () => { R.lastInput = abs(performance.now()); R.lastInputType = n; }, { passive: true, capture: true }));
  addEventListener('beforeunload', () => ev('beforeunload'));
  // push unsent data to the Node side
  const flush = () => {
    const msg = { doc: R.id, origin };
    for (const k of ['frames', 'ev', 'cls', 'loaf', 'lt']) { msg[k] = R[k].slice(R.sent[k]); R.sent[k] = R[k].length; }
    try { window.vdrec(JSON.stringify(msg)); } catch (e) {}
  };
  R.flush = flush;
  setInterval(flush, 250);
  addEventListener('pagehide', () => { ev('pagehide'); flush(); });
})();`;

/* ------------------------------------------------------------------ browser session */
export async function launch(name, { lite = false, device = 'desktop', mode = 'normal', hideScrollbars = false, gpu = true, w, h, url = BASE, wait = 3000, noNav = false } = {}) {
  const dev = DEVICES[device];
  const W = w || dev.w, H = h || dev.h;
  const profile = OUT + 'profile/' + name;
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
  mkdirSync(profile, { recursive: true });
  const args = ['--headless=new', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader']),
    ...(hideScrollbars ? ['--hide-scrollbars'] : []), '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    `--remote-debugging-port=${CDP_PORT}`, `--window-size=${W},${H}`, `--user-data-dir=${profile}`, 'about:blank'];
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', args, { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
  if (!wsUrl) { chrome.kill(); throw new Error('chrome did not start'); }
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map();
  const S = { chrome, ws, rec: { frames: [], ev: [], cls: [], loaf: [], lt: [], docs: [] }, nav: [], errors: [], listeners: [], W, H, device, mode };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method === 'Runtime.bindingCalled' && m.params.name === 'vdrec') {
      const d = JSON.parse(m.params.payload);
      let di = S.rec.docs.indexOf(d.doc); if (di < 0) { S.rec.docs.push(d.doc); di = S.rec.docs.length - 1; }
      for (const f of d.frames) S.rec.frames.push([di, ...f]);
      for (const k of ['ev', 'cls', 'loaf', 'lt']) for (const x of d[k]) S.rec[k].push({ doc: di, ...x });
    }
    if (m.method === 'Page.frameNavigated' && !m.params.frame.parentId) S.nav.push({ T: Date.now(), url: m.params.frame.url, type: 'navigated' });
    if (m.method === 'Runtime.exceptionThrown') S.errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) S.errors.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    for (const l of S.listeners) l(m);
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  S.send = send;
  S.eval = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Runtime.addBinding', { name: 'vdrec' });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: (lite ? 'window.__recLite = true;' : '') + RECORDER });
  S.metrics = async (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dev.dsf, mobile: dev.mobile, screenWidth: width, screenHeight: height });
  await S.metrics(W, H);
  if (dev.touch) { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); await send('Emulation.setEmitTouchEventsForMouse', { enabled: false }); }
  if (dev.ua) await send('Emulation.setUserAgentOverride', { userAgent: dev.ua, userAgentMetadata: { platform: 'Android', platformVersion: '14', architecture: '', model: 'Pixel 8', mobile: true, brands: [{ brand: 'Chromium', version: '140' }, { brand: 'Google Chrome', version: '140' }], fullVersionList: [{ brand: 'Chromium', version: '140.0.0.0' }, { brand: 'Google Chrome', version: '140.0.0.0' }] } });
  if (mode === 'reduced') await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (mode === 'calm') await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vd-calm','1'); } catch (e) {}" });
  // expose gsap / ScrollTrigger (module-scoped in the bundle) as window.__gsap / window.__ST by patching the engine chunk in flight (Fetch domain); the files on disk are untouched
  await send('Fetch.enable', { patterns: [{ urlPattern: '*/_astro/engine.*.js', requestStage: 'Response' }] });
  S.listeners.push(async (m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, responseStatusCode, responseHeaders } = m.params;
    try {
      const b = await send('Fetch.getResponseBody', { requestId });
      let body = b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body;
      const before = body.length;
      body = body.replace(/(\w+)\.registerPlugin\((\$),(\w+),(\w+)\),\$\.config\(\{ignoreMobileResize:!0\}\);/, (all, g, st) => all + `window.__gsap=${g};window.__ST=${st};`);
      if (body.length === before) S.errors.push('PATCH-MISS engine chunk (window.__ST not exposed)');
      await send('Fetch.fulfillRequest', { requestId, responseCode: responseStatusCode, responseHeaders: (responseHeaders || []).filter((h) => h.name.toLowerCase() !== 'content-length'), body: Buffer.from(body, 'utf8').toString('base64') });
    } catch (e) { S.errors.push('fetch-patch ' + e.message); try { await send('Fetch.continueRequest', { requestId }); } catch {} }
  });
  S.close = () => { try { ws.close(); } catch {} try { chrome.kill(); } catch {} };
  if (!noNav) { await send('Page.navigate', { url }); await sleep(wait); }
  return S;
}

/* ------------------------------------------------------------------ real input */
// scroll with a REAL touch gesture (Input.dispatchTouchEvent with explicit timestamps; synthesizeScrollGesture does nothing in this headless build).
// dir 'down' = finger moves up. speed px/s (average finger speed). fling=true: the finger lifts while still moving, so Chrome starts inertia from the
// release velocity; fling=false: the finger decelerates to rest before lifting (a drag, no inertia).
export async function touchScroll(S, { dist = 400, speed = 800, dir = 'down', fling = false, x, y } = {}) {
  const x0 = x ?? Math.round(S.W / 2);
  const sign = dir === 'down' ? -1 : 1;
  const span = Math.min(dist, S.H * 0.7);
  const y0 = y ?? Math.round(dir === 'down' ? S.H * 0.82 : S.H * 0.25);
  const dur = Math.max(60, (span / speed) * 1000);
  const step = 16;
  const n = Math.max(3, Math.round(dur / step));
  const t0 = Date.now();
  const ts = (ms) => (t0 + ms) / 1000;
  const prof = (u) => (fling ? u : 1 - (1 - u) * (1 - u)); // fling: constant velocity to the end; drag: ease-out to rest
  await S.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }], timestamp: ts(0) });
  for (let i = 1; i <= n; i++) {
    const target = t0 + i * step; const wait = target - Date.now(); if (wait > 0) await sleep(wait);
    await S.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0, y: Math.round(y0 + sign * span * prof(i / n)) }], timestamp: ts(i * step) });
  }
  if (!fling) await sleep(120);
  await S.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: ts(n * step + (fling ? 8 : 120)) });
  return { span, dur };
}
export async function wheel(S, { dy = 100, x, y, dx = 0 } = {}) {
  return S.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: x ?? Math.round(S.W / 2), y: y ?? Math.round(S.H / 2), deltaX: dx, deltaY: dy, pointerType: 'mouse' });
}
export const mouseMove = (S, x, y) => S.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, pointerType: 'mouse' });
export async function waitSettled(S, { quiet = 350, max = 6000 } = {}) {
  let last = await S.eval('scrollY'), t0 = Date.now(), q0 = Date.now();
  while (Date.now() - t0 < max) { await sleep(60); const y = await S.eval('scrollY'); if (Math.abs(y - last) > 0.5) { last = y; q0 = Date.now(); } else if (Date.now() - q0 > quiet) break; }
  return last;
}
export const info = (S) => S.eval(`(() => ({ y: scrollY, h: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight, cls: document.documentElement.className, mq: { wide: matchMedia('(min-width: 768px) and (pointer: fine)').matches, coarse: matchMedia('(pointer: coarse)').matches, fine: matchMedia('(pointer: fine)').matches, hover: matchMedia('(hover: hover)').matches, reduced: matchMedia('(prefers-reduced-motion: reduce)').matches }, lenis: !!document.documentElement.classList.contains('lenis'), maxTouch: navigator.maxTouchPoints, ua: navigator.userAgent.slice(0, 60), dpr: devicePixelRatio, gsap: typeof window.gsap }))()`);
export async function pullRec(S) { try { await S.eval('window.__rec && window.__rec.flush()'); } catch {} await sleep(300); return S.rec; }

/* ------------------------------------------------------------------ analysis */
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0; };
// frame row: [doc, T, dt, y, h, ih, vvh, top, about, services, process, education, stories, faq, contact, footer]
export function analyze(rec, { from = 0, to = Infinity, minJump = 40 } = {}) {
  const SEC = ['top', 'about', 'services', 'process', 'education', 'stories', 'faq', 'contact', 'footer'];
  const fr = rec.frames.filter((f) => f[1] >= from && f[1] <= to);
  const out = { frames: fr.length };
  const dts = fr.filter((f) => f[2] > 0 && f[2] < 1000).map((f) => f[2]);
  out.dt = { med: med(dts), p95: pct(dts, 0.95), p99: pct(dts, 0.99), max: Math.max(0, ...dts), gt25: dts.filter((d) => d > 25).length, gt34: dts.filter((d) => d > 34).length, gt50: dts.filter((d) => d > 50).length, gt100: dts.filter((d) => d > 100).length };
  // scroll anomalies
  const jumps = [], shifts = [], hchg = [];
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i]; if (a[0] !== b[0]) continue;
    const dy = b[3] - a[3];
    // prior window median speed
    const win = []; for (let k = Math.max(1, i - 8); k < i; k++) if (fr[k][0] === b[0]) win.push(Math.abs(fr[k][3] - fr[k - 1][3]));
    const m = med(win);
    if (Math.abs(dy) >= minJump && Math.abs(dy) > 4 * Math.max(m, 4)) jumps.push({ T: b[1], dy: +dy.toFixed(1), prevMed: +m.toFixed(1), y: b[3], dt: b[2] });
    if (b[4] !== a[4]) hchg.push({ T: b[1], from: a[4], to: b[4], d: +(b[4] - a[4]).toFixed(1), y: b[3] });
    for (let s = 0; s < SEC.length; s++) { const d = b[7 + s] - a[7 + s]; if (a[7 + s] >= 0 && b[7 + s] >= 0 && Math.abs(d) > 0.6) shifts.push({ T: b[1], sec: SEC[s], d: +d.toFixed(2), y: b[3], dy: +dy.toFixed(1) }); }
  }
  out.scrollJumps = jumps; out.docHeightChanges = hchg; out.sectionShifts = shifts;
  out.cls = rec.cls.filter((c) => c.T >= from && c.T <= to);
  out.clsTotal = +out.cls.reduce((s, c) => s + (c.input ? 0 : c.v), 0).toFixed(4);
  out.loaf = rec.loaf.filter((c) => c.T >= from && c.T <= to && c.dur >= 50);
  out.lt = rec.lt.filter((c) => c.T >= from && c.T <= to);
  return out;
}
export const save = (name, obj) => { writeFileSync(OUT + name, JSON.stringify(obj, null, 1)); console.log('saved', OUT + name); };
export const rel = (T, T0) => Math.round(T - T0);
export const secAt = async (S) => S.eval(`(() => { const ids=['top','about','services','process','education','stories','faq','contact']; let cur='?'; for (const id of ids) { const s=document.getElementById(id); if (s && s.getBoundingClientRect().top<=innerHeight*0.4) cur=id; } return cur; })()`);

/* ------------------------------------------------------------------ tracing (compositor pipeline attribution) */
export async function traceStart(S, cats = 'devtools.timeline,cc,viz,gpu,input,benchmark,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline') {
  S.traceEvents = [];
  S.listeners.push((m) => { if (m.method === 'Tracing.dataCollected') S.traceEvents.push(...m.params.value); });
  await S.send('Tracing.start', { traceConfig: { includedCategories: cats.split(','), recordMode: 'recordAsMuchAsPossible' }, transferMode: 'ReportEvents' });
}
export async function traceStop(S) {
  const done = new Promise((res) => S.listeners.push((m) => { if (m.method === 'Tracing.tracingComplete') res(); }));
  await S.send('Tracing.end'); await done;
  return S.traceEvents;
}
// PipelineReporter frames: duration + per-stage durations + state. returns [{ts, dur(ms), state, stages:{name:ms}, mainAnim, compAnim}]
export function pipelineFrames(events) {
  const open = new Map(), frames = [];
  const key = (e) => (e.id2 ? e.id2.local || e.id2.global : e.id) + ':' + e.pid;
  const kids = new Map();
  for (const e of events) {
    if (e.cat && /cc|viz|benchmark/.test(e.cat) === false) continue;
    if (e.ph !== 'b' && e.ph !== 'e' && e.ph !== 'n') continue;
    const k = key(e);
    if (e.name === 'PipelineReporter') {
      if (e.ph === 'b') open.set(k, { ts: e.ts, args: e.args?.chrome_frame_reporter || {}, stages: {} });
      else if (e.ph === 'e' && open.has(k)) { const o = open.get(k); open.delete(k); frames.push({ ts: o.ts, dur: (e.ts - o.ts) / 1000, state: o.args.state, scrollThread: o.args.scroll_state || o.args.scrolling_thread, mainAnim: o.args.has_main_animation, compAnim: o.args.has_compositor_animation, smoothMain: o.args.has_smooth_input_main, missing: o.args.has_missing_content, reason: o.args.reason, stages: o.stages }); }
    } else if (open.has(k) && (e.ph === 'b' || e.ph === 'e')) {
      const o = open.get(k); const sk = e.name;
      if (e.ph === 'b') (kids.set(k + sk, e.ts)); else if (kids.has(k + sk)) { o.stages[sk] = (o.stages[sk] || 0) + (e.ts - kids.get(k + sk)) / 1000; kids.delete(k + sk); }
    }
  }
  return frames.sort((a, b) => a.ts - b.ts);
}
