// v2-sum: aggregate v2-scroll JSON outputs. node tools/qa/probes/v2-sum.mjs <tag> [<tag>...]  -> per-section median p95 / worst max over reps+directions, spikes list.
import { readFileSync } from 'node:fs';
import { OUT } from './v2-lib.mjs';
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
for (const tag of process.argv.slice(2)) {
  const R = JSON.parse(readFileSync(`${OUT}scroll-${tag}.json`, 'utf8'));
  console.log(`\n##### ${tag}: ${R.length} passes (${R.map((r) => r.dir + '#' + r.rep + ' cpu' + r.cpuPct + '%').join(', ')})`);
  const ids = Object.keys(R[0].secStats);
  console.log('section     passes  p50  p95(med/worst)   max(med/worst)  >25ms(total)  >50ms(total)  nAct');
  for (const k of ids) {
    const A = R.map((r) => r.secStats[k].act).filter((a) => a.n);
    if (!A.length) continue;
    const f = (key) => A.map((a) => a[key]);
    console.log(`${k.padEnd(11)} ${String(A.length).padStart(4)}   ${String(med(f('p50'))).padStart(5)}  ${String(med(f('p95'))).padStart(5)}/${String(Math.max(...f('p95'))).padEnd(6)}  ${String(med(f('max'))).padStart(6)}/${String(Math.max(...f('max'))).padEnd(6)}  ${String(f('o25').reduce((a, b) => a + b, 0)).padStart(5)}  ${String(f('o50').reduce((a, b) => a + b, 0)).padStart(5)}   ${f('n').reduce((a, b) => a + b, 0)}`);
  }
  for (const r of R) {
    console.log(`-- ${r.dir}#${r.rep}: ${r.spikes.length} spikes >50ms; buildWindow ${JSON.stringify(r.buildWindow)}`);
    for (const s of r.spikes) console.log(`   ${String(s.dt).padStart(5)}ms t=${s.t} y=${s.yFrom}->${s.y} sec=${s.sec}${s.digitalVisible ? ' [DG visible]' : ''} lt=${JSON.stringify(s.lt)} ${s.marks.join(',')} | ${s.loafs.map((l) => `LoAF ${l.d}ms(render ${l.render})` + (l.scripts.length ? ' ' + l.scripts.join(';').replace(/http:\/\/127.0.0.1:4422\/_astro\//g, '') : '')).join(' + ')}`);
  }
}
