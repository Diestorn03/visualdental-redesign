import { fileURLToPath } from 'node:url';
// Trace scrolling through one section (real GPU, no throttle unless --cpu=N) and report where frame time goes.
// Usage: node tools/qa/perf-section.mjs <port> <url> <selector> [--w=1366 --h=768 --cpu=1]   (output dir: <project>/.shots/, SHOTS_DIR overrides)
import { spawn } from 'node:child_process';
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const [PORT, URL, SEL] = args.filter((a) => !a.startsWith('--'));
const W = +flag('w', 1366), H = +flag('h', 768), CPU = +flag('cpu', 1);
const OUT = (process.env.SHOTS_DIR || fileURLToPath(new URL('../../.shots/', import.meta.url))).replaceAll(String.fromCharCode(92), '/') + '/'; (await import('node:fs')).mkdirSync(OUT, { recursive: true });
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--hide-scrollbars', '--remote-debugging-port=' + PORT, `--window-size=${W},${H}`, '--user-data-dir=' + OUT + 'profile-' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); const events = []; let done;
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); return; } if (m.method === 'Tracing.dataCollected') events.push(...m.params.value); if (m.method === 'Tracing.tracingComplete') done(); };
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }))?.result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('DOM.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL }); await sleep(5000);
const range = await ev(`(() => { const el = document.querySelector(${JSON.stringify(SEL)}); const box = el.parentElement?.classList.contains('pin-spacer') ? el.parentElement : el; const r = box.getBoundingClientRect(); return [Math.max(0, Math.round(r.top + scrollY - innerHeight * 0.6)), Math.round(r.top + scrollY + box.offsetHeight - innerHeight * 0.4)]; })()`);
await ev(`scrollTo(0, ${range[0]}); 1`); await sleep(1500);
if (CPU > 1) await send('Emulation.setCPUThrottlingRate', { rate: CPU });
await send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReportEvents' });
const r = await ev(`(async () => { const [a, b] = [${range[0]}, ${range[1]}]; let n = 0, worst = 0, t0 = performance.now(), last = t0; for (let y = a; y <= b; y += 30) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); worst = Math.max(worst, t - last); last = t; n++; } return { n, ms: performance.now() - t0, worst }; })()`);
await sleep(400);
const fin = new Promise((res) => (done = res)); await send('Tracing.end'); await fin;
const tot = (name) => events.filter((e) => e.name === name && e.ph === 'X').reduce((a, e) => a + (e.dur || 0) / 1000, 0);
console.log(`${SEL} ${W}x${H} cpu=${CPU}: ${r.n} frames in ${r.ms.toFixed(0)}ms → ${(r.n / r.ms * 1000).toFixed(0)} fps, worst ${r.worst.toFixed(0)}ms`);
console.log('  ' + ['FunctionCall', 'FireAnimationFrame', 'UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'RasterTask', 'Layerize', 'Decode Image', 'ImageDecodeTask'].map((n) => `${n}=${tot(n).toFixed(0)}`).join(' '));
const byNode = {}; events.filter((e) => e.name === 'Paint').forEach((e) => { const k = e.args?.data?.nodeId; byNode[k] = (byNode[k] || 0) + (e.dur || 0) / 1000; });
await send('DOM.getDocument', { depth: -1 });
for (const [k, n] of Object.entries(byNode).sort((a, b) => b[1] - a[1]).slice(0, 5)) { let d = ''; try { const x = await send('DOM.describeNode', { backendNodeId: +k }); d = x?.node ? x.node.nodeName + ' ' + (x.node.attributes || []).join(' ').slice(0, 80) : '?'; } catch {} console.log('  paint', n.toFixed(0) + 'ms', d); }
const fns = {}; events.filter((e) => e.name === 'FunctionCall' && e.ph === 'X').forEach((e) => { const d = e.args?.data || {}; const k = (d.url || '').split('/').pop() + ':' + d.lineNumber + ' ' + (d.functionName || ''); fns[k] = (fns[k] || 0) + (e.dur || 0) / 1000; });
Object.entries(fns).sort((a, b) => b[1] - a[1]).slice(0, 4).forEach(([k, n]) => console.log('  js', n.toFixed(0) + 'ms', k.slice(0, 120)));
ws.close(); chrome.kill();
