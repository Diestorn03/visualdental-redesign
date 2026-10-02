// d5-touch-scroll: native touch scrolling (no Lenis) through the whole page with real gesture input, recording per-frame jumps.
// node tools/qa/probes/d5-touch-scroll.mjs --device=mobile|tablet [--mode=normal|reduced|calm] [--passes=slow,fast,up,upslow]
//   slow   : 280 px gestures @ 450 px/s, no fling, 350 ms pauses (reading)
//   fast   : 900 px gestures @ 4500 px/s WITH fling, back to back (flicking)
//   up     : after reaching the bottom, flick back to the top
//   upslow : slow scroll up through a few sections
import { launch, touchScroll, waitSettled, info, pullRec, analyze, save, sleep, secAt, OUT } from './d5-lib.mjs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const device = arg('device', 'mobile'), mode = arg('mode', 'normal');
const passes = arg('passes', 'slow,fast,up,upslow').split(',');
const lite = process.argv.includes('--lite');
const S = await launch(`ts-${device}-${mode}`, { device, mode, lite, wait: 3500 });
const report = { device, mode, env: await info(S), passes: {} };
const maxY = () => S.eval('document.documentElement.scrollHeight - innerHeight');
const jumpTo = async (y) => { await S.eval(`document.documentElement.style.scrollBehavior='auto'; scrollTo(0, ${y}); 1`); await sleep(500); };

async function phase(name, fn, { reload = false } = {}) {
  if (reload) { await S.send('Page.reload'); await sleep(3500); }
  const T0 = Date.now();
  const startY = await S.eval('scrollY');
  await fn();
  await sleep(600);
  await pullRec(S);
  const T1 = Date.now();
  const a = analyze(S.rec, { from: T0, to: T1, minJump: 30 });
  a.window = [T0, T1]; a.startY = startY; a.endY = await S.eval('scrollY');
  const hdr = S.rec.ev.filter((e) => e.T >= T0 && e.T <= T1 && e.type === 'hdr');
  a.headerChanges = hdr.length;
  a.headerHides = hdr.filter((e) => /is-hidden/.test(e.to) && !/is-hidden/.test(e.from)).length;
  a.events = S.rec.ev.filter((e) => e.T >= T0 && e.T <= T1 && !['hdr'].includes(e.type)).map((e) => ({ ...e, T: Math.round(e.T - T0) }));
  a.durationMs = T1 - T0;
  // normalise times relative to phase start for readability
  for (const k of ['scrollJumps', 'docHeightChanges', 'sectionShifts', 'cls', 'loaf', 'lt']) a[k] = a[k].map((x) => ({ ...x, T: Math.round(x.T - T0) }));
  report.passes[name] = a;
  console.log(`\n== ${name}  ${a.durationMs}ms  y ${Math.round(a.startY)} -> ${Math.round(a.endY)}  frames=${a.frames}`);
  console.log(`   dt med=${a.dt.med} p95=${a.dt.p95} p99=${a.dt.p99} max=${a.dt.max}  >25:${a.dt.gt25} >34:${a.dt.gt34} >50:${a.dt.gt50} >100:${a.dt.gt100}`);
  console.log(`   scrollJumps=${a.scrollJumps.length} docHeightChanges=${a.docHeightChanges.length} sectionShifts=${a.sectionShifts.length} CLS=${a.clsTotal} (n=${a.cls.length}) LoAF>=50ms=${a.loaf.length} headerHides=${a.headerHides}/${a.headerChanges}`);
  a.scrollJumps.slice(0, 8).forEach((j) => console.log('   JUMP', JSON.stringify(j)));
  a.docHeightChanges.slice(0, 12).forEach((j) => console.log('   HEIGHT', JSON.stringify(j)));
  a.sectionShifts.slice(0, 12).forEach((j) => console.log('   SHIFT', JSON.stringify(j)));
  a.cls.slice(0, 8).forEach((c) => console.log('   CLS', JSON.stringify({ T: c.T, v: +c.v.toFixed(4), y: Math.round(c.y), src: c.src.map((s) => s.n + ' ' + JSON.stringify(s.p) + '->' + JSON.stringify(s.c)) })));
  a.loaf.slice(0, 6).forEach((l) => console.log('   LoAF', JSON.stringify(l)));
  return a;
}

const down = async (dist, speed, fling, pause) => {
  let guard = 0, last = -1;
  while (guard++ < 160) {
    const y = await S.eval('scrollY');
    if (y >= (await maxY()) - 2) break;
    await touchScroll(S, { dist, speed, fling, dir: 'down' });
    if (fling) await waitSettled(S, { quiet: 250, max: 4000 }); else await sleep(pause);
    const y2 = await S.eval('scrollY'); if (Math.abs(y2 - y) < 1 && Math.abs(y2 - last) < 1) break; last = y2;
  }
};

if (passes.includes('slow')) await phase('slow-down', () => down(420, 600, false, 200));
if (passes.includes('fast')) await phase('fast-down', async () => { await jumpTo(0); await down(900, 4500, true, 0); }, { reload: passes.includes('slow') });
if (passes.includes('up')) await phase('fast-up', async () => {
  let guard = 0;
  while (guard++ < 160 && (await S.eval('scrollY')) > 2) { await touchScroll(S, { dist: 900, speed: 4500, fling: true, dir: 'up' }); await waitSettled(S, { quiet: 250, max: 4000 }); }
});
if (passes.includes('upslow')) await phase('slow-up', async () => {
  await jumpTo(await maxY()); await sleep(600);
  for (let i = 0; i < 40; i++) { await touchScroll(S, { dist: 420, speed: 600, fling: false, dir: 'up' }); await sleep(200); }
});
report.finalInfo = await info(S);
report.errors = S.errors; report.nav = S.nav;
console.log('\nnavigations:', S.nav.length, 'errors:', S.errors.length ? S.errors : 'none');
const sfx = lite ? '-lite' : '';
save(`touch-${device}-${mode}${sfx}.json`, report);
save(`touch-${device}-${mode}${sfx}-raw.json`, { frames: S.rec.frames, ev: S.rec.ev, loaf: S.rec.loaf, cls: S.rec.cls, lt: S.rec.lt, windows: Object.fromEntries(Object.entries(report.passes).map(([k, v]) => [k, v.window])) });
S.close();
