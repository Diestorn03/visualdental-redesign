// d4-03: wheel scroll with the pointer parked still. Compares pointer ON the list (panel active) vs OFF (x=20, outside the list),
// and logs frame dt, row changes, panel motion per frame.  node tools/qa/probes/d4-03-wheel-still-pointer.mjs [w] [h] [port]
import { writeFileSync } from 'node:fs';
import { launch, sleep, RECORDER, stats, OUT } from './d4-lib.mjs';
const W = +(process.argv[2] || 1366), H = +(process.argv[3] || 820), PORT = +(process.argv[4] || 9404);
const b = await launch({ port: PORT, w: W, h: H, tag: `w${W}` });
await b.open('http://127.0.0.1:4404/');
await b.evalJs(RECORDER);
const listTop = await b.evalJs(`document.querySelector('.svc__list').getBoundingClientRect().top + scrollY`);
await b.wheelTo(listTop - 120, W / 2, H / 2);
await sleep(2500);

async function scenario(name, px, py, { notches = 14, dy = 100, every = 30, up = 0 } = {}) {
  await b.move(px, py); await sleep(1500); // pointer parked; panel (if any) settled
  await b.evalJs('__rec.start()');
  await b.burst(px, py, notches, dy, every);
  await sleep(900);
  if (up) { await b.burst(px, py, up, -dy, every); await sleep(900); }
  const { samples } = await b.evalJs('__rec.stop()');
  const dt = samples.slice(1).map((s, i) => s.t - samples[i].t);
  const scrolling = samples.slice(1).filter((s, i) => s.y !== samples[i].y);
  const dtS = samples.slice(1).map((s, i) => ({ dt: s.t - samples[i].t, moved: s.y !== samples[i].y })).filter((o) => o.moved).map((o) => o.dt);
  const jumpsY = samples.slice(1).map((s, i) => Math.abs((s.py ?? 0) - (samples[i].py ?? 0))).filter((v) => v > 0.5);
  const acts = []; samples.forEach((s, i) => { if (i && s.act !== samples[i - 1].act) acts.push({ t: Math.round(s.t - samples[0].t), from: samples[i - 1].act, to: s.act, y: Math.round(s.y) }); });
  const sy = samples.map((s) => s.y);
  // scroll velocity per frame (px/frame) and its largest second difference (jerk) while scrolling
  const vel = samples.slice(1).map((s, i) => s.y - samples[i].y);
  const maxV = Math.max(...vel.map(Math.abs));
  const acc = vel.slice(1).map((v, i) => v - vel[i]);
  console.log(name, JSON.stringify({ ptr: [px, py], frames: samples.length, dtAll: stats(dt), dtWhileScrolling: stats(dtS), over20ms: dtS.filter((v) => v > 20).length, over33ms: dtS.filter((v) => v > 33).length, scrollFrom: Math.round(sy[0]), scrollTo: Math.round(sy.at(-1)), maxScrollPxPerFrame: +maxV.toFixed(1), maxAccel: +Math.max(...acc.map(Math.abs)).toFixed(1), panelMovedFrames: jumpsY.length, panelMaxStepPx: jumpsY.length ? +Math.max(...jumpsY).toFixed(1) : 0, rowChanges: acts }));
  writeFileSync(`${OUT}d4-03-${name}-${W}.json`, JSON.stringify(samples));
  return samples;
}
await scenario('A-onlist-down', 500, 430, { notches: 14 });
await scenario('B-offlist-down', 20, 430, { notches: 14 });
// back up
await scenario('C-onlist-up', 500, 430, { notches: 14, dy: -100 });
await scenario('D-offlist-up', 20, 430, { notches: 14, dy: -100 });
// fast flick: 40 notches @16ms
await scenario('E-onlist-fastflick', 500, 430, { notches: 40, dy: 100, every: 16 });
await scenario('F-offlist-fastflick', 20, 430, { notches: 40, dy: 100, every: 16 });
console.log('errors', b.errors);
await b.close();
process.exit(0);
