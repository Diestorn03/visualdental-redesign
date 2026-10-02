// v3-17: Services extras: keyboard Tab order through the rows (focus ring, photo follows, scroll does not override focus), end-of-list clamp, row 06 link, reduced-motion fallback.
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const W = 1366, H = 820;
const J = (o) => JSON.stringify(o);
{
  const b = await start({ w: W, h: H, tag: 'sx', wait: 3500 });
  const listTop = await docTop(b, '.svc__list');
  await b.move(20, 30);
  await b.wheelTo(listTop - 200, W / 2, H / 2); await sleep(1800);
  // sequential focus starts right before the list: focus the section heading (tabindex -1) like a click on it
  await b.evalJs(`(() => { const h = document.querySelector('#services-title'); h.tabIndex = -1; h.focus(); })()`);
  const key = async (k, code, vk, shift) => { const m = shift ? 8 : 0; await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: m }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: m }); await sleep(900); };
  const st = () => b.evalJs(`(() => { const a = document.activeElement, rows = [...document.querySelectorAll('.svc__row')], r = a.closest && a.closest('.svc__row'); const cs = getComputedStyle(a); const rr = r ? r.getBoundingClientRect() : null; return { el: a.tagName.toLowerCase() + '.' + String(a.className).split(' ')[0], row: r ? rows.indexOf(r) + 1 : 0, act: rows.findIndex((x) => x.classList.contains('is-active')) + 1, cap: document.querySelector('.svc__cap').textContent.trim().slice(0, 2), ring: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor, fv: a.matches(':focus-visible'), rowInView: rr ? rr.top < innerHeight && rr.bottom > 0 : null, headerCovers: rr ? rr.top < 72 && rr.bottom > 0 : null, y: Math.round(scrollY) }; })()`);
  const seq = [];
  for (let i = 0; i < 8; i++) { await key('Tab', 'Tab', 9); seq.push(await st()); }
  console.log('TAB through rows', J(seq.map((s) => `${s.el} row${s.row} act${s.act} cap${s.cap} ring[${s.ring}] fv=${s.fv} inView=${s.rowInView}`)));
  await b.shot('80-keyboard-after-tabs');
  // wheel while a row has focus: focus keeps the selection
  const f0 = await st(); const sc = [];
  for (let i = 0; i < 5; i++) { await b.wheel(W / 2, H / 2, 100); await sleep(60); } await sleep(1200);
  const f1 = await st();
  console.log('focus keeps selection under wheel', J({ focusedRow: f0.row, activeBefore: f0.act, activeAfterWheel: f1.act, scrolledPx: f1.y - f0.y }));
  await key('Tab', 'Tab', 9, true); const back = await st(); console.log('Shift+Tab', J(back));
  // end-of-list clamp + hover row 6
  const listH = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().height`);
  await b.wheelTo(listTop + listH - H * 0.55, W / 2, H / 2); await sleep(2200);
  await b.evalJs('document.activeElement.blur()');
  await b.move(300, 30); await sleep(300);
  await b.shot('81-end-of-list');
  const last = await b.evalJs(`(() => { const r = [...document.querySelectorAll('.svc__row')].at(-1).getBoundingClientRect(); const p = document.querySelector('.svc__panel').getBoundingClientRect(); const l = document.querySelector('.svc__lane').getBoundingClientRect(); const c = document.querySelector('.svc__close').getBoundingClientRect(); return { lastRow: [r.top, r.bottom].map(Math.round), panel: [p.top, p.bottom].map(Math.round), laneBottom: Math.round(l.bottom), closeTop: Math.round(c.top), act: [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active')) + 1 }; })()`);
  console.log('END', J(last));
  const mid6 = (last.lastRow[0] + last.lastRow[1]) / 2;
  const L = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().left`);
  await b.move(L + 300, Math.min(H - 60, mid6)); await sleep(900);
  await b.shot('82-hover-row6-link');
  console.log('row6 hover', J(await b.evalJs(`({ cursor: getComputedStyle(document.elementFromPoint(${L + 300}, ${Math.min(H - 60, mid6)}).closest('.svc__row')).cursor, act: [...document.querySelectorAll('.svc__row')].findIndex((x) => x.classList.contains('is-active')) + 1 })`)));
  console.log('errors', J(b.errors));
  await b.close();
}
{
  // reduced motion fallback (no sticky panel; inline photos from CSS)
  const b = await start({ w: W, h: H, tag: 'sxr', wait: 100 });
  await b.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await b.open('http://127.0.0.1:4423/', 3000);
  const listTop = await docTop(b, '.svc__list');
  await b.evalJs(`document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, ${Math.round(listTop - 150)}); 0`); await sleep(1500);
  await b.shot('83-services-reduced-motion');
  console.log('REDUCED', J(await b.evalJs(`({ fx: document.documentElement.classList.contains('is-desktop-fx'), panel: getComputedStyle(document.querySelector('.svc__panel')).display, thumb: getComputedStyle(document.querySelector('.svc__thumb')).display, thumbH: Math.round(document.querySelector('.svc__thumb').getBoundingClientRect().height), active: document.querySelectorAll('.svc__row.is-active').length })`)));
  await b.close();
}
process.exit(0);
