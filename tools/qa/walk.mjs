import { fileURLToPath } from 'node:url';
// Full-page walk: scrolls the page top to bottom in viewport-sized steps, one screenshot per step, and logs per step which section is
// under the header, the header theme, the FAB and the menu state. Complements shoot.mjs (which only captures at fixed targets).
// Usage: node tools/qa/walk.mjs --port=94xx <desktop|mobile> [url] [--reduced] [--calm] [--w=1366 --h=820] [--step=0.85] [--wait=1100] [--eval=<expr>]
// Output: <project>/.shots/ (SHOTS_DIR overrides, absolute on Windows) as <port>-<m|d>[R][C]-<page>-w<NN>-<section>.png
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = (process.env.SHOTS_DIR || fileURLToPath(new URL('../../.shots/', import.meta.url))).replaceAll(String.fromCharCode(92), '/') + '/';
mkdirSync(OUT, { recursive: true });
const argvAll = process.argv.slice(2);
const flag = (k, d) => { const a = argvAll.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=').slice(1).join('=') : true) : d; };
const PORT = +flag('port', 9333);
const pos = argvAll.filter((a) => !a.startsWith('--'));
const [mode = 'desktop', ...rest] = pos;
const url = /^(https?|file):/.test(rest[0] || '') ? rest[0] : 'http://127.0.0.1:4321/';
const u = new URL(url);
const slug = (u.pathname.replace(/^\/+|\/+$/g, '').replace(/[^a-z0-9]+/gi, '-') || 'home') + (u.search ? '-' + u.search.replace(/[^a-z0-9]+/gi, '') : '');
const mobile = mode === 'mobile';
const tag = `${PORT}-${mode[0]}${flag('reduced') ? 'R' : ''}${flag('calm') ? 'C' : ''}-${slug}`;
const W = +flag('w', mobile ? 390 : 1366), H = +flag('h', mobile ? 844 : 820);
const STEP = +flag('step', 0.85), WAIT = +flag('wait', 1100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--enable-unsafe-swiftshader', '--hide-scrollbars', '--remote-debugging-port=' + PORT, `--window-size=${W},${H}`, '--user-data-dir=' + OUT + 'profile-' + PORT, 'about:blank'], { stdio: 'ignore' });
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
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
if (flag('reduced')) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
if (flag('calm')) await send('Page.addScriptToEvaluateOnNewDocument', { source: "try { localStorage.setItem('vd-calm', '1'); } catch (e) {}" });
await send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__cls = 0; try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {}" });
await send('Page.navigate', { url });
await sleep(+flag('wait0', 3000));

// what the page says about itself at the current scroll position
const PROBE = `(() => {
  const hdr = document.querySelector('[data-header]'), hh = hdr ? hdr.getBoundingClientRect().height : 0;
  const hit = document.elementsFromPoint(innerWidth / 2, Math.min(hh / 2, 36)).filter((e) => !hdr?.contains(e));
  const blocks = hit.map((e) => e.closest('[data-theme]')).filter(Boolean);
  const sec = hit.map((e) => e.closest('main > section[id], footer')).find(Boolean);
  const fab = document.querySelector('.fab, [data-fab]');
  const cur = document.querySelector('[data-header] [aria-current]');
  const h = document.documentElement;
  return { y: Math.round(scrollY), max: h.scrollHeight - innerHeight, sw: h.scrollWidth, cw: h.clientWidth, sec: sec ? (sec.id || sec.tagName.toLowerCase()) : '-', under: blocks[0]?.dataset.theme || '-', hdr: hdr?.dataset.theme || '-', hdrHidden: hdr ? hdr.getBoundingClientRect().bottom <= 0 : null, current: cur?.getAttribute('href') || null, fab: fab ? getComputedStyle(fab).visibility + '/' + (+getComputedStyle(fab).opacity).toFixed(1) : null, lenis: h.classList.contains('lenis'), cls: +(window.__cls || 0).toFixed(4) };
})()`;
const log = [];
let n = 0;
for (let y = 0, last = -1; ; ) {
  await evalJs(`window.scrollTo(0, ${y}); 0`);
  await sleep(WAIT);
  const p = await evalJs(PROBE);
  const name = `${String(n).padStart(2, '0')}-${p.sec}-y${p.y}`;
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${tag}-${name}.png`, Buffer.from(r.data, 'base64'));
  log.push({ n, ...p }); n++;
  if (p.y >= p.max - 1 || p.y === last) break;
  last = p.y;
  y = Math.min(p.y + Math.round(H * STEP), p.max);
}
if (flag('eval')) console.log('eval ->', JSON.stringify(await evalJs(flag('eval'))));
for (const l of log) console.log(JSON.stringify(l));
const mism = log.filter((l) => l.under !== '-' && l.hdr !== l.under && !l.hdrHidden);
console.log(`steps ${log.length} | overflow ${log.some((l) => l.sw > l.cw)} | header-theme mismatches ${mism.length}${mism.length ? ' @ y=' + mism.map((l) => l.y).join(',') : ''}`);
console.log('errors:', errors.length ? '\n  ' + errors.join('\n  ') : 'none');
ws.close(); chrome.kill();
