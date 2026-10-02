// d4-07c: is the nav-click jank the "teleport" (Lenis lerp) or the work done by the sections crossed? Fresh page each time:
// (a) real nav click to #faq (Lenis lerp mode), (b) rAF-driven eased scroll (easeInOutCubic 1.6 s) over the same distance (diagnostic only).
// node tools/qa/probes/d4-07c-eased-vs-lerp.mjs [w] [h] [port]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
async function run(mode) {
  const b = await launch({ port: PORT, w: W, h: H, tag: `ev${mode}` });
  await b.open('http://127.0.0.1:4404/');
  await b.evalJs(`(() => { let on = false, S = []; const tick = (t) => { if (on) S.push([t, scrollY]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__r = { start() { S = []; on = true; }, stop() { on = false; return S; } }; })()`);
  const target = await b.evalJs(`Math.round(document.querySelector('#faq').getBoundingClientRect().top + scrollY)`);
  await b.evalJs('__r.start()');
  if (mode === 'click') { const a = await b.evalJs(`(() => { const r = document.querySelector('.hdr__nav a[data-nav=faq]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`); await b.move(a.x, a.y); await sleep(200); await b.down(a.x, a.y); await sleep(30); await b.up(a.x, a.y); }
  else await b.evalJs(`(() => { const t0 = performance.now(), D = 1600, y1 = ${target}; const e = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2); const f = (now) => { const p = Math.min(1, (now - t0) / D); window.scrollTo(0, y1 * e(p)); if (p < 1) requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
  await sleep(4500);
  const S = await b.evalJs('__r.stop()');
  const dts = S.slice(1).map((s, i) => s[0] - S[i][0]); const dys = S.slice(1).map((s, i) => Math.abs(s[1] - S[i][1]));
  const i0 = S.findIndex((s, i) => i && s[1] !== S[i - 1][1]);
  const mv = dts.slice(i0 - 1).filter((_, i) => dys[i0 - 1 + i] > 0);
  const long = mv.filter((d) => d > 33);
  console.log(mode.padEnd(6), JSON.stringify({ distance: target, framesWithMotion: mv.length, maxPxPerFrame: Math.round(Math.max(...dys)), framesOver33ms: long.length, sumLongMs: Math.round(long.reduce((a, c) => a + c, 0)), worstFrameMs: Math.round(Math.max(0, ...long)) }));
  await b.close();
}
await run('click'); await run('eased'); await run('click'); await run('eased');
process.exit(0);
