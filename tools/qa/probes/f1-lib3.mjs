// d3 probe helper: headless Chrome (GPU) driven over CDP with REAL input events (mouseWheel / mouseMoved).
// Not for production. Used by d3-*.mjs. Output dir: .shots/f1/boot/ (profile in .shots/diag/d3/profile).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll('\\', '/');
export const OUT = ROOT + '.shots/f1/boot/';
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch({ port = 9411, w = 1366, h = 820, url, gpu = true, profile = 'profile', reduced = false, wait = 0, early = null, mobile = false, dpr = 1, instrument = false } = {}) {
  const dir = OUT + profile + '-' + port;
  try { rmSync(dir, { recursive: true, force: true }); } catch {}
  const args = ['--headless=new', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader']),
    '--hide-scrollbars', '--remote-debugging-port=' + port, `--window-size=${w},${h}`, '--user-data-dir=' + dir, '--no-first-run', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', 'about:blank'];
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', args, { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
  if (!wsUrl) throw new Error('chrome did not start');
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const events = []; const listeners = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); return; }
    events.push(m); listeners.forEach((l) => l(m));
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (instrument) { // expose gsap / ScrollTrigger / SplitText on window by patching the served engine chunk in flight (nothing on disk changes)
    listeners.push(async (m) => {
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params;
      try {
        let body = await (await fetch(request.url)).text();
        body = body.replace(/([\w$]+)\.registerPlugin\(([\w$]+),([\w$]+),([\w$]+)\),\2\.config\(\{ignoreMobileResize/, (all, g, st, sp, dr) => `(window.__gsap=${g},window.__ST=${st},window.__SplitText=${sp},${g}.registerPlugin(${st},${sp},${dr})),${st}.config({ignoreMobileResize`);
        body = body.replace(/([\w$]+)=new ([\w$]+)\(\{lerp:\.12,smoothWheel:!0\}\)/, (all, v, C) => `window.__lenis=${v}=new ${C}({lerp:.12,smoothWheel:!0,...(window.__lenisOpts||{})})`);
        await send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(body).toString('base64') });
      } catch (e) { try { await send('Fetch.continueRequest', { requestId }); } catch {} }
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*/_astro/engine.*.js', requestStage: 'Request' }] });
  }
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (early) await send('Page.addScriptToEvaluateOnNewDocument', { source: early });
  if (url) { await send('Page.navigate', { url }); if (wait) await sleep(wait); }

  const mouse = { x: Math.round(w / 2), y: Math.round(h / 2) };
  const wheel = (deltaY, x = mouse.x, y = mouse.y) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY });
  const move = (x, y, buttons = 0) => { mouse.x = x; mouse.y = y; return send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons }); };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(`${OUT}${name}.png`, Buffer.from(r.data, 'base64')); return `${OUT}${name}.png`; };
  const close = async () => { try { ws.close(); } catch {} try { chrome.kill(); } catch {} try { execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`, { stdio: 'ignore' }); } catch {} };
  return { send, ev, wheel, move, shot, close, sleep, events, listeners, mouse, chrome, ws };
}

// Page-side helpers injected via eval: finds ScrollTrigger through GSAP's global registry.
export const PAGE_ST = `(() => { const g = window.gsap || null; const ST = window.ScrollTrigger || g?.core?.globals?.().ScrollTrigger || null; return ST; })()`;
export const summarize = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, min: s[0], p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1], mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2) }; };

// ---- engine instrumentation in flight (dev server): appends a tail to the served /src/scripts/engine.js that exposes window.__vd and logs every refresh.
// Also stubs /@vite/client so another agent's edit cannot reload the page mid-run.
import { VITE_STUB } from './f1-lib.mjs';
export const TAIL_LITE = `
;(() => {
  const L = (window.__R = { refresh: [], sh: [] });
  window.__vd = { gsap, ScrollTrigger, SplitText, env, getLenis };
  let initT = 0;
  ScrollTrigger.addEventListener('refreshInit', () => { initT = performance.now(); });
  ScrollTrigger.addEventListener('refresh', () => L.refresh.push({ t: Math.round(performance.now()), dur: +(performance.now() - initT).toFixed(1), y: Math.round(scrollY), sh: document.documentElement.scrollHeight, lenis: getLenis()?.isScrolling || false, n: ScrollTrigger.getAll().length }));
})();`;
export async function instrument(b, { tail = TAIL_LITE } = {}) {
  b.listeners.push(async (m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    try {
      const body = request.url.includes('/@vite/client') ? VITE_STUB : (await (await fetch(request.url)).text()) + tail;
      await b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(body).toString('base64') });
    } catch (e) { try { await b.send('Fetch.continueRequest', { requestId }); } catch {} }
  });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/src/scripts/engine.js*', requestStage: 'Request' }, { urlPattern: '*/@vite/client*', requestStage: 'Request' }] });
}
