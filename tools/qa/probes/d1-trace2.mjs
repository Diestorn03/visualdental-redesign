// d1-trace2: for every slow frame of a traced run (d1-scroll.mjs --trace) list what ran on every thread inside the gap.
//   node tools/qa/probes/d1-trace2.mjs <tag> [--slow=34] [--min=6]   (needs data/<tag>.json and data/<tag>.trace.json)
import { readFileSync } from 'node:fs';
import { OUT } from './d1-lib.mjs';
const tag = process.argv[2];
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? +a.split('=')[1] : d; };
const SLOW = arg("slow", 34), MIN = arg("min", 6), TOPN = arg("topn", 4);
const D = JSON.parse(readFileSync(`${OUT('d1')}/data/${tag}.json`, 'utf8'));
const ev = JSON.parse(readFileSync(`${OUT('d1')}/data/${tag}.trace.json`, 'utf8'));
const sync = ev.find((e) => e.name === 'd1sync');
if (!sync) throw new Error('no d1sync event in trace (blink.user_timing category missing?)');
const off = sync.ts / 1000 - D.meta.sync; // trace ms = page performance.now() + off
const names = new Map(ev.filter((e) => e.ph === 'M' && e.name === 'thread_name').map((e) => [`${e.pid}:${e.tid}`, e.args.name]));
const procs = new Map(ev.filter((e) => e.ph === 'M' && e.name === 'process_name').map((e) => [e.pid, e.args.name]));
const tn = (e) => `${(procs.get(e.pid) || '?').replace('Renderer', 'R').replace('Browser', 'B')}/${names.get(`${e.pid}:${e.tid}`) || e.tid}`;
const X = ev.filter((e) => e.ph === 'X' && e.dur >= MIN * 1000 && !/^(ThreadControllerImpl::RunTask|RunTask|ThreadPool_RunTask|SimpleWatcher::OnHandleReady|Receive mojo message)$/.test(e.name));
const startMark = D.marks.find((m) => m.n === 'scenario-start').t;
const F = D.frames.filter((r) => r[1] >= startMark);
const T0 = F[0][1];
const f1 = (x) => x.toFixed(1);
const info = (e) => { const a = e.args?.data || e.args || {}; const bits = []; if (a.functionName) bits.push(`fn=${a.functionName}`); if (a.url) bits.push(String(a.url).split('/').pop().slice(0, 60)); if (a.imageType) bits.push(a.imageType); if (a.pixelRefId) bits.push('ref' + a.pixelRefId); if (a.elementCount) bits.push('el' + a.elementCount); if (a.dirtyObjects !== undefined) bits.push(`dirty${a.dirtyObjects}/${a.totalObjects}`); if (a.name) bits.push(a.name); if (a.stage) bits.push(a.stage); return bits.join(' '); };
let nSlow = 0;
for (let i = 1; i < F.length; i++) {
  const dt = F[i][0] - F[i - 1][0]; if (dt <= SLOW) continue; nSlow++;
  const a = (F[i - 1][0] + off) * 1000, b = (F[i][0] + off) * 1000;
  console.log(`\n#${nSlow} t=${f1(F[i][1] - T0)}ms dt=${f1(dt)} y=${F[i][2]} (viewport doc range ${F[i][2]}..${F[i][2] + D.meta.h})`);
  const inwin = X.filter((e) => e.ts < b && e.ts + e.dur > a);
  const byThread = new Map(); for (const e of inwin) { const k = tn(e); (byThread.get(k) || byThread.set(k, []).get(k)).push(e); }
  for (const [th, list] of byThread) {
    list.sort((x, y) => y.dur - x.dur);
    const shown = list.slice(0, TOPN).map((e) => `${e.name} ${f1(e.dur / 1000)}ms${info(e) ? ' [' + info(e) + ']' : ''}`);
    console.log(`   ${th.padEnd(38)} ${shown.join('  |  ')}`);
  }
}
console.log(`\nslow frames: ${nSlow}; trace offset ${off.toFixed(1)}`);
