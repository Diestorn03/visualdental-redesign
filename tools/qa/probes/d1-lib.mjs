// d1 probe library: Chrome over CDP (Node's native WebSocket), real input events, and the in-page scroll recorder.
// Used by tools/qa/probes/d1-*.mjs. No dependencies.
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll(String.fromCharCode(92), '/').replace(/\/$/, '');
export const OUT = (id) => { const d = `${ROOT}/.shots/diag/${id}`; mkdirSync(d, { recursive: true }); return d; };

export async function launch({ port = 9401, w = 1366, h = 820, profile, fresh = true, gpu = true, extra = [] } = {}) {
  if (fresh) { try { rmSync(profile, { recursive: true, force: true }); } catch {} }
  const args = ['--headless=new', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader']),
    '--remote-debugging-port=' + port, `--window-size=${w},${h}`, '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check', '--disable-extensions', ...extra, 'about:blank'];
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
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const close = async () => { try { ws.close(); } catch {} chrome.kill(); await sleep(300); };
  return { send, ev, on: (f) => listeners.push(f), errors, close, chrome, port };
}

// Real wheel input. Returns when the burst is done. dy list is [deltaY, waitMsAfter] pairs.
export async function wheelSeq(c, seq, x = 683, y = 450) {
  for (const [dy, wait] of seq) {
    await c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: dy });
    if (wait) await sleep(wait);
  }
}
export const move = (c, x, y) => c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });

// High-resolution wait loop (Windows timers are ~15 ms coarse unless asked for 1 ms): used by paced input generators.
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

// ---------------------------------------------------------------- in-page recorder (installed with Page.addScriptToEvaluateOnNewDocument)
// engineUrl: module URL of engine (/_astro/engine.<hash>.js), imported from the page so the SAME module instance gives us getLenis().
export const recorderSource = (engineUrl) => `(() => {
  if (window.__d1) return;
  const D = window.__d1 = { frames: [], tracked: [], refresh: [], ls: [], ro: [], long: [], loaf: [], marks: [], resize: [], animLog: [], anim: false, on: false, t0: performance.now(), notes: [] };
  const desc = (n) => { if (!n) return '?'; const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; return (e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')); };
  D.desc = desc;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) D.ls.push({ t: e.startTime, v: e.value, hri: e.hadRecentInput, src: (e.sources || []).map((s) => ({ n: desc(s.node), p: [s.previousRect.x, s.previousRect.y, s.previousRect.width, s.previousRect.height].map(Math.round), c: [s.currentRect.x, s.currentRect.y, s.currentRect.width, s.currentRect.height].map(Math.round) })) }); }).observe({ type: 'layout-shift', buffered: true }); } catch (e) { D.notes.push('no layout-shift ' + e); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) D.long.push({ t: e.startTime, d: e.duration }); }).observe({ type: 'longtask', buffered: true }); } catch (e) { D.notes.push('no longtask'); }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) D.loaf.push({ t: e.startTime, d: e.duration, blk: e.blockingDuration, rs: e.renderStart, sd: e.styleAndLayoutStart, scripts: (e.scripts || []).map((s) => ({ src: (s.sourceURL || '').split('/').pop().slice(0, 40), fn: s.sourceFunctionName, inv: s.invoker, dur: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration || 0) })) }); }).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) { D.notes.push('no loaf'); }
  addEventListener('resize', () => D.resize.push({ t: performance.now(), w: innerWidth, h: innerHeight }));

  // --- tracked elements ---
  const ready = () => document.querySelector('main') && document.querySelector('main > section[id]');
  const pickTracked = () => {
    const out = [];
    const add = (name, el) => { if (el) out.push({ name, el }); };
    add('body', document.body);
    add('main', document.querySelector('main'));
    document.querySelectorAll('main > section[id]').forEach((s) => {
      add('#' + s.id, s);
      add('#' + s.id + ' h1/h2', s.querySelector('h1, h2'));
      const kids = [...s.querySelectorAll(':scope > .container, :scope > div, :scope > .rc__stage')];
      const last = kids[kids.length - 1]; if (last) add('#' + s.id + ' last', last);
    });
    add('footer', document.querySelector('body > footer'));
    add('footer h2/fill', document.querySelector('footer [data-fill]'));
    add('header', document.querySelector('[data-header]'));
    // extra refs by selector
    for (const [n, sel] of D.extra || []) add(n, document.querySelector(sel));
    return out;
  };
  D.mutLog = [];
  try { new MutationObserver((list) => { const t = performance.now(); for (const m of list) { if (m.type !== 'attributes' || m.attributeName === 'style') continue; const el = m.target; const nv = el.getAttribute(m.attributeName); if (nv === m.oldValue) continue; D.mutLog.push([Math.round(t * 10) / 10, scrollY, desc(el), m.attributeName, (m.oldValue || '').slice(0, 60), (nv || '').slice(0, 60)]); } }).observe(document, { attributes: true, subtree: true, attributeOldValue: true }); } catch (e) { D.notes.push('mut ' + e); }
  D.start = (extra) => {
    D.extra = extra; D.frames = []; D.refresh = []; D.ro = []; D.on = true; D.t0 = performance.now();
    const T = pickTracked(); D.tracked = T.map((x) => x.name); D.els = T.map((x) => x.el);
    // ResizeObserver on body + each section: any height change is logged with who/when/how much
    const last = new Map();
    D.roObs?.disconnect();
    D.roObs = new ResizeObserver((entries) => { for (const e of entries) { const el = e.target; const h = e.contentRect.height; const k = D.els.indexOf(el); const p = last.get(el); if (p !== undefined && Math.abs(p - h) > 0.01) D.ro.push({ t: performance.now(), n: k >= 0 ? D.tracked[k] : desc(el), from: p, to: h, d: h - p, y: scrollY }); last.set(el, h); } });
    D.els.forEach((el) => { if (el) { last.set(el, el.getBoundingClientRect().height); D.roObs.observe(el); } });
    D.nextFrame();
  };
  const mc = new MessageChannel();
  mc.port1.onmessage = (m) => { if (!D.on) return; const rec = m.data; const y = scrollY; const lenis = D.getLenis?.();
    const row = [rec, performance.now(), y, lenis ? lenis.scroll : null, lenis ? lenis.targetScroll : null, document.documentElement.scrollHeight, lenis ? (lenis.velocity ?? null) : null];
    const els = D.els; for (let i = 0; i < els.length; i++) { const el = els[i]; if (!el) { row.push(null, null); continue; } const r = el.getBoundingClientRect(); row.push(r.top, r.height); }
    D.frames.push(row);
    if (D.anim && D.api) { try { const act = D.api.gsap.globalTimeline.getChildren(true, true, false).filter((t) => t.isActive() && !t.vars?.scrollTrigger?.scrub && t.scrollTrigger?.vars?.scrub == null).map((t) => { const e = t.targets()[0]; return e && e.nodeType === 1 ? desc(e) + (e.parentElement ? '@' + [...e.parentElement.children].indexOf(e) : '') : (t.targets()[0] === window ? 'window' : 'obj'); }); const key = [...new Set(act)].join(','); if (key !== D.lastAnim) { D.lastAnim = key; D.animLog.push([D.frames.length - 1, key]); } } catch (e) { D.notes.push('anim ' + e); } }
  };
  D.nextFrame = () => { if (!D.on) return; requestAnimationFrame((ts) => { mc.port2.postMessage(ts); D.nextFrame(); }); };
  D.stop = () => { D.on = false; };
  // --- engine hooks: lenis, gsap, ScrollTrigger ---
  import(${JSON.stringify(engineUrl)}).then((m) => {
    D.getLenis = m.t; D.env = m.r;
    m.n((api) => {
      D.api = api; const ST = api.ScrollTrigger;
      ST.addEventListener('refresh', () => D.refresh.push({ t: performance.now(), y: scrollY, sh: document.documentElement.scrollHeight, lenis: D.getLenis?.()?.scroll }));
      ST.addEventListener('refreshInit', () => D.refresh.push({ t: performance.now(), init: true, y: scrollY }));
    });
  }).catch((e) => D.notes.push('engine import failed ' + e));
})();`;

