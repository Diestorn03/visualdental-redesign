// v3-28 (r2): #digital callouts stable? per-rAF class flips (is-flip / is-below) + on/off and text-plate rect while (a) dwelling 3 s on each step, (b) a slow wheel sweep down and back up, (c) a drag-rotate at step 3 and 6. Oscillation = a flip that reverts within 700 ms.
// node tools/qa/probes/v3-28-callouts.mjs [w] [h]
import { start, sleep, OUT, FRAMES, docTop } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `co${W}`, wait: 9000 });
const J = (o) => JSON.stringify(o);
await b.evalJs(FRAMES);
await b.evalJs(`window.__fr.add('c', () => { const o = { y: Math.round(scrollY) }; document.querySelectorAll('.dg__call').forEach((c, i) => { const t = c.querySelector('.dg__call-t').getBoundingClientRect(); o['c' + i] = (c.classList.contains('is-on') ? 1 : 0) + (c.classList.contains('is-flip') ? 'F' : '-') + (c.classList.contains('is-below') ? 'B' : '-'); o['x' + i] = Math.round(t.left); o['y' + i] = Math.round(t.top); }); return o; })`);
const geo = await b.evalJs(`window.__digital && window.__digital.geo ? window.__digital.geo.a : null`);
const dtop = await docTop(b, '#digital');
console.log('geo', J(geo?.map(Math.round)), 'mode', await b.evalJs(`document.querySelector('#digital').dataset.mode`));
await b.move(W * 0.62, H * 0.5);
await b.wheelTo(dtop - 100, W / 2, H / 2); await sleep(1500);
const analyse = (S, label) => {
  const n = S[0] ? Object.keys(S[0]).filter((k) => /^c\d/.test(k)).length : 0;
  const out = { label, frames: S.length, callouts: n };
  const rev = [], flips = [];
  for (let i = 0; i < n; i++) {
    const ch = []; S.forEach((s, k) => { if (k && s['c' + i] !== S[k - 1]['c' + i]) ch.push({ k, t: s.t, from: S[k - 1]['c' + i], to: s['c' + i] }); });
    // oscillation: a flip/below change reverted within 700 ms (ignore on/off, i.e. first char)
    let osc = 0; for (let q = 0; q + 1 < ch.length; q++) { const a = ch[q], c2 = ch[q + 1]; if (a.from.slice(1) !== a.to.slice(1) && c2.t - a.t < 700 && c2.to.slice(1) === a.from.slice(1)) osc++; }
    if (process.env.ONLY === 'sweep') console.log('  c' + i + ' changes', J(ch.map((c2) => [Math.round(c2.t), S[c2.k].y, c2.from, c2.to])));
    flips.push(ch.filter((c2) => c2.from.slice(1) !== c2.to.slice(1)).length); rev.push(osc);
    // rect jumps while the page is not moving
    let jumps = 0; S.forEach((s, k) => { if (k && Math.abs(s.y - S[k - 1].y) < 1 && s['c' + i][0] === '1' && S[k - 1]['c' + i][0] === '1' && (Math.abs(s['x' + i] - S[k - 1]['x' + i]) > 25 || Math.abs(s['y' + i] - S[k - 1]['y' + i]) > 25)) jumps++; });
    out['callout' + i] = { sideChanges: flips.at(-1), oscillations: rev.at(-1), rectJumpsWhileStill: jumps };
  }
  console.log('CALL', J(out)); return out;
};
const R = [];
// (a) dwell 3 s on each step
for (let k = 0; k < (process.env.ONLY === 'sweep' ? 0 : 6); k++) {
  if (geo) { await b.wheelTo(geo[k] + 6, W / 2, H / 2, { tol: 25 }); await sleep(400); }
  await b.evalJs(`window.__fr.start('c')`); await sleep(3000);
  const S = await b.evalJs(`window.__fr.stop('c')`);
  R.push(analyse(S, 'dwell step ' + (k + 1)));
  if (k === 2 || k === 4) await b.shot(`co-step${k + 1}-${W}`);
}
// (b) slow sweep down and back
await b.wheelTo(dtop - 100, W / 2, H / 2); await sleep(800);
await b.evalJs(`window.__fr.start('c')`);
for (let i = 0; i < 95; i++) { await b.wheel(W * 0.62, H / 2, 60); await sleep(70); }
await sleep(1500);
for (let i = 0; i < 95; i++) { await b.wheel(W * 0.62, H / 2, -60); await sleep(70); }
await sleep(1500);
R.push(analyse(await b.evalJs(`window.__fr.stop('c')`), 'sweep down+up (slow wheel)'));
// (c) drag-rotate at step 3
if (geo) { await b.wheelTo(geo[2] + 6, W / 2, H / 2, { tol: 25 }); await sleep(800);
  const cv = await b.evalJs(`(() => { const r = document.querySelector('.dg__canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await b.evalJs(`window.__fr.start('c')`);
  await b.move(cv[0], cv[1]); await b.down(cv[0], cv[1]);
  for (let i = 1; i <= 40; i++) { await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: cv[0] + i * 6, y: cv[1] + Math.sin(i / 5) * 20, button: 'left', buttons: 1, pointerType: 'mouse' }); await sleep(16); }
  await b.up(cv[0] + 240, cv[1]); await sleep(2500);
  R.push(analyse(await b.evalJs(`window.__fr.stop('c')`), 'drag-rotate at step 3'));
}
console.log('errors', J(b.errors));
writeFileSync(OUT + `v3-28-result-${W}.json`, J(R));
await b.close(); process.exit(0);
