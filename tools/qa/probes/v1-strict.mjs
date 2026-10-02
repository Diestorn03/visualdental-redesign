// v1-strict: pinned/sticky displacement with ZERO slack. For each contiguous frame pair: dTop must be inside [min(0,-dY), max(0,-dY)]; excess = distance outside.
// Prints max / p99 / count>=0.5 / count>=1 per element for each saved run. node v1-strict.mjs <tag>...
import { readFileSync } from 'node:fs';
import { OUT, SECT, STICKY, EXTRA } from './v1-lib.mjs';
const names = [...SECT, ...STICKY, ...EXTRA].map((x) => x[0]);
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0; };
for (const tag of process.argv.slice(2)) {
  const D = JSON.parse(readFileSync(`${OUT()}/data/${tag}.json`, 'utf8'));
  // frames inside legs only (between *-s and *-e marks), ignoring gotoY teleports (|dy| > 1500 in one frame with no lenis motion)
  const legs = []; for (const m of D.marks) if (m.n.endsWith('-s')) { const e = D.marks.find((x) => x.n === m.n.slice(0, -2) + '-e'); if (e) legs.push([m.t, e.t]); }
  const F = D.frames.filter((r) => legs.length ? legs.some(([a, b]) => r[1] >= a && r[1] <= b) : true);
  const row = [];
  for (const nm of ['rc stage', 'dg stage', 'svc panel', 'faq head']) {
    const k = names.indexOf(nm); const ex = []; let stuck = 0, edge = 0;
    for (let i = 1; i < F.length; i++) {
      const a = F[i - 1][8 + 2 * k], b = F[i][8 + 2 * k]; if (a == null || b == null) continue;
      const dy = F[i][2] - F[i - 1][2]; if (Math.abs(dy) > 1500) continue;
      const dTop = b - a; const lo = Math.min(0, -dy), hi = Math.max(0, -dy);
      ex.push(dTop < lo ? lo - dTop : dTop > hi ? dTop - hi : 0);
      if (Math.abs(dTop) < 0.3 && Math.abs(dy) > 1) stuck++;
      if (Math.abs(dTop) > 0.3 && Math.abs(dTop) < Math.abs(dy) - 0.3) edge++;
    }
    if (!stuck && !ex.some((x) => x >= 0.5)) continue;
    row.push(`${nm}: stuck=${stuck} edgeFrames=${edge} maxExcess=${Math.max(0, ...ex).toFixed(2)} p99=${q(ex, 0.99).toFixed(2)} >=0.5:${ex.filter((x) => x >= 0.5).length} >=1:${ex.filter((x) => x >= 1).length}`);
  }
  console.log(`${tag.padEnd(34)} ${row.join(' | ')}`);
}
