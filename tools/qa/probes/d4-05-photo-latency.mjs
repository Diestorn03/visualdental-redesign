// d4-05: latency between "row highlighted" and "its photo visible" (clip-path wipe), single jump + fast sweep (rows 1->3 in ~250 ms).
// Records per frame the clip-path inset of every slide + z-index.  node tools/qa/probes/d4-05-photo-latency.mjs [w] [h] [port]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `l${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(`(() => {
  const panel = document.querySelector('.svc__panel'), rows = [...document.querySelectorAll('.svc__row')], slides = [...panel.children];
  let on = false, S = [];
  const inset = (s) => { const m = /inset\\(([\\d.]+)%/.exec(getComputedStyle(s).clipPath); return m ? +(+m[1]).toFixed(1) : 0; };
  const tick = (t) => { if (on) { const r = panel.getBoundingClientRect(); S.push({ t: +t.toFixed(1), act: rows.findIndex((x) => x.classList.contains('is-active')), z: slides.map((s) => +s.style.zIndex || 0), cp: slides.map(inset), po: +(+getComputedStyle(panel).opacity).toFixed(3), py: +r.top.toFixed(1), px: +r.left.toFixed(1) }); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__r5 = { start() { S = []; on = true; return performance.now(); }, stop() { on = false; return S; } };
})()`);
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop - 120, W / 2, H / 2);
await sleep(2500);
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
const lb = await b.evalJs(`(() => { const r = document.querySelector('.svc__list').getBoundingClientRect(); return r.left; })()`);
const X = lb + 250;
const analyse = (S, t0, label, from, to) => {
  // first frame where act === to
  const iAct = S.findIndex((s) => s.act === to);
  const tAct = iAct >= 0 ? S[iAct].t : null;
  const path = (th) => { const s = S.find((s, i) => i >= iAct && s.cp[to] <= th && Math.max(...s.z) === s.z[to]); return s && tAct != null ? Math.round(s.t - tAct) : null; };
  console.log(label, JSON.stringify({ ms_pointerEvent_to_rowActive: tAct != null ? Math.round(tAct - t0) : null, ms_rowActive_to_photo_clip_below: { '90%': path(90), '50%': path(50), '10%': path(10), '0.5%': path(0.5) } }));
};
await b.move(X, rows[0]); await sleep(2500); // settle on row 1 (panel shown)
// ---- jump 1 -> 2 ----
let t0 = await b.evalJs('__r5.start()'); await b.move(X, rows[1]); await sleep(1800);
let S = await b.evalJs('__r5.stop()'); analyse(S, t0, 'jump row1->row2', 0, 1);
writeFileSync(`${OUT}d4-05-jump-${W}.json`, JSON.stringify(S));
// ---- jump 2 -> 3 ----
await sleep(800);
t0 = await b.evalJs('__r5.start()'); await b.move(X, Math.min(H - 70, rows[2])); await sleep(1800);
S = await b.evalJs('__r5.stop()'); analyse(S, t0, 'jump row2->row3', 1, 2);
// ---- fast sweep 1 -> 3 (rows highlighted: 0,1,2 within ~250 ms), then hold ----
await b.move(X, rows[0]); await sleep(2500);
t0 = await b.evalJs('__r5.start()');
const n = 14; for (let i = 1; i <= n; i++) { const yy = rows[0] + (Math.min(H - 70, rows[2]) - rows[0]) * (i / n); await b.move(X, yy); await sleep(16); }
const tEnd = await b.evalJs('performance.now()');
await sleep(1800);
S = await b.evalJs('__r5.stop()');
writeFileSync(`${OUT}d4-05-sweep-${W}.json`, JSON.stringify(S));
console.log('sweep took ms', Math.round(tEnd - t0));
analyse(S, t0, 'sweep (final row 3)', 0, 2);
// what was on screen during the sweep: per 50 ms print act | top slide | clip of slides 0..2
const rep = []; let last = -1e9; for (const s of S) { if (s.t - last >= 50) { last = s.t; rep.push(`${String(Math.round(s.t - t0)).padStart(4)}ms act=${s.act} z=[${s.z.slice(0, 4).join(',')}] clip%=[${s.cp.slice(0, 4).join(',')}]`); } }
console.log(rep.slice(0, 40).join('\n'));
console.log('errors', b.errors);
await b.close();
process.exit(0);
