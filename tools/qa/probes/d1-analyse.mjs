// d1-analyse: reads .shots/diag/d1/data/<tag>.json written by d1-scroll.mjs and prints jank findings with numbers.
//   node tools/qa/probes/d1-analyse.mjs <tag> [--from=scenario-start] [--verbose]
import { readFileSync } from 'node:fs';
import { OUT } from './d1-lib.mjs';
const tag = process.argv[2];
const verbose = process.argv.includes('--verbose');
const D = JSON.parse(readFileSync(`${OUT('d1')}/data/${tag}.json`, 'utf8'));
const names = D.tracked; const N = names.length;
const fromName = (process.argv.find((a) => a.startsWith('--from=')) || '--from=scenario-start').split('=')[1];
const toName = (process.argv.find((a) => a.startsWith('--to=')) || '--to=scenario-end').split('=')[1];
const startMark = D.marks.find((m) => m.n === fromName)?.t ?? 0;
const endMark = D.marks.find((m) => m.n === toName)?.t ?? Infinity;
// frame row: [rafTs, now, scrollY, lenis.scroll, lenis.target, scrollHeight, velocity, (top,h) x N]
const F = D.frames.filter((r) => r[1] >= startMark && r[1] <= endMark);
const T0 = F[0]?.[1] ?? 0;
const f1 = (x) => (x == null ? '-' : (+x).toFixed(1));
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
console.log(`== ${tag}: ${F.length} frames over ${((F.at(-1)[1] - T0) / 1000).toFixed(1)} s, meta=${JSON.stringify(D.meta)}`);

// 1. frame cadence ------------------------------------------------------------------------------------------------------
const dts = []; for (let i = 1; i < F.length; i++) dts.push(F[i][0] - F[i - 1][0]);
console.log(`frame dt (ms): median ${f1(q(dts, 0.5))}  p95 ${f1(q(dts, 0.95))}  p99 ${f1(q(dts, 0.99))}  max ${f1(Math.max(...dts))}  | >20ms: ${dts.filter((d) => d > 20).length}  >25ms: ${dts.filter((d) => d > 25).length}  >34ms: ${dts.filter((d) => d > 34).length}  >50ms: ${dts.filter((d) => d > 50).length}  >100ms: ${dts.filter((d) => d > 100).length}`);
const longTasks = D.long.filter((l) => l.t >= startMark - 5); const loaf = D.loaf.filter((l) => l.t >= startMark - 5);
console.log(`long tasks (>50ms): ${longTasks.length}${longTasks.length ? '  worst ' + f1(Math.max(...longTasks.map((l) => l.d))) + ' ms' : ''} | long-animation-frames: ${loaf.length}${loaf.length ? '  worst ' + f1(Math.max(...loaf.map((l) => l.d))) + ' ms' : ''}`);

// 2. scroll position continuity -----------------------------------------------------------------------------------------
const dy = []; for (let i = 1; i < F.length; i++) dy.push({ i, t: F[i][1] - T0, dt: F[i][0] - F[i - 1][0], dy: F[i][2] - F[i - 1][2], dl: (F[i][3] ?? F[i][2]) - (F[i - 1][3] ?? F[i - 1][2]), y: F[i][2], ls: F[i][3], tg: F[i][4] });
const moving = dy.filter((d) => Math.abs(d.dy) > 0.01);
console.log(`scrollY: total travel ${f1(F.at(-1)[2] - F[0][2])} px; frames with motion ${moving.length}/${dy.length}`);
// backwards steps while the target is monotonic
let back = 0; const backs = [];
for (const d of dy) { if (d.dy < -0.5 && d.tg !== null) { back++; if (backs.length < 8) backs.push(d); } }
console.log(`direction reversals (scrollY went backwards >0.5px) in a downward-only run: ${back}${backs.length ? ' e.g. ' + backs.map((b) => `t=${f1(b.t)}ms y=${f1(b.y)} dy=${f1(b.dy)}`).join(' | ') : ''}`);
// quantisation: lenis.scroll fractional vs scrollY integer
const diffs = F.filter((r) => r[3] != null).map((r) => Math.abs(r[2] - r[3]));
console.log(`|scrollY - lenis.scroll|: median ${f1(q(diffs, 0.5))} p95 ${f1(q(diffs, 0.95))} max ${f1(Math.max(...diffs))}`);
// jumps: a frame whose dy is > 2.5x the median of the 5 frames before/after (normalised by dt) and > 12 px
const rate = dy.map((d) => d.dy / Math.max(1, d.dt) * 16.67);
const jumps = [];
for (let i = 3; i < dy.length - 3; i++) {
  const nb = [rate[i - 3], rate[i - 2], rate[i - 1], rate[i + 1], rate[i + 2], rate[i + 3]].map(Math.abs).sort((a, b) => a - b);
  const med = (nb[2] + nb[3]) / 2; const v = Math.abs(rate[i]);
  if (v > 12 && v > 2.5 * Math.max(med, 4)) jumps.push({ ...dy[i], rate: rate[i], med });
  else if (med > 12 && v < 0.25 * med && dy[i].dt < 30) jumps.push({ ...dy[i], rate: rate[i], med, stall: true });
}
console.log(`scroll speed discontinuities (frame speed >2.5x neighbours, or stall <0.25x): ${jumps.length}`);
for (const j of jumps.slice(0, verbose ? 60 : 12)) console.log(`   t=${f1(j.t)}ms y=${f1(j.y)} dt=${f1(j.dt)} dy=${f1(j.dy)} (rate ${f1(j.rate)} vs nbr ${f1(j.med)})${j.stall ? ' STALL' : ''}`);

