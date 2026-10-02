// d2-jumps: are there visual position jumps that scrolling alone does not explain? Samples, every rAF, scrollY and the screen position of reference
// elements, with real wheel input across the pinned Recipe scene (start / end of the pin) and the hero parallax.
//   node tools/qa/probes/d2-jumps.mjs [--profile=bursts|flick|steady] [--from=8800 --px=4600] [--cpu=1]
import { launch, goto, playWheel, profiles, sleep, arg } from './d2-lib.mjs';
const PROFILE = arg('profile', 'bursts'), FROM = +arg('from', 8800), PX = +arg('px', 4600), CPU = +arg('cpu', 1);
const c = await launch({ port: +arg('port', 9402), profile: 'jump', cpu: CPU });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(2500);
await c.ev(`(() => { window.__J = { rec: true, rows: [] }; const q = (s) => document.querySelector(s); const els = { stage: q('.rc__stage'), head: q('.hdr'), f1: q('.rc__step:nth-child(1) .rc__frame'), f2: q('.rc__step:nth-child(2) .rc__frame'), txt1: q('.rc__step:nth-child(1) .rc__txt'), no1: q('.rc__step:nth-child(1) .rc__no'), spacer: q('.pin-spacer') };
  (function f(t) { if (!window.__J.rec) return; const r = [t, scrollY]; for (const k of Object.keys(els)) { const b = els[k] && els[k].getBoundingClientRect(); r.push(b ? +b.top.toFixed(2) : null); } window.__J.rows.push(r); requestAnimationFrame(f); })(performance.now()); window.__J.keys = Object.keys(els); })(); 1`);
await playWheel(c, profiles[PROFILE](PX));
await sleep(1500);
const J = JSON.parse(await c.ev(`window.__J.rec = false, JSON.stringify(window.__J)`));
const k = J.keys, rows = J.rows; const idx = (n) => 2 + k.indexOf(n);
// pinned range from the DOM: stage top == 0 and spacer present
const pinned = rows.filter((r) => Math.abs(r[idx('stage')]) < 0.6);
console.log('frames', rows.length, 'pinned frames (stage.top≈0)', pinned.length, 'scrollY range pinned', pinned.length ? [Math.round(pinned[0][1]), Math.round(pinned.at(-1)[1])] : '-');
// residual: stage top should be 0 for the whole pinned range once it has reached 0; before it scrolls with the page (d top = -d scrollY)
let maxPinDrift = 0, enter = null, leave = null;
for (let i = 1; i < rows.length; i++) {
  const dS = rows[i][1] - rows[i - 1][1], dT = rows[i][idx('stage')] - rows[i - 1][idx('stage')];
  const wasPinned = Math.abs(rows[i - 1][idx('stage')]) < 0.6, isPinned = Math.abs(rows[i][idx('stage')]) < 0.6;
  if (!wasPinned && isPinned && enter == null) enter = i; if (wasPinned && !isPinned && enter != null && leave == null) leave = i;
  if (wasPinned && isPinned) maxPinDrift = Math.max(maxPinDrift, Math.abs(dT));
  // not pinned: stage should move by exactly -dS (normal flow), residual = dT + dS
  if (!wasPinned && !isPinned) { const res = dT + dS; if (Math.abs(res) > 1.5 && rows[i][idx('stage')] > -2000) console.log(`  non-pinned residual ${res.toFixed(1)}px at scrollY=${rows[i][1].toFixed(0)} (dScroll ${dS.toFixed(1)}, dTop ${dT.toFixed(1)})`); }
}
console.log('max stage drift while pinned:', maxPinDrift.toFixed(2), 'px');
const show = (i, label) => { if (i == null) return console.log(label, 'n/a'); console.log(label); for (let j = Math.max(1, i - 4); j < Math.min(rows.length, i + 5); j++) console.log(`   t=${rows[j][0].toFixed(0)} dt=${(rows[j][0] - rows[j - 1][0]).toFixed(1)} scrollY=${rows[j][1].toFixed(1)} dScroll=${(rows[j][1] - rows[j - 1][1]).toFixed(1)} stage.top=${rows[j][idx('stage')]} spacer.top=${rows[j][idx('spacer')]}`); };
show(enter, 'pin START (frames around the first pinned frame):'); show(leave, 'pin END (frames around the first unpinned frame):');
// header: while a frame shows the stage, does the header position jump?
// scroll step smoothness: ratio of consecutive scroll deltas (Lenis lerp should decay smoothly)
const ds = []; for (let i = 1; i < rows.length; i++) ds.push(rows[i][1] - rows[i - 1][1]);
let spikes = 0; for (let i = 2; i < ds.length; i++) if (ds[i] > 0 && ds[i - 1] > 0 && ds[i] > 2.2 * ds[i - 1] && ds[i] > 12) spikes++;
console.log(`scroll step spikes (a frame moving >2.2x the previous one, >12px): ${spikes} of ${ds.length}; max step ${Math.max(...ds.map(Math.abs)).toFixed(1)}px`);
await c.close();
