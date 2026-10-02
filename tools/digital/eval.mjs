// d1: open the lab page at progress p and evaluate an expression in it. node tools/digital/eval.mjs <p> "<js expr>" [--w= --h= --q=]
import { spawn } from 'node:child_process';
const argv = process.argv.slice(2), flag = (k, d) => (argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const pos = argv.filter((a) => !a.startsWith('--')), P = pos[0], EXPR = pos[1], W = +flag('w', 1000), H = +flag('h', 640), Q = flag('q', ''), DPR = +flag('dpr', 1);
const PORT = 9416, chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--remote-debugging-port=' + PORT, `--window-size=${W},${H}`, '--user-data-dir=' + (process.env.SHOTS_DIR || '.shots/d1') + '/profile-eval', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r)); let id = 0; const pend = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:4416/lab/digital-scene/?hud=0&' + Q });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? 'EXC ' + r.exceptionDetails.exception?.description : r.result?.value; };
for (let i = 0; i < 60 && !(await ev('!!window.__set')); i++) await sleep(200);
await ev(`window.__set(${P}, true)`); await sleep(1500);
console.log(JSON.stringify(await ev(EXPR)));
sock.close(); chrome.kill();
