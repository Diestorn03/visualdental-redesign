// v1-shchange: dissect every scrollHeight change in a saved run (which tracked elements moved / resized in that very frame pair, refresh times, RO, LoAF).
//   node tools/qa/probes/v1-shchange.mjs <tag> [tag...]
import { readFileSync } from 'node:fs';
import { OUT, TRACK } from './v1-lib.mjs';
const names = TRACK.map((x) => x[0]);
for (const tag of process.argv.slice(2)) {
  const D = JSON.parse(readFileSync(`${OUT()}/data/${tag}.json`, 'utf8'));
  const F = D.frames; const fw = (D.inputs.find((x) => x[1] === 'wheel' || x[1] === 'touchstart') || [null])[0];
  console.log(`== ${tag}: first wheel/touch ${fw && Math.round(fw)} · dcl ${Math.round(D.dclAt)} · load ${Math.round(D.loadAt)} · engine hook ${Math.round(D.hookAt)} (${D.hookState}) · frames ${F.length}`);
  console.log('   first frames (now/y/sh):', F.slice(0, 4).map((f) => [Math.round(f[1]), Math.round(f[2]), f[5]].join('/')).join('  '));
  for (let i = 1; i < F.length; i++) {
    if (Math.abs(F[i][5] - F[i - 1][5]) <= 0.5) continue;
    const a = F[i - 1], b = F[i];
    console.log(`   SH ${a[5]} -> ${b[5]} at now=${Math.round(b[1])} (frame gap ${Math.round(b[1] - a[1])} ms) y=${Math.round(b[2])} ${fw && b[1] > fw ? 'AFTER first input' : 'before first input'}`);
    names.forEach((n, k) => { const t0 = a[8 + 2 * k], t1 = b[8 + 2 * k], h0 = a[9 + 2 * k], h1 = b[9 + 2 * k]; if (t0 != null && t1 != null && (Math.abs(t0 - t1) > 1 || Math.abs(h0 - h1) > 1)) console.log(`      ${n}: top ${Math.round(t0)} -> ${Math.round(t1)} · h ${Math.round(h0)} -> ${Math.round(h1)}`); });
  }
  console.log('   refresh:', D.refresh.map((r) => `${Math.round(r.t)}${r.init ? 'i' : 'd'}@y${Math.round(r.y)}/sh${r.sh}${r.ls ? '/lenis-moving' : ''}`).join(' '));
  console.log('   ro:', JSON.stringify(D.ro.map((r) => ({ t: Math.round(r.t), n: r.n, from: Math.round(r.from), to: Math.round(r.to) })).slice(0, 12)));
  console.log('   ls:', JSON.stringify(D.ls.filter((l) => l.v > 0.0005).map((l) => ({ t: Math.round(l.t), v: +l.v.toFixed(4), hri: l.hri, src: l.src.map((s) => `${s.n} ${s.p}->${s.c}`).join(';').slice(0, 140) }))));
  console.log('   loaf>80:', JSON.stringify(D.loaf.filter((l) => l.d > 80).map((l) => ({ t: Math.round(l.t), d: Math.round(l.d), s: l.scripts.filter((s) => s.dur > 20) }))));
}
