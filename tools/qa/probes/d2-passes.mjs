// d2-passes: repeat the same wheel scroll (down PX, up PX) N times over a region. Stalls that vanish after pass 1 are first-use costs
// (shader compile, texture upload, image decode, SplitText/ScrollTrigger first run); stalls that persist are per-frame costs.
//   node tools/qa/probes/d2-passes.mjs --from=0 --px=1000 --passes=4 [--cpu=1] [--profile=bursts] [--cond=base]
import { launch, goto, playWheel, profiles, sleep, frameStats, frames, arg, cpuSampler } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const FROM = +arg('from', 0), PX = +arg('px', 1000), N = +arg('passes', 4), CPU = +arg('cpu', 1), PROFILE = arg('profile', 'bursts'), COND = arg('cond', 'base');
const c = await launch({ port: +arg('port', 9402), cpu: CPU, profile: 'pass', w: +arg('w', 1366), h: +arg('h', 820), dpr: +arg('dpr', 1) });
const cond = CONDS[COND];
if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: +arg('settle', 4000) });
if (FROM > 0) { await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(2500); }
for (let p = 1; p <= N; p++) {
  for (const dir of [1, -1]) {
    await c.ev('__d2.reset(); __d2.rec = true; 1');
    const cpuEnd = cpuSampler();
    await playWheel(c, profiles[PROFILE](dir * PX));
    await sleep(1200);
    const sys = cpuEnd();
    await c.ev('__d2.rec = false; 1');
    const f = await frames(c); const s = frameStats(f.f);
    const gaps = []; for (let i = 1; i < f.f.length / 2; i++) { const dt = f.f[i * 2] - f.f[(i - 1) * 2]; if (dt >= 40 && f.f[i * 2 + 1] !== f.f[(i - 1) * 2 + 1] || dt >= 40 && Math.abs((f.f[Math.min(f.f.length / 2 - 1, i + 2) * 2 + 1]) - f.f[(i - 1) * 2 + 1]) > 0) gaps.push(Math.round(dt) + '@' + Math.round(f.f[i * 2 + 1])); }
    console.log(`pass ${p} ${dir > 0 ? 'down' : 'up  '} sysCPU=${String(sys).padStart(3)}% n=${s.n} p95=${s.p95} worst=${s.worst} >33ms=${s.over33} missed=${s.missed} loaf=${f.loaf.length} | gaps>=40: ${gaps.join(' ') || '-'}`);
  }
}
await c.close();
