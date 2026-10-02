// d1-lag: is a scrubbed element (parallax) in step with the scroll position it is painted with?
// Model: viewport top_i + scrollY_i = c + k * scrollY_(i-L).  The lag L with the smallest residual tells which scroll sample ScrollTrigger used.
//   node tools/qa/probes/d1-lag.mjs <tag> ["hero mesh" "hero photo" ...]
import { readFileSync } from 'node:fs';
import { OUT } from './d1-lib.mjs';
const [tag, ...els] = process.argv.slice(2);
const D = JSON.parse(readFileSync(`${OUT('d1')}/data/${tag}.json`, 'utf8'));
const sm = D.marks.find((m) => m.n === 'scenario-start').t; const F = D.frames.filter((r) => r[1] >= sm);
const targets = els.length ? els : ['hero mesh', 'hero photo'];
for (const name of targets) {
  const k = D.tracked.indexOf(name); if (k < 0) { console.log('no such tracked', name); continue; }
  const [lo, hi] = name.startsWith('hero') ? [60, 780] : [0, 1e9];
  const res = [];
  for (const L of [0, 1, 2, 3]) {
    const X = [], Y = [];
    for (let i = L + 1; i < F.length; i++) { const y = F[i][2]; if (y < lo || y > hi || F[i][7 + 2 * k] == null) continue; X.push(F[i - L][2]); Y.push(F[i][7 + 2 * k] + F[i][2]); }
    const n = X.length; if (n < 20) continue;
    const mx = X.reduce((a, b) => a + b, 0) / n, my = Y.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (X[i] - mx) * (Y[i] - my); sxx += (X[i] - mx) ** 2; }
    const kk = sxy / sxx, c = my - kk * mx; let se = 0, mxr = 0; for (let i = 0; i < n; i++) { const r = Y[i] - (c + kk * X[i]); se += r * r; mxr = Math.max(mxr, Math.abs(r)); }
    res.push({ L, n, k: kk.toFixed(4), rms: Math.sqrt(se / n).toFixed(3), max: mxr.toFixed(2) });
  }
  console.log(name, JSON.stringify(res));
}
