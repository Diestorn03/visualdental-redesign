// d3: per-frame scroll recorder driven by REAL wheel events (Input.dispatchMouseEvent mouseWheel).
// Samples after Lenis + ScrollTrigger have run in each gsap tick, so it sees what is painted. Reports: frame-time distribution per section,
// scroll-position stalls / reversals while Lenis is still moving, residual jumps of section tops (layout shifts), pin jitter (stage top != 0 while pinned).
// Usage: node tools/qa/probes/d3-scroll.mjs [profile=notch|fast|pad|up] [dpr=1] [w=1366] [h=820] [url]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT, summarize } from './d3-lib.mjs';

const PROFILE = process.argv[2] || 'notch';
const DPR = +(process.argv[3] || 1);
const W = +(process.argv[4] || 1366), H = +(process.argv[5] || 820);
const URL_ = process.argv[6] || 'http://127.0.0.1:4403/';
const PORT = +(process.env.CDP_PORT || 9403);

const b = await launch({ port: PORT, w: W, h: H, dpr: DPR, url: URL_ });
await sleep(4500);
console.log('state:', await b.ev(`document.documentElement.className + ' | docH=' + document.documentElement.scrollHeight + ' dpr=' + devicePixelRatio`));

await b.ev(`(() => {
  const g = window.__gsap, ST = window.__ST;
  const secs = [...document.querySelectorAll('main > section[id], footer.ftr')];
  const stage = document.querySelector('.rc__stage');
  const stPin = ST.getAll().find((s) => s.pin);
  const R = (window.__R = { t: [], y: [], la: [], tg: [], v: [], tops: [], stage: [], pinActive: [], hdr: [], pinStart: stPin?.start, pinEnd: stPin?.end, ids: secs.map((s) => s.id || 'footer') });
  const lenis = window.__lenis;
  const hdr = document.querySelector('[data-header]');
  window.__recOn = true;
  g.ticker.add(() => {
    if (!window.__recOn) return;
    const y = scrollY;
    R.t.push(performance.now()); R.y.push(y); R.la.push(lenis.animatedScroll); R.tg.push(lenis.targetScroll); R.v.push(lenis.velocity);
    R.tops.push(secs.map((s) => s.getBoundingClientRect().top + y));
    R.stage.push(stage ? stage.getBoundingClientRect().top : null);
    R.pinActive.push(stPin ? (stPin.isActive ? 1 : 0) : null);
    R.hdr.push(hdr ? hdr.classList.contains('is-hidden') ? 1 : 0 : null);
  });
  // long animation frames with script attribution
  R.loaf = [];
  try { new PerformanceObserver((l) => l.getEntries().forEach((e) => R.loaf.push({ t: Math.round(e.startTime), dur: Math.round(e.duration), block: Math.round(e.blockingDuration), render: Math.round(e.renderStart ? e.startTime + e.duration - e.renderStart : 0), style: Math.round(e.styleAndLayoutStart ? e.startTime + e.duration - e.styleAndLayoutStart : 0), y: Math.round(scrollY), sc: (e.scripts || []).map((s) => ({ d: Math.round(s.duration), inv: s.invoker?.slice(0, 40), fn: s.sourceFunctionName?.slice(0, 30), src: (s.sourceURL || '').split('/').pop()?.slice(0, 30) + ':' + s.sourceCharPosition })) }))).observe({ type: 'long-animation-frame', buffered: false }); } catch (e) { R.loafErr = String(e); }
  return 1;
})()`);

const total = await b.ev('document.documentElement.scrollHeight - innerHeight');
const rnd = (a, c) => a + Math.floor(Math.random() * (c - a + 1));
let guard = 0;
async function run() {
  if (PROFILE === 'up') { // go to the bottom of the pin region first, then scroll UP through the whole page with notches
    await b.ev(`window.__lenis.scrollTo(${total}, { immediate: true, force: true }); 1`); await sleep(1200);
    await b.ev(`window.__R.t.length = window.__R.y.length = window.__R.la.length = window.__R.tg.length = window.__R.v.length = window.__R.tops.length = window.__R.stage.length = window.__R.pinActive.length = window.__R.hdr.length = 0; 1`);
    while (guard++ < 600) { const y = await b.ev('scrollY'); if (y <= 4) break; const n = rnd(6, 12); for (let i = 0; i < n; i++) { await b.wheel(-100); await sleep(rnd(16, 30)); } await sleep(rnd(120, 400)); }
    return;
  }
  while (guard++ < 800) {
    const y = await b.ev('scrollY'); if (y >= total - 4 && guard > 5) break;
    if (PROFILE === 'notch') { const n = rnd(6, 12); for (let i = 0; i < n; i++) { await b.wheel(100); await sleep(rnd(16, 30)); } await sleep(rnd(120, 400)); }
    else if (PROFILE === 'fast') { for (let i = 0; i < 60; i++) { await b.wheel(100); await sleep(8); } await sleep(rnd(300, 700)); }
    else if (PROFILE === 'pad') { // precision touchpad flick: a ramp of small deltas then a decaying inertia tail
      let d = 4; for (let i = 0; i < 12; i++) { await b.wheel(d); d += 6; await sleep(8); }
      for (let i = 0; i < 40; i++) { await b.wheel(Math.max(1, d)); d *= 0.9; await sleep(8); }
      await sleep(rnd(300, 600));
    }
  }
}
const t0 = Date.now();
await run();
await sleep(1500);
await b.ev('window.__recOn = false; 1');
console.log('wheel run took', Date.now() - t0, 'ms');
const R = await b.ev('window.__R');
writeFileSync(`${OUT}scroll-${PROFILE}-dpr${DPR}.json`, JSON.stringify(R));

