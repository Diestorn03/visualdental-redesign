// v2 verifier library: Chrome (GPU) over raw CDP, real wheel input, in-page frame recorder (from d2-lib), frame statistics per section.
// Output dir: .shots/d1/v/. Run from the project root. Git Bash: MSYS_NO_PATHCONV=1 and C:/... paths.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RECORDER, playWheel, profiles, frames, traceStart, traceStop, threadMap, selfTimes, cpuSampler } from './d2-lib.mjs';
export { RECORDER, playWheel, profiles, frames, traceStart, traceStop, threadMap, selfTimes, cpuSampler };

export const ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replaceAll('\\', '/');
export const OUT = ROOT + '.shots/d1/v/';
mkdirSync(OUT, { recursive: true });
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const arg = (k, d) => { const a = process.argv.slice(2).find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };
export const save = (name, obj) => writeFileSync(OUT + name, typeof obj === 'string' ? obj : JSON.stringify(obj));

// profileDir: absolute dir for --user-data-dir. fresh=true wipes it first (cold GPU shader cache); false keeps it (warm).
export async function launch({ port = 9422, w = 1366, h = 820, dpr = 1, profileDir, fresh = false, gpu = true, reduced = false, recorder = true, mobile = false } = {}) {
  for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); await sleep(250); } catch { break; } }
  if (fresh) { try { rmSync(profileDir, { recursive: true, force: true }); } catch {} }
  const args = ['--headless=new', ...(gpu ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--enable-unsafe-swiftshader']),
    '--hide-scrollbars', '--remote-debugging-port=' + port, `--window-size=${w},${h}`, '--user-data-dir=' + profileDir, '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', 'about:blank'];
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
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dpr, mobile });
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (recorder) await send('Page.addScriptToEvaluateOnNewDocument', { source: RECORDER });
  const errors = [];
  on('Runtime.exceptionThrown', (p) => errors.push('EXC ' + (p.exceptionDetails.exception?.description || p.exceptionDetails.text).slice(0, 200)));
  on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error' || p.type === 'warning') errors.push(p.type.toUpperCase() + ' ' + p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)); });
  const close = async () => { try { ws.close(); } catch {} try { spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {} for (let i = 0; i < 40; i++) { try { await fetch(`http://127.0.0.1:${port}/json/version`); await sleep(150); } catch { break; } } };
  return { send, ev, on, close, proc, w, h, port, errors };
}

export async function goto(c, url, { settle = 2500 } = {}) {
  const loaded = new Promise((r) => c.on('Page.loadEventFired', r));
  await c.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(20000)]);
  for (let i = 0; i < 60; i++) { if (await c.ev(`document.documentElement.classList.contains('fx-booted')`)) break; await sleep(100); }
  await sleep(settle);
}

export const geom = (c) => c.ev(`(() => ({ vh: innerHeight, vw: innerWidth, docH: document.documentElement.scrollHeight, secs: [...document.querySelectorAll('main > section[id], body > footer')].map((s) => { const r = s.getBoundingClientRect(); return { id: s.id || 'footer', top: Math.round(r.top + scrollY), h: Math.round(r.height) }; }) }))()`);
export const secOf = (g, y) => { const m = y + g.vh / 2; let cur = g.secs[0]; for (const s of g.secs) if (m >= s.top) cur = s; return cur.id; };
export const visible = (g, id, y) => { const s = g.secs.find((x) => x.id === id); return !!s && y + g.vh > s.top && y < s.top + s.h; };

export const q = (s, p) => s[Math.min(s.length - 1, Math.floor(s.length * p))];
// flat = [t0,y0,t1,y1,...]. idx = optional list of frame indexes to keep (dt is taken against the PREVIOUS frame, always).
export function stats(dt) {
  const n = dt.length; if (!n) return { n: 0 };
  const s = [...dt].sort((a, b) => a - b);
  const over = (ms) => dt.filter((d) => d > ms).length;
  return { n, p50: +q(s, 0.5).toFixed(1), p95: +q(s, 0.95).toFixed(1), p99: +q(s, 0.99).toFixed(1), max: +s[n - 1].toFixed(1), o25: over(25), pct25: +(100 * over(25) / n).toFixed(1), o33: over(33), o50: over(50), o100: over(100), jank: Math.round(dt.reduce((a, d) => a + Math.max(0, d - 16.7), 0)) };
}
// Frame series: [{t, y, dt, active}]. A frame is "active" (the page is being scrolled) if scrollY changed within +-3 frames of it.
export function series(flat) {
  const F = []; for (let i = 0; i < flat.length; i += 2) F.push({ t: flat[i], y: flat[i + 1], dt: i ? flat[i] - flat[i - 2] : 0, active: false });
  const mv = F.map((f, i) => (i && Math.abs(f.y - F[i - 1].y) > 0.05 ? 1 : 0));
  for (let i = 0; i < F.length; i++) for (let k = -3; k <= 3; k++) if (mv[i + k]) { F[i].active = true; break; }
  return F.slice(1);
}
