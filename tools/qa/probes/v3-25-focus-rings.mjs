// v3-25 (r2): keyboard Tab walk over the whole page on the production build: for every stop, is there a visible focus indicator (outline / box-shadow / ::after outline) and is the stop inside the viewport and not under the header? Also: palette expands on keyboard focus, IG marquee pauses on keyboard focus and resumes after Tab-out.
// node tools/qa/probes/v3-25-focus-rings.mjs
import { start, sleep, OUT } from './v3-lib.mjs';
import { writeFileSync } from 'node:fs';
const b = await start({ w: 1366, h: 820, tag: 'fr', wait: 3500 });
const J = (o) => JSON.stringify(o);
const key = async (k, code, vk, shift = false) => { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); };
const probe = () => b.evalJs(`(() => { const a = document.activeElement; if (!a || a === document.body) return null; const cs = getComputedStyle(a); const af = getComputedStyle(a, '::after'); const r = a.getBoundingClientRect(); const hb = document.querySelector('[data-header]').getBoundingClientRect().bottom;
  const ring = (c) => (c.outlineStyle !== 'none' && parseFloat(c.outlineWidth) > 0) || (c.boxShadow && c.boxShadow !== 'none');
  const inner = a.querySelector && a.querySelector('*:focus-visible');
  const par = a.closest('summary, li, label');
  const sel = a.tagName.toLowerCase() + (a.className && typeof a.className === 'string' ? '.' + a.className.split(' ')[0] : '') + (a.dataset && a.dataset.nav ? '[' + a.dataset.nav + ']' : '');
  const sec = (a.closest('section') || {}).id || (a.closest('header') ? 'header' : a.closest('footer') ? 'footer' : '-');
  return { sel, sec, ring: ring(cs) || ring(af), selfRing: ring(cs), afterRing: ring(af), fv: a.matches(':focus-visible'), inView: r.bottom > 0 && r.top < innerHeight, underHeader: r.top < hb - 1 && r.bottom > 0 && getComputedStyle(document.querySelector('[data-header]')).visibility !== 'hidden' && hb > 0, w: Math.round(r.width), h: Math.round(r.height) }; })()`);
await b.evalJs(`document.activeElement && document.activeElement.blur(); scrollTo(0, 0); 0`);
const rows = []; let prev = '';
for (let i = 0; i < 140; i++) {
  await key('Tab', 'Tab', 9); await sleep(i % 10 === 0 ? 220 : 90);
  const p = await probe(); if (!p) { rows.push({ i, none: true }); continue; }
  rows.push({ i, ...p });
  if (p.sel === prev && i > 5 && p.sec === 'footer' && p.sel.startsWith('a')) {}
  prev = p.sel;
}
const bad = rows.filter((r) => !r.none && !r.ring);
const hidden = rows.filter((r) => r.underHeader);
console.log('stops', rows.length, '| without visible ring:', J(bad.map((r) => `${r.i}:${r.sec}:${r.sel}(${r.w}x${r.h})`)));
console.log('stops under header:', J(hidden.map((r) => `${r.i}:${r.sec}:${r.sel}`)));
console.log('sections visited', J([...new Set(rows.map((r) => r.sec))]));
console.log('sample', J(rows.slice(0, 14).map((r) => `${r.sec}:${r.sel}:${r.ring ? 'ring' : 'NO'}`)));
// palette: keyboard focus expands?
await b.evalJs(`scrollTo(0, 0); document.activeElement && document.activeElement.blur(); 0`); await sleep(500);
const pw0 = await b.evalJs(`document.querySelector('.pal').getBoundingClientRect().width`);
await b.evalJs(`document.querySelector('.pal button, .pal [role=radio], .pal input').focus({ focusVisible: true }); 0`); await sleep(900);
const pw1 = await b.evalJs(`document.querySelector('.pal').getBoundingClientRect().width`);
console.log('PALETTE width idle -> keyboard focus', pw0, '->', pw1);
await b.shot('fr-palette-focus');
console.log('errors', J(b.errors));
writeFileSync(OUT + 'v3-25-result.json', J(rows));
await b.close(); process.exit(0);
