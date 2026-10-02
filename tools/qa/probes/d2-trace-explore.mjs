// d2-trace-explore: what events/threads does a scroll trace contain? (design aid for the analysis)
import { launch, goto, traceStart, traceStop, playWheel, profiles, sleep, threadMap, selfTimes, arg, save } from './d2-lib.mjs';
const c = await launch({ port: +arg('port', 9402) });
await goto(c, arg('url', 'http://127.0.0.1:4402/'));
await c.ev(`scrollTo(0, ${+arg('y', 6000)}); 1`); await sleep(2500);
await traceStart(c);
await c.ev(`performance.mark('d2:begin'); 1`);
await playWheel(c, profiles.bursts(+arg('px', 1500)));
await sleep(1200);
const ev = await traceStop(c);
console.log('events', ev.length);
const { names, procs } = threadMap(ev);
const cnt = new Map();
for (const e of ev) { const k = (procs.get(e.pid) || e.pid) + '|' + (names.get(e.pid + ':' + e.tid) || e.tid) ; cnt.set(k, (cnt.get(k) || 0) + 1); }
console.log([...cnt].sort((a, b) => b[1] - a[1]).slice(0, 30));
const byName = new Map();
for (const e of ev) byName.set(e.name, (byName.get(e.name) || 0) + 1);
console.log([...byName].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([n, v]) => n + ':' + v).join('  '));
const mk = ev.filter((e) => e.name === 'd2:begin');
console.log('marks', mk.map((e) => ({ ts: e.ts, ph: e.ph, cat: e.cat })));
save('trace-explore.json', ev.slice(0, 20));
await c.close();
