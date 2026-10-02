// d4-07b: header "Send a case" CTA click -> Lenis scroll to #contact, then contact.js focuses the first field. Is there a late native jump?
// node tools/qa/probes/d4-07b-cta-focus.mjs [w] [h] [port]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9423);
const b = await launch({ port: PORT, w: W, h: H, tag: `f${W}` });
await b.open('http://127.0.0.1:4423/');
await b.evalJs(`(() => { let on = false, S = []; const tick = (t) => { if (on) S.push([+t.toFixed(1), +scrollY.toFixed(1), document.activeElement?.id || document.activeElement?.tagName]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__r = { start() { S = []; on = true; return performance.now(); }, stop() { on = false; return S; } }; })()`);
const cta = await b.evalJs(`(() => { const r = document.querySelector('.hdr__cta').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, contactTop: document.querySelector('#contact').getBoundingClientRect().top + scrollY }; })()`);
await b.move(cta.x, cta.y); await sleep(300);
const t0 = await b.evalJs('__r.start()');
await b.down(cta.x, cta.y); await sleep(30); await b.up(cta.x, cta.y);
await sleep(6000);
const S = await b.evalJs('__r.stop()');
writeFileSync(`${OUT}d4-07b-cta-${W}.json`, JSON.stringify(S));
const v = S.slice(1).map((s, i) => ({ t: s[0] - t0, d: s[1] - S[i][1], y: s[1], ae: s[2] }));
const moving = v.filter((o) => o.d !== 0);
const lastMove = moving.at(-1);
// late jump: a frame with |d| > 25 after the glide has been below 3 px/frame for >= 10 frames
let calm = 0, late = null; v.forEach((o) => { if (Math.abs(o.d) < 3) calm++; else { if (calm >= 10 && !late && Math.abs(o.d) > 25) late = { ...o, calmFramesBefore: calm }; calm = 0; } });
console.log(JSON.stringify({ contactTop: Math.round(cta.contactTop), finalY: Math.round(S.at(-1)[1]), lastMoveAtMs: Math.round(lastMove.t), focusedAtEnd: S.at(-1)[2], lateJump: late }));
const idx = v.findIndex((o) => o.ae && o.ae !== 'BODY' && o.ae !== 'A'); console.log('first non-body focus at ms', idx >= 0 ? Math.round(v[idx].t) : null, 'element', idx >= 0 ? v[idx].ae : null);
console.log('last 12 frames with movement', JSON.stringify(moving.slice(-12).map((o) => [Math.round(o.t), +o.d.toFixed(1), Math.round(o.y)])));
console.log('errors', b.errors);
await b.close();
process.exit(0);
