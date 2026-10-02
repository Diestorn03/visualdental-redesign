// d4-14: rapid enter/leave of the list (old panel): consistency + opacity flicker count.   node tools/qa/probes/d4-14-rapid-inout.mjs [w] [h] [port] [halfPeriodMs]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404), HP = +(process.argv[5] || 90);
const b = await launch({ port: PORT, w: W, h: H, tag: `r${W}` });
await b.open('http://127.0.0.1:4404/');
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop + 100, W / 2, H / 2); await sleep(2500);
const lb = await b.evalJs('document.querySelector(".svc__list").getBoundingClientRect().left');
await b.evalJs(`(() => { const p = document.querySelector('.svc__panel'); let on = false, S = []; const tick = (t) => { if (on) S.push([+t.toFixed(1), +(+getComputedStyle(p).opacity).toFixed(3)]); requestAnimationFrame(tick); }; requestAnimationFrame(tick); window.__o = { start() { S = []; on = true; }, stop() { on = false; return S; } }; })()`);
await b.move(20, 400); await sleep(800);
await b.evalJs('__o.start()');
const cycles = 12;
for (let i = 0; i < cycles; i++) { await b.move(lb + 250, 400); await sleep(HP); await b.move(20, 400); await sleep(HP); }
await b.move(lb + 250, 400); await sleep(1800);
const S = await b.evalJs('__o.stop()');
const op = S.map((s) => s[1]);
let dirChanges = 0; for (let i = 2; i < op.length; i++) { const a = op[i - 1] - op[i - 2], c = op[i] - op[i - 1]; if (Math.abs(a) > 0.004 && Math.abs(c) > 0.004 && Math.sign(a) !== Math.sign(c)) dirChanges++; }
console.log(`half-period ${HP} ms x ${cycles}:`, JSON.stringify({ opacityDirectionReversals: dirChanges, minOp: Math.min(...op), maxOp: Math.max(...op), finalOpacity: op.at(-1), finalActiveRow: await b.evalJs(`[...document.querySelectorAll('.svc__row')].findIndex((r) => r.classList.contains('is-active'))`) }));
await b.close(); process.exit(0);
