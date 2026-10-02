// d4-09: hover/click interactions outside the Services panel: palette pill, nav underline vs aria-current, FAB vs panel overlap,
// IG marquee (hover pause, click -> focus-within pause), FAQ exclusive accordion (clicked row moves away from the pointer).
// node tools/qa/probes/d4-09-chrome-interactions.mjs [w] [h] [port]
import { launch, sleep, OUT, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9423);
const b = await launch({ port: PORT, w: W, h: H, tag: `i${W}` });
await b.open('http://127.0.0.1:4423/');
// prevent link navigation (we only care about hover/focus states) but keep default focus behaviour
await b.evalJs(`document.addEventListener('click', (e) => { if (e.target.closest('a[target=_blank]')) e.preventDefault(); }, true); 0`);
const docTop = (sel) => b.evalJs(`document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().top + scrollY`);
const frames = (ms, expr) => b.evalJs(`new Promise((res) => { const out = []; const t0 = performance.now(); const f = (t) => { out.push([+(t - t0).toFixed(1), ${expr}]); if (t - t0 < ${ms}) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); })`);

// ---------------- A. palette pill ----------------
await b.wheelTo(await docTop('#services') + 200, W / 2, H / 2);
await sleep(1500);
const pal = await b.evalJs(`(() => { const r = document.querySelector('.pal').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height, vis: getComputedStyle(document.querySelector('.pal')).visibility }; })()`);
console.log('A palette rect idle', JSON.stringify(pal));
await b.move(W / 2, H / 2); await sleep(300);
const pIn = frames(700, `(() => { const r = document.querySelector('.pal').getBoundingClientRect(); return [Math.round(r.width * 10) / 10, Math.round(r.height)]; })()`);
await sleep(100); await b.move(pal.l + 22, pal.t + pal.h / 2); const rIn = await pIn;
const wIn = rIn.map((r) => r[1][0]);
console.log('A palette width per frame after pointer enters (first 14 frames after the move)', wIn.filter((w, i) => i > 5).slice(0, 14).join(' '), '| distinct widths:', [...new Set(wIn)].join(','));
const pOut = frames(700, `Math.round(document.querySelector('.pal').getBoundingClientRect().width * 10) / 10`);
await sleep(100); await b.move(W / 2, H / 2 - 100); const rOut = await pOut;
console.log('A palette width after pointer leaves', [...new Set(rOut.map((r) => r[1]))].join(','));
await b.move(W / 2, H / 2);

// ---------------- B. nav hover vs aria-current ----------------
await b.wheelTo(await docTop('#about') + 400, W / 2, H / 2); await sleep(1200);
// header is hidden after scrolling down: scroll up one notch to bring it back (as a user would)
await b.burst(W / 2, H / 2, 2, -100, 40); await sleep(1200);
const navInfo = await b.evalJs(`[...document.querySelectorAll('.hdr__nav a')].map((a) => { const r = a.getBoundingClientRect(); return { id: a.dataset.nav, cur: a.hasAttribute('aria-current'), x: r.left + r.width / 2, y: r.top + r.height / 2, line: getComputedStyle(a, '::after').transform }; })`);
console.log('B nav before hover', JSON.stringify(navInfo.map((n) => `${n.id}${n.cur ? '*' : ''}:${n.line === 'none' ? 'none' : n.line.slice(7, 12)}`)));
const hov = navInfo.find((n) => n.id === 'process');
await b.move(hov.x, hov.y); await sleep(700);
const navHover = await b.evalJs(`[...document.querySelectorAll('.hdr__nav a')].map((a) => ({ id: a.dataset.nav, cur: a.hasAttribute('aria-current'), line: getComputedStyle(a, '::after').transform }))`);
console.log('B nav hovering "process": underlined links =', navHover.filter((n) => n.line !== 'none' && !n.line.startsWith('matrix(0,')).map((n) => n.id + (n.cur ? '(current)' : '(hover)')).join(' + '));
await b.shot('09-nav-hover-' + W, { x: 0, y: 0, width: W, height: 90 });
await b.move(W / 2, H / 2);

