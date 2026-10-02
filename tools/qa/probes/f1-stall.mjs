// f1-stall: deterministic test of the scroll "leap after a stalled frame". A steady wheel stream runs while the main thread is blocked for --stall ms
// (default 200) once; the probe reports the scroll step of the frame that follows the stall and the next ones, against the steady step before it.
// GPU noise from other processes cannot fake this: the stall is injected, so old vs new engine (or different --maxdt) compare directly.
//   node tools/qa/probes/f1-stall.mjs [--old] [--maxdt=34] [--stall=200] [--y=1500] [--runs=3] [--tag=name]
import { launch, install, sleep, paced, noHmr, OUT } from './f1-lib.mjs';
import { execSync } from 'node:child_process';
const killPort = (port) => { try { execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }"`, { stdio: 'ignore' }); } catch {} };
const arg = (k, d) => { const a = process.argv.find((x) => x === `--${k}` || x.startsWith(`--${k}=`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const OLD = !!arg('old', false), MAXDT = +arg('maxdt', 0), STALL = +arg('stall', 200), Y0 = +arg('y', 1500), RUNS = +arg('runs', 3), PORT = +arg('port', 9411);
const BASE = 'http://127.0.0.1:4411';
const rows = [];
for (let run = 0; run < RUNS; run++) {
  const c = await launch({ port: PORT, w: 1366, h: 820, profile: `${OUT('stall')}/profile` });
  await install(c, '/src/scripts/engine.js');
  await noHmr(c, { old: OLD, maxdt: MAXDT, base: BASE });
  await c.send('Page.navigate', { url: BASE + '/' });
  for (let i = 0; i < 100; i++) { const ok = await c.ev(`document.documentElement.classList.contains('fx-booted') && !!__d1.getLenis?.()`).catch(() => false); if (ok) break; await sleep(100); }
  await sleep(2500);
  await c.ev(`__d1.getLenis().scrollTo(${Y0}, { immediate: true, force: true }); 0`); await sleep(1200);
  await c.ev(`__d1.start([]); 0`);
  // 1.6 s of steady wheel (a notch every 30 ms); the stall hits at 700 ms
  let stalled = false;
  await paced(1600, 30, async (i, el) => {
    c.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 683, y: 450, deltaX: 0, deltaY: 60 }).catch(() => {});
    if (!stalled && el > 700) { stalled = true; c.send('Runtime.evaluate', { expression: `(() => { const t = performance.now(); while (performance.now() - t < ${STALL}); })()` }).catch(() => {}); }
  });
  await sleep(1500);
  const F = JSON.parse(await c.ev(`JSON.stringify(__d1.frames)`));
  await c.close(); killPort(PORT); await sleep(1500);
  // frames: [rafTs, now, scrollY, lenis.scroll, ...]
  let si = -1; for (let i = 1; i < F.length; i++) if (F[i][0] - F[i - 1][0] > STALL * 0.7) { si = i; break; }
  if (si < 0) { rows.push({ run, err: 'no stall frame found' }); continue; }
  const step = (i) => Math.abs(F[i][2] - F[i - 1][2]);
  const pre = []; for (let i = Math.max(2, si - 12); i < si; i++) pre.push(step(i)); pre.sort((a, b) => a - b);
  const post = []; for (let i = si; i < Math.min(F.length, si + 8); i++) post.push(Math.round(step(i)));
  const steady = pre[Math.floor(pre.length / 2)] ?? 0;
  rows.push({ run, stallDt: Math.round(F[si][0] - F[si - 1][0]), steady: +steady.toFixed(1), post: post.join(' '), maxPost: Math.max(...post), travelAfter8: Math.round(F[Math.min(F.length - 1, si + 7)][2] - F[si - 1][2]) });
}
const tag = arg('tag', `${OLD ? 'old' : MAXDT ? 'maxdt' + MAXDT : 'new'}`);
console.log(`[${tag}] stall ${STALL} ms at y~${Y0}`);
for (const r of rows) console.log(r.err ? `  run ${r.run}: ${r.err}` : `  run ${r.run}: stalled frame dt ${r.stallDt} ms | steady step ${r.steady}px | steps from the stalled frame on: ${r.post} | max ${r.maxPost}px (${(r.maxPost / Math.max(1, r.steady)).toFixed(1)}x steady) | travel in those 8 frames ${r.travelAfter8}px`);
process.exit(0);
