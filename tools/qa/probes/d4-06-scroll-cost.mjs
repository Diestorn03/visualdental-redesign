// d4-06: main-thread cost of wheel-scrolling through #services with the pointer ON the list vs OFF it (Performance.getMetrics deltas).
// node tools/qa/probes/d4-06-scroll-cost.mjs [w] [h] [port]
import { launch, sleep } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `c${W}` });
await b.open('http://127.0.0.1:4404/');
await b.send('Performance.enable');
const metrics = async () => Object.fromEntries((await b.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
async function run(name, px, py, dir) {
  await b.wheelTo(dir > 0 ? listTop - 120 : listTop + 1300, W / 2, H / 2);
  await sleep(2200);
  await b.move(px, py); await sleep(1200);
  const m0 = await metrics(); const y0 = await b.evalJs('scrollY');
  await b.burst(px, py, 18, dir * 100, 40);
  await sleep(1200);
  const m1 = await metrics(); const y1 = await b.evalJs('scrollY');
  const d = (k) => +(m1[k] - m0[k]).toFixed(4);
  console.log(name, JSON.stringify({ scrolledPx: Math.round(y1 - y0), LayoutCount: d('LayoutCount'), RecalcStyleCount: d('RecalcStyleCount'), LayoutMs: +(d('LayoutDuration') * 1000).toFixed(1), RecalcStyleMs: +(d('RecalcStyleDuration') * 1000).toFixed(1), ScriptMs: +(d('ScriptDuration') * 1000).toFixed(1), TaskMs: +(d('TaskDuration') * 1000).toFixed(1) }));
}
await run('ON  list (500,430) down', 500, 430, 1);
await run('OFF list (20,430)  down', 20, 430, 1);
await run('ON  list (500,430) up  ', 500, 430, -1);
await run('OFF list (20,430)  up  ', 20, 430, -1);
console.log('errors', b.errors);
await b.close();
process.exit(0);
