// v2-passes: one line per pass (all active frames) from every .shots/v2-r2/scroll-*.json, plus section geometry. node tools/qa/probes/v2-passes.mjs
import { readFileSync, readdirSync } from 'node:fs';
import { OUT } from './v2-lib.mjs';
for (const f of readdirSync(OUT).filter((x) => /^scroll-.*\.json$/.test(x) && !/smoke/.test(x))) {
  const R = JSON.parse(readFileSync(OUT + f, 'utf8'));
  for (const r of R) { const a = r.secStats.ALL.act, w = r.secStats.ALL.all; console.log(`${f.slice(7, -5).padEnd(26)} ${r.dir.padEnd(4)} cpu=${String(r.cpuPct).padStart(3)}%  act n=${String(a.n).padStart(4)} p50=${a.p50} p95=${a.p95} p99=${a.p99} max=${String(a.max).padStart(6)} >25=${String(a.o25).padStart(3)} >50=${String(a.o50).padStart(2)} | all p95=${w.p95} >25=${w.o25} | spikes>50=${r.spikes.length} worst=${Math.max(0, ...r.spikes.map((s) => s.dt))}`); }
}
const R = JSON.parse(readFileSync(OUT + 'scroll-trackpad-warm.json', 'utf8')); console.log('geometry 1366x820:', R[0].g.secs.map((s) => `${s.id}@${s.top}+${s.h}`).join(' '));
