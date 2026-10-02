// d5-resize: desktop window resizing with Lenis + the mode-change reload. Real wheel input to reach a spot, then resize with Emulation.setDeviceMetricsOverride
// (fires `resize`, re-evaluates media queries) either in a drag-like ramp (steps every ~30 ms) or in one jump.
// Per scenario: anchor drift (what content sits at the viewport centre before/after), scrollY jumps, section shifts, ST refreshes (count + duration), reloads, LoAF.
// node tools/qa/probes/d5-resize.mjs [--spots=services,process,stories] [--mode=normal|reduced|calm]
import { launch, wheel, waitSettled, info, pullRec, analyze, save, sleep } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const mode = arg('mode', 'normal');
const spots = arg('spots', 'about,services,process,education,stories,faq').split(',');
const S = await launch(`resize-${mode}`, { device: 'desktop', mode, wait: 3500 });
const ANCHOR = `(() => {
  const ids = ['top','about','services','process','education','stories','faq','contact'];
  let cur = null; for (const id of ids) { const s = document.getElementById(id); if (s && s.getBoundingClientRect().top <= innerHeight * 0.5) cur = s; }
  if (!cur) return null; const r = cur.getBoundingClientRect();
  // first text block whose box contains/is below the viewport centre line
  const mid = innerHeight * 0.5; let best = null, bd = 1e9;
  for (const e of cur.querySelectorAll('h1,h2,h3,p,figure,img,summary,li')) { const b = e.getBoundingClientRect(); if (b.height < 4 || b.width < 4) continue; const d = Math.abs((b.top + b.height / 2) - mid); if (d < bd) { bd = d; best = e; } }
  const b = best && best.getBoundingClientRect();
  return { sec: cur.id, frac: +(-r.top / r.height).toFixed(4), y: Math.round(scrollY), h: document.documentElement.scrollHeight, el: best ? best.tagName.toLowerCase() + ' "' + (best.textContent || best.alt || '').trim().slice(0, 28) + '"' : null, elTop: b ? Math.round(b.top) : null, elDocTop: b ? Math.round(b.top + scrollY) : null };
})()`;
const go = async (id) => { await S.eval(`(() => { const s = document.getElementById(${JSON.stringify(id)}); window.__lenisTarget = s.getBoundingClientRect().top + scrollY + s.offsetHeight * 0.35; })()`); const ty = await S.eval('window.__lenisTarget');
  // wheel there with real events
  for (let guard = 0; guard < 400; guard++) { const y = await S.eval('scrollY'); const d = ty - y; if (Math.abs(d) < 60) break; const dy = Math.max(-300, Math.min(300, d)); await wheel(S, { dy }); await sleep(28); }
  await waitSettled(S, { quiet: 500, max: 5000 }); };
const rows = [];
async function scenario(name, spot, action) {
  await go(spot);
  await sleep(600);
  const before = await S.eval(ANCHOR);
  const navBefore = S.nav.length;
  const T0 = Date.now();
  await action();
  await sleep(1800); // let refresh / reload settle
  await sleep(2500 * (S.nav.length > navBefore ? 1 : 0));
  await pullRec(S);
  const after = await S.eval(ANCHOR);
  const a = analyze(S.rec, { from: T0, minJump: 25 });
  const refreshes = S.rec.ev.filter((e) => e.T >= T0 && e.type === 'st-refresh').length;
  const resizeEv = S.rec.ev.filter((e) => e.T >= T0 && e.type === 'resize').length;
  const row = { name, spot, reloaded: S.nav.length - navBefore, before, after, drift: before && after ? { sameSec: before.sec === after.sec, dFrac: +(after.frac - before.frac).toFixed(4), elDocShift: before.elDocTop != null ? null : null, viewportShiftOfAnchorEl: null } : null,
    refreshes, resizeEv, jumps: a.scrollJumps, sectionShifts: a.sectionShifts.length, docH: a.docHeightChanges.length, cls: a.clsTotal, dtMax: a.dt.max, gt50: a.dt.gt50, loaf: a.loaf.map((l) => ({ dur: l.dur, s: l.scripts.map((s) => s.f + ':' + s.d).join(',') })) };
  rows.push(row);
  console.log(`\n## ${name} @${spot}: reloads=${row.reloaded} resizeEvents=${resizeEv} stRefresh=${refreshes} jumps=${a.scrollJumps.length} secShifts=${a.sectionShifts.length} heightChanges=${a.docHeightChanges.length} CLS=${a.clsTotal} dt max=${a.dt.max} >50ms=${a.dt.gt50}`);
  console.log('   before', JSON.stringify(before)); console.log('   after ', JSON.stringify(after));
  a.scrollJumps.slice(0, 5).forEach((j) => console.log('   JUMP', JSON.stringify(j)));
  a.loaf.slice(0, 4).forEach((l) => console.log('   LoAF', l.dur, JSON.stringify(l.scripts)));
  return row;
}
const ramp = async (w0, w1, h, stepPx = 12, every = 30) => { const n = Math.ceil(Math.abs(w1 - w0) / stepPx); for (let i = 1; i <= n; i++) { await S.metrics(Math.round(w0 + ((w1 - w0) * i) / n), h); await sleep(every); } };
const W = 1366, H = 820;
for (const spot of spots) {
  await S.metrics(W, H); await sleep(1200); // back to base (may reload if a previous scenario crossed 768)
  await scenario('ramp 1366->1200', spot, () => ramp(W, 1200, H));
  await scenario('jump 1200->1600', spot, () => S.metrics(1600, H));
  await scenario('ramp 1600->1366', spot, () => ramp(1600, W, H));
}
// height-only (desktop: ScrollTrigger refreshes on any resize; mobile ignores height-only)
await S.metrics(W, H); await sleep(1000);
await scenario('height 820->700->820', 'services', async () => { await S.metrics(W, 700); await sleep(300); await S.metrics(W, H); });
// crossing 768: reload + restore
await scenario('cross 768 (1366->700)', 'services', () => S.metrics(700, H));
await scenario('cross 768 back (700->1366)', 'services', () => S.metrics(W, H));
rep: {
  const out = { rows, nav: S.nav, errors: S.errors };
  save(`resize-${mode}.json`, out);
}
console.log('\nnav events', S.nav.length, 'errors', S.errors.length ? S.errors : 'none');
S.close();
