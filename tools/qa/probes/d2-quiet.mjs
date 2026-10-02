// d2-quiet: per-frame pipeline counts in a "quiet" warmed region (no reveal playing). Contention-proof metrics: events per frame, main-thread CPU time.
//   node tools/qa/probes/d2-quiet.mjs --from=17000 --px=900 --kill=lenis|st|both|none [--cond=base] [--cpu=1] [--reps=2]
import { launch, goto, traceStart, traceStop, playWheel, profiles, sleep, arg, threadMap, frames, frameStats, exposeEngine } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const FROM = +arg('from', 17000), PX = +arg('px', 900), COND = arg('cond', 'base'), KILL = arg('kill', 'none'), CPU = +arg('cpu', 1), REPS = +arg('reps', 1);
for (let r = 0; r < REPS; r++) {
  const c = await launch({ port: +arg('port', 9402), profile: 'q', cpu: CPU, w: +arg('w', 1366), h: +arg('h', 820) });
  await exposeEngine(c);
  const cond = CONDS[COND];
  if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
  await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
  await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(2500);
  await playWheel(c, profiles.steady(PX + 300, 40)); await sleep(1500); await playWheel(c, profiles.steady(-(PX + 300), 40)); await sleep(2500);
  const info = await c.ev(`JSON.stringify({ st: __G.ST.getAll().length, lenis: !!window.__lenis })`);
  if (KILL === 'lenis' || KILL === 'both') await c.ev(`__lenis.destroy(); 1`);
  if (KILL === 'st' || KILL === 'both') await c.ev(`__G.ST.getAll().forEach((t) => t.kill()); 1`);
  await sleep(500);
  await c.ev('__d2.reset(); __d2.rec = true; 1');
  await traceStart(c, 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing');
  const t0 = await c.ev('performance.now()'); await c.ev(`performance.mark('d2:begin'); 1`);
  await playWheel(c, profiles.steady(PX, 40)); await sleep(800);
  await c.ev('__d2.rec = false; 1');
  const f = await frames(c); const ev = await traceStop(c);
  const { names } = threadMap(ev);
  const main = (e) => names.get(e.pid + ':' + e.tid) === 'CrRendererMain';
  const cnt = (n) => ev.filter((e) => e.name === n && e.ph === 'X' && main(e));
  const sum = (a, k = 'dur') => a.reduce((x, e) => x + (e[k] || 0), 0) / 1000;
  const nF = f.f.length / 2;
  const runs = cnt('RunTask');
  const row = (n) => { const a = cnt(n); return `${n}: ${(a.length / nF).toFixed(2)}/frame ${(sum(a) / nF).toFixed(2)}ms/frame`; };
  console.log(`[${COND}|kill=${KILL}|cpu${CPU}] ${info} frames=${nF} raf=${JSON.stringify(frameStats(f.f)).slice(0, 120)}`);
  console.log('  ' + ['UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'IntersectionObserverController::computeIntersections', 'HitTest', 'FunctionCall', 'CullRectUpdate'].map(row).join('\n  '));
  console.log(`  RunTask wall ${(sum(runs) / nF).toFixed(2)}ms/frame  cpu(tdur) ${(sum(runs, 'tdur') / nF).toFixed(2)}ms/frame`);
  await c.close(); await sleep(800);
}