// 3. layout: elements that move in the viewport by something other than the scroll delta ------------------------------------
// residual r = (top[i] - top[i-1]) + (scrollY[i] - scrollY[i-1]); r = 0 -> element rides with the document; |top delta| ~ 0 -> fixed/pinned.
// Smooth animations (parallax, scrub, reveals) produce smooth r; a LAYOUT jump produces an isolated spike. A spike = |r - median(r of +-3 frames)| > 3 px.
const evs = [];
for (let k = 0; k < N; k++) {
  const r = []; // residual series
  for (let i = 1; i < F.length; i++) {
    const a = F[i][7 + 2 * k], b = F[i - 1][7 + 2 * k]; if (a == null || b == null) { r.push(null); continue; }
    const dd = (a - b) + (F[i][2] - F[i - 1][2]); const fixed = Math.abs(a - b) < 0.6 && Math.abs(F[i][2] - F[i - 1][2]) > 1;
    r.push({ r: fixed ? 0 : dd, fixed, dh: F[i][8 + 2 * k] - F[i - 1][8 + 2 * k] });
  }
  for (let i = 3; i < r.length - 3; i++) {
    if (!r[i]) continue;
    const nb = [r[i - 3], r[i - 2], r[i - 1], r[i + 1], r[i + 2], r[i + 3]].filter(Boolean).map((x) => x.r).sort((x, y) => x - y);
    const med = (nb[2] + nb[3]) / 2; const spike = r[i].r - med;
    if (Math.abs(spike) > 3 || Math.abs(r[i].dh) > 0.9) evs.push({ k, name: names[k], i: i + 1, t: F[i + 1][1] - T0, y: F[i + 1][2], dd: spike, dh: r[i].dh, doc: 0, h: 0 });
  }
}
const byFrame = new Map(); for (const e of evs) { if (!byFrame.has(e.i)) byFrame.set(e.i, []); byFrame.get(e.i).push(e); }
console.log(`layout/animation SPIKES (element moved >3px vs its smooth trend, or resized >0.9px): frames ${byFrame.size}, events ${evs.length}`);
const shToggle = []; for (let i = 1; i < F.length; i++) if (Math.abs(F[i][5] - F[i - 1][5]) > 0.5) shToggle.push({ t: F[i][1] - T0, y: F[i][2], from: F[i - 1][5], to: F[i][5] });
console.log(`document.scrollHeight changes during scenario: ${shToggle.length}${shToggle.length ? ' -> ' + shToggle.slice(0, 10).map((s) => `t=${f1(s.t)} y=${f1(s.y)} ${s.from}->${s.to} (${s.to - s.from > 0 ? '+' : ''}${s.to - s.from})`).join(' | ') : ''}`);
// element-by-element summary: how many frames moved, biggest move, and WHERE (scrollY) the biggest happened
const per = {};
for (const e of evs) { const p = (per[e.name] ||= { n: 0, maxdd: 0, maxdh: 0, at: 0, att: 0 }); p.n++; if (Math.abs(e.dd) > Math.abs(p.maxdd)) { p.maxdd = e.dd; p.at = e.y; p.att = e.t; } if (Math.abs(e.dh) > Math.abs(p.maxdh)) p.maxdh = e.dh; }
console.log('per-element doc-space motion (n frames / biggest dDoc / biggest dH / at scrollY):');
for (const [n, p] of Object.entries(per).sort((a, b) => b[1].n - a[1].n)) console.log(`   ${n.padEnd(26)} ${String(p.n).padStart(4)}  dDoc ${f1(p.maxdd).padStart(7)}  dH ${f1(p.maxdh).padStart(7)}  @y=${f1(p.at)} t=${f1(p.att)}ms`);

