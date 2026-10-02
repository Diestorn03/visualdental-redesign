// d4 shared CDP helpers (real input events). Usage from a probe:
//   import { launch, sleep } from './d4-lib.mjs';
//   const b = await launch({ port: 9404, w: 1366, h: 820, tag: 'a' });
//   await b.open('http://127.0.0.1:4404/');
// Env: SHOTS_DIR (Windows path with C:/...) for outputs, default <project>/.shots/diag/d4/
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const OUT = (process.env.SHOTS_DIR || fileURLToPath(new URL('../../../.shots/diag/d4/', import.meta.url))).replaceAll('\\', '/').replace(/\/?$/, '/');
mkdirSync(OUT, { recursive: true });

export async function launch({ port = 9404, w = 1366, h = 820, tag = 'x', gpu = true, extra = [] } = {}) {
  const profile = OUT + 'profile-' + tag;
  const args = ['--headless=new', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader']),
    '--remote-debugging-port=' + port, `--window-size=${w},${h}`, '--user-data-dir=' + profile, '--no-first-run', '--disable-features=Translate', ...extra, 'about:blank'];
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', args, { stdio: 'ignore' });
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
  if (!wsUrl) throw new Error('chrome did not start on ' + port);
  const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m.error); pending.delete(m.id); return; }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
    if (m.method === 'Runtime.consoleAPICalled' && ['error'].includes(m.params.type)) errors.push('ERR ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r?.result?.value; };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const api = {
    send, evalJs, errors, ws, chrome, W: w, H: h,
    async open(url, wait = 3500) { await send('Page.navigate', { url }); await sleep(wait); },
    async shot(name, clip) { const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }); const f = `${OUT}${name}.png`; writeFileSync(f, Buffer.from(r.data, 'base64')); return f; },
    move: (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' }),
    wheel: (x, y, deltaY, deltaX = 0) => send('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX, deltaY, button: 'none', pointerType: 'mouse' }),
    down: (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1, pointerType: 'mouse' }),
    up: (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1, pointerType: 'mouse' }),
    async click(x, y) { await api.move(x, y); await sleep(30); await api.down(x, y); await sleep(40); await api.up(x, y); },
    // human-ish wheel burst: n notches of `dy` px every `every` ms
    async burst(x, y, n, dy = 100, every = 30) { for (let i = 0; i < n; i++) { await api.wheel(x, y, dy); await sleep(every); } },
    // wheel until scrollY is within tol of target (closed loop, real wheel events), pointer at (x,y)
    async wheelTo(target, x = 683, y = 400, { tol = 40, every = 28, maxMs = 30000 } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < maxMs) {
        const cur = await evalJs('scrollY');
        const d = target - cur;
        if (Math.abs(d) <= tol) break;
        // do not overshoot: Lenis keeps interpolating after the last notch, so leave a lead
        const step = Math.sign(d) * Math.min(100, Math.max(20, Math.abs(d) * 0.35));
        await api.wheel(x, y, step); await sleep(every);
      }
      await sleep(900);
      return evalJs('scrollY');
    },
    async close() { try { ws.close(); } catch {} try { chrome.kill(); } catch {} },
  };
  return api;
}

// in-page recorder: per-rAF samples of scroll + the panel + header + pointer. start: __rec.start(); stop: __rec.stop() -> samples
export const RECORDER = `(() => {
  if (window.__rec) return 'already';
  const panel = document.querySelector('.svc__panel'), hdr = document.querySelector('[data-header]');
  const rows = [...document.querySelectorAll('.svc__row')];
  let on = false, samples = [], ptr = { x: -1, y: -1 }, pe = [];
  addEventListener('pointermove', (e) => { ptr = { x: e.clientX, y: e.clientY }; pe.push({ t: e.timeStamp, x: e.clientX, y: e.clientY }); }, { capture: true, passive: true });
  const tick = (t) => {
    if (on) {
      const r = panel ? panel.getBoundingClientRect() : null;
      const cs = panel ? getComputedStyle(panel) : null;
      const hr = hdr ? hdr.getBoundingClientRect() : null;
      samples.push({ t: +t.toFixed(2), y: +scrollY.toFixed(2), px: r ? +r.left.toFixed(2) : null, py: r ? +r.top.toFixed(2) : null, pw: r ? +r.width.toFixed(1) : null, ph: r ? +r.height.toFixed(1) : null,
        po: cs ? +(+cs.opacity).toFixed(3) : null, ptrx: ptr.x, ptry: ptr.y, act: rows.findIndex((x) => x.classList.contains('is-active')), hb: hr ? +hr.bottom.toFixed(1) : null });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__rec = { start() { samples = []; pe = []; on = true; }, stop() { on = false; return { samples, pe }; } };
  return 'ok';
})()`;

export const stats = (a) => { const s = [...a].sort((x, y) => x - y); const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))]; return { n: s.length, min: +s[0]?.toFixed(2), p50: +q(0.5)?.toFixed(2), p95: +q(0.95)?.toFixed(2), max: +s.at(-1)?.toFixed(2) }; };
