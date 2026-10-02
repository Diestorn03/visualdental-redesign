// d1-sum: one line per recorded run: slow-frame count, time lost, and where (scrollY) they happen.  node tools/qa/probes/d1-sum.mjs tag1 tag2 ... [--from=mark --to=mark]
import { readFileSync } from 'node:fs';
import { OUT } from './f1-lib.mjs';
const flags = process.argv.slice(2).filter((a) => a.startsWith('--')); const tags = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fl = (k, d) => (flags.find((f) => f.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
for (const tag of tags) {
  const D = JSON.parse(readFileSync(`${OUT('f1')}/data/${tag}.json`, 'utf8'));
  const a = D.marks.find((m) => m.n === fl('from', 'scenario-start'))?.t ?? 0, b = D.marks.find((m) => m.n === fl('to', 'scenario-end'))?.t ?? Infinity;
  const F = D.frames.filter((r) => r[1] >= a && r[1] <= b);
  let n20 = 0, n34 = 0, n100 = 0, lost = 0, max = 0; const where = [];
  for (let i = 1; i < F.length; i++) { const dt = F[i][0] - F[i - 1][0]; if (dt > 20) { n20++; lost += dt - 16.7; } if (dt > 34) { n34++; where.push(`${Math.round(F[i][2])}(${Math.round(dt)})`); } if (dt > 100) n100++; max = Math.max(max, dt); }
  console.log(`${tag.padEnd(34)} frames ${String(F.length).padStart(5)}  >20ms ${String(n20).padStart(3)}  >34ms ${String(n34).padStart(3)}  >100ms ${String(n100).padStart(2)}  lost ${String(Math.round(lost)).padStart(5)}ms  max ${Math.round(max)}  ${D.meta.variant ? '[' + D.meta.variant + '] ' : ''}${where.join(' ')}`);
}
// extra per-run metrics: p95/p99 dt, biggest single-frame scroll step, the biggest step that follows a stalled (>50 ms) frame, refreshes, scrollHeight changes, HMR flag
for (const tag of tags) {
  const D = JSON.parse(readFileSync(`${OUT('f1')}/data/${tag}.json`, 'utf8'));
  const a = D.marks.find((m) => m.n === 'scenario-start')?.t ?? 0, b = D.marks.find((m) => m.n === 'scenario-end')?.t ?? Infinity;
  const F = D.frames.filter((r) => r[1] >= a && r[1] <= b);
  const dts = [], steps = [], after = [];
  for (let i = 1; i < F.length; i++) { const dt = F[i][0] - F[i - 1][0]; dts.push(dt); const st = Math.abs(F[i][2] - F[i - 1][2]); steps.push(st); if (i > 1 && F[i - 1][0] - F[i - 2][0] > 50) after.push(st); }
  const s = [...dts].sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  const sh = []; for (let i = 1; i < F.length; i++) if (Math.abs(F[i][5] - F[i - 1][5]) > 0.5) sh.push(F[i][5] - F[i - 1][5]);
  const rf = D.refresh.filter((r) => r.t >= a && !r.init).length;
  console.log(`${tag.padEnd(26)} p50 ${q(0.5).toFixed(1)} p95 ${q(0.95).toFixed(1)} p99 ${q(0.99).toFixed(1)} max ${s.at(-1).toFixed(0)} | maxStep ${Math.max(...steps).toFixed(0)}px  stepAfterStall(>50ms): n=${after.length} max ${after.length ? Math.max(...after).toFixed(0) : '-'}px | scrollHeight changes ${sh.length} | refreshes in scenario ${rf} | layoutShifts ${D.ls.filter((l) => l.t >= a).length} | hmrReload=${D.meta.reloadedByHmr}`);
}
// per scroll range (the Digital section is its own agent's WebGL cost: report the page without it separately)
const RANGES = [['hero-services 0-8400', 0, 8400], ['digital+process 8400-13400', 8400, 13400], ['education-footer 13400+', 13400, 1e9]];
for (const tag of tags) {
  const D = JSON.parse(readFileSync(`${OUT('f1')}/data/${tag}.json`, 'utf8'));
  const a = D.marks.find((m) => m.n === 'scenario-start')?.t ?? 0, b = D.marks.find((m) => m.n === 'scenario-end')?.t ?? Infinity;
  const F = D.frames.filter((r) => r[1] >= a && r[1] <= b);
  const out = RANGES.map(([n, lo, hi]) => { let c = 0, o34 = 0, o50 = 0, o100 = 0, mx = 0, lost = 0; for (let i = 1; i < F.length; i++) { const y = F[i][2]; if (y < lo || y >= hi) continue; const dt = F[i][0] - F[i - 1][0]; c++; if (dt > 34) o34++; if (dt > 50) o50++; if (dt > 100) o100++; if (dt > 20) lost += dt - 16.7; mx = Math.max(mx, dt); } return `${n.split(' ')[0].slice(0, 12)}: n${c} >34:${o34} >50:${o50} >100:${o100} max${Math.round(mx)} lost${Math.round(lost)}`; });
  console.log(`${tag.padEnd(14)} ${out.join(' | ')}`);
}
