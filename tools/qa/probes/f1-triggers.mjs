// f1-triggers: dev-server port of d3-triggers. Records every ScrollTrigger refresh (who called it, how long it took, with the scroll state), snapshots
// all trigger start/end at boot / fonts.ready / load / t=1200ms / after a human-paced wheel traverse, forces a refresh at the end to expose staleness,
// and measures every [data-split]/[data-lit] block height before / after split. Also layout-shift entries and a document.scrollHeight timeline.
// The engine is instrumented in flight (nothing on disk changes): the served /src/scripts/engine.js gets a tail that exposes window.__vd and wraps refresh.
// Usage: node tools/qa/probes/f1-triggers.mjs [tag=run] [url=http://127.0.0.1:4411/] [--port=9411] [--noscroll]
import { writeFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { launch, sleep, OUT } from './f1-lib3.mjs';
import { VITE_STUB } from './f1-lib.mjs';

const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const pos = args.filter((a) => !a.startsWith('--'));
const TAG = pos[0] || 'run'; const URL_ = pos[1] || 'http://127.0.0.1:4411/'; const PORT = +flag('port', 9411);
const NOSCROLL = args.includes('--noscroll');
mkdirSync(OUT + 'triggers', { recursive: true });

const TAIL = String.raw`
;(() => {
  const L = (window.__L = { t0: performance.now(), ev: [], refresh: [], ls: [], sh: [], snaps: {}, split: {} });
  const mark = (n, x = {}) => L.ev.push({ n, t: Math.round(performance.now()), y: Math.round(scrollY), sh: document.documentElement.scrollHeight, ...x });
  const ST = ScrollTrigger;
  const orig = ST.refresh;
  window.__vd = { gsap, ScrollTrigger, SplitText, env, getLenis, onRefresh, refreshNow: ST.refreshNow || orig.bind(ST) };
  let kc = 0; const keyOf = (st) => st.__k || (st.__k = ++kc);
  const desc = (el) => { if (!el) return null; let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = [...el.classList].filter((x) => !/^(astro|split|lenis|js$|is-)/.test(x)).slice(0, 2).join('.'); if (c) s += '.' + c; for (const a of ['data-reveal','data-split','data-lit','data-parallax','data-draw','data-stagger','data-count']) if (el.hasAttribute(a)) s += '[' + a.slice(5) + (el.getAttribute(a) ? '=' + el.getAttribute(a) : '') + ']'; return s; };
  const snap = () => ST.getAll().map((st) => ({ k: keyOf(st), sec: st.trigger?.closest?.('section[id]')?.id || (st.trigger?.closest?.('footer') ? 'footer' : '?'), trg: desc(st.trigger), start: Math.round(st.start * 10) / 10, end: Math.round(st.end * 10) / 10, pin: !!st.pin, scrub: st.vars.scrub ?? null, once: !!st.vars.once, prog: +st.progress.toFixed(3) }));
  const splitH = () => [...document.querySelectorAll('[data-split], [data-lit]')].map((el) => ({ sec: el.closest('section[id]')?.id || '?', d: desc(el), h: Math.round(el.getBoundingClientRect().height * 100) / 100, split: !!el.querySelector('[class*="split-"],[class*="lit-word"]'), txt: el.textContent.trim().slice(0, 24) }));
  window.__snap = snap; window.__splitH = splitH; window.__mark = mark;
  ST.refresh = function () { const t = performance.now(); const stack = (new Error().stack || '').split('\n').slice(2, 5).map((s) => s.trim().replace(/https?:\/\/[^/]+/, '').replace(/\?.*?:/, ':')).join(' | '); const r = orig.apply(this, arguments); L.refresh.push({ call: true, safe: arguments[0], t: Math.round(t), dur: +(performance.now() - t).toFixed(1), y: Math.round(scrollY), sh: document.documentElement.scrollHeight, stack }); return r; };
  let initT = 0; ST.addEventListener('refreshInit', () => { initT = performance.now(); });
  ST.addEventListener('refresh', () => { L.refresh.push({ ev: true, dur: +(performance.now() - initT).toFixed(1), t: Math.round(performance.now()), y: Math.round(scrollY), sh: document.documentElement.scrollHeight, n: ST.getAll().length, lenis: getLenis()?.isScrolling || false }); });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => L.ls.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), input: e.hadRecentInput, y: Math.round(scrollY), src: (e.sources || []).slice(0, 3).map((s) => ({ n: desc(s.node), from: [Math.round(s.previousRect.y), Math.round(s.previousRect.height)], to: [Math.round(s.currentRect.y), Math.round(s.currentRect.height)] })) }))).observe({ type: 'layout-shift', buffered: true });
  let lastSh = 0; (function tick() { const sh = document.documentElement.scrollHeight; if (sh !== lastSh) { L.sh.push({ t: Math.round(performance.now()), y: Math.round(scrollY), from: lastSh, to: sh, lenisScrolling: !!getLenis()?.isScrolling }); lastSh = sh; } requestAnimationFrame(tick); })();
  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'));
  addEventListener('load', () => { mark('load'); L.snaps.load = snap(); L.split.load = splitH(); });
  const rafs = (n, f) => (n ? requestAnimationFrame(() => rafs(n - 1, f)) : f());
  (function wait() { if (document.documentElement.classList.contains('fx-booted')) { mark('fx-booted'); L.split.preSplit = splitH(); rafs(2, () => { L.snaps.boot = snap(); L.split.boot = splitH(); mark('boot+2raf'); }); } else requestAnimationFrame(wait); })();
  document.fonts.ready.then(() => { mark('fonts.ready'); rafs(2, () => { L.snaps.fonts = snap(); L.split.fonts = splitH(); }); });
  setTimeout(() => { mark('t=1200ms'); L.snaps.t1200 = snap(); L.split.t1200 = splitH(); }, 1200);
})();`;

const b = await launch({ port: PORT, w: 1366, h: 820 });
b.listeners.push(async (m) => {
  if (m.method !== 'Fetch.requestPaused') return;
  const { requestId, request } = m.params;
  try {
    const stub = request.url.includes('/@vite/client');
    const body = stub ? VITE_STUB : (await (await fetch(request.url)).text()) + TAIL;
    await b.send('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/javascript' }, { name: 'Cache-Control', value: 'no-store' }], body: Buffer.from(body).toString('base64') });
  } catch (e) { try { await b.send('Fetch.continueRequest', { requestId }); } catch {} }
});
await b.send('Fetch.enable', { patterns: [{ urlPattern: '*/src/scripts/engine.js*', requestStage: 'Request' }, { urlPattern: '*/@vite/client*', requestStage: 'Request' }] });
await b.send('Page.navigate', { url: URL_ });
await sleep(4500);
const get = (expr) => b.ev(expr);
const origin0 = await get('performance.timeOrigin');
console.log('booted:', await get(`document.documentElement.className`), '| ST count', await get(`window.__vd?.ScrollTrigger.getAll().length`));
console.log('events:', JSON.stringify(await get(`window.__L.ev`)));

