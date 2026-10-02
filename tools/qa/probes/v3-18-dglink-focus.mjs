// v3-18: keyboard focus indication on #digital step links (.dg__link): idle vs focus-visible computed styles + screenshot.
import { start, sleep, docTop } from './v3-lib.mjs';
const W = 1366, H = 820;
const b = await start({ w: W, h: H, tag: 'dl', wait: 3500 });
const J = (o) => JSON.stringify(o);
const top = await docTop(b, '#digital');
await b.move(20, 30);
await b.wheelTo(top + 500, W / 2, H / 2); await sleep(2000);
const snap = () => b.evalJs(`(() => { const a = document.querySelectorAll('.dg__link')[2]; const cs = getComputedStyle(a); const st = a.closest('.dg__step'); const sc = getComputedStyle(st); return { outline: cs.outlineStyle + ' ' + cs.outlineWidth + ' ' + cs.outlineColor + ' off ' + cs.outlineOffset, shadow: cs.boxShadow, deco: cs.textDecorationLine, color: cs.color, bg: cs.backgroundColor, fv: a.matches(':focus-visible'), stepOutline: sc.outlineStyle, stepShadow: sc.boxShadow, linkCls: a.className, tag: a.parentElement.tagName }; })()`);
console.log('idle', J(await snap()));
await b.evalJs(`document.querySelectorAll('.dg__link')[2].focus({ focusVisible: true })`); await sleep(1500);
console.log('focus', J(await snap()));
await b.shot('85-dg-link-focus');
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
