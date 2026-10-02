// v3-30 (r2): video card click (facade -> player): no layout jump, the player replaces the facade at the same size, focus stays inside, hover state clear before. Also FAQ keyboard toggle.
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const b = await start({ w: 1366, h: 820, tag: 'vc', wait: 3500 });
const J = (o) => JSON.stringify(o);
await b.move(683, 400); await b.wheelTo((await docTop(b, '.vid__frame')) - 140, 683, 400); await sleep(1800);
console.log('scrollY after wheelTo', await b.evalJs('scrollY'), 'target', (await docTop(b, '.vid__frame')));
const geo = () => b.evalJs(`(() => { const f = document.querySelectorAll('.vid__frame')[1]; const r = f.getBoundingClientRect(); return { y: scrollY, h: document.documentElement.scrollHeight, fx: Math.round(r.left), fy: Math.round(r.top), fw: Math.round(r.width), fh: Math.round(r.height), iframe: !!f.querySelector('iframe'), video: !!f.querySelector('video'), ae: document.activeElement.className + ' ' + document.activeElement.tagName, src: (f.querySelector('iframe') || {}).src || null, tag: f.querySelector('iframe') ? f.querySelector('iframe').allow : null }; })()`);
const g0 = await geo();
const c = [g0.fx + g0.fw / 2, g0.fy + g0.fh / 2];
await b.move(c[0], c[1]); await sleep(600); await b.shot('vc-hover');
await b.click(c[0], c[1]); await sleep(1500);
const g1 = await geo();
await b.shot('vc-clicked');
console.log('before', J(g0)); console.log('after ', J(g1));
console.log('layout stable', g0.h === g1.h && g0.fw === g1.fw && g0.fh === g1.fh && Math.abs(g0.y - g1.y) < 3);
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
