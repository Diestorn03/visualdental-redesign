// d1: baseline rAF cadence of this headless Chrome (scene stopped) so scene numbers can be read against it.
import { spawn } from 'node:child_process';
const PORT = 9416, chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--remote-debugging-port=' + PORT, '--window-size=1600,900', '--user-data-dir=' + (process.env.SHOTS_DIR || '.shots/d1') + '/profile-base', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r)); let id = 0; const pend = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
await send('Page.navigate', { url: 'http://127.0.0.1:4416/lab/digital-scene/?hud=0' }); await sleep(3000);
await send('Runtime.evaluate', { expression: 'window.__scene.stop(), 1' });
const r = await send('Runtime.evaluate', { returnByValue: true, awaitPromise: true, expression: `new Promise((res) => { const t = []; let l = performance.now(), s = l; const f = (n) => { t.push(n - l); l = n; if (n - s < 3000) requestAnimationFrame(f); else { t.shift(); t.sort((a, b) => a - b); res({ n: t.length, p50: t[t.length >> 1], p95: t[Math.floor(t.length * .95)], max: t[t.length - 1] }); } }; requestAnimationFrame(f); })` });
console.log('idle rAF', JSON.stringify(r.result.value)); sock.close(); chrome.kill();