const t0 = Date.now();
if (!NOSCROLL) {
  const H = await get('document.documentElement.scrollHeight - innerHeight');
  let guard = 0;
  while (guard++ < 400) {
    const y = await get('scrollY');
    if (y >= H - 4 && guard > 5) break;
    const n = 6 + Math.floor(Math.random() * 6);
    for (let i = 0; i < n; i++) { await b.wheel(100); await sleep(16 + Math.floor(Math.random() * 14)); }
    await sleep(120 + Math.floor(Math.random() * 280));
  }
  await sleep(1500);
}
await get(`window.__L.snaps.afterTraverse = window.__snap(); window.__L.split.after = window.__splitH(); window.__mark('traverseEnd'); 1`);
console.log('traverse took', Date.now() - t0, 'ms; docH now', await get('document.documentElement.scrollHeight'), 'y', await get('scrollY'));
// force a refresh at the very end through the ORIGINAL function (bypassing any gateway the engine installs) to expose staleness
await get(`window.__vd.refreshNow(); 1`);
await sleep(400);
await get(`window.__L.snaps.afterForcedRefresh = window.__snap(); window.__L.split.afterRefresh = window.__splitH(); 1`);
const L = await get('window.__L');
writeFileSync(`${OUT}triggers/${TAG}.json`, JSON.stringify(L, null, 1));

