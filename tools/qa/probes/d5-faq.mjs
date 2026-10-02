// d5-faq: touch-tap the FAQ <details> on mobile/tablet and measure what moves: scrollY, the tapped summary's viewport position (does it slide away from the finger?),
// section/doc height over the 0.9 s block-size transition, layout shifts. Also taps on summaries ABOVE the open one and the exclusive-accordion closing of item 1.
// node tools/qa/probes/d5-faq.mjs --device=mobile
import { launch, touchScroll, waitSettled, pullRec, analyze, save, sleep } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const device = arg('device', 'mobile');
const S = await launch(`faq-${device}`, { device, wait: 3500 });
const tap = async (x, y) => { const t = Date.now() / 1000; await S.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }], timestamp: t }); await sleep(60); await S.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t + 0.06 }); };
// bring #faq list into view with real touch drags
const faqTop = await S.eval(`document.getElementById('faq').getBoundingClientRect().top + scrollY`);
let g = 0; while ((await S.eval('scrollY')) < faqTop - 40 && g++ < 80) { await touchScroll(S, { dist: 600, speed: 1500, fling: false }); await sleep(150); }
await waitSettled(S, { quiet: 400 });
await sleep(1500);
const SUM = `(() => [...document.querySelectorAll('.faq__item')].map((d, i) => { const s = d.querySelector('summary'); const r = s.getBoundingClientRect(); return { i, open: d.open, top: Math.round(r.top), h: Math.round(r.height), docTop: Math.round(r.top + scrollY), bodyH: Math.round(d.getBoundingClientRect().height) }; }))()`;
console.log('summaries at start', JSON.stringify(await S.eval(SUM)));
const report = [];
async function tapItem(i, label) {
  const sums = await S.eval(SUM); const s = sums[i];
  // make sure it is on screen: if not, scroll it to 55% of the viewport with a drag
  const T0 = Date.now();
  const yBefore = await S.eval('scrollY');
  const secTopBefore = await S.eval(`document.querySelector('.faq__item:nth-child(${i + 1}) summary').getBoundingClientRect().top`);
  await tap(Math.round(S.W / 2), Math.round(s.top + s.h / 2));
  // sample for 1.4 s (transition 0.9 s)
  await sleep(1500); await pullRec(S);
  const fr = S.rec.frames.filter((f) => f[1] >= T0 && f[1] <= T0 + 1500);
  const ys = fr.map((f) => f[3]), hs = fr.map((f) => f[4]);
  const secTopAfter = await S.eval(`document.querySelector('.faq__item:nth-child(${i + 1}) summary').getBoundingClientRect().top`);
  const a = analyze(S.rec, { from: T0, to: T0 + 1500, minJump: 10 });
  const states = await S.eval(`[...document.querySelectorAll('.faq__item')].map(d => d.open ? 1 : 0).join('')`);
  const r = { label, item: i, openStatesAfter: states, scrollY: [Math.round(yBefore), Math.round(ys.at(-1) ?? yBefore)], scrollYRange: [Math.round(Math.min(...ys)), Math.round(Math.max(...ys))], docH: [hs[0], hs.at(-1)], summaryViewportTop: [Math.round(secTopBefore), Math.round(secTopAfter)], tappedSummaryMovedBy: Math.round(secTopAfter - secTopBefore), jumps: a.scrollJumps, cls: a.clsTotal, dtMax: a.dt.max };
  report.push(r); console.log(label, JSON.stringify(r));
  return r;
}
// 1: item 0 is open by default. Tap item 2 (below it): item 0 collapses ABOVE the tapped row while item 2 expands.
await tapItem(2, 'tap #3 while #1 (above) is open');
await sleep(600);
// 2: tap #5 (below an open #3)
await tapItem(4, 'tap #5 while #3 (above) is open');
await sleep(600);
// 3: tap #2 (above the open #5): the open one is BELOW the tapped row
await tapItem(1, 'tap #2 while #5 (below) is open');
await sleep(600);
// 4: tap the open one to close it
await tapItem(1, 'tap #2 again (close)');
save(`faq-${device}.json`, { report, nav: S.nav, errors: S.errors });
S.close();
