// d3: A/B jank harness. For each variant (CSS and/or JS injected at document start; nothing on disk changes) it reloads the page, jumps to just above a region,
// scrolls through it with real wheel events and reports the frame-time stats of the ticks inside the region. Repeats N trials per variant.
// Usage: node tools/qa/probes/d3-ab.mjs <region:hero|about|services|process|education|stories|faq|contact|y0-y1> <variants comma list or 'all'> [trials=3] [dpr=1]
import { launch, sleep, summarize } from './d3-lib.mjs';

const REGION = process.argv[2] || 'hero';
const WANT = (process.argv[3] || 'base').split(',');
const TRIALS = +(process.argv[4] || 3);
const DPR = +(process.argv[5] || 1);
const PORT = +(process.env.CDP_PORT || 9403);
const REGIONS = { hero: [0, 1000], about: [800, 3800], services: [3800, 6800], process: [9400, 12600], education: [12500, 14800], stories: [14800, 17400], faq: [17400, 19200], contact: [19200, 21100] };
const [Y0, Y1] = REGIONS[REGION] || REGION.split('-').map(Number);

const css = (s) => `(() => { const add = () => { const st = document.createElement('style'); st.textContent = ${JSON.stringify(s)}; document.head.appendChild(st); }; if (document.head) add(); else document.addEventListener('DOMContentLoaded', add); })();`;
const VARIANTS = {
  base: '',
  'no-backdrop': css('.hdr::after, .fab, .pal { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }'),
  'no-hero-mesh': css('.hero__mesh-wrap { display: none !important; }'),
  'no-hero-mask': css('.hero__photo { -webkit-mask-image: none !important; mask-image: none !important; }'),
  'hero-layers': css('.hero__mesh-wrap, .hero__photo { will-change: transform !important; }'),
  'no-clip-reveal': css('[data-reveal="clip"] { clip-path: none !important; }'),
  'no-offscreen-pause': css('[data-offscreen] *, [data-offscreen] *::before, [data-offscreen] *::after { animation-play-state: running !important; }'),
  'no-marquee': css('.strip__track { animation: none !important; will-change: auto !important; }'),
  'no-parallax-layer': css('.shot__in { transform: none !important; }'),
  'no-svc-panel': css('.svc__panel { display: none !important; }'),
  'no-hairline-anim': css('*, *::before, *::after { transition: none !important; }'),
  'no-css-anim': css('*, *::before, *::after { animation: none !important; }'),
  'layers-all-reveal': css('[data-reveal], [data-stagger] > * { will-change: transform, opacity; }'),
};
const names = WANT[0] === 'all' ? Object.keys(VARIANTS) : WANT;

const results = {};
for (const name of names) {
  const src = VARIANTS[name];
  if (src === undefined) { console.log('unknown variant', name); continue; }
  const trials = [];
  for (let k = 0; k < TRIALS; k++) {
    const b = await launch({ port: PORT, dpr: DPR, early: src || undefined, url: 'http://127.0.0.1:4403/' });
    await sleep(4200);
    await b.ev(`(() => { const R = (window.__A = { t: [], y: [] }); window.__gsap.ticker.add(() => { R.t.push(performance.now()); R.y.push(scrollY); }); return 1; })()`);
    await b.ev(`window.__lenis.scrollTo(${Math.max(0, Y0 - 500)}, { immediate: true, force: true }); 1`);
    await sleep(1200);
    await b.ev('window.__A.t.length = window.__A.y.length = 0; 1');
    // human-ish notches through the region
    let guard = 0;
    while (guard++ < 400) {
      const y = await b.ev('scrollY'); if (y >= Y1) break;
      const n = 8; for (let i = 0; i < n; i++) { await b.wheel(100); await sleep(20 + (i % 3) * 5); }
      await sleep(150);
    }
    await sleep(500);
    const A = await b.ev('window.__A');
    await b.close();
    const dt = []; for (let i = 1; i < A.t.length; i++) if (A.y[i] >= Y0 && A.y[i] <= Y1 && A.t[i] - A.t[i - 1] < 1500) dt.push(A.t[i] - A.t[i - 1]);
    const q = summarize(dt);
    const jank = dt.reduce((a, d) => a + Math.max(0, d - 16.7), 0);
    trials.push({ n: q.n, mean: q.mean, p95: q.p95, max: q.max, over25: dt.filter((d) => d > 25).length, over50: dt.filter((d) => d > 50).length, jank: Math.round(jank) });
    console.log(`  ${name} trial ${k + 1}: n=${q.n} mean=${q.mean} p95=${q.p95.toFixed(1)} max=${q.max.toFixed(0)} >25=${trials.at(-1).over25} >50=${trials.at(-1).over50} jank=${trials.at(-1).jank}ms`);
  }
  const avg = (key) => +(trials.reduce((a, t) => a + t[key], 0) / trials.length).toFixed(1);
  results[name] = { mean: avg('mean'), p95: avg('p95'), max: avg('max'), over25: avg('over25'), over50: avg('over50'), jank: avg('jank') };
}
console.log(`\n=== region ${REGION} y=${Y0}..${Y1} dpr=${DPR} trials=${TRIALS} (avg) ===`);
for (const [k, v] of Object.entries(results)) console.log(`${k.padEnd(20)} mean=${v.mean} p95=${v.p95} max=${v.max} >25ms=${v.over25} >50ms=${v.over50} jank(sum excess ms)=${v.jank}`);
