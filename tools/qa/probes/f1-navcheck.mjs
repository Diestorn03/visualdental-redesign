// f1-navcheck: behaviour checks for the long-jump skip in engine.scrollToTarget (desktop Lenis, wheel during the wait, supersede, numeric target,
// native smooth path at 390 px, reduced motion). node tools/qa/probes/f1-navcheck.mjs
process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f1/nav/';
import { rmSync } from 'node:fs';
import { VITE_STUB } from './f1-lib.mjs';
const d4 = await import('./d4-lib.mjs');
const { sleep, OUT } = d4;
const BASE = 'http://127.0.0.1:4411/', PORT = 9411;
const J = JSON.stringify;
async function open(tag, { w = 1366, h = 820, reduced = false } = {}) {
  try { rmSync(OUT + 'profile-' + tag, { recursive: true, force: true }); } catch {}
  const b = await d4.launch({ port: PORT, w, h, tag });
  b.ws.addEventListener('message', async (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused') return;
    try { await b.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(VITE_STUB).toString('base64') }); } catch {} });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] });
  if (reduced) await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.open(BASE, 5000);
  return b;
}
const top = (b, id) => b.evalJs(`Math.round(document.getElementById(${J(id)}).getBoundingClientRect().top)`);
const res = {};
// 1. desktop
let b = await open('nc1');
const nav = (id) => b.evalJs(`(() => { const a = document.querySelector('.hdr__nav a[data-nav="${id}"]'); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
let n = await nav('faq'); await b.move(...n); await sleep(200); await b.down(...n); await b.up(...n); await sleep(4500);
res.desktopFaqTop = await top(b, 'faq');                       // 0 = flush under the header
// wheel during the wait cancels the glide
await b.evalJs(`scrollTo(0, 0)`); await sleep(1500);
await b.evalJs(`document.querySelector('.hdr__nav a[data-nav="stories"]').click()`);
await sleep(60); const yCut = await b.evalJs('scrollY'); await b.wheel(683, 400, 100); await sleep(2500);
res.wheelDuringWait = { yCut: Math.round(yCut), yAfter: await b.evalJs('Math.round(scrollY)'), storiesTop: await top(b, 'stories') };
// second click supersedes the first (about, then 80 ms later the footer link to contact)
await b.evalJs(`scrollTo(0, 0)`); await sleep(1500);
await b.evalJs(`document.querySelector('.hdr__nav a[data-nav="faq"]').click()`); await sleep(80);
await b.evalJs(`document.querySelector('.hdr__nav a[data-nav="about"]').click()`); await sleep(4500);
res.supersede = { aboutTop: await top(b, 'about'), faqTop: await top(b, 'faq') };
// numeric target (used to throw: getComputedStyle(number))
const eng = await b.evalJs(`performance.getEntriesByType('resource').map((r) => r.name).find((u) => u.includes('scripts/engine.js'))`);
res.numeric = await b.evalJs(`(async () => { const m = await import(${J(eng)}); let err = null; try { m.scrollToTarget(15000); } catch (e) { err = String(e); } await new Promise((r) => setTimeout(r, 4000)); return { err, y: Math.round(scrollY) }; })()`);
res.errors = b.errors; await b.close(); await sleep(600);
// 2. native smooth path (390 px: no Lenis)
b = await open('nc2', { w: 390, h: 800 });
res.mobile = { lenis: await b.evalJs(`document.documentElement.classList.contains('is-desktop-fx')` ) };
await b.evalJs(`document.querySelector('a[href*="#faq"]').click()`); await sleep(5000);
res.mobile.faqTop = await top(b, 'faq'); res.mobile.errors = b.errors; await b.close(); await sleep(600);
// 3. reduced motion: immediate, no wait
b = await open('nc3', { reduced: true });
const t0 = Date.now(); await b.evalJs(`document.querySelector('a[href*="#faq"]').click()`); await sleep(150);
res.reduced = { faqTop150ms: await top(b, 'faq'), ms: Date.now() - t0 }; await b.close();
console.log(J(res, null, 1));
process.exit(0);