// 4. engine events during scenario -----------------------------------------------------------------------------------------
const rf = D.refresh.filter((r) => r.t >= startMark);
console.log(`ScrollTrigger refresh events: ${rf.length}${rf.length ? ' ' + rf.slice(0, 12).map((r) => `[t=${f1(r.t - T0)} y=${f1(r.y)} ${r.init ? 'init' : 'done sh=' + r.sh}]`).join(' ') : ''}`);
const ls = D.ls.filter((l) => l.t >= startMark);
console.log(`layout-shift entries: ${ls.length} total value ${f1(ls.reduce((a, l) => a + l.v, 0) * 1000) / 1000}${ls.length ? '\n' + ls.slice(0, 10).map((l) => `   t=${f1(l.t - T0)} v=${l.v.toFixed(4)} hri=${l.hri} ${l.src.map((s) => `${s.n} ${s.p}->${s.c}`).join(' ; ')}`).join('\n') : ''}`);
const ro = D.ro.filter((r) => r.t >= startMark);
console.log(`ResizeObserver height changes: ${ro.length}${ro.length ? '\n' + ro.slice(0, 20).map((r) => `   t=${f1(r.t - T0)} ${r.n} ${f1(r.from)} -> ${f1(r.to)} (${r.d > 0 ? '+' : ''}${f1(r.d)}) at scrollY ${f1(r.y)}`).join('\n') : ''}`);
if (D.marks.length > 2) console.log('marks:', D.marks.map((m) => `${m.n}@${f1(m.t - T0)}ms y=${f1(m.y)}`).join(' | '));

// 5. worst frames: print context around frames with dt>34 ------------------------------------------------------------------
const slow = []; for (let i = 1; i < F.length; i++) { const d = F[i][0] - F[i - 1][0]; if (d > 34) slow.push({ i, d, t: F[i][1] - T0, y: F[i][2], dy: F[i][2] - F[i - 1][2] }); }
console.log(`slow frames (>34 ms): ${slow.length}`);
const base0 = D.frames.indexOf(F[0]);
if (D.mutLog?.length && process.argv.includes('--mut')) {
  console.log('-- class/attribute mutations in the 120 ms before each slow frame:');
  for (const sl of slow) { const t1 = F[sl.i][1], t0 = F[sl.i][1] - 120; const m = D.mutLog.filter((x) => x[0] >= t0 && x[0] <= t1 + 5 && !/^(circle|path|g|svg|line)/.test(x[2])); console.log(`   y=${sl.y} dt=${f1(sl.d)}: ` + (m.length ? m.slice(0, 14).map((x) => `${x[2]} ${x[3]}:"${x[4]}"->"${x[5]}"`).join(' ; ') : '(none)')); }
}
for (const s of slow.slice(0, verbose ? 80 : 15)) {
  if (D.animLog?.length) { const near = D.animLog.filter(([fi]) => fi - base0 >= s.i - 6 && fi - base0 <= s.i).map(([, k]) => k); if (near.length) console.log(`   [anim @ frame ${s.i}] ${near.at(-1).slice(0, 400)}`); }
  const la = loaf.find((l) => Math.abs(l.t + l.d - F[s.i][1]) < 60);
  console.log(`   t=${f1(s.t)} dt=${f1(s.d)} y=${f1(s.y)} dy=${f1(s.dy)}${la ? `  LoAF ${f1(la.d)}ms blk=${f1(la.blk)} style/layout@+${f1(la.sd - la.t)} scripts=${la.scripts.map((x) => `${x.src}:${x.fn || x.inv}:${x.dur}ms(forced ${x.forced})`).join(',')}` : ''}`);
}
// section by section speed: where the dt>25 frames concentrate
const secs = names.map((n, k) => ({ n, k })).filter((x) => /^#[a-z]+$/.test(x.n) || x.n === 'footer');
const bySec = {};
for (let i = 1; i < F.length; i++) { const d = F[i][0] - F[i - 1][0]; const y = F[i][2] + innerHeightGuess(); let cur = '?'; for (const s of secs) { const top = F[i][7 + 2 * s.k] + F[i][2]; if (top <= F[i][2] + 60) cur = s.n; } const b = (bySec[cur] ||= { n: 0, s25: 0, s34: 0, max: 0 }); b.n++; if (d > 25) b.s25++; if (d > 34) b.s34++; b.max = Math.max(b.max, d); }
function innerHeightGuess() { return 0; }
console.log('frames by section under header (n / >25ms / >34ms / max dt):', Object.entries(bySec).map(([k, b]) => `${k}: ${b.n}/${b.s25}/${b.s34}/${f1(b.max)}`).join('  '));
