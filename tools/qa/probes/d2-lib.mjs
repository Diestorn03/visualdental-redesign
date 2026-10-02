// d2 probe library: Chrome (GPU) driven over raw CDP, real wheel/mouse input, in-page frame recorder, trace analysis.
// Used by d2-*.mjs. Run from the project root. Git Bash: MSYS_NO_PATHCONV=1 and absolute Windows paths (C:/...).
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll('\\', '/');
export const OUT = ROOT + '.shots/diag/d2/';
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const arg = (k, d) => { const a = process.argv.slice(2).find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };

// In-page recorder, installed before any page script. Frames: flat [t, scrollY, ...] pairs from rAF; LoAF with script attribution and
// forced style/layout time; long tasks; layout shifts; event timing. Everything is read back with D.dump().
export const RECORDER = `(() => {
  if (window.__d2) return;
  const D = window.__d2 = { rec: false, frames: [], loaf: [], lt: [], ls: [], ev: [], t0: performance.now() };
  const loop = (t) => { if (D.rec) D.frames.push(t, scrollY); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  const obs = (type, fn, extra = {}) => { try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true, ...extra }); } catch (e) {} };
  obs('longtask', (e) => D.lt.push({ s: e.startTime, d: e.duration }));
  obs('long-animation-frame', (e) => D.loaf.push({ s: e.startTime, d: e.duration, bd: e.blockingDuration, rs: e.renderStart, sl: e.styleAndLayoutStart,
    scripts: e.scripts.map((c) => ({ u: (c.sourceURL || '').split('/').pop(), f: c.sourceFunctionName, l: c.sourceCharPosition, i: c.invoker, it: c.invokerType, d: c.duration, fl: c.forcedStyleAndLayoutDuration, p: c.pauseDuration })) }));
  obs('layout-shift', (e) => D.ls.push({ s: e.startTime, v: e.value, in: e.hadRecentInput, src: (e.sources || []).map((x) => (x.node ? (x.node.nodeName + '.' + String(x.node.className || '').slice(0, 30)) : '?') + ' ' + JSON.stringify([x.previousRect && Math.round(x.previousRect.y), x.currentRect && Math.round(x.currentRect.y)])) }));
  obs('event', (e) => D.ev.push({ s: e.startTime, n: e.name, d: e.duration, p: e.processingEnd - e.processingStart }), { durationThreshold: 16 });
  D.reset = () => { D.frames.length = 0; D.loaf.length = 0; D.lt.length = 0; D.ls.length = 0; D.ev.length = 0; };
})();`;

export async function launch({ port = 9402, w = 1366, h = 820, dpr = 1, profile = 'profile', gpu = true, url, cpu = 1, recorder = true, noBlur = false, extraArgs = [], reduced = false } = {}) {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); await sleep(250); } catch { break; } }
  const dir = OUT + profile + '-' + port;
  const args = [...(gpu ? ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--headless=new', '--enable-unsafe-swiftshader']),
    '--hide-scrollbars', '--remote-debugging-port=' + port, `--window-size=${w},${h}`, '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', ...extraArgs, 'about:blank'];
  const proc = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', args, { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
  if (!wsUrl) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const handlers = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); return; }
    if (m.method) (handlers.get(m.method) || []).forEach((f) => f(m.params));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const on = (method, f) => { if (!handlers.has(method)) handlers.set(method, []); handlers.get(method).push(f); };
  const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result?.value; };
  await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile: false });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (recorder) await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  if (noBlur) await send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';document.head.append(s);},{once:true});` });
  if (cpu > 1) await send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const close = async () => { try { ws.close(); } catch {} try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); await sleep(150); } catch { break; } } };
  const api = { send, ev, on, close, proc, w, h, port, dir };
  if (url) await goto(api, url);
  return api;
}

export async function goto(c, url, { settle = 3500, ready = true } = {}) {
  const loaded = new Promise((r) => { c.on('Page.loadEventFired', r); });
  await c.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(20000)]);
  if (ready) {
    for (let i = 0; i < 40; i++) { if (await c.ev(`document.documentElement.classList.contains('fx-booted')`)) break; await sleep(100); }
  }
  await sleep(settle);
}

