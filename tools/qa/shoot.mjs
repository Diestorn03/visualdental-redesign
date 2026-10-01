import { fileURLToPath } from 'node:url';
// Tiny CDP driver: headless Chrome → navigate → scroll to targets → screenshots + console errors.
// Usage:
//   node tools/qa/shoot.mjs --port=94xx <desktop|mobile> [url] [targets...] [--reduced] [--calm] [--w=1280 --h=720] [--wait=2500]
//   --reduced emulates prefers-reduced-motion; --calm sets the footer "Reduce motion" switch (localStorage vd-calm). ?palette=mono works in the url.
// Targets:
//   "#id"        scroll so the element's top is at the top of the viewport
//   "#id!"       scroll so the element's bottom is at the bottom of the viewport
//   "#id@5"      pinned/scrubbed scene: 5 frames evenly across the element's whole scroll range (pin-spacer aware)
//   "js:<expr>"  evaluate an expression in the page (e.g. click a button), then wait 1.2 s
// Output: <project>/.shots/ (SHOTS_DIR overrides) as <port>-<m|d>[R]-<page>-<name>.png ; prints console errors / exceptions at the end.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const OUT = (process.env.SHOTS_DIR || fileURLToPath(new URL('../../.shots/', import.meta.url))).replaceAll(String.fromCharCode(92), '/') + '/'; (await import('node:fs')).mkdirSync(OUT, { recursive: true });
const argvAll = process.argv.slice(2);
const flag = (k, d) => { const a = argvAll.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };
const PORT = +flag('port', 9333);
const pos = argvAll.filter((a) => !a.startsWith('--'));
const [mode = 'desktop', ...targets] = pos;
const url = /^(https?|file):/.test(targets[0] || '') ? targets.shift() : 'http://127.0.0.1:4321/';
const u = new URL(url);
const slug = (u.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home') + (u.search ? '-' + u.search.replace(/[^a-z0-9]+/gi, '') : '');
const tag = `${PORT}-${mode[0]}${flag('reduced') ? 'R' : ''}${flag('calm') ? 'C' : ''}-${slug}`;
const mobile = mode === 'mobile';
const W = +flag('w', mobile ? 390 : 1366), H = +flag('h', mobile ? 844 : 820);
const WAIT = +flag('wait', 2500);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [...(flag('gpu') ? ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization'] : ['--headless=new', '--enable-unsafe-swiftshader']), '--hide-scrollbars', '--remote-debugging-port=' + PORT, `--window-size=${W},${H}`, '--user-data-dir=' + OUT + 'profile-' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
if (!wsUrl) { console.error('chrome did not start on port', PORT); process.exit(1); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const errors = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 400));
  if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) errors.push(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) errors.push(`HTTP ${m.params.response.status} ${m.params.response.url}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${OUT}${tag}-${name}.png`, Buffer.from(r.data, 'base64')); console.log('saved', `${OUT}${tag}-${name}.png`); };
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
if (flag('reduced')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (flag('calm')) await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vd-calm', '1'); } catch (e) {}" });
await send('Page.navigate', { url });
await sleep(WAIT);
await shot('00-top');
for (const t of targets) {
  if (t.startsWith('js:')) { console.log('js ->', JSON.stringify(await evalJs(t.slice(3)))?.slice(0, 4000)); await sleep(1200); continue; }
  const frames = t.includes('@') ? +t.split('@')[1] : 0;
  const end = t.endsWith('!');
  const sel = t.replace(/[!@].*$/, '');
  const name = sel.replace(/[^a-z0-9]/gi, '');
  if (frames) {
    const range = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; const box = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el; const r = box.getBoundingClientRect(); return { start: r.top + scrollY, end: r.top + scrollY + box.offsetHeight - innerHeight }; })()`);
    if (!range) { console.log('missing', sel); continue; }
    for (let i = 0; i < frames; i++) {
      const y = Math.round(range.start + ((range.end - range.start) * i) / Math.max(1, frames - 1));
      await evalJs(`window.scrollTo(0, ${y}); 'ok'`);
      await sleep(1400);
      await shot(`${name}-f${i + 1}of${frames}`);
    }
    continue;
  }
  const ok = await evalJs(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.scrollIntoView({ block: '${end ? 'end' : 'start'}' }); return true; })()`);
  if (!ok) { console.log('missing', sel); continue; }
  await sleep(2200);
  await shot(name + (end ? '-end' : ''));
}
console.log('errors:', errors.length ? '\n  ' + errors.join('\n  ') : 'none');
ws.close(); chrome.kill();
