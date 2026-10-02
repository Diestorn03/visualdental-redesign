// d2-cost: contention-proof cost of a full-page real-wheel scroll: CPU seconds consumed by the renderer / GPU / browser processes
// (SystemInfo.getProcessInfo) and GPU-engine utilisation of THIS Chrome's GPU process (Windows GPU Engine counters), per condition.
//   node tools/qa/probes/d2-cost.mjs --conds=base,noblur --reps=2 [--profile=bursts] [--from=0 --px=21000]
import { spawn } from 'node:child_process';
import { launch, goto, playWheel, profiles, sleep, arg, frames, frameStats, save } from './d2-lib.mjs';
import { CONDS } from './d2-conds.mjs';
const CONDLIST = arg('conds', 'base').split(','), REPS = +arg('reps', 1), PROFILE = arg('profile', 'bursts'), FROM = +arg('from', 0), PX = +arg('px', 0);
const results = {};
for (let r = 0; r < REPS; r++) for (const cn of CONDLIST) {
  const c = await launch({ port: +arg('port', 9402), profile: 'cost', cpu: +arg('cpu', 1), w: +arg('w', 1366), h: +arg('h', 820), dpr: +arg('dpr', 1) });
  const cond = CONDS[cn];
  if (cond.css) await c.send('Page.addScriptToEvaluateOnNewDocument', { source: `document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(cond.css)};document.head.append(s);},{once:true});` });
  await goto(c, arg('url', 'http://127.0.0.1:4402/'), { settle: 4000 });
  const docH = await c.ev('document.documentElement.scrollHeight - innerHeight');
  if (FROM > 0) { await c.ev(`scrollTo(0, ${FROM}); 1`); await sleep(2500); }
  const bws = new WebSocket((await (await fetch('http://127.0.0.1:' + c.port + '/json/version')).json()).webSocketDebuggerUrl); await new Promise((r) => (bws.onopen = r));
  let bid = 0; const bp = new Map(); bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && bp.has(m.id)) { bp.get(m.id)(m.result); bp.delete(m.id); } };
  const bsend = (method, params = {}) => new Promise((r) => { const i = ++bid; bp.set(i, r); bws.send(JSON.stringify({ id: i, method, params })); });
  const procs = async () => { const r = await bsend('SystemInfo.getProcessInfo'); const o = {}; for (const p of r.processInfo) o[p.type + ':' + p.id] = p.cpuTime; return { o, ids: r.processInfo }; };
  const p0 = await procs();
  const gpuPid = p0.ids.find((p) => p.type === 'GPU')?.id;
  // GPU engine utilisation sampler for this GPU pid
  const ps = spawn('powershell', ['-NoProfile', '-Command', `for ($i=0; $i -lt 120; $i++) { $s = (Get-Counter '\GPU Engine(pid_${gpuPid}*)\Utilization Percentage' -ErrorAction SilentlyContinue).CounterSamples; $t = ($s | Where-Object { $_.InstanceName -match 'engtype_3D' } | Measure-Object CookedValue -Sum).Sum; Write-Output ([math]::Round($t,1)); Start-Sleep -Milliseconds 400 }`], { stdio: ['ignore', 'pipe', 'ignore'] });
  const gpu = []; ps.stdout.on('data', (d) => String(d).split(/\r?\n/).filter(Boolean).forEach((x) => gpu.push(+x.replace(',', '.'))));
  await sleep(1500); gpu.length = 0;
  await c.ev('__d2.reset(); __d2.rec = true; 1');
  const t0 = performance.now();
  await playWheel(c, profiles[PROFILE](PX || docH - FROM + 300));
  await sleep(1500);
  const wall = (performance.now() - t0) / 1000;
  await c.ev('__d2.rec = false; 1');
  const p1 = await procs();
  const f = await frames(c);
  ps.kill(); bws.close();
  const dsum = (re) => +Object.keys(p1.o).filter((k) => re.test(k)).reduce((a, k) => a + (p1.o[k] - (p0.o[k] || 0)), 0).toFixed(2);
  const dmax = (re) => +Math.max(0, ...Object.keys(p1.o).filter((k) => re.test(k)).map((k) => p1.o[k] - (p0.o[k] || 0))).toFixed(2);
  const row = { cond: cn, wallS: +wall.toFixed(1), cpuRenderer: dmax(/^renderer:/), cpuGpu: dsum(/^GPU:/), cpuBrowser: dsum(/^browser:/), gpuUtilAvg: +(gpu.reduce((a, b) => a + b, 0) / Math.max(1, gpu.length)).toFixed(1), gpuUtilMax: Math.max(0, ...gpu), samples: gpu.length, raf: frameStats(f.f) };
  (results[cn] ||= []).push(row);
  console.log(JSON.stringify({ ...row, raf: { fps: row.raf.fps, p95: row.raf.p95, worst: row.raf.worst, over33: row.raf.over33, missed: row.raf.missed } }));
  await c.close(); await sleep(1000);
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log('\nMEDIANS per condition (renderer/gpu/browser CPU s, GPU 3D util avg%, over33, missed):');
for (const [cn, rows] of Object.entries(results)) console.log(`  ${cn.padEnd(10)} rendererCPU=${med(rows.map((x) => x.cpuRenderer))} gpuCPU=${med(rows.map((x) => x.cpuGpu))} browserCPU=${med(rows.map((x) => x.cpuBrowser))} gpuUtilAvg=${med(rows.map((x) => x.gpuUtilAvg))} over33=${med(rows.map((x) => x.raf.over33))} missed=${med(rows.map((x) => x.raf.missed))} worst=${med(rows.map((x) => x.raf.worst))}`);
save(`cost-${CONDLIST.join('+')}.json`, results);
