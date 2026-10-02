// d5-frames: offline analysis of a *-raw.json written by the scroll probes: where (y / section) do slow frames cluster, and what ran then.
// node tools/qa/probes/d5-frames.mjs <raw.json> [phase] [thresholdMs=25]
import { readFileSync } from 'node:fs';
const [file, phase, thr = '25'] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(file, 'utf8'));
const w = phase ? raw.windows[phase] : [0, Infinity];
const SEC = ['top', 'about', 'services', 'process', 'education', 'stories', 'faq', 'contact', 'footer'];
const fr = raw.frames.filter((f) => f[1] >= w[0] && f[1] <= w[1]);
const secOf = (f) => { let c = 'top'; for (let i = 0; i < SEC.length; i++) { const t = f[7 + i]; if (t >= 0 && f[3] + f[5] * 0.4 >= t) c = SEC[i]; } return c; };
const bySec = {};
for (const f of fr) { const s = secOf(f); const o = (bySec[s] ||= { frames: 0, slow: 0, slow50: 0, moving: 0, slowMoving: 0, maxDt: 0 }); o.frames++; const slow = f[2] > +thr; if (slow) o.slow++; if (f[2] > 50) o.slow50++; if (f[2] > o.maxDt && f[2] < 1000) o.maxDt = f[2]; }
// moving = scrollY changed vs previous frame
for (let i = 1; i < fr.length; i++) { if (Math.abs(fr[i][3] - fr[i - 1][3]) > 0.5) { const o = bySec[secOf(fr[i])]; o.moving++; if (fr[i][2] > +thr) o.slowMoving++; } }
console.log('section'.padEnd(10), 'frames slow slow>50 moving slowMoving%  maxDt');
for (const [s, o] of Object.entries(bySec)) console.log(s.padEnd(10), String(o.frames).padStart(6), String(o.slow).padStart(4), String(o.slow50).padStart(7), String(o.moving).padStart(6), (o.moving ? (100 * o.slowMoving / o.moving).toFixed(1) : '-').padStart(9), o.maxDt);
// 100px y-bins with the most slow frames
const bins = {};
for (const f of fr) if (f[2] > +thr && f[2] < 1000) { const b = Math.floor(f[3] / 400) * 400; bins[b] = (bins[b] || 0) + 1; }
console.log('slow frames per 400px bin (top 12):', Object.entries(bins).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([b, n]) => `${b}:${n}`).join('  '));
// longest frames
const worst = fr.filter((f) => f[2] < 1000).sort((a, b) => b[2] - a[2]).slice(0, 12);
console.log('worst frames:'); worst.forEach((f) => console.log(`  dt=${f[2]} y=${Math.round(f[3])} sec=${secOf(f)} T=${Math.round(f[1] - w[0])}ms`));
// LoAF overlap
const loaf = raw.loaf.filter((l) => l.T >= w[0] && l.T <= w[1] && l.dur >= 50);
console.log('LoAF>=50ms:', loaf.length); loaf.slice(0, 20).forEach((l) => console.log('  ', JSON.stringify({ T: Math.round(l.T - w[0]), dur: l.dur, block: l.block, scripts: l.scripts })));
