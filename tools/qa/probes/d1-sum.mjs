// d1-sum: one line per recorded run: slow-frame count, time lost, and where (scrollY) they happen.  node tools/qa/probes/d1-sum.mjs tag1 tag2 ... [--from=mark --to=mark]
import { readFileSync } from 'node:fs';
import { OUT } from './d1-lib.mjs';
const flags = process.argv.slice(2).filter((a) => a.startsWith('--')); const tags = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const fl = (k, d) => (flags.find((f) => f.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1];
for (const tag of tags) {
  const D = JSON.parse(readFileSync(`${OUT('d1')}/data/${tag}.json`, 'utf8'));
  const a = D.marks.find((m) => m.n === fl('from', 'scenario-start'))?.t ?? 0, b = D.marks.find((m) => m.n === fl('to', 'scenario-end'))?.t ?? Infinity;
  const F = D.frames.filter((r) => r[1] >= a && r[1] <= b);
  let n20 = 0, n34 = 0, n100 = 0, lost = 0, max = 0; const where = [];
  for (let i = 1; i < F.length; i++) { const dt = F[i][0] - F[i - 1][0]; if (dt > 20) { n20++; lost += dt - 16.7; } if (dt > 34) { n34++; where.push(`${Math.round(F[i][2])}(${Math.round(dt)})`); } if (dt > 100) n100++; max = Math.max(max, dt); }
  console.log(`${tag.padEnd(34)} frames ${String(F.length).padStart(5)}  >20ms ${String(n20).padStart(3)}  >34ms ${String(n34).padStart(3)}  >100ms ${String(n100).padStart(2)}  lost ${String(Math.round(lost)).padStart(5)}ms  max ${Math.round(max)}  ${D.meta.variant ? '[' + D.meta.variant + '] ' : ''}${where.join(' ')}`);
}
