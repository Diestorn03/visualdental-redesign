// d3: ScrollTrigger start/end audit. Records every ScrollTrigger refresh (with caller), snapshots all triggers at boot / fonts.ready / load /
// after a human-paced wheel traverse of the whole page, then forces a refresh to expose how stale the live positions were.
// Also measures every [data-split] block height before / during / after its SplitText revert, and layout-shift entries.
// Usage: node tools/qa/probes/d3-triggers.mjs [url=http://127.0.0.1:4403/] [port=9403]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d3-lib.mjs';

const URL_ = process.argv[2] || 'http://127.0.0.1:4403/';
const PORT = +(process.argv[3] || 9403);

const EARLY = String.raw`(() => {
  const L = (window.__L = { t0: performance.now(), ev: [], refresh: [], ls: [], splitH: [], snaps: {} });
  const mark = (n, x = {}) => L.ev.push({ n, t: Math.round(performance.now()), y: Math.round(scrollY), ...x });
  const desc = (el) => { if (!el) return null; let s = el.tagName.toLowerCase(); if (el.id) s += '#' + el.id; const c = [...el.classList].filter((x) => !/^(astro|split|lenis|js$|is-)/.test(x)).slice(0, 2).join('.'); if (c) s += '.' + c; for (const a of ['data-reveal','data-split','data-lit','data-parallax','data-draw','data-stagger','data-count']) if (el.hasAttribute(a)) s += '[' + a.slice(5) + (el.getAttribute(a) ? '=' + el.getAttribute(a) : '') + ']'; return s; };
  let kc = 0; const keyOf = (st) => st.__k || (st.__k = ++kc);
  const snap = () => (window.__ST ? window.__ST.getAll().map((st) => ({ k: keyOf(st), sec: st.trigger?.closest?.('section[id],footer')?.id || (st.trigger?.closest?.('footer') ? 'footer' : '?'), trg: desc(st.trigger), start: Math.round(st.start * 10) / 10, end: Math.round(st.end * 10) / 10, pin: !!st.pin, scrub: st.vars.scrub ?? null, once: !!st.vars.once, sStr: typeof st.vars.start === 'function' ? 'fn' : st.vars.start, eStr: typeof st.vars.end === 'function' ? 'fn' : st.vars.end, prog: +st.progress.toFixed(3), active: st.isActive, anim: st.animation ? (st.animation.duration?.() || 0) : null })) : []);
  const splitH = () => [...document.querySelectorAll('[data-split]')].map((el) => ({ sec: el.closest('section[id]')?.id || '?', d: desc(el), h: Math.round(el.getBoundingClientRect().height * 100) / 100, oh: el.offsetHeight, split: !!el.querySelector('.split-line-mask,.split-word-mask'), txt: el.textContent.trim().slice(0, 28) }));
  window.__snap = snap; window.__splitH = splitH; window.__mark = mark; window.__desc = desc;
  let ST_ = null;
  Object.defineProperty(window, '__ST', { configurable: true, get() { return ST_; }, set(v) {
    ST_ = v;
    const orig = v.refresh;
    v.refresh = function () { const t = performance.now(); const stack = (new Error().stack || '').split('\n').slice(2, 5).map((s) => s.trim().replace(/https?:\/\/[^/]+\/_astro\//, '')).join(' | '); const r = orig.apply(this, arguments); L.refresh.push({ call: true, t: Math.round(t), dur: +(performance.now() - t).toFixed(1), y: Math.round(scrollY), stack }); return r; };
    v.addEventListener('refresh', () => { L.refresh.push({ ev: true, t: Math.round(performance.now()), y: Math.round(scrollY), docH: document.documentElement.scrollHeight, n: v.getAll().length, snap: snap().map((s) => [s.k, s.start, s.end]), split: splitH().map((s) => [s.h, s.split]) }); });
  } });
  new PerformanceObserver((l) => l.getEntries().forEach((e) => L.ls.push({ t: Math.round(e.startTime), v: +e.value.toFixed(4), input: e.hadRecentInput, y: Math.round(scrollY), src: (e.sources || []).slice(0, 3).map((s) => ({ n: desc(s.node), from: [Math.round(s.previousRect.y), Math.round(s.previousRect.height)], to: [Math.round(s.currentRect.y), Math.round(s.currentRect.height)] })) }))).observe({ type: 'layout-shift', buffered: true });
  document.addEventListener('DOMContentLoaded', () => mark('DOMContentLoaded'));
  addEventListener('load', () => { mark('load'); L.snaps.load = snap(); L.splitLoad = splitH(); });
  const rafs = (n, f) => (n ? requestAnimationFrame(() => rafs(n - 1, f)) : f());
  (function wait() { if (document.documentElement?.classList.contains("fx-booted") && window.__ST) { mark('fx-booted'); rafs(2, () => { L.snaps.boot = snap(); L.splitBoot = splitH(); mark('boot+2raf'); }); } else requestAnimationFrame(wait); })();
  document.fonts.ready.then(() => { mark('fonts.ready'); rafs(2, () => { L.snaps.fonts = snap(); L.splitFonts = splitH(); }); });
  setTimeout(() => { mark('t=1200ms'); L.snaps.t1200 = snap(); L.splitT1200 = splitH(); }, 1200);
})();`;

