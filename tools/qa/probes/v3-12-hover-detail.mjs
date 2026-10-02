// v3-12: hover detail for the groups v3-11 flagged (video card, FAQ question, contact phone link, brand, step links, calm toggle) looking at the whole
// card/item (parents + siblings), plus screenshots hover vs idle. node tools/qa/probes/v3-12-hover-detail.mjs
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'hd', wait: 4000 });
const J = (o) => JSON.stringify(o);
const SNAP = `(root) => { const out = {}; const props = ['color','backgroundColor','borderTopColor','borderBottomColor','opacity','transform','boxShadow','textDecorationLine','filter','scale']; const els = [root, ...root.querySelectorAll('*')].slice(0, 40); els.forEach((n, i) => { const cs = getComputedStyle(n); for (const k of props) out[i + ':' + n.tagName.toLowerCase() + '.' + String(n.className).split(' ')[0] + ':' + k] = cs[k]; for (const ps of ['::before', '::after']) { const c = getComputedStyle(n, ps); if (c.content !== 'none') { out[i + ps + ':transform'] = c.transform; out[i + ps + ':opacity'] = c.opacity; out[i + ps + ':bg'] = c.backgroundColor; } } }); return out; }`;
async function probe(name, itemSel, hoverSel, scrollSel) {
  const top = await docTop(b, scrollSel || itemSel);
  await b.move(5, 5);
  await b.wheelTo(Math.max(0, top - H * 0.4), W / 2, H / 2, { tol: 30 }); await sleep(1500);
  const g = await b.evalJs(`(() => { const it = document.querySelector(${J(itemSel)}); const h = document.querySelector(${J(hoverSel)}); const r = h.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, snap: (${SNAP})(it), cursor: getComputedStyle(h).cursor }; })()`);
  await b.shot(`60-${name}-idle`);
  await b.move(g.x, g.y); await sleep(800);
  const a = await b.evalJs(`(() => { const it = document.querySelector(${J(itemSel)}); return (${SNAP})(it); })()`);
  await b.shot(`61-${name}-hover`);
  const ch = Object.keys(g.snap).filter((k) => g.snap[k] !== a[k]);
  console.log(name.padEnd(14), 'cursor', g.cursor, '| changed:', ch.length, J(ch.slice(0, 6).map((k) => k + ' ' + String(g.snap[k]).slice(0, 24) + ' -> ' + String(a[k]).slice(0, 24))));
  await b.move(5, 5); await sleep(300);
}
await probe('video-card', '#stories .vid:first-of-type, #stories [class*=vid]:not(.vid__hit):not(.vid__frame)', '.vid__hit', '.vid__hit');
await probe('faq-q', '.faq__item:nth-child(3)', '.faq__item:nth-child(3) .faq__q');
await probe('contact-call', '#contact a[href^="tel"]', '#contact a[href^="tel"]');
await probe('brand', '.hdr__brand', '.hdr__brand', 'body');
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
