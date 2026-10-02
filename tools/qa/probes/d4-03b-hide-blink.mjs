// d4-03b: why does the active row drop to -1 (hide) while wheel-scrolling over the list with a still pointer?
// Records per frame: what elementFromPoint returns, row transforms (reveal), panel opacity/scale, slide clip-paths.
// node tools/qa/probes/d4-03b-hide-blink.mjs [w] [h] [port] [every_ms]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404), EVERY = +(process.argv[5] || 40);
const b = await launch({ port: PORT, w: W, h: H, tag: `b${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(`(() => {
  const panel = document.querySelector('.svc__panel'), rows = [...document.querySelectorAll('.svc__row')], slides = [...panel.children];
  let on = false, S = [], px = 0, py = 0;
  addEventListener('pointermove', (e) => { px = e.clientX; py = e.clientY; }, { capture: true, passive: true });
  const tick = (t) => { if (on) {
    const el = document.elementFromPoint(px, py);
    const row = el?.closest?.('.svc__row');
    const cs = getComputedStyle(panel);
    const m = new DOMMatrixReadOnly(cs.transform);
    const top = slides.map((s, i) => ({ i, z: +s.style.zIndex || 0, cp: getComputedStyle(s).clipPath })).sort((a, b) => b.z - a.z)[0];
    S.push({ t: +t.toFixed(1), y: +scrollY.toFixed(1), hit: el ? (row ? 'row' + rows.indexOf(row) : el.className?.baseVal ?? el.className ?? el.tagName) : 'null', act: rows.findIndex((r) => r.classList.contains('is-active')),
      op: +(+cs.opacity).toFixed(3), sc: +m.a.toFixed(3), top: top.i, topCp: top.cp, rowY: rows.map((r) => +new DOMMatrixReadOnly(getComputedStyle(r).transform).m42.toFixed(1)), rowOp: rows.map((r) => +(+getComputedStyle(r).opacity).toFixed(2)) });
  } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__r2 = { start() { S = []; on = true; }, stop() { on = false; return S; } };
})()`);
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop - 120, W / 2, H / 2);
await sleep(2500);
const px = 500, py = +(process.env.PY || 430);
await b.move(px, py); await sleep(1500);
await b.evalJs('__r2.start()');
await b.burst(px, py, 16, 100, EVERY);
await sleep(1000);
const S = await b.evalJs('__r2.stop()');
writeFileSync(`${OUT}d4-03b-${W}-${EVERY}${process.env.PY ? '-y' + process.env.PY : ''}.json`, JSON.stringify(S));
const blinks = [];
S.forEach((s, i) => { if (s.hit !== 'row' + s.act && !s.hit.startsWith('row')) blinks.push(i); });
console.log('frames', S.length, 'frames where elementFromPoint is NOT a row:', blinks.length);
// group consecutive
const groups = []; blinks.forEach((i) => { const g = groups.at(-1); if (g && i - g.at(-1) <= 1) g.push(i); else groups.push([i]); });
for (const g of groups) {
  const a = Math.max(0, g[0] - 2), z = Math.min(S.length - 1, g.at(-1) + 6);
  console.log(`--- blink: ${g.length} frame(s) at scrollY ${S[g[0]].y}, hit="${S[g[0]].hit}"`);
  for (let i = a; i <= z; i++) { const s = S[i]; console.log(`  f${i} dt=${i ? (s.t - S[i - 1].t).toFixed(1) : '-'} y=${s.y} hit=${s.hit} act=${s.act} op=${s.op} sc=${s.sc} topSlide=${s.top} ${s.topCp} rowY=[${s.rowY.join(',')}] rowOp=[${s.rowOp.join(',')}]`); }
}
console.log('errors', b.errors);
await b.close();
process.exit(0);