const b = await launch({ port: PORT, early: EARLY, url: URL_ });
await sleep(4500);
const get = (expr) => b.ev(expr);
console.log('booted:', await get(`document.documentElement.className`), 'ST count', await get(`window.__ST?.getAll().length`));
console.log('events:', JSON.stringify(await get(`window.__L.ev`)));

// human traverse: bursts of wheel ticks (deltaY 100 every ~16 ms), pauses, down to the bottom
const H = await get('document.documentElement.scrollHeight - innerHeight');
let guard = 0;
const t0 = Date.now();
while (guard++ < 400) {
  const y = await get('scrollY');
  if (y >= H - 4 && guard > 5) break;
  const n = 6 + Math.floor(Math.random() * 6);
  for (let i = 0; i < n; i++) { await b.wheel(100); await sleep(16 + Math.floor(Math.random() * 14)); }
  await sleep(120 + Math.floor(Math.random() * 280));
}
await sleep(1500);
await get(`window.__L.snaps.afterTraverse = window.__snap(); window.__L.splitAfter = window.__splitH(); window.__mark('traverseEnd'); 1`);
console.log('traverse took', Date.now() - t0, 'ms; docH now', await get('document.documentElement.scrollHeight'), 'y', await get('scrollY'));
// force a refresh at the very end to expose staleness
await get(`window.__ST.refresh(); 1`);
await sleep(400);
await get(`window.__L.snaps.afterForcedRefresh = window.__snap(); window.__L.splitAfterRefresh = window.__splitH(); 1`);
const L = await get('window.__L');
writeFileSync(OUT + 'triggers.json', JSON.stringify(L, null, 1));

// ---------- report ----------
const byK = (a) => Object.fromEntries((a || []).map((s) => [s.k, s]));
const A = byK(L.snaps.boot), F = byK(L.snaps.fonts), LD = byK(L.snaps.load), T = byK(L.snaps.t1200), Z = byK(L.snaps.afterTraverse), R = byK(L.snaps.afterForcedRefresh);
const rows = [];
for (const k of Object.keys(R)) {
  const r = R[k]; const a = A[k], f = F[k], l = LD[k], t = T[k], z = Z[k];
  rows.push({ k: +k, sec: r.sec, trg: r.trg, pin: r.pin, scrub: r.scrub, boot: a ? [a.start, a.end] : null, fonts: f ? [f.start, f.end] : null, t1200: t ? [t.start, t.end] : null, final: [r.start, r.end], stale: z ? [z.start, z.end] : null });
}
const d = (x, y) => (x && y ? Math.round((x[0] - y[0]) * 10) / 10 : null);
console.log('\n=== refreshes (call + event) ===');
for (const r of L.refresh) console.log(r.call ? `CALL t=${r.t} dur=${r.dur}ms y=${r.y} ${r.stack}` : `EVENT t=${r.t} y=${r.y} docH=${r.docH} n=${r.n}`);
console.log('\n=== layout shifts ===');
for (const s of L.ls) console.log(JSON.stringify(s));
console.log('\n=== start drift per trigger (final=fresh refresh at end) ===');
console.log('k sec trigger | boot→final | fonts→final | t1200→final | staleBeforeForcedRefresh→final');
for (const r of rows) {
  const dd = [d(r.boot, r.final), d(r.fonts, r.final), d(r.t1200, r.final), d(r.stale, r.final)];
  console.log(`${r.k} ${r.sec} ${r.trg}${r.pin ? ' PIN' : ''}${r.scrub ? ' scrub=' + r.scrub : ''} | ${dd.map((x) => (x === null ? '-' : x)).join(' | ')} | final=${r.final.join('..')}`);
}
const gone = Object.keys(Z).filter((k) => !R[k]);
console.log('triggers present before forced refresh but gone after (once-fired kills):', gone.length);
const mism = rows.filter((r) => r.stale && Math.abs(d(r.stale, r.final)) > 1);
console.log('triggers whose live start was off by >1px before the forced refresh:', mism.length, 'max abs', Math.max(0, ...mism.map((r) => Math.abs(d(r.stale, r.final)))));
console.log('\n=== [data-split] heights (boot-time DOM unsplit→ split → reverted) ===');
const sb = L.splitBoot || [], sf = L.splitFonts || [], sa = L.splitAfter || [], sr = L.splitAfterRefresh || [];
sb.forEach((s, i) => console.log(`${s.sec} ${s.d} "${s.txt}" boot=${s.h}${s.split ? 's' : ''} fonts=${sf[i]?.h}${sf[i]?.split ? 's' : ''} after=${sa[i]?.h}${sa[i]?.split ? 's' : ''} final=${sr[i]?.h}`));
await b.close();
