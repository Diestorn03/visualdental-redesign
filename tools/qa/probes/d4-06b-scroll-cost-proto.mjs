// d4-06b: same measurement as d4-06 (main-thread cost of wheel-scrolling the list, pointer ON vs OFF the list) but with the prototype
// (sticky preview) injected. Run order warms the row reveals first so they do not pollute the numbers.
// node tools/qa/probes/d4-06b-scroll-cost-proto.mjs [w] [h] [port] [proto=1|0]
import { launch, sleep } from './d4-lib.mjs';
import { PROTO_JS } from './d4-proto-services.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404), PROTO = process.argv[5] !== '0';
const b = await launch({ port: PORT, w: W, h: H, tag: `cp${W}` });
await b.open('http://127.0.0.1:4404/');
await b.send('Performance.enable');
const metrics = async () => Object.fromEntries((await b.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop + 1700, W / 2, H / 2); await sleep(1500); await b.wheelTo(listTop - 300, W / 2, H / 2); await sleep(1500); // warm reveals
if (PROTO) await b.evalJs(PROTO_JS);
async function run(name, px, py, dir) {
  await b.wheelTo(dir > 0 ? listTop - 300 : listTop + 1450, W / 2, H / 2); await sleep(2200);
  await b.move(px, py); await sleep(1200);
  const m0 = await metrics();
  await b.burst(px, py, 18, dir * 100, 40); await sleep(1200);
  const m1 = await metrics(); const d = (k) => +(m1[k] - m0[k]).toFixed(4);
  console.log((PROTO ? 'PROTO ' : 'OLD   ') + name, JSON.stringify({ LayoutCount: d('LayoutCount'), RecalcStyleCount: d('RecalcStyleCount'), LayoutMs: +(d('LayoutDuration') * 1000).toFixed(1), RecalcStyleMs: +(d('RecalcStyleDuration') * 1000).toFixed(1), ScriptMs: +(d('ScriptDuration') * 1000).toFixed(1), TaskMs: +(d('TaskDuration') * 1000).toFixed(1) }));
}
for (let i = 0; i < 2; i++) {
  await run('ON  list down', 500, 430, 1); await run('OFF list down', 20, 430, 1);
  await run('ON  list up  ', 500, 430, -1); await run('OFF list up  ', 20, 430, -1);
}
await b.close(); process.exit(0);
