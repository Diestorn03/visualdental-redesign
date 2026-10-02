// d1: pointer-drag test. Drags on the canvas with a real (CDP) mouse and reports the camera position before/after + after idle decay.
import { spawn } from 'node:child_process';
const PORT = 9416, chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--remote-debugging-port=' + PORT, '--window-size=1000,640', '--user-data-dir=' + (process.env.SHOTS_DIR || '.shots/d1') + '/profile-int', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r)); let id = 0; const pend = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.exceptionDetails ? 'EXC ' + r.exceptionDetails.exception?.description : r.result?.value; };
await send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 640, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:4416/lab/digital-scene/?hud=0' });
for (let i = 0; i < 60 && !(await ev('!!window.__set')); i++) await sleep(200);
await ev('window.__set(0.5, true)'); await sleep(1200);
const cam = () => ev('(() => { const c = window.__scene._dbg.camera.position; return [c.x, c.y, c.z].map((v) => +v.toFixed(2)); })()');
console.log('before', await cam());
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 500, y: 320, button: 'left', clickCount: 1 });
for (let i = 1; i <= 12; i++) { await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 500 + i * 15, y: 320 + i * 4, button: 'left', buttons: 1 }); await sleep(16); }
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 680, y: 368, button: 'left', clickCount: 1 });
await sleep(400); console.log('after drag', await cam());
await sleep(5500); console.log('after 5.5 s idle (should drift back)', await cam());
console.log('wheel scrolls page:', await ev('(() => { const y0 = scrollY; return y0; })()'));
sock.close(); chrome.kill();
