// v3-26 (r2): (1) palette expands with keyboard focus once past the hero, (2) video card keyboard ring (screenshot), (3) IG marquee: keyboard focus pauses, Tab-out resumes; mouse click does not leave it paused.
import { start, sleep, OUT, docTop } from './v3-lib.mjs';
const b = await start({ w: 1366, h: 820, tag: 'kd', wait: 3500 });
const J = (o) => JSON.stringify(o);
const key = async (k, code, vk, shift = false) => { await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers: shift ? 8 : 0 }); };
// (1)
await b.evalJs(`document.documentElement.style.scrollBehavior = 'auto'; scrollTo(0, ${await docTop(b, '#process')}); 0`); await sleep(1500);
const pw0 = await b.evalJs(`document.querySelector('.pal').getBoundingClientRect().width`);
await b.evalJs(`document.querySelector('.pal button').focus({ focusVisible: true }); 0`); await sleep(900);
const pw1 = await b.evalJs(`document.querySelector('.pal').getBoundingClientRect().width`);
await b.shot('kd-palette-focus');
console.log('PALETTE idle->focus width', pw0, pw1, 'visibility', await b.evalJs(`getComputedStyle(document.querySelector('.pal')).visibility`));
await b.evalJs(`document.activeElement.blur(); 0`);
// (2) video card ring
const vt = await docTop(b, '.vid__hit');
await b.evalJs(`scrollTo(0, ${vt - 160}); 0`); await sleep(1500);
await b.evalJs(`document.querySelectorAll('.vid__hit')[0].previousElementSibling && 0; (document.querySelector('.stories a, .stories button, #stories a, #stories button') || document.body).focus(); 0`);
for (let i = 0; i < 12 && !(await b.evalJs(`document.activeElement.classList.contains('vid__hit')`)); i++) { await key('Tab', 'Tab', 9); await sleep(120); }
await sleep(500);
const ring = await b.evalJs(`(() => { const a = document.activeElement; const out = (e, p) => { const c = getComputedStyle(e, p); return c.outlineStyle + ' ' + c.outlineWidth + ' ' + c.outlineColor + ' | shadow ' + c.boxShadow.slice(0, 60); }; const f = a.closest('.vid__frame') || a.parentElement; return { fv: a.matches(':focus-visible'), self: out(a), after: out(a, '::after'), parent: out(f), parentCls: f.className, hitRect: a.getBoundingClientRect().toJSON() }; })()`);
console.log('VID ring', J(ring));
await b.shot('kd-video-focus');
// (3) IG marquee
const ig = await docTop(b, '.ig-card');
await b.evalJs(`scrollTo(0, ${ig - 300}); 0`); await sleep(1500);
const state = () => b.evalJs(`document.querySelector('.strip__track').getAnimations()[0].playState`);
console.log('IG state idle', await state());
await b.evalJs(`document.querySelector('.ig-card').focus({ focusVisible: true }); 0`); await sleep(600);
console.log('ig fv', await b.evalJs(`document.activeElement.matches(':focus-visible')`));
console.log('IG state after keyboard focus', await state(), '(expect paused)');
await key('Tab', 'Tab', 9, true); await sleep(200); await key('Tab', 'Tab', 9, true); await sleep(200);
const afterShiftTab = await b.evalJs(`document.activeElement.className + ''`);
console.log('active after shift-tabs', afterShiftTab);
await b.evalJs(`document.activeElement.blur(); 0`); await sleep(700);
console.log('IG state after blur', await state(), '(expect running)');
const c = await b.evalJs(`(() => { const r = document.querySelector('.ig-card').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
await b.click(c[0], c[1]); await sleep(500); await b.move(20, 20); await sleep(1500);
console.log('IG state after mouse click + pointer away', await state(), '(expect running)');
console.log('errors', J(b.errors));
await b.close(); process.exit(0);
