// d4-proto: RUNTIME PROTOTYPE of the proposed #services redesign (sticky preview in the lane, no pointer chase) injected into the
// built page through CDP (nothing in src/ is touched). It validates the spec numerically and takes the screenshots.
// The page's own services.js is kept inert by stopping `pointermove` at window capture (its listeners never see a pointer).
// node tools/qa/probes/d4-proto-services.mjs [w] [h] [port] [measure=1]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);

export const PROTO_CSS = `
.svc__panel { display: none !important; } /* old floating panel */
.svc__hint { display: none !important; }
.svc__preview { position: sticky; top: calc(var(--header-h) + 24px); margin: 0; }
.svc__frame { position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: var(--surface); }
.svc__pslide { position: absolute; inset: 0; visibility: hidden; clip-path: inset(100% 0 0 0); overflow: hidden; }
.svc__pslide img, .svc__pslide video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.svc__cap { display: flex; align-items: baseline; gap: 0.9rem; margin-top: 14px; font-family: var(--font-label); font-size: var(--step--1); letter-spacing: 0.14em; text-transform: uppercase; line-height: 1.4; color: var(--fg); }
.svc__cap .num { flex: none; color: var(--stroke); }
.svc__title { transition: opacity var(--d-base) var(--ease-out), color var(--d-base) var(--ease-out); }
.svc__row.is-active .svc__title { color: var(--stroke); }
.svc__row::before { content: '\\2192'; position: absolute; right: calc(var(--lane) + 6px); top: clamp(28px, 3.6vw, 52px); font-family: var(--font-label); font-size: var(--step-2); line-height: 1; color: var(--stroke); opacity: 0; transform: translateX(-10px); transition: opacity var(--d-base) var(--ease-out), transform var(--d-slow) var(--ease-out); pointer-events: none; }
.svc__row.is-active::before { opacity: 1; transform: none; }
`;

export const PROTO_JS = `(() => {
  const root = document.querySelector('#services'), list = root.querySelector('.svc__list'), lane = root.querySelector('.svc__lane'), old = root.querySelector('.svc__panel');
  const style = document.createElement('style'); style.textContent = ${JSON.stringify(PROTO_CSS)}; document.head.append(style);
  const rows = [...list.children], two = (n) => String(n + 1).padStart(2, '0');
  const fig = document.createElement('figure'); fig.className = 'svc__preview';
  const frame = document.createElement('div'); frame.className = 'svc__frame';
  const slides = [...old.children].map((s) => { const c = s.cloneNode(true); c.className = 'svc__pslide'; c.removeAttribute('style'); c.querySelectorAll('.svc__tag').forEach((t) => t.remove()); frame.append(c); return c; });
  const cap = document.createElement('figcaption'); cap.className = 'svc__cap'; cap.innerHTML = '<span class="num"></span><span></span>';
  fig.append(frame, cap); lane.append(fig);
  let shown = -1, z = 1, lastScroll = 0, tops = [];
  const measure = () => { tops = rows.map((r) => r.offsetTop); };
  new ResizeObserver(measure).observe(list); measure();
  const sel = (i) => {
    if (i === shown) return;
    const prev = shown; shown = i;
    rows.forEach((r, k) => r.classList.toggle('is-active', k === i));
    list.classList.add('is-active');
    cap.children[0].textContent = two(i); cap.children[1].textContent = rows[i].querySelector('.svc__title').textContent;
    const s = slides[i], busy = s.getAnimations().length > 0, visible = s.style.visibility === 'visible';
    s.style.zIndex = ++z;
    if (prev < 0) { s.style.visibility = 'visible'; s.style.clipPath = 'inset(0%)'; return; }
    if (busy) return;                                  // already wiping in: just raise it
    if (visible) { s.style.clipPath = 'inset(0%)'; return; } // sits fully open under the stack: raise it, no restart
    s.style.visibility = 'visible';
    const from = i > prev ? 'inset(100% 0 0 0)' : 'inset(0 0 100% 0)';
    const a = s.animate([{ clipPath: from }, { clipPath: 'inset(0% 0% 0% 0%)' }], { duration: (window.__cfg || {}).d || 500, easing: (window.__cfg || {}).e || 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
    a.onfinish = () => { s.style.clipPath = 'inset(0%)'; a.cancel(); slides.forEach((o) => { if (o !== s && (+o.style.zIndex || 0) < (+s.style.zIndex || 0)) { o.style.visibility = 'hidden'; o.style.clipPath = ''; } }); };
    slides.forEach((sl, k) => { const v = sl.querySelector('video'); if (v) (k === i ? v.play().catch(() => {}) : v.pause()); });
  };
  addEventListener('pointermove', (e) => {
    e.stopPropagation(); // PROTO ONLY: keeps the old services.js inert
    if (e.pointerType === 'touch' || performance.now() - lastScroll < 160) return;
    const r = e.target.closest?.('.svc__row'); if (r && list.contains(r)) sel(rows.indexOf(r));
  }, { capture: true, passive: true });
  let raf = 0;
  const byScroll = () => { raf = 0; const L = list.getBoundingClientRect(); if (L.bottom < 0 || L.top > innerHeight) return; const y = innerHeight * 0.5 - L.top; let i = 0; for (let k = 0; k < tops.length; k++) if (tops[k] <= y) i = k; sel(i); };
  addEventListener('scroll', () => { lastScroll = performance.now(); if (!raf) raf = requestAnimationFrame(byScroll); }, { passive: true });
  list.addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) sel(rows.indexOf(e.target.closest('.svc__row'))); });
  sel(0);
  // recorder
  let on = false, S = [];
  const tick = (t) => { if (on) { const r = fig.getBoundingClientRect(); const vis = slides.map((s, k) => ({ k, z: +s.style.zIndex || 0, v: s.style.visibility === 'visible', cp: getComputedStyle(s).clipPath })).filter((o) => o.v).sort((a, b) => b.z - a.z)[0];
      const m = /inset\\(([\\d.]+)%/.exec(vis?.cp || ''); S.push({ t: +t.toFixed(1), y: +scrollY.toFixed(1), py: +r.top.toFixed(1), px: +r.left.toFixed(1), act: rows.findIndex((x) => x.classList.contains('is-active')), top: vis?.k ?? -1, clip: m ? +m[1] : 0, layers: slides.filter((s) => s.style.visibility === 'visible').length }); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__p = { start() { S = []; on = true; return performance.now(); }, stop() { on = false; return S; }, sel, get shown() { return shown; } };
  return 'proto ready';
})()`;

