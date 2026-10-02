// d1-trace: summarise a Chrome trace (written by d1-scroll.mjs --trace): long main-thread tasks and what they were made of.
//   node tools/qa/probes/d1-trace.mjs <tag> [--min=24] [--top=25]
import { readFileSync } from 'node:fs';
import { OUT } from './d1-lib.mjs';
const tag = process.argv[2];
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split('=')[1] : d; };
const MIN = arg('min', 24), TOP = arg('top', 25);
const ev = JSON.parse(readFileSync(`${OUT('d1')}/data/${tag}.trace.json`, 'utf8'));
console.log('events', ev.length);
// find renderer main thread of the page
const meta = ev.filter((e) => e.ph === 'M' && e.name === 'thread_name');
const procName = new Map(ev.filter((e) => e.ph === 'M' && e.name === 'process_name').map((e) => [e.pid, e.args.name]));
const mainThreads = meta.filter((e) => e.args.name === 'CrRendererMain').map((e) => `${e.pid}:${e.tid}`);
// the page renderer = the CrRendererMain with most events
const cnt = new Map(); for (const e of ev) { const k = `${e.pid}:${e.tid}`; if (mainThreads.includes(k)) cnt.set(k, (cnt.get(k) || 0) + 1); }
const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0];
const [mp, mt] = main.split(':').map(Number);
console.log('renderer main', main, 'events', cnt.get(main));
const names = new Map(meta.map((e) => [`${e.pid}:${e.tid}`, e.args.name]));
// other threads of the same process + gpu
const E = ev.filter((e) => e.ph === 'X' && e.dur != null);
const onMain = E.filter((e) => e.pid === mp && e.tid === mt);
// top-level tasks
const tasks = onMain.filter((e) => e.name === 'RunTask' && e.dur / 1000 >= MIN).sort((a, b) => b.dur - a.dur);
console.log(`main-thread RunTask >= ${MIN} ms: ${tasks.length}`);
const t0 = onMain.reduce((m, e) => Math.min(m, e.ts), Infinity);
const within = (p, c) => c.ts >= p.ts && c.ts + c.dur <= p.ts + p.dur + 1 && c !== p;
for (const t of tasks.slice(0, TOP)) {
  const kids = onMain.filter((c) => within(t, c) && c.name !== 'RunTask');
  const agg = new Map(); for (const k of kids) { const a = agg.get(k.name) || { n: 0, d: 0, mx: 0 }; a.n++; a.d += k.dur; a.mx = Math.max(a.mx, k.dur); agg.set(k.name, a); }
  // self-time approximations: only direct heavy names
  const top = [...agg.entries()].filter(([n]) => !/^(RunTask|ThreadControllerImpl::RunTask|ThreadControllerImpl::DoWork)$/.test(n)).sort((a, b) => b[1].mx - a[1].mx).slice(0, 7);
  console.log(`\n t=${((t.ts - t0) / 1000).toFixed(0)}ms  task ${(t.dur / 1000).toFixed(1)} ms  :: ` + top.map(([n, a]) => `${n} x${a.n} max ${(a.mx / 1000).toFixed(1)}ms`).join(' | '));
  // show the heaviest events with args (url / function / name)
  const heavy = kids.filter((k) => k.dur / 1000 > MIN * 0.4).sort((a, b) => b.dur - a.dur).slice(0, 5);
  for (const h of heavy) {
    const a = h.args?.data || h.args || {};
    const info = a.functionName ? `fn=${a.functionName} ${String(a.url || '').split('/').pop()}:${a.lineNumber}` : a.url ? String(a.url).split('/').pop() : a.elementCount ? `elements ${a.elementCount}` : a.dirtyObjects !== undefined ? `dirty ${a.dirtyObjects}/${a.totalObjects}` : '';
    console.log(`       ${h.name} ${(h.dur / 1000).toFixed(1)} ms ${info}`);
  }
}
// aggregate whole-run costs on main thread by category
const agg = new Map(); for (const e of onMain) { if (e.name === 'RunTask') continue; const a = agg.get(e.name) || { n: 0, d: 0, mx: 0 }; a.n++; a.d += e.dur; a.mx = Math.max(a.mx, e.dur); agg.set(e.name, a); }
console.log('\nmain-thread totals by event name (sum may double count nested events):');
for (const [n, a] of [...agg.entries()].sort((a, b) => b[1].d - a[1].d).slice(0, 30)) console.log(`   ${n.padEnd(40)} n=${String(a.n).padStart(6)} total ${(a.d / 1000).toFixed(0).padStart(7)} ms  max ${(a.mx / 1000).toFixed(1)} ms`);
// other threads: raster / decode / GPU
const byThread = new Map(); for (const e of E) { const k = names.get(`${e.pid}:${e.tid}`) || `${e.pid}:${e.tid}`; if (e.pid === mp && e.tid === mt) continue; const a = byThread.get(k) || {}; const x = (a[e.name] ||= { n: 0, d: 0, mx: 0 }); x.n++; x.d += e.dur; x.mx = Math.max(x.mx, e.dur); byThread.set(k, a); }
for (const [th, a] of byThread) { const rows = Object.entries(a).filter(([n, x]) => x.mx / 1000 > 8 || /Raster|Decode|Draw|Swap|Commit/i.test(n)).sort((x, y) => y[1].d - x[1].d).slice(0, 6); if (rows.length) console.log(`thread ${th}: ` + rows.map(([n, x]) => `${n} x${x.n} sum ${(x.d / 1000).toFixed(0)}ms max ${(x.mx / 1000).toFixed(1)}`).join(' | ')); }
