import { fileURLToPath } from 'node:url';
// Responsive / runtime audit via Chrome DevTools Protocol.
// Usage: node tools/qa/audit.mjs <baseUrl> <outJson> [--vp=name,name] [--shots=dir] [--reduced] [--port=9444] [page paths...]
// Example: node tools/qa/audit.mjs http://127.0.0.1:4320 .shots/audit.json --vp=iphone-14,laptop-1366 / /404/
// Screenshots go to <project>/.shots/audit/ (SHOTS_DIR or --shots override).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const flags = Object.fromEntries(argv.filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const pos = argv.filter((a) => !a.startsWith('--'));
const [baseUrl, outFile, ...pagesArg] = pos;
const pages = pagesArg.length ? pagesArg : ['/', '/404/'];
const SHOTS = (flags.shots || (process.env.SHOTS_DIR ? process.env.SHOTS_DIR + '/audit' : fileURLToPath(new URL('../../.shots/audit/', import.meta.url)))).replaceAll(String.fromCharCode(92), '/') + '/';
mkdirSync(SHOTS, { recursive: true });
const ALL = [
  { name: 'tiny-320', w: 320, h: 568, mobile: true },
  { name: 'android-360', w: 360, h: 780, mobile: true },
  { name: 'iphone-se', w: 375, h: 667, mobile: true },
  { name: 'iphone-14', w: 390, h: 844, mobile: true },
  { name: 'iphone-pro-max', w: 430, h: 932, mobile: true },
  { name: 'tablet-768', w: 768, h: 1024, mobile: true },
  { name: 'ipad-pro-1024', w: 1024, h: 1366, mobile: true },
  { name: 'laptop-1280', w: 1280, h: 720, mobile: false },
  { name: 'laptop-1366', w: 1366, h: 768, mobile: false },
  { name: 'desktop-1536', w: 1536, h: 864, mobile: false },
  { name: 'desktop-1920', w: 1920, h: 1080, mobile: false },
  { name: 'ultrawide-2560', w: 2560, h: 1440, mobile: false },
];
const viewports = flags.vp ? ALL.filter((v) => flags.vp.split(',').includes(v.name)) : ALL;
const PORT = flags.port || 9444;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--hide-scrollbars', '--enable-unsafe-swiftshader', `--remote-debugging-port=${PORT}`, '--window-size=1366,820', '--user-data-dir=' + SHOTS + 'profile-' + PORT, 'about:blank'], { stdio: 'ignore' });
let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) { await sleep(250); try { const t = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); wsUrl = t.find((x) => x.type === 'page')?.webSocketDebuggerUrl; } catch {} }
if (!wsUrl) { console.error('chrome did not start'); process.exit(1); }
const ws = new WebSocket(wsUrl); await new Promise((r) => (ws.onopen = r));
let id = 0; const pending = new Map(); let consoleErrors = []; let netFailures = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).slice(0, 300));
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) consoleErrors.push(m.params.type.toUpperCase() + ' ' + m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300));
  if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) netFailures.push(`${m.params.response.status} ${m.params.response.url}`);
  if (m.method === 'Network.loadingFailed') netFailures.push(`FAIL ${m.params.errorText} ${m.params.requestId}`);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.error || r.result?.exceptionDetails) return { __error: JSON.stringify(r.error || r.result.exceptionDetails).slice(0, 300) }; return r.result?.result?.value; };