// ---------------- analysis ----------------
const n = R.t.length;
const dt = []; for (let i = 1; i < n; i++) dt.push(R.t[i] - R.t[i - 1]);
const secAt = (y) => { let id = '-'; R.ids.forEach((s, k) => { if (R.tops[0][k] <= y + 1) id = s; }); return id; };
console.log(`\nframes: ${n}  dt:`, JSON.stringify(summarize(dt)));
const over = (x) => dt.filter((d) => d > x).length;
console.log(`dt>20ms: ${over(20)}  >25: ${over(25)}  >33: ${over(33)}  >50: ${over(50)}  >100: ${over(100)}`);
const bySec = {};
for (let i = 1; i < n; i++) { const s = secAt(R.y[i]); (bySec[s] ||= []).push(R.t[i] - R.t[i - 1]); }
console.log('\nper section: frames, mean, p95, max, >25ms');
for (const [s, a] of Object.entries(bySec)) { const q = summarize(a); console.log(`  ${s.padEnd(10)} n=${String(q.n).padStart(4)} mean=${q.mean} p95=${q.p95.toFixed(1)} max=${q.max.toFixed(1)} >25ms=${a.filter((d) => d > 25).length}`); }
const worst = dt.map((d, i) => [d, i + 1]).sort((a, c) => c[0] - a[0]).slice(0, 12);
console.log('\nworst frames: dt@y (section)');
console.log(worst.map(([d, i]) => `${d.toFixed(0)}ms@${Math.round(R.y[i])}(${secAt(R.y[i])})`).join('  '));

// scroll continuity: Lenis wants to move (|la-y| > 1.5) but the page position did not change; direction reversals; big per-frame steps
let stall = 0, rev = 0; const stalls = [], steps = [];
for (let i = 1; i < n; i++) {
  const dy = R.y[i] - R.y[i - 1], dla = R.la[i] - R.la[i - 1];
  steps.push(Math.abs(dy));
  if (Math.abs(dla) > 2 && Math.abs(dy) < 0.01) { stall++; stalls.push(Math.round(R.y[i])); }
  if (dy * dla < 0 && Math.abs(dy) >= 1 && Math.abs(dla) >= 1) rev++;
}
console.log(`\nscroll: Lenis moving but scrollY frozen: ${stall} frames ${stalls.slice(0, 10)}  | direction reversals: ${rev} | max |dy|/frame: ${Math.max(...steps).toFixed(1)}`);
// y vs lenis.animatedScroll disagreement (px)
const gap = []; for (let i = 0; i < n; i++) gap.push(Math.abs(R.y[i] - R.la[i]));
console.log('|scrollY - lenis.animatedScroll|:', JSON.stringify(summarize(gap)));
// residual jumps: a section top that moved in document space (layout shift) between frames
const res = [];
for (let i = 1; i < n; i++) for (let k = 0; k < R.ids.length; k++) { const d = R.tops[i][k] - R.tops[i - 1][k]; if (Math.abs(d) > 0.5) res.push({ i, sec: R.ids[k], d: +d.toFixed(2), y: Math.round(R.y[i]) }); }
console.log('section tops that moved in document space between frames (layout shifts > 0.5px):', res.length, JSON.stringify(res.slice(0, 12)));
// pin jitter
if (R.pinStart != null) {
  const inPin = []; let pinDev = 0, engage = null, mism = 0;
  for (let i = 0; i < n; i++) {
    const y = R.y[i]; const s = R.stage[i];
    if (y > R.pinStart + 2 && y < R.pinEnd - 2) { inPin.push(Math.abs(s)); if (Math.abs(s) > 0.01) pinDev++; if (!R.pinActive[i]) mism++; }
  }
  console.log(`\npin ${R.pinStart}..${R.pinEnd}: frames inside ${inPin.length}; stage.top != 0 in ${pinDev} frames (max ${Math.max(0, ...inPin).toFixed(2)}px); ScrollTrigger.isActive false inside range in ${mism} frames`);
  // around the edges: print stage.top vs y for frames within +-60px of start and end
  for (const [name, edge] of [['start', R.pinStart], ['end', R.pinEnd]]) {
    const rows = []; for (let i = 0; i < n; i++) if (Math.abs(R.y[i] - edge) < 70) rows.push(`${R.y[i].toFixed(0)}:${R.stage[i]?.toFixed(1)}`);
    console.log(`  around pin ${name} (y:stage.top):`, rows.slice(0, 30).join(' '));
  }
}
console.log('\nheader is-hidden toggles:', R.hdr.reduce((a, v, i) => a + (i && v !== R.hdr[i - 1] ? 1 : 0), 0));
console.log('\nlong-animation-frames (>50ms):', R.loaf.length, R.loafErr || '');
for (const l of R.loaf.slice(0, 20)) console.log(' ', JSON.stringify(l));
await b.close();
