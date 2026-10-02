// Drag-to-rotate on the real page (worker path or ?digital=main): real mouse events on the canvas at step 6, screenshots before / during / after.
//   MSYS_NO_PATHCONV=1 node tools/digital/drag-page.mjs --port=9416 [--main]
import { writeFileSync, mkdirSync } from 'node:fs';
import { launch, goto, geom, sleep, arg, ROOT } from './v/v2-lib.mjs';
const PORT = +arg('port', 9416), OUT = ROOT + '.shots/d1/drag/'; mkdirSync(OUT, { recursive: true });
const c = await launch({ port: PORT, w: 1366, h: 820, profileDir: ROOT + '.shots/d1/v/prof-shot', recorder: false });
await goto(c, arg('url', 'http://127.0.0.1:4416/') + (arg('main', false) ? '?digital=main' : ''), { settle: 1500 });
const g = await geom(c); const dg = g.secs.find((s) => s.id === 'digital');
await c.ev(`scrollTo(0, ${dg.top - Math.round(g.vh * 1.2)}); 1`);
for (let i = 0; i < 200; i++) { if (await c.ev(`document.querySelector('#digital')?.dataset.ready === '1'`)) break; await sleep(250); }
const geo = await c.ev(`JSON.parse(JSON.stringify(window.__digital.geo))`);
await c.ev(`scrollTo(0, ${Math.round(geo.a[5])}); 1`); await sleep(2500);
const r = await c.ev(`(() => { const b = document.querySelector('.dg__canvas').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
const shot = async (n) => { const s = await c.send('Page.captureScreenshot', { format: 'png' }); writeFileSync(OUT + n + '.png', Buffer.from(s.data, 'base64')); return s.data.length; };
const a = await shot('0-before');
const m = (type, x, y, extra = {}) => c.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: r.x, y: r.y });
await m('mousePressed', r.x, r.y);
for (let i = 1; i <= 20; i++) { await m('mouseMoved', r.x + i * 8, r.y + i * 1.5); await sleep(16); }
await sleep(300); const b = await shot('1-during');
await m('mouseReleased', r.x + 160, r.y + 30);
await sleep(600); const d = await shot('2-after');
console.log('screenshot bytes before/during/after', a, b, d, 'cursor', await c.ev(`getComputedStyle(document.querySelector('.dg__canvas')).cursor`), 'errors', c.errors.slice(0, 3));
await c.close();