// ---------- report ----------
const byK = (a) => Object.fromEntries((a || []).map((s) => [s.k, s]));
const A = byK(L.snaps.boot), F = byK(L.snaps.fonts), LD = byK(L.snaps.load), T = byK(L.snaps.t1200), Z = byK(L.snaps.afterTraverse), R = byK(L.snaps.afterForcedRefresh);
const rows = [];
for (const k of Object.keys(R)) { const r = R[k]; const a = A[k], f = F[k], l = LD[k], t = T[k], z = Z[k]; rows.push({ k: +k, sec: r.sec, trg: r.trg, pin: r.pin, scrub: r.scrub, boot: a ? [a.start, a.end] : null, fonts: f ? [f.start, f.end] : null, t1200: t ? [t.start, t.end] : null, final: [r.start, r.end], stale: z ? [z.start, z.end] : null }); }
const d = (x, y) => (x && y ? Math.round((x[0] - y[0]) * 10) / 10 : null);
console.log((await get('performance.timeOrigin')) !== origin0 ? '\n!!! INVALID RUN: the page was reloaded mid-run. Re-run.' : '\nrun valid (no reload)');
console.log('\n=== refreshes ===');
for (const r of L.refresh) console.log(r.call ? `CALL t=${r.t} dur=${r.dur}ms y=${r.y} sh=${r.sh} safe=${r.safe} ${r.stack}` : `EVENT t=${r.t} dur=${r.dur}ms y=${r.y} sh=${r.sh} n=${r.n} lenisScrolling=${r.lenis}`);
console.log('\n=== document.scrollHeight timeline (changes) ===');
for (const s of L.sh) console.log(JSON.stringify(s));
console.log('\n=== layout shifts ===');
for (const s of L.ls) console.log(JSON.stringify(s));
console.log('\n=== start drift per trigger vs the final fresh refresh: boot | fonts | t1200 | live-before-forced-refresh (only rows with >1px) ===');
let driftN = 0, driftMax = 0;
for (const r of rows) {
  const dd = [d(r.boot, r.final), d(r.fonts, r.final), d(r.t1200, r.final), d(r.stale, r.final)];
  const live = dd[3]; if (live !== null && Math.abs(live) > 1) { driftN++; driftMax = Math.max(driftMax, Math.abs(live)); }
  if (dd.some((x) => x !== null && Math.abs(x) > 1)) console.log(`${r.k} ${r.sec} ${r.trg}${r.pin ? ' PIN' : ''}${r.scrub ? ' scrub=' + r.scrub : ''} | ${dd.map((x) => (x === null ? '-' : x)).join(' | ')} | final=${r.final.join('..')}`);
}
console.log(`SUMMARY triggers=${rows.length} liveDrift>1px=${driftN} maxLiveDrift=${driftMax} goneBeforeForced=${Object.keys(Z).filter((k) => !R[k]).length} refreshCalls=${L.refresh.filter((x) => x.call).length} refreshEvents=${L.refresh.filter((x) => x.ev).length} scrollHeightChanges=${L.sh.length}`);
console.log('\n=== [data-split]/[data-lit] heights: preSplit -> boot -> fonts -> after traverse -> forced refresh ===');
const g = (k, i) => L.split[k]?.[i];
(L.split.preSplit || []).forEach((s, i) => console.log(`${s.sec} ${s.d} "${s.txt}" pre=${s.h} boot=${g('boot', i)?.h}${g('boot', i)?.split ? 's' : ''} fonts=${g('fonts', i)?.h}${g('fonts', i)?.split ? 's' : ''} after=${g('after', i)?.h}${g('after', i)?.split ? 's' : ''} refreshed=${g('afterRefresh', i)?.h}`));
await b.close();
process.exit(0);
