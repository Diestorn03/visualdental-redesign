// v3-24 (r2): what does a long nav jump LOOK like? timeline of scrollY per frame (hold/teleport/glide) + screenshots at a few instants. Cold-ish visit (fresh profile), user clicks the header nav.
// node tools/qa/probes/v3-24-navjump-visual.mjs [from=services] [to=faq]
import { start, sleep, OUT, FRAMES } from './v3-lib.mjs';
const FROM = process.argv[2] || 'services', TO = process.argv[3] || 'faq', W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'nv', wait: 9000 });
const J = (o) => JSON.stringify(o);
await b.evalJs(FRAMES);
await b.evalJs(`window.__fr.add('j', () => ({ y: Math.round(scrollY * 10) / 10, ae: document.activeElement.id || document.activeElement.tagName }))`);
const nav = (id) => b.evalJs(`(() => { const a = ${J(id)} === 'cta' ? document.querySelector('.hdr__cta') : document.querySelector('.hdr__nav a[data-nav=${J(id)}]'); const r = a.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
async function click(id) {
  const hb = await b.evalJs(`document.querySelector('[data-header]').getBoundingClientRect().bottom`);
  if (hb <= 0) { await b.wheel(W / 2, H / 2, -100); await sleep(900); }
  const n = await nav(id); await b.move(n[0], n[1]); await sleep(250); await b.down(n[0], n[1]); await sleep(30); await b.up(n[0], n[1]);
}
if (process.env.PATCH_FOCUS) await b.evalJs(`(() => { const f = HTMLElement.prototype.focus; HTMLElement.prototype.focus = function (o) { return f.call(this, Object.assign({}, o, { preventScroll: true })); }; return 1; })()`);
await click(FROM); await sleep(4500);
console.log('at', FROM, await b.evalJs('scrollY'));
await b.evalJs(`window.__fr.start('j')`);
const t0 = Date.now();
await click(TO);
const shots = [];
for (const at of [60, 200, 400, 700, 1100, 1700, 2600]) { const wait = at - (Date.now() - t0); if (wait > 0) await sleep(wait); shots.push([Date.now() - t0, await b.evalJs('scrollY'), await b.shot(`nv-${FROM}-${TO}-${at}`)]); }
await sleep(2500);
const S = await b.evalJs(`window.__fr.stop('j')`);
const mv = S.map((s, i) => ({ t: s.t, y: s.y, dy: i ? Math.round(s.y - S[i - 1].y) : 0 }));
const first = mv.findIndex((m) => m.dy !== 0);
console.log('timeline (ms from first move: dy)', J(mv.slice(first - 1, first + 40).map((m) => [Math.round(m.t - mv[first].t), m.dy])));
const big = mv.filter((m) => Math.abs(m.dy) > 2000);
console.log('instant cuts (|dy|>2000 in one frame)', J(big.map((m) => [Math.round(m.t - mv[first].t), m.dy])));
// longest stillness between the click and the end of motion
let still = 0, worst = 0, last = null;
for (let i = first; i < mv.length; i++) { if (mv[i].dy === 0) { still += mv[i].t - mv[i - 1].t; } else { worst = Math.max(worst, still); still = 0; } if (mv[i].dy !== 0) last = i; }
console.log('longest still gap during the jump (ms)', Math.round(worst), '| final y', mv.at(-1).y, '| target top', await b.evalJs(`Math.round(document.getElementById(${J(TO === 'cta' ? 'contact' : TO)}).getBoundingClientRect().top)`), '| ms click->first move', Math.round(mv[first].t - mv[0].t));
console.log('focus first at (ms)', J(mv.length ? S.find((x) => x.ae === 'cf-first') && Math.round(S.find((x) => x.ae === 'cf-first').t - S[first].t) : null));
console.log('shots', J(shots.map((s) => [s[0], Math.round(s[1])])));
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