// ---------- input ----------
// plan: [[atMs, deltaY], ...] relative to the call. Fire-and-forget at the scheduled time (not awaiting the CDP reply before the next one).
export async function playWheel(c, plan, { x = 683, y = 420 } = {}) {
  const t0 = performance.now();
  const ps = [];
  for (const [at, dy] of plan) {
    const wait = t0 + at - performance.now();
    if (wait > 3) await sleep(wait - 2);
    while (performance.now() < t0 + at) { /* spin the last ms */ }
    ps.push(c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy, modifiers: 0, pointerType: 'mouse' }));
  }
  await Promise.all(ps);
  return performance.now() - t0;
}
// Human-ish wheel profiles. Each returns a plan covering ~`px` pixels (sign gives direction).
export const profiles = {
  // a held-down mouse wheel spun steadily: 100 px notches every `gap` ms
  steady: (px, gap = 40) => { const n = Math.ceil(Math.abs(px) / 100), s = Math.sign(px) || 1; return Array.from({ length: n }, (_, i) => [i * gap, 100 * s]); },
  // short bursts of notches with a pause (reading) in between: 4 notches 30 ms apart, 600 ms pause
  bursts: (px, { per = 4, gap = 30, pause = 600 } = {}) => { const n = Math.ceil(Math.abs(px) / 100), s = Math.sign(px) || 1, out = []; let t = 0; for (let i = 0; i < n; i++) { out.push([t, 100 * s]); t += (i + 1) % per === 0 ? pause : gap; } return out; },
  // trackpad swipe: bell-shaped velocity, 120 Hz-ish events, ~700 ms swipe, then inertia tail, then a pause
  trackpad: (px, { swipe = 900, pause = 500 } = {}) => {
    const s = Math.sign(px) || 1, out = []; let left = Math.abs(px), t = 0;
    while (left > 0) {
      const ev = 56, step = swipe / ev; let tot = 0; const raw = [];
      for (let i = 0; i < ev; i++) { const u = i / (ev - 1); raw.push(Math.sin(Math.PI * Math.pow(u, 0.7)) ** 2 + 0.02); tot += raw[i]; }
      const peak = 900; // px per swipe
      for (let i = 0; i < ev && left > 0; i++) { const d = Math.max(1, Math.round((raw[i] / tot) * peak)); out.push([t + i * step, Math.min(d, left) * s]); left -= Math.min(d, left); }
      t += swipe + pause;
    }
    return out;
  },
  // a hard flick: 100 px every 16 ms
  flick: (px) => profiles.steady(px, 16),
};

export async function mouseMove(c, x, y, buttons = 0) { return c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, buttons, pointerType: 'mouse' }); }
// move along a path of [dtMs, x, y]; returns when done
export async function movePath(c, path) {
  const t0 = performance.now(); let ps = [];
  for (const [at, x, y] of path) { const wait = t0 + at - performance.now(); if (wait > 3) await sleep(wait - 2); ps.push(mouseMove(c, x, y)); }
  await Promise.all(ps);
}

// ---------- recorder read-back ----------
export async function frames(c) {
  const d = await c.ev(`JSON.stringify({ f: __d2.frames, loaf: __d2.loaf, lt: __d2.lt, ls: __d2.ls, ev: __d2.ev, now: performance.now() })`);
  return JSON.parse(d);
}
export function frameStats(flat, from = -Infinity, to = Infinity) {
  const t = [], y = [];
  for (let i = 0; i < flat.length; i += 2) if (flat[i] >= from && flat[i] <= to) { t.push(flat[i]); y.push(flat[i + 1]); }
  const dt = []; for (let i = 1; i < t.length; i++) dt.push(t[i] - t[i - 1]);
  const n = dt.length; if (!n) return { n: 0 };
  const s = [...dt].sort((a, b) => a - b), q = (p) => s[Math.min(n - 1, Math.floor(n * p))];
  const over = (ms) => dt.filter((d) => d > ms).length;
  // frames missed = round(dt/16.67)-1, summed
  const missed = dt.reduce((a, d) => a + Math.max(0, Math.round(d / 16.667) - 1), 0);
  const dy = []; for (let i = 1; i < y.length; i++) dy.push(y[i] - y[i - 1]);
  return { n, durMs: Math.round(t[t.length - 1] - t[0]), fps: +(n / ((t[t.length - 1] - t[0]) / 1000)).toFixed(1), p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), p99: +q(0.99).toFixed(1), worst: +s[n - 1].toFixed(1), over17: over(16.7 * 1.25), pct17: +(100 * over(16.7 * 1.25) / n).toFixed(1), over33: over(33.4), pct33: +(100 * over(33.4) / n).toFixed(1), over50: over(50), missed, y0: Math.round(y[0]), y1: Math.round(y[y.length - 1]), maxDy: Math.round(Math.max(...dy.map(Math.abs), 0)) };
}

