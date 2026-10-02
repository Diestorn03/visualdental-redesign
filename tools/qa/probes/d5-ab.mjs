// d5-ab: A/B attribution of main-thread jank during touch drags. Each variant injects CSS / JS, then drags 420 px @ 600 px/s (+200 ms pause) from the top
// until --to px. Reports, over frames where scrollY moved: share of rAF frames > 25 ms, count > 50 ms, p95 dt. Lite recorder (no per-frame layout reads).
// node tools/qa/probes/d5-ab.mjs --device=mobile --to=6300 --reps=2 [--variants=base,nobackdrop,...]
import { launch, touchScroll, pullRec, sleep, save } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const device = arg('device', 'mobile'), to = +arg('to', 6300), reps = +arg('reps', 2), from = +arg('from', 0);
const V = {
  base: {},
  nobackdrop: { css: '*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' },
  noclip: { css: '[data-reveal="clip"]{clip-path:none!important}' },
  nofab: { css: '[data-fab]{display:none!important}' },
  nohdr: { css: '[data-header]{display:none!important}' },
  noblend: { css: '.portrait img{mix-blend-mode:normal!important}' },
  nomask: { css: '*{mask-image:none!important;-webkit-mask-image:none!important}' },
  nomarquee: { css: '.strip__track{animation:none!important}' },
  nograyscale: { css: '*{filter:none!important}' },
  instant: { ev: 'window.__gsap.globalTimeline.timeScale(1000)' },
  noGSAP: { ev: 'window.__ST.getAll().forEach(t=>t.kill()); window.__gsap.globalTimeline.clear(); document.documentElement.classList.add("calm")' },
};
const names = (arg('variants', Object.keys(V).join(','))).split(',');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
const results = {};
for (const name of names) {
  for (let r = 0; r < reps; r++) {
    const v = V[name];
    const S = await launch(`ab-${name}`, { device, lite: true, noNav: true });
    if (v.css) await S.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(v.css)}; document.head.append(s); });` });
    await S.send('Page.navigate', { url: process.env.D5_URL || 'http://127.0.0.1:4405/' });
    await sleep(3500);
    if (v.ev) await S.eval(v.ev);
    if (from) { await S.eval(`scrollTo(0, ${from}); 1`); await sleep(800); }
    const T0 = Date.now(); let g = 0;
    while ((await S.eval('scrollY')) < to && g++ < 150) { await touchScroll(S, { dist: 420, speed: 600, fling: false }); await sleep(200); }
    await sleep(300); await pullRec(S);
    const fr = S.rec.frames.filter((f) => f[1] >= T0);
    const mv = []; for (let i = 1; i < fr.length; i++) if (Math.abs(fr[i][3] - fr[i - 1][3]) > 0.5 && fr[i][2] < 1000) mv.push(fr[i][2]);
    const o = { moving: mv.length, gt25: mv.filter((d) => d > 25).length, gt50: mv.filter((d) => d > 50).length, p95: mv.sort((a, b) => a - b)[Math.floor(mv.length * 0.95)] };
    o.pct25 = +(100 * o.gt25 / o.moving).toFixed(1);
    (results[name] ||= []).push(o);
    console.log(`${name.padEnd(12)} rep${r + 1} moving=${o.moving} >25ms=${o.gt25} (${o.pct25}%) >50ms=${o.gt50} p95=${o.p95}`);
    S.close(); await sleep(800);
  }
}
console.log('\nsummary (median % of moving frames >25ms):');
for (const [k, a] of Object.entries(results)) console.log(' ', k.padEnd(12), med(a.map((x) => x.pct25)).toFixed(1) + '%', ' >50ms:', a.map((x) => x.gt50).join('/'));
save(`ab-${device}-${from}-${to}.json`, results);
