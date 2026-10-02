// d4-08: header while wheel-scrolling the whole page at human pace: theme lag at section boundaries (header attr + computed colours vs the
// block really under it), hide/show toggles, frame dt.  node tools/qa/probes/d4-08-header.mjs [w] [h] [port] [every_ms] [px_per_notch]
import { writeFileSync } from 'node:fs';
import { launch, sleep, OUT, stats } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404), EVERY = +(process.argv[5] || 60), PX = +(process.argv[6] || 100);
const b = await launch({ port: PORT, w: W, h: H, tag: `h${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(`(() => {
  const hdr = document.querySelector('[data-header]');
  const zones = [...document.querySelectorAll('main [data-theme], body > footer[data-theme]')];
  let on = false, S = [];
  const under = () => { const band = hdr.offsetHeight / 2; let cur = null; for (const z of zones) { const r = z.getBoundingClientRect(); if (r.top <= band + 1 && r.bottom >= band - 1) cur = z; } return cur; };
  const tick = (t) => { if (on) { const r = hdr.getBoundingClientRect(); const u = under(); const cs = getComputedStyle(hdr), as = getComputedStyle(hdr, '::after');
    S.push({ t: +t.toFixed(1), y: +scrollY.toFixed(1), hb: +r.bottom.toFixed(1), th: hdr.dataset.theme, want: u?.dataset.theme || '-', sec: (u?.closest('section[id]')?.id) || u?.tagName || '-', col: cs.color, bg: as.backgroundColor, bgo: +as.opacity }); } requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  window.__r8 = { start() { S = []; on = true; }, stop() { on = false; return S; } };
})()`);
await b.move(W / 2, H / 2); await sleep(500);
await b.evalJs('__r8.start()');
const total = await b.evalJs('document.documentElement.scrollHeight - innerHeight');
let sent = 0; const t0 = Date.now();
while ((await b.evalJs('scrollY')) < total - 5 && Date.now() - t0 < 120000) { await b.wheel(W / 2, H / 2, PX); await sleep(EVERY); sent++; }
await sleep(1500);
const S = await b.evalJs('__r8.stop()');
writeFileSync(`${OUT}d4-08-${W}-${EVERY}-${PX}.json`, JSON.stringify(S));
console.log('frames', S.length, 'notches', sent, 'dt', JSON.stringify(stats(S.slice(1).map((s, i) => s.t - S[i].t))), 'avg scroll px/s', Math.round(total / ((S.at(-1).t - S[0].t) / 1000)));
// theme attr mismatches vs the block under the header band
const mism = []; let cur = null;
S.forEach((s, i) => { const bad = s.th !== s.want && s.want !== '-'; if (bad && !cur) cur = { i, t0: s.t, y0: s.y, th: s.th, want: s.want, sec: s.sec }; if (!bad && cur) { cur.ms = Math.round(s.t - cur.t0); cur.y1 = s.y; mism.push(cur); cur = null; } });
console.log('theme attr lagging the block under the header (IntersectionObserver band): intervals', mism.length, JSON.stringify(mism.map((m) => `${m.sec}:${m.th}->${m.want} ${m.ms}ms ${Math.round(m.y1 - m.y0)}px`)));
// colour transition: from the first frame the attr flips to the frame the computed colour settles
const flips = []; S.forEach((s, i) => { if (i && s.th !== S[i - 1].th) { let j = i; while (j < S.length - 1 && (S[j].col !== S[j + 1].col || S[j].bg !== S[j + 1].bg)) j++; flips.push({ at: Math.round(s.y), to: s.th, settleMs: Math.round(S[j].t - s.t), scrollPxDuring: Math.round(S[j].y - s.y) }); } });
console.log('header colour transition after each theme flip', JSON.stringify(flips));
// hide / show toggles
let tog = 0, hidden = S[0].hb <= 0; const toggles = []; S.forEach((s, i) => { const h2 = s.hb <= 1; if (h2 !== hidden) { hidden = h2; tog++; toggles.push(`${Math.round(s.y)}:${h2 ? 'hide' : 'show'}`); } });
console.log('header hide/show toggles', tog, toggles.join(' '));
console.log('errors', b.errors);
await b.close();
process.exit(0);