export async function install(c, engineUrl) {
  await c.send('Page.addScriptToEvaluateOnNewDocument', { source: recorderSource(engineUrl) });
}

export async function engineUrlOf(base) {
  // follow the module imports from the page scripts until the engine chunk shows up
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

export async function dump(c, name) {
  const d = await c.ev(`JSON.stringify({ frames: __d1.frames, tracked: __d1.tracked, refresh: __d1.refresh, ls: __d1.ls, ro: __d1.ro, long: __d1.long, loaf: __d1.loaf, resize: __d1.resize, notes: __d1.notes, animLog: __d1.animLog, mutLog: __d1.mutLog })`);
  return JSON.parse(d);
}

// ---------------------------------------------------------------- analysis helpers (Node side)
export function analyse(D, { label = '', y0 = 0 } = {}) {
  const F = D.frames; const n = D.tracked.length; const out = { label, frames: F.length };
  if (F.length < 3) return out;
  const ts = F.map((r) => r[0]); const dts = []; for (let i = 1; i < ts.length; i++) dts.push(ts[i] - ts[i - 1]);
  const sorted = [...dts].sort((a, b) => a - b); const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  out.dt = { med: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +sorted.at(-1).toFixed(1), over25: dts.filter((d) => d > 25).length, over33: dts.filter((d) => d > 33.4).length, over50: dts.filter((d) => d > 50).length };
  out.durationMs = +(ts.at(-1) - ts[0]).toFixed(0);
  return out;
}
export const save = (dir, name, obj) => writeFileSync(`${dir}/${name}.json`, JSON.stringify(obj));
