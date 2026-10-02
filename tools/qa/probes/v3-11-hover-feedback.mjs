// v3-11: hover feedback audit of every interactive element group (buttons, nav, cards, FAQ, marquee...): does anything change on hover, is the cursor right,
// is there a transition, does the layout move? Real pointer. node tools/qa/probes/v3-11-hover-feedback.mjs [w] [h]
import { start, sleep, OUT } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820);
const b = await start({ w: W, h: H, tag: `hv${W}`, wait: 4000 });
const J = (o) => JSON.stringify(o);
// candidate groups: first visible element of each (tag + first class) among interactive elements
const groups = await b.evalJs(`(() => {
  const els = [...document.querySelectorAll('a[href], button, summary, [role=button], [tabindex="0"], label, input, select, textarea')];
  const seen = new Map();
  for (const e of els) {
    if (e.closest('[aria-hidden=true], [inert]')) continue;
    const r = e.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const key = e.tagName.toLowerCase() + '.' + (String(e.className).split(/\\s+/)[0] || '') + (e.closest('header,[data-header]') ? '@hdr' : e.closest('footer') ? '@ftr' : e.closest('section') ? '@' + e.closest('section').id : '');
    if (!seen.has(key)) { e.setAttribute('data-v3', String(seen.size)); seen.set(key, { key, n: 1, idx: seen.size, text: (e.textContent || e.getAttribute('aria-label') || '').trim().replace(/\\s+/g, ' ').slice(0, 40) }); } else seen.get(key).n++;
  }
  return [...seen.values()];
})()`);
console.log('groups', groups.length);
const SNAP = `(el) => { const out = {}; const props = ['color','backgroundColor','borderTopColor','opacity','transform','boxShadow','textDecorationLine','outlineStyle','filter','width','height','top','left','letterSpacing','backgroundImage','clipPath']; const walk = (n, d, p) => { const cs = getComputedStyle(n); for (const k of props) out[p + k] = cs[k]; for (const ps of ['::before', '::after']) { const c = getComputedStyle(n, ps); if (c.content !== 'none') { out[p + ps + 'transform'] = c.transform; out[p + ps + 'opacity'] = c.opacity; out[p + ps + 'bg'] = c.backgroundColor; out[p + ps + 'color'] = c.color; out[p + ps + 'w'] = c.width; } } if (d < 3) [...n.children].slice(0, 6).forEach((c, i) => walk(c, d + 1, p + i + '/')); }; walk(el, 0, ''); return out; }`;
const res = [];
await b.move(5, 5);
// order by document position so we scroll monotonically
const info = await b.evalJs(`(${JSON.stringify(groups.map((g) => g.idx))}).map((i) => { const e = document.querySelector('[data-v3="' + i + '"]'); const r = e.getBoundingClientRect(); return { i, top: r.top + scrollY, hdr: !!e.closest('header,[data-header]'), fixed: !!e.closest('.fab, .pal, [class*=fab], [class*=pal]') }; })`);
info.sort((a, c) => a.top - c.top);
for (const it of info) {
  const g = groups.find((x) => x.idx === it.i);
  await b.move(5, 5); await sleep(100);
  if (it.hdr) { await b.wheelTo(0, W / 2, H / 2, { tol: 5 }); await sleep(900); }
  else if (!it.fixed) { await b.wheelTo(Math.max(0, it.top - H * 0.45), W / 2, H / 2, { tol: 30 }); await sleep(1100); }
  const geom = await b.evalJs(`(() => { const e = document.querySelector('[data-v3="${it.i}"]'); const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, inView: r.top >= 0 && r.bottom <= innerHeight, hit: !!top && (e === top || e.contains(top) || top.contains(e)), cursor: getComputedStyle(e).cursor, td: getComputedStyle(e).transitionDuration, before: (${SNAP})(e), rect0: [r.left, r.top, r.width, r.height] }; })()`);
  if (!geom.inView || !geom.hit) { res.push({ key: g.key, text: g.text, skipped: !geom.inView ? 'not in view' : 'covered by another element' }); continue; }
  await b.move(geom.x, geom.y); await sleep(750);
  const after = await b.evalJs(`(() => { const e = document.querySelector('[data-v3="${it.i}"]'); const r = e.getBoundingClientRect(); return { snap: (${SNAP})(e), rect: [r.left, r.top, r.width, r.height], hover: e.matches(':hover') }; })()`);
  const changed = Object.keys(geom.before).filter((k) => geom.before[k] !== after.snap[k] && !/^(width|height|top|left)$/.test(k.split('/').pop()));
  const moved = after.rect.some((v, i) => Math.abs(v - geom.rect0[i]) > 0.6);
  res.push({ key: g.key, n: g.n, text: g.text, cursor: geom.cursor, transition: geom.td, changedProps: changed.length, sample: changed.slice(0, 4).map((k) => k + ': ' + String(geom.before[k]).slice(0, 28) + ' -> ' + String(after.snap[k]).slice(0, 28)), boxMoved: moved ? after.rect.map((v, i) => +(v - geom.rect0[i]).toFixed(1)) : false });
  await b.move(5, 5);
}
for (const r of res) console.log(J(r));
const flat = res.filter((r) => !r.skipped && r.changedProps === 0);
console.log('NO-HOVER-FEEDBACK:', J(flat.map((r) => r.key + ' "' + r.text + '"')));
console.log('WRONG CURSOR (interactive but not pointer/text):', J(res.filter((r) => !r.skipped && !/pointer|text|default|grab/.test(r.cursor)).map((r) => r.key + ':' + r.cursor)));
console.log('DEFAULT CURSOR on links/buttons:', J(res.filter((r) => !r.skipped && r.cursor === 'auto' && /^(a|button|summary)\./.test(r.key)).map((r) => r.key)));
console.log('errors', J(b.errors));
writeFileSync(OUT + `v3-11-result-${W}.json`, J(res, null, 1));
await b.close(); process.exit(0);
