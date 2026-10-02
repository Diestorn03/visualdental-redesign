// d1: interleaved A/B cost probe (robust to other processes sharing the GPU). Each case toggles something on the live scene;
// blocks of frames alternate base / case, each frame = renderNow + readPixels (forces GPU completion). Prints median ms per config.
// node tools/digital/ab.mjs [p=0.5] [--dpr=1] [--q=lite=1] [--w=1600 --h=900]
import { spawn } from 'node:child_process';
const argv = process.argv.slice(2), flag = (k, d) => (argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=').slice(1).join('=');
const P = +(argv.find((a) => !a.startsWith('--')) ?? 0.5), DPR = +flag('dpr', 1), W = +flag('w', 1600), H = +flag('h', 900), Q = flag('q', '');
const PORT = 9416, chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--remote-debugging-port=' + PORT, `--window-size=${W},${H}`, '--user-data-dir=' + (process.env.SHOTS_DIR || '.shots/d1') + '/profile-ab', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); let ws;
for (let i = 0; i < 60 && !ws; i++) { await sleep(250); try { ws = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const sock = new WebSocket(ws); await new Promise((r) => (sock.onopen = r)); let id = 0; const pend = new Map();
sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); sock.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) console.log('EXC', r.exceptionDetails.exception?.description?.slice(0, 300)); return r.result?.value; };
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
await send('Page.navigate', { url: 'http://127.0.0.1:4416/lab/digital-scene/?hud=0&' + Q });
for (let i = 0; i < 60 && !(await ev('!!window.__set')); i++) await sleep(200); await sleep(1500);
await ev(`window.__set(${P}, true)`); await sleep(1200);
const cases = JSON.parse(process.env.AB_CASES || 'null') || [
  ['no gizmo', 'D.gz.visible=false', 'D.gz.visible=true'],
  ['no env', 'D.scene.environment=null', 'D.scene.environment=D.env'],
  ['no bg tex', 'D.scene.background=null', 'D.scene.background=D.bg'],
  ['no gum', 'D.gum.visible=false', 'D.gum.visible=true'],
  ['no bone', 'D.bone.visible=false', 'D.bone.visible=true'],
  ['no grid/shadow', 'D.grid.visible=false;D.shadow.visible=false', 'D.grid.visible=true;D.shadow.visible=true'],
  ['no model at all', 'D.model.visible=false', 'D.model.visible=true'],
  ['nothing (clear only)', 'D.model.visible=false;D.gz.visible=false', 'D.model.visible=true;D.gz.visible=true'],
];
const res = await ev(`(() => { const sc = window.__scene, D = sc._dbg, gl = D.renderer.getContext(), px = new Uint8Array(4); D.env = D.scene.environment; D.bg = D.scene.background; sc.stop();
  const cases = ${JSON.stringify(cases)}; const blocks = { base: [] }; cases.forEach((c) => (blocks[c[0]] = []));
  const run = () => { const t = []; for (let i = 0; i < 14; i++) { const a = performance.now(); sc.renderNow(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t.push(performance.now() - a); } t.splice(0, 3); t.sort((a, b) => a - b); return t[t.length >> 1]; };
  for (let r = 0; r < 8; r++) { blocks.base.push(run()); for (const [n, on, off] of cases) { eval(on); blocks[n].push(run()); eval(off); } }
  const med = (a) => { a = a.slice().sort((x, y) => x - y); return +a[a.length >> 1].toFixed(2); }, mn = (a) => +Math.min(...a).toFixed(2);
  return Object.fromEntries(Object.entries(blocks).map(([k, v]) => [k, 'med ' + med(v) + '  min ' + mn(v)])); })()`);
console.log(`p=${P} dpr=${DPR} ${W}x${H} ${Q}`); for (const [k, v] of Object.entries(res || {})) console.log(k.padEnd(22), v);
sock.close(); chrome.kill();
