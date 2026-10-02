// d2-ab-first: interleaved A/B of a region scrolled for the FIRST time after load (fresh Chrome profile per run: cold shader/image caches).
//   node tools/qa/probes/d2-ab-first.mjs --conds=base,nohdrblur,noblur --reps=6 --from=0 --px=1000 [--settle=4000] [--cpu=1] [--profile=bursts]
// Per run: gaps (rAF delta >= 2.5 x cadence, i.e. >= 40 ms at 60 Hz / 25 ms at 100 Hz) while moving, worst frame, excess ms. Medians per condition.
import { rmSync } from 'node:fs';
import { launch, goto, playWheel, profiles, sleep, arg, frames, frameStats, cpuSampler, OUT } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const CONDLIST = arg('conds', 'base').split(','), REPS = +arg('reps', 4), FROM = +arg('from', 0), PX = +arg('px', 1000), PROFILE = arg('profile', 'bursts'), CPU = +arg('cpu', 1);
const res = {};
for (let r = 0; r < REPS; r++) for (const cn of CONDLIST) {
  try { rmSync(OUT + 'abf-' + arg('port', 9402), { recursive: true, force: true }); } catch {}
  const c = await launch({ port: +arg('port', 9402), profile: 'abf', cpu: CPU });
  const cond = CONDS[cn];
  if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
  await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: +arg('settle', 4000) });
  if (FROM > 0) { await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(2500); }
  await c.ev('__d2.reset(); __d2.rec = true; 1');
  const cpuEnd = cpuSampler();
  await playWheel(c, profiles[PROFILE](PX)); await sleep(1300);
  const sys = cpuEnd(); await c.ev('__d2.rec = false; 1');
  const f = await frames(c); const s = frameStats(f.f); const cad = s.p50;
  const thr = Math.max(25, cad * 2.5); let gaps = 0, excess = 0; const list = [];
  for (let i = 1; i < f.f.length / 2; i++) { const dt = f.f[i * 2] - f.f[(i - 1) * 2]; if (dt >= thr) { gaps++; excess += dt - cad; list.push(Math.round(dt) + '@' + Math.round(f.f[i * 2 + 1])); } }
  const row = { cond: cn, sys, cad, gaps, excess: Math.round(excess), worst: s.worst, loaf: f.loaf.length, list };
  (res[cn] ||= []).push(row);
  console.log(`rep ${r + 1} ${cn.padEnd(10)} sysCPU=${String(sys).padStart(3)}% cadence=${cad} gaps=${gaps} excess=${Math.round(excess)}ms worst=${s.worst} | ${list.join(' ')}`);
  await c.close();
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`\nMEDIAN of ${REPS} per condition (region ${FROM}..${FROM + PX}, cpu x${CPU}):`);
for (const [cn, rows] of Object.entries(res)) console.log(`  ${cn.padEnd(10)} gaps=${med(rows.map((x) => x.gaps))} (mean ${(rows.reduce((a, x) => a + x.gaps, 0) / rows.length).toFixed(1)}) excess=${med(rows.map((x) => x.excess))}ms worst=${med(rows.map((x) => x.worst))}ms runsWithGap>=80ms=${rows.filter((x) => x.worst >= 80).length}/${rows.length} sysCPU=${med(rows.map((x) => x.sys))}%`);