await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
if (flags.reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
await send('Page.addScriptToEvaluateOnNewDocument', { source: `
  window.__lcp = 0; window.__cls = 0; window.__longTasks = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { window.__longTasks += l.getEntries().length; }).observe({ type: 'longtask', buffered: true }); } catch {}
` });

const MEASURE = `(async () => {
  const vw = innerWidth, vh = innerHeight;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (el) => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '') + ' "' + (el.textContent || '').trim().slice(0, 40).replace(/\\s+/g, ' ') + '"');
  // horizontal overflow offenders (ignore elements clipped by an overflow-hidden/clip ancestor)
  const clipped = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const o = getComputedStyle(p); if (/(hidden|clip|auto|scroll)/.test(o.overflowX + o.overflow)) return true; } return false; };
  const overflow = [];
  for (const el of document.querySelectorAll('body *')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) overflow.push(label(el) + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']'); if (overflow.length >= 20) break; }
  // small text
  const small = []; const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) { const t = walker.currentNode; if (!t.textContent.trim()) continue; const el = t.parentElement; if (!vis(el)) continue; const fs = parseFloat(getComputedStyle(el).fontSize); if (fs < 12) { small.push(label(el) + ' ' + fs.toFixed(1) + 'px'); if (small.length >= 15) break; } }
  // tap targets
  const taps = []; for (const el of document.querySelectorAll('a, button, [role=button], input, select, textarea, summary')) { if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (r.width < 40 || r.height < 40) { if (el.closest('.marquee, [aria-hidden=true]')) continue; taps.push(label(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); if (taps.length >= 20) break; } }
  // images
  const imgs = []; let missingAlt = 0; for (const im of document.querySelectorAll('img')) { if (!im.hasAttribute('alt')) missingAlt++; const r = im.getBoundingClientRect(); if (im.naturalWidth && r.width > 0 && im.naturalWidth > r.width * devicePixelRatio * 2.2) imgs.push((im.getAttribute('src') || '').split('/').pop() + ' natural ' + im.naturalWidth + ' shown ' + Math.round(r.width)); }
  const broken = [...document.querySelectorAll('img')].filter((im) => im.complete && im.naturalWidth === 0).map((im) => im.getAttribute('src')).slice(0, 10);
  // stuck motion (after scrolling through the whole page every once-reveal should have fired)
  const stuck = []; for (const el of document.querySelectorAll('[data-reveal], [data-stagger] > *, [data-split], [data-lit]')) { const cs = getComputedStyle(el); if ((parseFloat(cs.opacity) < 0.05 || cs.visibility === 'hidden') && vis(el.parentElement || el)) { stuck.push(label(el)); if (stuck.length >= 15) break; } }
  // headings order / landmarks
  const hs = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((h) => h.tagName + ':' + (h.textContent || '').trim().slice(0, 30).replace(/\\s+/g, ' '));
  const h1s = document.querySelectorAll('h1').length;
  // focusable elements without visible name
  const unnamed = [...document.querySelectorAll('a, button')].filter((el) => vis(el) && !(el.textContent || '').trim() && !el.getAttribute('aria-label') && !el.querySelector('[aria-label], img[alt]')).map(label).slice(0, 10);
  return { vw, vh, dpr: devicePixelRatio, docH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, bodyScrollW: document.body.scrollWidth, hOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) > vw, overflow, small, taps, oversizedImgs: imgs, brokenImgs: broken, missingAlt, stuck, h1s, headings: hs.slice(0, 40), unnamed, lcp: Math.round(window.__lcp || 0), cls: +(window.__cls || 0).toFixed(4), longTasks: window.__longTasks || 0, title: document.title, canonical: document.querySelector('link[rel=canonical]')?.href, desc: document.querySelector('meta[name=description]')?.content?.slice(0, 80), reduced: matchMedia('(prefers-reduced-motion: reduce)').matches, coarse: matchMedia('(pointer: coarse)').matches, lenisActive: document.documentElement.classList.contains('lenis'), fontsLoaded: document.fonts?.status };
})()`;

const SCROLL_THROUGH = `(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += innerHeight * 0.7) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 140)); } window.scrollTo(0, h); await new Promise((r) => setTimeout(r, 600)); 'done'; })()`;
const FPS_TEST = `(async () => { const h = document.documentElement.scrollHeight - innerHeight; let frames = 0, worst = 0, last = performance.now(); const t0 = last; const tick = (t) => { frames++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 2500) requestAnimationFrame(tick); }; requestAnimationFrame(tick); const start = performance.now(); while (performance.now() - start < 2500) { const p = (performance.now() - start) / 2500; window.scrollTo(0, Math.min(h, p * h * 0.6)); await new Promise((r) => setTimeout(r, 16)); } await new Promise((r) => setTimeout(r, 100)); return { fps: +(frames / 2.5).toFixed(1), worstFrameMs: Math.round(worst) }; })()`;

const results = [];
for (const vp of viewports) {
  await send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: vp.mobile ? 2 : 1, mobile: vp.mobile });
  await send('Emulation.setTouchEmulationEnabled', { enabled: vp.mobile, maxTouchPoints: vp.mobile ? 5 : 0 });
  for (const path of pages) {
    consoleErrors = []; netFailures = [];
    const url = baseUrl.replace(/\/$/, '') + path;
    await send('Page.navigate', { url }); await sleep(3200);
    await evalJs(SCROLL_THROUGH);
    const fps = await evalJs(FPS_TEST);
    await evalJs(`window.scrollTo(0, 0); new Promise(r => setTimeout(r, 400))`);
    const m = await evalJs(MEASURE);
    const shotName = `${vp.name}_${path.replace(/[^a-z0-9]/gi, '_') || 'home'}.jpg`;
    try {
      const docH = Math.min(m?.docH || vp.h, 12000);
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 55, captureBeyondViewport: true, clip: { x: 0, y: 0, width: vp.w, height: docH, scale: vp.mobile ? 0.5 : 0.6 } });
      if (r.result?.data) writeFileSync(SHOTS + shotName, Buffer.from(r.result.data, 'base64'));
    } catch (e) { consoleErrors.push('SHOT ' + e.message); }
    results.push({ viewport: vp.name, w: vp.w, h: vp.h, mobile: vp.mobile, page: path, url, ...m, fps, consoleErrors: consoleErrors.slice(0, 15), netFailures: netFailures.slice(0, 15), screenshot: SHOTS + shotName });
    console.log(`${vp.name} ${path} docH=${m?.docH} hOverflow=${m?.hOverflow} overflow=${m?.overflow?.length} taps=${m?.taps?.length} stuck=${m?.stuck?.length} lcp=${m?.lcp} cls=${m?.cls} fps=${fps?.fps} errs=${consoleErrors.length} net=${netFailures.length}`);
  }
}
writeFileSync(outFile, JSON.stringify({ baseUrl, generated: 'see file mtime', results }, null, 2));
console.log('wrote', outFile, results.length, 'entries');
ws.close(); chrome.kill();
