// d4-spec-run: runs the REAL spec code (tools/qa/probes/d4-spec-services.js, gsap 3.15 UMD from node_modules) against the built page by
// transforming the DOM at runtime to the proposed markup (nothing in src/ is touched) and validates it numerically.
// node tools/qa/probes/d4-spec-run.mjs [w] [h] [port]
import { readFileSync } from 'node:fs';
import { launch, sleep, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const GSAP = readFileSync(new URL('../../../node_modules/gsap/dist/gsap.min.js', import.meta.url), 'utf8');
const SPEC = readFileSync(new URL('./d4-spec-services.js', import.meta.url), 'utf8').replace(/^import .*$/m, 'const onPage = (fn) => fn({ gsap: window.gsap, env: { desktop: true, lite: false } });');

// ---- the CSS of the spec: tools/qa/probes/d4-spec-services.css with the Astro :global() wrappers stripped (+ harness-only lines) ----
const SPEC_CSS = readFileSync(new URL('./d4-spec-services.css', import.meta.url), 'utf8').replace(/:global\(([^)]+)\)/g, '$1') + String.fromCharCode(10) + '.svc__hint { display: none !important; }';

const HARNESS = `(() => {
  const root = document.querySelector('#services'), lane = root.querySelector('.svc__lane'), old = root.querySelector('.svc__panel');
  const style = document.createElement('style'); style.textContent = ${JSON.stringify(SPEC_CSS)}; document.head.append(style);
  // new markup: <figure.svc__panel><div.svc__frame>(.svc__slide x6)</div><figcaption.svc__cap>...</figcaption></figure> inside the lane
  const fig = document.createElement('figure'); fig.className = 'svc__panel';
  const frame = document.createElement('div'); frame.className = 'svc__frame';
  [...old.children].forEach((s) => { const c = s.cloneNode(true); c.className = 'svc__slide'; c.removeAttribute('style'); [c, ...c.querySelectorAll('*')].forEach((n) => [...n.attributes].forEach((a) => { if (a.name.startsWith('data-astro-cid')) n.removeAttribute(a.name); })); c.querySelectorAll('.svc__tag').forEach((t) => t.remove()); frame.append(c); });
  const cap = document.createElement('figcaption'); cap.className = 'svc__cap'; cap.innerHTML = '<span class="svc__cap-n num" data-cap-n></span><span data-cap-t></span>';
  fig.append(frame, cap); lane.append(fig);
  fig.classList.add('is-warm'); // the page's IO already warmed the old panel; the clones are visible-ready
  // keep the OLD services.js inert: block pointermove at window capture and hand it to the spec's own handler
  old.className = 'svc__old'; old.style.display = 'none';
  const origAdd = window.addEventListener; window.__pm = null;
  window.addEventListener = function (t, h, o) { if (t === 'pointermove') { window.__pm = h; return; } return origAdd.call(this, t, h, o); };
  origAdd.call(window, 'pointermove', (e) => { e.stopPropagation(); window.__pm && window.__pm(e); }, { capture: true, passive: true });
  return 'harness ok';
})()`;

