// d4-10: which pointer events does Chrome fire on rows when the page scrolls under a PARKED pointer (wheel)?  Decides how a hover/scroll
// active-row rule must be written.  node tools/qa/probes/d4-10-synthetic-hover.mjs [w] [h] [port]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `y${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(`(() => { window.__ev = []; const t0 = performance.now(); ['pointermove','mousemove','pointerover','pointerenter','mouseover','mouseenter','pointerout','pointerleave'].forEach((n) => document.addEventListener(n, (e) => { if (e.target.closest?.('.svc__row')) window.__ev.push([Math.round(performance.now()), n, [...document.querySelectorAll('.svc__row')].indexOf(e.target.closest('.svc__row')), e.isTrusted]); }, true)); })()`);
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop - 120, W / 2, H / 2); await sleep(2500);
await b.move(500, 450); await sleep(500);
await b.evalJs('window.__ev.length = 0');
const t0 = await b.evalJs('performance.now()');
await b.burst(500, 450, 6, 100, 60); // ~600px of scroll under a parked pointer
const tEnd = await b.evalJs('performance.now()');
await sleep(1500);
const ev = await b.evalJs('window.__ev');
console.log('wheel burst took', Math.round(tEnd - t0), 'ms; events on rows during burst + 1.5 s after:');
const counts = {}; ev.forEach((e) => { counts[e[1]] = (counts[e[1]] || 0) + 1; });
console.log(JSON.stringify(counts));
console.log(ev.map((e) => `${e[0] - Math.round(t0)}ms ${e[1]} row${e[2]}`).join('\n'));
await b.close(); process.exit(0);