// ---------------- C. FAB vs panel overlap (Services, pointer low in the viewport) ----------------
await b.wheelTo(await docTop('.svc__list') - 100, W / 2, H / 2); await sleep(2500);
const rowsVp = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return [q.top, q.bottom]; })`);
const lb = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().left`);
const rowLow = rowsVp.findIndex((r) => r[0] < H - 120 && r[1] > H - 120);
await b.move(W / 2, 20); await sleep(700);
await b.move(lb + 250, H - 120); await sleep(2000);
const ov = await b.evalJs(`(() => { const p = document.querySelector('.svc__panel').getBoundingClientRect(), f = document.querySelector('.fab__case').getBoundingClientRect(), c = document.querySelector('.fab__call').getBoundingClientRect(); const ix = (a, b2) => Math.max(0, Math.min(a.right, b2.right) - Math.max(a.left, b2.left)) * Math.max(0, Math.min(a.bottom, b2.bottom) - Math.max(a.top, b2.top)); return { panel: [p.left, p.top, p.right, p.bottom].map(Math.round), fab: [f.left, f.top, f.right, f.bottom].map(Math.round), overlapPx2: Math.round(ix(p, f) + ix(p, c)), panelArea: Math.round(p.width * p.height) }; })()`);
console.log('C pointer low in viewport (y=' + (H - 120) + ') panel vs FAB', JSON.stringify(ov));
await b.shot('09-fab-over-panel-' + W);
await b.move(W / 2, 20); await sleep(800);

// ---------------- D. IG marquee ----------------
await b.wheelTo(await docTop('.strip__view') - 300, W / 2, H / 2); await sleep(2000);
const mq = await b.evalJs(`(() => { const t = document.querySelector('.strip__track'); const a = t.getAnimations()[0]; return { state: a?.playState, dur: a?.effect.getComputedTiming().duration, w: t.scrollWidth, set: t.firstElementChild.offsetWidth }; })()`);
console.log('D marquee', JSON.stringify(mq), 'speed px/s =', Math.round(mq.set / (mq.dur / 1000)));
const sv = await b.evalJs(`(() => { const r = document.querySelector('.strip__view').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
const tx = `new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.strip__track')).transform).m41`;
const seg = async (label, ms) => { const f = await frames(ms, tx); const v = f.map((s) => s[1]); const d = v.slice(1).map((x, i) => x - v[i]); return label + ': Δx/frame first=' + d[0]?.toFixed(2) + ' last=' + d.at(-1)?.toFixed(2) + ' total=' + (v.at(-1) - v[0]).toFixed(1) + 'px'; };
await b.move(W / 2, 20);
console.log('D', await seg('running      ', 500));
const hoverP = seg('pointer over ', 600); await sleep(80); await b.move(sv.l + sv.w / 2, sv.t + sv.h / 2); console.log('D', await hoverP);
const leaveP = seg('pointer left ', 600); await sleep(80); await b.move(W / 2, 20); console.log('D', await leaveP);
// click a card (navigation prevented) then move away: is the marquee still paused?
const card = await b.evalJs(`(() => { const r = document.querySelectorAll('.strip__set .ig-card')[2].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
await b.click(card.x, card.y); await sleep(300);
await b.move(W / 2, 20); await sleep(1500);
const after = await b.evalJs(`({ state: document.querySelector('.strip__track').getAnimations()[0].playState, active: document.activeElement.className, mask: getComputedStyle(document.querySelector('.strip__view')).maskImage.slice(0, 30) })`);
console.log('D after mouse CLICK on a card and pointer moved away (1.5 s):', JSON.stringify(after), '(running would be state=running)');
await b.evalJs('document.activeElement.blur()');

// ---------------- E. FAQ exclusive accordion: click question 5 while question 1 is open ----------------
await b.wheelTo(await docTop('.faq__list') - 150, W / 2, H / 2); await sleep(2200);
const q = await b.evalJs(`[...document.querySelectorAll('.faq__q')].map((s) => { const r = s.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })`);
console.log('E FAQ open at start:', await b.evalJs(`[...document.querySelectorAll('.faq__item')].map((d, i) => d.open ? i + 1 : '').join('')`));
const tgt = 4; // 5th
await b.move(q[tgt].x, q[tgt].y); await sleep(300);
const fr = frames(1600, `(() => { const s = document.querySelectorAll('.faq__q')[${tgt}].getBoundingClientRect(); return [Math.round(s.top * 10) / 10, scrollY, document.querySelector('footer.ftr').getBoundingClientRect().top | 0]; })()`);
await sleep(60); await b.click(q[tgt].x, q[tgt].y); const fres = await fr;
const tops = fres.map((r) => r[1][0]);
console.log('E clicked row top (viewport y) over time: start', tops[0], 'min', Math.min(...tops), 'end', tops.at(-1), '=> moved', Math.round(tops.at(-1) - tops[0]), 'px; pointer y stays', Math.round(q[tgt].y), '| scrollY start/end', Math.round(fres[0][1][1]), Math.round(fres.at(-1)[1][1]));
const lag = fres.find((r, i) => i && Math.abs(r[1][0] - tops.at(-1)) < 2);
console.log('E ms until the clicked row settles', lag ? Math.round(lag[0]) : '?', ' | row still under the pointer at end?', Math.abs(tops.at(-1) - (q[tgt].y - 40)) < 40);
await b.shot('09-faq-after-click-' + W);
console.log('errors', b.errors);
await b.close();
process.exit(0);