// ---------- trace ----------
export const TRACE_CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'blink', 'blink.user_timing', 'cc', 'gpu', 'v8.execute', 'loading', 'benchmark', 'viz', 'latencyInfo'].join(',');
export async function traceStart(c, categories = TRACE_CATS) {
  c.__events = []; c.on('Tracing.dataCollected', (p) => c.__events.push(...p.value));
  await c.send('Tracing.start', { categories, transferMode: 'ReportEvents', bufferUsage: 0, traceConfig: undefined });
}
export async function traceStop(c) {
  const done = new Promise((r) => c.on('Tracing.tracingComplete', r));
  await c.send('Tracing.end'); await done;
  // the same event is delivered more than once when several of its categories are enabled: keep one
  const seen = new Set(), ev = [];
  for (const e of c.__events) { const k = e.ph + '|' + e.name + '|' + e.pid + '|' + e.tid + '|' + e.ts + '|' + (e.dur ?? '') + '|' + (e.id ?? e.id2?.local ?? ''); if (e.ph === 'M' || !seen.has(k)) { seen.add(k); ev.push(e); } }
  c.__events = [];
  return ev;
}
// Self-time per event name on one thread, restricted to [t0,t1] (µs). Nested 'X' events: self = dur - sum(children).
export function selfTimes(events, pred, t0, t1) {
  const xs = events.filter((e) => e.ph === 'X' && e.dur != null && pred(e) && e.ts + e.dur >= t0 && e.ts <= t1).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map(); const stack = [];
  const add = (n, d) => self.set(n, (self.get(n) || 0) + d);
  for (const e of xs) {
    while (stack.length && stack.at(-1).ts + stack.at(-1).dur <= e.ts) stack.pop();
    const clipped = Math.max(0, Math.min(e.ts + e.dur, t1) - Math.max(e.ts, t0));
    if (stack.length) stack.at(-1).childSum += clipped;
    stack.push({ ts: e.ts, dur: e.dur, name: e.name, childSum: 0, clipped });
    e.__node = stack.at(-1);
  }
  for (const e of xs) { const n = e.__node; add(e.name, Math.max(0, n.clipped - n.childSum)); }
  return self;
}
export function threadMap(events) {
  const names = new Map(), procs = new Map();
  for (const e of events) { if (e.ph !== 'M') continue; if (e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name); if (e.name === 'process_name') procs.set(e.pid, e.args.name); }
  return { names, procs };
}
export function save(name, obj) { writeFileSync(OUT + name, typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1)); }
export async function killPort(port) { /* Chrome is killed through proc.kill(); the astro server is stopped by the caller with PowerShell */ }

import { cpus } from 'node:os';
// whole-machine CPU use between start() and stop(): other processes (sibling agents, antivirus) are noise for every frame metric
export function cpuSampler() {
  const snap = () => cpus().reduce((a, c) => { const t = c.times; a.idle += t.idle; a.total += t.user + t.nice + t.sys + t.idle + t.irq; return a; }, { idle: 0, total: 0 });
  const a = snap();
  return () => { const b = snap(); return +(100 * (1 - (b.idle - a.idle) / (b.total - a.total))).toFixed(0); };
}

// Expose engine internals for diagnosis by rewriting the engine bundle IN FLIGHT (Fetch domain; nothing on disk changes):
// window.__G = { gsap, ST (ScrollTrigger), Split }, window.__lenis = the Lenis instance. Minified names are matched by shape, not position.
export async function exposeEngine(c) {
  await c.send('Fetch.enable', { patterns: [{ urlPattern: '*/_astro/engine*.js', requestStage: 'Response' }] });
  c.on('Fetch.requestPaused', async (p) => {
    try {
      const r = await c.send('Fetch.getResponseBody', { requestId: p.requestId });
      let body = r.base64Encoded ? Buffer.from(r.body, 'base64').toString('utf8') : r.body;
      const m1 = body.match(/([\w$]+)\.registerPlugin\(([\w$]+),([\w$]+),([\w$]+)\),\2\.config\(\{ignoreMobileResize:!0\}\);/);
      if (m1) body = body.replace(m1[0], m1[0] + `window.__G={gsap:${m1[1]},ST:${m1[2]},Split:${m1[3]}};`);
      const m2 = body.match(/([\w$]+)=new ([\w$]+)\(\{lerp:\.12,smoothWheel:!0\}\)/);
      if (m2) body = body.replace(m2[0], `window.__lenis=${m2[0]}`);
      await c.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: p.responseStatusCode || 200, responseHeaders: (p.responseHeaders || []).filter((h) => !/content-length|content-encoding/i.test(h.name)), body: Buffer.from(body, 'utf8').toString('base64') });
    } catch (e) { try { await c.send('Fetch.continueRequest', { requestId: p.requestId }); } catch {} }
  });
}
