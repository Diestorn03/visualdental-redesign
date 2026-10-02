// f1-nav (from v3-15): header nav click jumps (long Lenis scrollTo) AFTER the page has been idle long enough for the 3D scene to be built/warm: frame dt + LoAF attribution.
// node tools/qa/probes/v3-15-navjump-loaf.mjs [idleMs=15000]
// f1 copy of v3-15: same measurement, pointed at the f1 dev server (4411 / CDP 9411). Optional 2nd arg: label for the output tag.
process.env.SHOTS_DIR ||= 'C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents/.shots/f1/nav/';
const d4 = await import('./d4-lib.mjs');
const { sleep, OUT } = d4;
const BASE = process.env.F1_BASE || 'http://127.0.0.1:4411/', PORT = +(process.env.F1_CDP || 9411);
const FRAMES = `(() => { if (window.__fr) return 'ok'; const R = {}; window.__fr = { add(n, fn) { R[n] = { fn, on: false, S: [] }; }, start(n) { R[n].S = []; R[n].on = true; }, stop(n) { R[n].on = false; return R[n].S; } };
  const tick = (t) => { for (const k in R) if (R[k].on) R[k].S.push(Object.assign({ t: +t.toFixed(1) }, R[k].fn())); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 'ok'; })()`;

// the dev server's HMR client would reload the page when another agent saves a file: stub it
import { VITE_STUB } from './f1-lib.mjs';
async function noHmr(b) {
  b.ws.addEventListener('message', async (e) => { const m = JSON.parse(e.data); if (m.method !== 'Fetch.requestPaused') return;
    try { await b.send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }], body: Buffer.from(VITE_STUB).toString('base64') }); } catch {} });
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/@vite/client*', requestStage: 'Request' }] });
}
async function start({ w, h, tag, wait }) { const b = await d4.launch({ port: PORT, w, h, tag }); await noHmr(b); await b.open(BASE, wait); return b; }
const IDLE = +(process.argv[2] || 15000), W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'nj', wait: IDLE });
const J = (o) => JSON.stringify(o);
await b.evalJs(FRAMES);
await b.evalJs(`window.__loaf = []; try { new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__loaf.push({ t: Math.round(e.startTime), d: Math.round(e.duration), bd: Math.round(e.blockingDuration), s: (e.scripts || []).map((s) => (s.sourceURL || '').split('/').pop().slice(0, 28) + ':' + (s.sourceFunctionName || s.invoker || '') + ' ' + Math.round(s.duration)).slice(0, 3) }))).observe({ type: 'long-animation-frame', buffered: true }); } catch (e) {}
 window.__fr.add('j', () => ({ y: scrollY, th: document.querySelector('[data-header]').dataset.theme }));`);
console.log('scene state after idle', J(await b.evalJs(`({ ready: document.querySelector('#digital').dataset.ready || null, live: document.querySelector('#digital').classList.contains('is-live') })`)));
const nav = await b.evalJs(`Object.fromEntries([...document.querySelectorAll('.hdr__nav a')].map((a) => { const r = a.getBoundingClientRect(); return [a.dataset.nav, [r.left + r.width / 2, r.top + r.height / 2]]; }))`);
const seq = [['services', 'top->services'], ['faq', 'services->faq (crosses #digital)'], ['about', 'faq->about'], ['digital', 'about->digital'], ['stories', 'digital->stories']];
for (const [id, label] of seq) {
  // header may be hidden after a downward scroll: bring it back by a wheel-up notch
  const hb = await b.evalJs(`document.querySelector('[data-header]').getBoundingClientRect().bottom`);
  if (hb <= 0) { await b.wheel(W / 2, H / 2, -100); await sleep(900); }
  const n = (await b.evalJs(`(() => { const a = document.querySelector('.hdr__nav a[data-nav=${J(id)}]'); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`));
  await b.move(n[0], n[1]); await sleep(250);
  const l0 = await b.evalJs('window.__loaf.length');
  await b.evalJs(`window.__fr.start('j')`);
  await b.down(n[0], n[1]); await sleep(30); await b.up(n[0], n[1]);
  await sleep(4200);
  const S = await b.evalJs(`window.__fr.stop('j')`);
  const mv = S.filter((s, i) => i && s.y !== S[i - 1].y);
  const dts = mv.map((s) => s.t - S[S.indexOf(s) - 1].t);
  const dist = S.at(-1).y - S[0].y;
  const loaf = (await b.evalJs(`window.__loaf.slice(${l0})`)).filter((l) => l.d >= 50);
  const targetTop = await b.evalJs(`(() => { const s = document.getElementById(${J(id)}); return s ? Math.round(s.getBoundingClientRect().top) : null; })()`);
  console.log(label.padEnd(34), J({ distance: Math.round(dist), motionFrames: mv.length, over33: dts.filter((d) => d > 33).length, over50: dts.filter((d) => d > 50).length, worstFrame: Math.round(Math.max(...dts)), targetTopAtEnd: targetTop, loaf50: loaf.map((l) => `${l.d}ms ${l.s.join('|')}`) }));
}
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
