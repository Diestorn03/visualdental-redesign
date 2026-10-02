// d1: capture the lab scene at given progress values via CDP. Windows/Git Bash: MSYS_NO_PATHCONV=1 SHOTS_DIR=C:/.../.shots/d1
// node tools/digital/shoot-scene.mjs [--port=9416] [--w=1600 --h=900] [--gpu] [--dpr=1] [--q="lite=1"] [--out=name] [--perf] p1 p2 ...
// --perf: after the shots, scrolls p 0→1 for 6 s and prints rAF frame-time stats (p50/p95/max) and renderer.info.
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const argv = process.argv.slice(2);
const flag = (k, d) => { const a = argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };
const PORT = +flag('port', 9416), W = +flag('w', 1600), H = +flag('h', 900), DPR = +flag('dpr', 1), OUT = (process.env.SHOTS_DIR || '.shots/d1').replaceAll(String.fromCharCode(92), '/') + '/';
mkdirSync(OUT, { recursive: true });
const ps = argv.filter((a) => !a.startsWith('--'));
const q = flag('q', '');
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', ...(flag('swift') ? ['--enable-unsafe-swiftshader'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization']), '--hide-scrollbars', '--remote-debugging-port=' + PORT, `--window-size=${W},${H}`, '--user-data-dir=' + OUT + 'profile-' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl; for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(250); try { wsUrl = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 500));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 500)); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:4416/lab/digital-scene/?hud=0&${q}` });
for (let i = 0; i < 80 && !(await ev('!!window.__set')); i++) await sleep(250);
console.log('gl:', await ev(`(() => { const c = document.createElement('canvas'); const g = c.getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()`));
for (const p of ps) {
  await ev(`window.__set(${p}, true)`); await sleep(+flag('settle', 1800));
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const f = `${OUT}${flag('out', 'scene')}-p${String(p).replace('.', '')}.png`; writeFileSync(f, Buffer.from(r.data, 'base64')); console.log('saved', f);
}
if (flag('perf')) {
  // 12 s with p sweeping 0→1 twice; stats over the whole run and over the last 5 s (after the adaptive pixel ratio settled)
  await ev('window.__live = true');
  const r = await ev(`new Promise((res) => { const t = [], late = []; let last = performance.now(), start = last; const st = (a) => { a = a.slice().sort((x, y) => x - y); const q = (x) => +a[Math.floor(a.length * x)].toFixed(1); return { n: a.length, p50: q(.5), p95: q(.95), p99: q(.99), max: +a[a.length - 1].toFixed(1), over20: a.filter((x) => x > 20).length }; };
    const f = (n) => { const d = n - last; last = n; const e = n - start; if (e > 100) { t.push(d); if (e > 7000) late.push(d); } window.__set((e / 6000) % 1); if (e < 12000) requestAnimationFrame(f); else res({ all: st(t), steady: st(late), pr: window.__scene.info().pr }); }; requestAnimationFrame(f); })`);
  console.log('perf', JSON.stringify(r));
}
console.log('errors:', errors.length ? '\n  ' + errors.join('\n  ') : 'none');
ws.close(); chrome.kill();