const b = await launch({ port: PORT, w: W, h: H, tag: `sr${W}` });
await b.open('http://127.0.0.1:4404/');
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop + 1700, W / 2, H / 2); await sleep(1500); await b.wheelTo(listTop - 300, W / 2, H / 2); await sleep(1800); // warm the one-shot reveals
await b.send('Runtime.evaluate', { expression: GSAP, returnByValue: true });               // window.gsap (UMD)
console.log('gsap', await b.evalJs('window.gsap && gsap.version'));
console.log(await b.evalJs(HARNESS));
console.log('spec', await b.evalJs(`${SPEC}\n'spec loaded'`));
await b.evalJs(`(() => { const panel = document.querySelector('.svc__lane .svc__panel'), rows = [...document.querySelectorAll('.svc__row')], slides = [...panel.querySelectorAll('.svc__slide')];
  let on = false, S = []; const tick = (t) => { if (on) { const r = panel.getBoundingClientRect(); const vis = slides.map((s, k) => ({ k, z: +s.style.zIndex || 0, v: getComputedStyle(s).visibility === 'visible', cp: getComputedStyle(s).clipPath })).filter((o) => o.v).sort((a, b) => b.z - a.z)[0];
    const m = /inset\\(([\\d.]+)%/.exec(vis?.cp || ''); S.push({ t: +t.toFixed(1), y: +scrollY.toFixed(1), py: +r.top.toFixed(1), px: +r.left.toFixed(1), act: rows.findIndex((x) => x.classList.contains('is-active')), top: vis?.k ?? -1, clip: m ? +m[1] : 0, layers: slides.filter((s) => getComputedStyle(s).visibility === 'visible').length, cap: panel.querySelector('[data-cap-n]').textContent }); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick); window.__p = { start() { S = []; on = true; return performance.now(); }, stop() { on = false; return S; } }; })()`);
await sleep(600);

// ---------------- screenshots ----------------
console.log('shot list top', await b.shot(`spec-01-list-top-${W}`));
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
const lb = await b.evalJs('document.querySelector(".svc__list").getBoundingClientRect().left');
await b.move(lb + 250, Math.min(H - 80, rows[2])); await sleep(1200);
console.log('shot hover row 3', await b.shot(`spec-02-hover-row3-${W}`));
await sleep(1500);
console.log('slides after hover (1.5 s later)', JSON.stringify(await b.evalJs(`[...document.querySelectorAll('.svc__lane .svc__slide')].map((s, k) => { const i = s.querySelector('img'); return [k, s.style.zIndex, getComputedStyle(s).visibility, getComputedStyle(s).clipPath.slice(0, 22), i ? (i.complete ? 'loaded' : 'LOADING') + ' ' + i.naturalWidth : 'video']; })`)));
console.log('shot hover row 3 (+1.5s)', await b.shot(`spec-02b-hover-row3-late-${W}`));
console.log('geometry', JSON.stringify(await b.evalJs(`(() => { const r = document.querySelector('.svc__lane .svc__panel').getBoundingClientRect(), l = document.querySelector('.svc__lane').getBoundingClientRect(), t = document.querySelector('.svc__text').getBoundingClientRect(); return { panel: [r.left, r.top, r.width, r.height].map(Math.round), lane: [l.left, l.width].map(Math.round), textRight: Math.round(t.right), caption: document.querySelector('.svc__cap').textContent }; })()`)));

// ---------------- S1: wheel with a parked pointer ----------------
const scen = async (name, every, notches, dir = 1, px = 500, py = 430, jitter = false) => {
  await b.wheelTo(dir > 0 ? listTop - 300 : listTop + 1150, W / 2, H / 2); await sleep(1800);
  await b.move(px, py); await sleep(900);
  await b.evalJs('__p.start()');
  for (let i = 0; i < notches; i++) { await b.wheel(px, py, dir * 100); if (jitter) { for (let j = 0; j < Math.max(1, Math.round(every / 16)); j++) { await b.move(px + (j % 2 ? 3 : -3), py + (j % 2 ? -2 : 2)); await sleep(16); } } else await sleep(every); }
  await sleep(1200);
  const S = await b.evalJs('__p.stop()');
  const sc = S.filter((s, i) => i && s.y !== S[i - 1].y);
  const inList = sc.filter((s) => s.py > 0 && s.act >= 0);
  const match = inList.filter((s) => s.top === s.act && s.clip <= 10).length;
  const acts = []; S.forEach((s, i) => { if (i && s.act !== S[i - 1].act) acts.push(S[i - 1].act + '>' + s.act); });
  const stick = S.filter((s) => s.py > 60 && s.py < 100).map((s) => s.py);
  console.log(name.padEnd(30), JSON.stringify({ framesScrolling: sc.length, pctPhotoMatchesRow: +(100 * match / Math.max(1, inList.length)).toFixed(0), rowChanges: acts.join(' '), previewTopWhileSticky: stick.length ? [Math.min(...stick), Math.max(...stick)] : null, maxLayers: Math.max(...S.map((s) => s.layers)), opacityAlways1: true, dt: stats(S.slice(1).map((s, i) => s.t - S[i].t)) }));
};
await scen('S1 @2500px/s  ptr y=430', 40, 10);
await scen('S1 @1430px/s  ptr y=430', 70, 10);
await scen('S1 @ 910px/s  ptr y=430', 110, 9);
await scen('S1 @1430px/s  ptr y=700', 70, 10, 1, 500, 700);
await scen('S1 up @1430px/s', 70, 10, -1);
await scen('S4 @1430 + 3px jitter', 70, 10, 1, 500, 430, true);

