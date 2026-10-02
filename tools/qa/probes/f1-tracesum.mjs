// f1-tracesum: main-thread CPU cost per event type from a trace written by f1-scroll.mjs --trace (style / layout / script / long tasks). CPU only, so GPU contention does not colour it.
//   node tools/qa/probes/f1-tracesum.mjs tagA [tagB ...]
import { readFileSync } from 'node:fs';
import { OUT } from './f1-lib.mjs';
const NAMES = ['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'FunctionCall', 'FireAnimationFrame', 'HitTest', 'IntersectionObserverController::computeIntersections'];
for (const tag of process.argv.slice(2)) {
  const ev = JSON.parse(readFileSync(`${OUT('f1')}/data/${tag}.trace.json`, 'utf8'));
  const meta = ev.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args.name === 'CrRendererMain');
  const cnt = new Map(); for (const e of ev) { const k = `${e.pid}:${e.tid}`; if (meta.some((m) => `${m.pid}:${m.tid}` === k)) cnt.set(k, (cnt.get(k) || 0) + 1); }
  const main = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0]; const [mp, mt] = main.split(':').map(Number);
  const on = ev.filter((e) => e.ph === 'X' && e.pid === mp && e.tid === mt && e.dur != null);
  const agg = (n, f = () => true) => { const x = on.filter((e) => e.name === n && f(e)); return { n: x.length, total: x.reduce((a, e) => a + e.dur, 0) / 1000, max: Math.max(0, ...x.map((e) => e.dur)) / 1000 }; };
  const fmt = (a) => `n=${a.n} total ${a.total.toFixed(0)}ms max ${a.max.toFixed(1)}ms`;
  const tasks = on.filter((e) => e.name === 'RunTask');
  console.log(`\n[${tag}] RunTask n=${tasks.length} >16ms: ${tasks.filter((e) => e.dur > 16000).length} >32ms: ${tasks.filter((e) => e.dur > 32000).length} total ${(tasks.reduce((a, e) => a + e.dur, 0) / 1000).toFixed(0)}ms`);
  for (const n of NAMES) console.log(`   ${n.padEnd(52)} ${fmt(agg(n))}`);
  console.log(`   ${'UpdateLayoutTree touching >150 elements'.padEnd(52)} ${fmt(agg('UpdateLayoutTree', (e) => (e.args?.elementCount || 0) > 150))}`);
  console.log(`   ${'Layout touching >150 objects'.padEnd(52)} ${fmt(agg('Layout', (e) => (e.args?.beginData?.totalObjects || e.args?.totalObjects || 0) > 150))}`);
}
// the engine's own per-frame work: gsap ticker ticks (Lenis + ScrollTrigger + tweens) and ScrollTrigger scroll handlers; Digital's scene.js is excluded on purpose
console.log('\n=== gsap _tick / ScrollTrigger _onScroll only (engine work per frame), Digital scene excluded ===');
for (const tag of process.argv.slice(2)) {
  const ev = JSON.parse(readFileSync(`${OUT('f1')}/data/${tag}.trace.json`, 'utf8'));
  const meta = ev.filter((e) => e.ph === 'M' && e.name === 'thread_name' && e.args.name === 'CrRendererMain');
  const cnt = new Map(); for (const e of ev) { const k = `${e.pid}:${e.tid}`; if (meta.some((m) => `${m.pid}:${m.tid}` === k)) cnt.set(k, (cnt.get(k) || 0) + 1); }
  const [mp, mt] = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0][0].split(':').map(Number);
  const on = ev.filter((e) => e.ph === 'X' && e.pid === mp && e.tid === mt && e.dur != null);
  const ticks = on.filter((e) => e.name === 'FunctionCall' && /^(_tick|_onScroll)$/.test(e.args?.data?.functionName || '') && /gsap/.test(e.args?.data?.url || ''));
  const d = ticks.map((e) => e.dur / 1000).sort((a, b) => a - b); const q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))] ?? 0;
  const lay = on.filter((e) => e.name === 'Layout'), ult = on.filter((e) => e.name === 'UpdateLayoutTree');
  console.log(`${tag.padEnd(10)} ticks n=${d.length} p50 ${q(0.5).toFixed(2)} p95 ${q(0.95).toFixed(2)} p99 ${q(0.99).toFixed(2)} max ${(d.at(-1) ?? 0).toFixed(1)} ms | >16ms: ${d.filter((x) => x > 16).length}  >32ms: ${d.filter((x) => x > 32).length} | Layout max ${(Math.max(0, ...lay.map((e) => e.dur)) / 1000).toFixed(1)} ms (>8ms: ${lay.filter((e) => e.dur > 8000).length}) | UpdateLayoutTree max ${(Math.max(0, ...ult.map((e) => e.dur)) / 1000).toFixed(1)} ms (>8ms: ${ult.filter((e) => e.dur > 8000).length})`);
}
