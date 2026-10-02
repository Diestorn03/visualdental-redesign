// d3: does the jank come from FIRST views (raster/glyph/decode warm-up)? Scroll down the whole page 3 times (wheel notches), recording ticker frame times per pass.
import { launch, sleep, summarize } from './d3-lib.mjs';
const b = await launch({ port: 9403, url: 'http://127.0.0.1:4403/' });
await sleep(4500);
await b.ev(`(() => { const R = (window.__A = { t: [], y: [] }); window.__gsap.ticker.add(() => { R.t.push(performance.now()); R.y.push(scrollY); }); return 1; })()`);
const total = await b.ev('document.documentElement.scrollHeight - innerHeight');
const rnd = (a, c) => a + Math.floor(Math.random() * (c - a + 1));
const res = [];
for (let pass = 1; pass <= 3; pass++) {
  await b.ev('window.__A.t.length = window.__A.y.length = 0; 1');
  let guard = 0;
  while (guard++ < 800) { const y = await b.ev('scrollY'); if (y >= total - 4) break; for (let i = 0; i < 8; i++) { await b.wheel(100); await sleep(rnd(20, 30)); } await sleep(150); }
  await sleep(500);
  const A = await b.ev('window.__A');
  const dt = []; const worst = []; for (let i = 1; i < A.t.length; i++) { const d = A.t[i] - A.t[i - 1]; if (d < 1500) { dt.push(d); if (d > 40) worst.push(`${d.toFixed(0)}@${Math.round(A.y[i])}`); } }
  const q = summarize(dt); res.push(q);
  console.log(`pass ${pass} (down): n=${q.n} mean=${q.mean} p95=${q.p95.toFixed(1)} max=${q.max.toFixed(0)} >25ms=${dt.filter((d) => d > 25).length} >50ms=${dt.filter((d) => d > 50).length} jank=${Math.round(dt.reduce((a, d) => a + Math.max(0, d - 16.7), 0))}ms  worst: ${worst.slice(0, 14).join(' ')}`);
  // back to top instantly (not measured)
  await b.ev(`window.__lenis.scrollTo(0, { immediate: true, force: true }); 1`); await sleep(1500);
}
await b.close();