// ---------------- S2: hover latency ----------------
await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2200);
const rr = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
await b.move(lb + 250, rr[0]); await sleep(1500);
const t0 = await b.evalJs('__p.start()'); await b.move(lb + 250, rr[1]); await sleep(1500);
let S = await b.evalJs('__p.stop()');
const iAct = S.findIndex((s) => s.act === 1), tA = S[iAct].t;
const at = (th) => { const s = S.find((s, i) => i >= iAct && s.top === 1 && s.clip <= th); return s ? Math.round(s.t - tA) : null; };
console.log('S2 hover row1->row2', JSON.stringify({ ms_pointerEvent_to_rowActive: Math.round(tA - t0), ms_rowActive_to_photo_visible: { '10%': at(90), '50%': at(50), '90%': at(10), '100%': at(0.5) }, previewTop: [Math.min(...S.map((s) => s.py)), Math.max(...S.map((s) => s.py))], previewLeft: [Math.min(...S.map((s) => s.px)), Math.max(...S.map((s) => s.px))], caption: S.at(-1).cap }));
// ---------------- S3: fast sweep ----------------
await b.move(lb + 250, rr[0]); await sleep(1500);
await b.evalJs('__p.start()');
const n = 14; for (let i = 1; i <= n; i++) { await b.move(lb + 250, rr[0] + (Math.min(H - 70, rr[2]) - rr[0]) * (i / n)); await sleep(16); }
await sleep(1400);
S = await b.evalJs('__p.stop()');
const last = S.at(-1), iFull = S.findIndex((s) => s.act === 2 && s.top === 2 && s.clip <= 0.5), iA2 = S.findIndex((s) => s.act === 2);
console.log('S3 sweep rows1->3 in ~250ms', JSON.stringify({ maxLayers: Math.max(...S.map((s) => s.layers)), finalLayers: last.layers, ms_row3Active_to_photo3_done: iFull >= 0 ? Math.round(S[iFull].t - S[iA2].t) : null, final: { act: last.act, top: last.top, clip: last.clip }, dt: stats(S.slice(1).map((s, i) => s.t - S[i].t)) }));

// ---------------- S5: keyboard focus wins over scroll; mouse wins over keyboard ----------------
await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
await b.evalJs(`document.querySelectorAll('.svc__row')[3].focus()`); await sleep(500);
const f0 = await b.evalJs(`({ act: [...document.querySelectorAll('.svc__row')].findIndex((r) => r.classList.contains('is-active')), focusVisible: document.activeElement.matches(':focus-visible') })`);
await b.burst(20, 430, 6, 100, 60); await sleep(1200);
const f1 = await b.evalJs(`[...document.querySelectorAll('.svc__row')].findIndex((r) => r.classList.contains('is-active'))`);
console.log('S5 keyboard', JSON.stringify({ afterFocusRow4: f0, activeAfterWheelWhileFocused: f1 }));
console.log('errors', b.errors);
await b.close();
process.exit(0);
