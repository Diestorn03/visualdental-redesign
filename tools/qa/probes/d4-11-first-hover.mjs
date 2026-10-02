// d4-11: first hover after arriving by nav click: panel opacity/scale over time, image decode state, hint visibility window.
// node tools/qa/probes/d4-11-first-hover.mjs [w] [h] [port]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `fh${W}` });
await b.open('http://127.0.0.1:4404/');
const nav = await b.evalJs(`(() => { const a = document.querySelector('.hdr__nav a[data-nav=services]').getBoundingClientRect(); return { x: a.left + a.width / 2, y: a.top + a.height / 2 }; })()`);
await b.move(nav.x, nav.y); await sleep(200); await b.down(nav.x, nav.y); await sleep(30); await b.up(nav.x, nav.y);
await sleep(2600);
console.log('scrollY after nav click', await b.evalJs('scrollY'), '| panel warm:', await b.evalJs(`document.querySelector('.svc__panel').classList.contains('is-warm')`), '| slide imgs complete:', await b.evalJs(`[...document.querySelectorAll('.svc__slide img')].map((i) => i.complete && i.naturalWidth > 0).join(',')`));
const hint = await b.evalJs(`(() => { const h = document.querySelector('.svc__hint').getBoundingClientRect(); const l = document.querySelector('.svc__list').getBoundingClientRect(); return { hintTop: Math.round(h.top), hintBottom: Math.round(h.bottom), listTop: Math.round(l.top), headerH: 72, op: getComputedStyle(document.querySelector('.svc__hint')).opacity, fs: getComputedStyle(document.querySelector('.svc__hint')).fontSize }; })()`);
console.log('hint right after landing on #services', JSON.stringify(hint));
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; })`);
console.log('rows in viewport', JSON.stringify(rows.slice(0, 4)));
await b.evalJs(`(() => { const p = document.querySelector('.svc__panel'); window.__f = []; const t0 = performance.now(); const f = (t) => { const cs = getComputedStyle(p), m = new DOMMatrixReadOnly(cs.transform); const r = p.getBoundingClientRect(); window.__f.push([Math.round(t - t0), +(+cs.opacity).toFixed(2), +m.a.toFixed(3)]); if (t - t0 < 1500) requestAnimationFrame(f); }; window.__t0 = t0; window.__go = () => { window.__f = []; const t0 = performance.now(); window.__t0 = t0; requestAnimationFrame(function g(t) { const cs = getComputedStyle(p), m = new DOMMatrixReadOnly(cs.transform); window.__f.push([Math.round(t - t0), +(+cs.opacity).toFixed(2), +m.a.toFixed(3)]); if (t - t0 < 1400) requestAnimationFrame(g); }); }; })()`);
await b.move(683, 5); await sleep(300);
await b.evalJs('__go()'); await sleep(20);
const y = Math.min(H - 100, (rows[1][0] + rows[1][1]) / 2);
await b.move(300, y);
await sleep(1600);
const f = await b.evalJs('window.__f');
console.log('first hover: [ms, panel opacity, panel scale] sampled', JSON.stringify(f.filter((_, i) => i % 3 === 0).slice(0, 14)));
await b.close(); process.exit(0);