if (import.meta.url === `file:///${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('d4-proto-services.mjs')) {
  const b = await launch({ port: PORT, w: W, h: H, tag: `p${W}` });
  await b.open('http://127.0.0.1:4404/');
  const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
  await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2500);   // (no pointermove yet; wheel only)
  console.log(await b.evalJs(PROTO_JS));
  await sleep(500);
  // ---- screenshots ----
  console.log('shot first glance', await b.shot(`proto-01-list-top-${W}`));
  const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
  const lb = await b.evalJs('document.querySelector(".svc__list").getBoundingClientRect().left');
  await b.move(lb + 250, Math.min(H - 80, rows[2])); await sleep(1400);
  console.log('shot hover row 3', await b.shot(`proto-02-hover-row3-${W}`));
  await b.burst(lb + 250, 450, 14, 100, 60); await sleep(1500);
  console.log('shot mid list (scroll)', await b.shot(`proto-03-mid-${W}`));
  const rect = await b.evalJs(`(() => { const r = document.querySelector('.svc__preview').getBoundingClientRect(); const l = document.querySelector('.svc__lane').getBoundingClientRect(); return { panel: [r.left, r.top, r.width, r.height].map(Math.round), lane: [l.left, l.top, l.width, l.height].map(Math.round), headerH: 72 }; })()`);
  console.log('preview rect', JSON.stringify(rect));
  // ---- warm-up pass (row reveals fire once; keep them out of the numbers) ----
  await b.wheelTo(listTop + 1700, W / 2, H / 2); await sleep(1500);
  await b.wheelTo(listTop - 300, W / 2, H / 2); await sleep(1500);
  // ---- S1: wheel with a PARKED pointer on the list, 3 speeds x 3 wipe variants ----
  const VARS = { 'A power3.inOut 500': { d: 500, e: 'cubic-bezier(.65,0,.35,1)' }, 'B expo.out 500': { d: 500, e: 'cubic-bezier(.16,1,.3,1)' }, 'C power3.out 450': { d: 450, e: 'cubic-bezier(.33,1,.68,1)' } };
  const scen = async (name, every, notches, dir = 1, px = 500, py = 430) => {
    await b.wheelTo(dir > 0 ? listTop - 300 : listTop + 1150, W / 2, H / 2); await sleep(1800);
    await b.move(px, py); await sleep(900);
    await b.evalJs('__p.start()'); await b.burst(px, py, notches, dir * 100, every); await sleep(1200);
    const S = await b.evalJs('__p.stop()');
    const sc = S.filter((s, i) => i && s.y !== S[i - 1].y);
    const inList = sc.filter((s) => s.py > 0 && s.act >= 0);
    const match = inList.filter((s) => s.top === s.act && s.clip <= 10).length;
    const acts = []; S.forEach((s, i) => { if (i && s.act !== S[i - 1].act) acts.push(S[i - 1].act + '>' + s.act); });
    const dt = S.slice(1).map((s, i) => s.t - S[i].t);
    const stick = S.filter((s) => s.py > 60 && s.py < 200 && s.y > 0).map((s) => s.py);
    console.log(name.padEnd(34), JSON.stringify({ framesScrolling: sc.length, pctPhotoMatchesRow: +(100 * match / Math.max(1, inList.length)).toFixed(0), rowChanges: acts.length, previewTopWhileSticky: stick.length ? [Math.min(...stick), Math.max(...stick)] : null, maxLayers: Math.max(...S.map((s) => s.layers)), dt: stats(dt) }));
  };
  for (const [vn, cfg] of Object.entries(VARS)) {
    await b.evalJs(`window.__cfg = ${JSON.stringify(cfg)}`);
    await scen(`S1 ${vn} @2500px/s`, 40, 10);
    await scen(`S1 ${vn} @1430px/s`, 70, 10);
    await scen(`S1 ${vn} @ 910px/s`, 110, 9);
  }
  await b.evalJs('window.__cfg = ' + JSON.stringify(VARS['B expo.out 500']));
  // ---- S2: hover jump latency row1 -> row2 -> row3 ----
  await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2200);
  const rr = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
  await b.move(lb + 250, rr[0]); await sleep(1500);
  const t0 = await b.evalJs('__p.start()'); await b.move(lb + 250, rr[1]); await sleep(1500);
  let S = await b.evalJs('__p.stop()');
  const iAct = S.findIndex((s) => s.act === 1), tA = S[iAct].t;
  const at = (th) => { const s = S.find((s, i) => i >= iAct && s.top === 1 && s.clip <= th); return s ? Math.round(s.t - tA) : null; };
  console.log('S2 hover row1->row2', JSON.stringify({ ms_pointerEvent_to_rowActive: Math.round(tA - t0), ms_rowActive_to_photo_clip_below: { '90%': at(90), '50%': at(50), '10%': at(10), '0.5%': at(0.5) }, previewTopRange: [Math.min(...S.map((s) => s.py)), Math.max(...S.map((s) => s.py))], previewLeftRange: [Math.min(...S.map((s) => s.px)), Math.max(...S.map((s) => s.px))] }));
  // ---- S3: fast sweep rows 1->3 (3 wipes started within 250 ms): stack depth + settle ----
  await b.move(lb + 250, rr[0]); await sleep(1500);
  await b.evalJs('__p.start()');
  const n = 14; for (let i = 1; i <= n; i++) { await b.move(lb + 250, rr[0] + (Math.min(H - 70, rr[2]) - rr[0]) * (i / n)); await sleep(16); }
  await sleep(1400);
  S = await b.evalJs('__p.stop()');
  const last = S.at(-1); const iFull = S.findIndex((s) => s.act === 2 && s.top === 2 && s.clip <= 0.5), iA2 = S.findIndex((s) => s.act === 2);
  console.log('S3 sweep', JSON.stringify({ maxLayers: Math.max(...S.map((s) => s.layers)), finalLayers: last.layers, ms_row3Active_to_photo3_done: iFull >= 0 ? Math.round(S[iFull].t - S[iA2].t) : null, final: { act: last.act, top: last.top, clip: last.clip }, dt: stats(S.slice(1).map((s, i) => s.t - S[i].t)) }));
  // ---- end of list: the preview un-sticks with the lane ----
  await b.wheelTo(listTop + 1650, W / 2, H / 2); await sleep(1500);
  console.log('shot list end', await b.shot(`proto-04-end-${W}`));
  console.log('errors', b.errors);
  await b.close();
  process.exit(0);
}
