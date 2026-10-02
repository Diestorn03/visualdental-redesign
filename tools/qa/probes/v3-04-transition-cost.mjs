// v3-04: frame cost of a Services photo change (hover row A <-> row B, 16 transitions) vs idle frames, with optional in-page A/B variants.
// node tools/qa/probes/v3-04-transition-cost.mjs [w] [h] [variant: base|noscale|noclip]
import { start, sleep, stats, OUT, FRAMES, docTop } from './v3-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), VAR = process.argv[4] || 'base';
const b = await start({ w: W, h: H, tag: `c${W}${VAR}`, wait: +(process.argv[5] || 4500) });
await b.evalJs(FRAMES);
const J = (o) => JSON.stringify(o);
await b.evalJs(`window.__fr.add('h', () => ({ act: [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active')) }))`);
if (VAR !== 'base') {
  // A/B inside the page: neutralise one ingredient of the wipe (probe only; src is untouched)
  await b.evalJs(`(() => { const st = document.createElement('style'); st.textContent = ${J(VAR === 'noscale' ? '.svc__slide img { transform: none !important; }' : '.svc__slide { clip-path: none !important; }')}; document.head.append(st); })()`);
}
const listTop = await docTop(b, '.svc__list');
const L = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().left`);
await b.move(20, 30);
await b.wheelTo(listTop - 130, W / 2, H / 2); await sleep(2500);
const rows = await b.evalJs(`[...document.querySelectorAll('.svc__row')].map((r) => { const q = r.getBoundingClientRect(); return (q.top + q.bottom) / 2; })`);
// idle baseline (pointer parked, no transition)
await b.evalJs(`window.__fr.start('h')`); await sleep(1500);
const idle = await b.evalJs(`window.__fr.stop('h')`);
const idleDt = idle.slice(1).map((s, i) => s.t - idle[i].t);
const per = [];
const seq = [0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0, 2, 0];
for (let k = 1; k < seq.length; k++) {
  await b.evalJs(`window.__fr.start('h')`);
  await b.move(L + 260, rows[seq[k]]); await sleep(750);
  const S = await b.evalJs(`window.__fr.stop('h')`);
  const dts = S.slice(1).map((s, i) => s.t - S[i].t);
  per.push({ k, to: seq[k] + 1, ok: S.at(-1).act === seq[k], max: +Math.max(...dts).toFixed(1), n25: dts.filter((d) => d > 25).length, n17: dts.filter((d) => d > 17.5).length, frames: S.length });
}
const maxs = per.map((p) => p.max);
console.log(VAR, 'idle', J(stats(idleDt)), '| transitions', per.length, 'max dt per transition', J(stats(maxs)), 'frames>25ms total', per.reduce((a, p) => a + p.n25, 0), 'frames>17.5ms total', per.reduce((a, p) => a + p.n17, 0), 'of', per.reduce((a, p) => a + p.frames, 0), '| all ok', per.every((p) => p.ok));
console.log(J(per.map((p) => p.max)));
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
